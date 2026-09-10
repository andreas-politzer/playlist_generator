from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import numpy as np
import math
import json
import uuid
import sqlite3
from datetime import datetime, timezone
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, PowerTransformer
from sklearn.cluster import KMeans, DBSCAN, HDBSCAN, AgglomerativeClustering
from sklearn.decomposition import PCA, KernelPCA
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score
from pydantic import BaseModel
from sklearn.manifold import TSNE
from scipy.cluster.hierarchy import linkage, dendrogram as scipy_dendrogram
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent.parent.parent / "data"
TRASH_DIR = UPLOAD_DIR / "trash"
UPLOAD_DIR.mkdir(exist_ok=True)
TRASH_DIR.mkdir(exist_ok=True)
GENERATIONS_DIR = UPLOAD_DIR / "generations"
GENERATIONS_DIR.mkdir(exist_ok=True)

ARCHIVE_DB_PATH = UPLOAD_DIR / "archive.db"


def get_db():
    conn = sqlite3.connect(ARCHIVE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_archive_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS archive_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS archive_items (
            id TEXT PRIMARY KEY,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            generation_id TEXT,
            folder_id TEXT,
            archived_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


init_archive_db()

MATPLOTLIB_COLOR_MAP = {
    "C0": "#1f77b4", "C1": "#ff7f0e", "C2": "#2ca02c", "C3": "#d62728",
    "C4": "#9467bd", "C5": "#8c564b", "C6": "#e377c2", "C7": "#7f7f7f",
    "C8": "#bcbd22", "C9": "#17becf",
}


TECHNICAL_EXCLUDE = {
    "id", "track_id", "song_id", "artist_id", "album_id",
    "playlist_id", "row_id", "index", "unnamed: 0", "url",
    "uri", "spotify_id", "isrc", "file_path", "filename",
}

CONTEXT_COLUMNS = {
    "year", "release_year", "release_date", "decade",
    "duration_ms", "popularity", "rank", "track_number",
}

# key/mode/time_signature sind numerisch gespeichert, aber keine kontinuierlichen
# Messwerte (key=11 ist nicht "mehr" als key=10) — werden vorerst wie normale
# Audio-Features behandelt, aber als Warnung markiert, siehe detect_features().
CATEGORICAL_NUMERIC = {"key", "mode", "time_signature"}

# Bewusste Entscheidung, keine technische Notwendigkeit: duration_ms zählt als
# Kontext-/Constraint-Feature (Playlistlänge), nicht als musikalisches
# Ähnlichkeits-Merkmal fürs Clustering.


def detect_features(df: pd.DataFrame) -> dict:
    normalized = {c: c.strip().lower() for c in df.columns}

    excluded = [c for c, n in normalized.items() if n in TECHNICAL_EXCLUDE]
    # Context-Spalten unabhängig vom Datentyp erkennen (release_date ist oft String)
    context = [c for c, n in normalized.items() if n in CONTEXT_COLUMNS]

    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    audio = [c for c in numeric_cols if c not in excluded and c not in context]

    warnings = []
    unknown_numeric = [c for c in audio if normalized[c] not in CATEGORICAL_NUMERIC
                        and normalized[c] not in {
                            "danceability", "energy", "loudness", "speechiness",
                            "acousticness", "instrumentalness", "liveness", "valence", "tempo",
                        }]
    if unknown_numeric:
        warnings.append(f"Unknown numeric columns used as audio features: {unknown_numeric}")

    categorical_used = [c for c in audio if normalized[c] in CATEGORICAL_NUMERIC]
    if categorical_used:
        warnings.append(f"Categorical-numeric columns used as continuous features: {categorical_used}")

    return {
        "audio_features": audio,
        "context_features": context,
        "excluded": excluded,
        "warnings": warnings,
    }


class GenerateTarget(BaseModel):
    type: str  # "songs_per_playlist" | "playlist_count" | "duration_minutes"
    value: float


class KMeansConfig(BaseModel):
    cluster_count_mode: str = "automatic"  # "automatic" | "manual"
    k: int | None = None


class DBSCANConfig(BaseModel):
    epsilon: float = 0.4
    min_samples: int = 10


class HDBSCANConfig(BaseModel):
    min_cluster_size: int = 10
    min_samples: int | None = None


class DimensionalityReductionConfig(BaseModel):
    method: str = "none"  # "none" | "pca" | "kernel_pca"
    n_components: int = 5
    kernel: str = "rbf"  # only used for kernel_pca: "linear" | "poly" | "rbf" | "sigmoid" | "cosine"


class ExpertConfig(BaseModel):
    n_init: int = 10
    max_iter: int = 300
    random_state: int = 42


class AgglomerativeConfig(BaseModel):
    n_clusters: int = 10
    linkage: str = "ward"


class GMMConfig(BaseModel):
    n_components: int = 10


class GenerateRequest(BaseModel):
    target: GenerateTarget
    algorithm: str = "kmeans"  # "kmeans" | "dbscan" | "hdbscan" | "agglomerative" | "gmm"
    scaler: str = "standard"  # "standard" | "minmax" | "robust" | "power"
    kmeans: KMeansConfig = KMeansConfig()
    dbscan: DBSCANConfig = DBSCANConfig()
    hdbscan: HDBSCANConfig = HDBSCANConfig()
    agglomerative: AgglomerativeConfig = AgglomerativeConfig()
    gmm: GMMConfig = GMMConfig()
    dimensionality_reduction: DimensionalityReductionConfig = DimensionalityReductionConfig()
    expert: ExpertConfig = ExpertConfig()


@app.post("/songs/upload")
async def upload_songs(file: UploadFile = File(...)):
    destination = UPLOAD_DIR / file.filename

    if destination.exists():
        raise HTTPException(status_code=409, detail="A raw list with this filename already exists.")

    contents = await file.read()
    destination.write_bytes(contents)

    df = pd.read_csv(destination)
    song_count = len(df)

    return {"filename": file.filename, "status": "uploaded", "song_count": song_count}


@app.get("/songs/list")
async def list_raw_lists():
    result = []
    for file in UPLOAD_DIR.glob("*.csv"):
        df = pd.read_csv(file)
        result.append({"filename": file.name, "song_count": len(df)})
    return result


@app.delete("/songs/{filename}")
async def move_to_trash(filename: str):
    source = UPLOAD_DIR / filename
    if not source.exists():
        return {"status": "not_found"}
    destination = TRASH_DIR / filename
    source.rename(destination)
    return {"status": "moved_to_trash"}


@app.get("/songs/trash")
async def list_trash():
    result = []
    for file in TRASH_DIR.glob("*.csv"):
        df = pd.read_csv(file)
        result.append({"filename": file.name, "song_count": len(df)})
    return result


@app.post("/songs/trash/{filename}/restore")
async def restore_from_trash(filename: str):
    source = TRASH_DIR / filename
    if not source.exists():
        return {"status": "not_found"}
    destination = UPLOAD_DIR / filename
    source.rename(destination)
    return {"status": "restored"}


@app.delete("/songs/trash/{filename}")
async def delete_permanently(filename: str):
    file_path = TRASH_DIR / filename
    if file_path.exists():
        file_path.unlink()
        return {"status": "deleted"}
    return {"status": "not_found"}


@app.post("/songs/{filename}/generate")
async def generate_playlists(filename: str, request: GenerateRequest):
    source = UPLOAD_DIR / filename
    if not source.exists():
        raise HTTPException(status_code=404, detail="Raw list not found.")

    df = pd.read_csv(source)
    df.columns = df.columns.str.strip()
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip()

    feature_info = detect_features(df)

    if not feature_info["audio_features"]:
        raise HTTPException(status_code=422, detail="No suitable numeric audio features found.")

    X = df[feature_info["audio_features"]]

    scaler_map = {
        "standard": StandardScaler(),
        "minmax": MinMaxScaler(),
        "robust": RobustScaler(),
        "power": PowerTransformer(),
    }
    scaler = scaler_map.get(request.scaler, StandardScaler())
    X_scaled = scaler.fit_transform(X)

    dr_config = request.dimensionality_reduction
    n_features_available = X_scaled.shape[1]
    reducer = None
    actual_n_components = None

    if dr_config.method != "none" and dr_config.n_components < n_features_available:
        actual_n_components = dr_config.n_components
        if dr_config.method == "pca":
            reducer = PCA(n_components=actual_n_components, random_state=request.expert.random_state)
        elif dr_config.method == "kernel_pca":
            reducer = KernelPCA(n_components=actual_n_components, kernel=dr_config.kernel, random_state=request.expert.random_state)
        else:
            raise HTTPException(status_code=422, detail=f"Unknown dimensionality reduction method: {dr_config.method}")

    X_for_clustering = reducer.fit_transform(X_scaled) if reducer is not None else X_scaled

    if request.algorithm == "kmeans":
        if request.kmeans.cluster_count_mode == "manual" and request.kmeans.k:
            k = request.kmeans.k
        elif request.target.type == "playlist_count":
            k = int(request.target.value)
        elif request.target.type == "songs_per_playlist":
            k = math.ceil(len(df) / request.target.value)
        elif request.target.type == "duration_minutes":
            total_duration_min = df["duration_ms"].sum() / 60000 if "duration_ms" in df.columns else None
            if total_duration_min is None:
                raise HTTPException(status_code=422, detail="No duration_ms column found for duration-based target.")
            k = math.ceil(total_duration_min / request.target.value)
        else:
            raise HTTPException(status_code=422, detail=f"Unknown target type: {request.target.type}")

        k = min(k, len(df) - 1)
        k = max(k, 1)
        kmeans = KMeans(
            n_clusters=k,
            random_state=request.expert.random_state,
            n_init=request.expert.n_init,
            max_iter=request.expert.max_iter,
        )
        labels = kmeans.fit_predict(X_for_clustering)
        noise_count = 0

    elif request.algorithm == "dbscan":
        dbscan = DBSCAN(eps=request.dbscan.epsilon, min_samples=request.dbscan.min_samples)
        labels = dbscan.fit_predict(X_for_clustering)
        noise_count = int((labels == -1).sum())
        k = len(set(labels)) - (1 if -1 in labels else 0)

    elif request.algorithm == "hdbscan":
        hdbscan_model = HDBSCAN(
            min_cluster_size=request.hdbscan.min_cluster_size,
            min_samples=request.hdbscan.min_samples,
        )
        labels = hdbscan_model.fit_predict(X_for_clustering)
        noise_count = int((labels == -1).sum())
        k = len(set(labels)) - (1 if -1 in labels else 0)

    elif request.algorithm == "agglomerative":
        agglomerative = AgglomerativeClustering(
            n_clusters=request.agglomerative.n_clusters,
            linkage=request.agglomerative.linkage,
        )
        labels = agglomerative.fit_predict(X_for_clustering)
        noise_count = 0
        k = request.agglomerative.n_clusters

    elif request.algorithm == "gmm":
        gmm = GaussianMixture(
            n_components=request.gmm.n_components,
            random_state=request.expert.random_state,
            max_iter=request.expert.max_iter,
        )
        labels = gmm.fit_predict(X_for_clustering)
        noise_count = 0
        k = request.gmm.n_components

    else:
        raise HTTPException(status_code=422, detail=f"Unknown algorithm: {request.algorithm}")

    score = round(float(silhouette_score(X_for_clustering, labels)), 3) if k > 1 else None

    name_col = next((c for c in ["name", "song_name", "title"] if c in df.columns), None)
    artist_col = "artist" if "artist" in df.columns else None

    unique_labels = sorted(set(labels) - {-1})

    clusters = []
    for cluster_id in unique_labels:
        mask = labels == cluster_id
        cluster_songs = df[mask]

        X_scaled_cluster = X_scaled[mask]

        reserved_columns = set(feature_info["audio_features"])
        reserved_columns.update({name_col, artist_col, "duration_ms"} - {None})

        metadata_columns = [c for c in df.columns if c not in reserved_columns]

        def safe_json_value(value):
            if pd.isna(value):
                return None
            if isinstance(value, (int, float)):
                return round(float(value), 4) if isinstance(value, float) else int(value)
            return str(value)

        tracks = []
        for track_idx, (_, row) in enumerate(cluster_songs.iterrows()):
            raw_features = {}
            scaled_features = {}
            for feature_idx, col in enumerate(feature_info["audio_features"]):
                raw_val = row[col]
                raw_features[col] = round(float(raw_val), 4) if pd.notna(raw_val) else None
                scaled_val = X_scaled_cluster[track_idx][feature_idx]
                scaled_features[col] = round(float(scaled_val), 4) if pd.notna(scaled_val) else None

            metadata = {col: safe_json_value(row[col]) for col in metadata_columns}

            tracks.append({
                "track_id": str(uuid.uuid4()),
                "name": row[name_col] if name_col else None,
                "artist": row[artist_col] if artist_col else None,
                "duration_ms": int(row["duration_ms"]) if "duration_ms" in df.columns else None,
                "audio_features": raw_features,
                "audio_features_scaled": scaled_features,
                "metadata": metadata,
            })

        audio_feature_averages = {}
        for col in feature_info["audio_features"]:
            avg = cluster_songs[col].mean(skipna=True)
            audio_feature_averages[col] = round(float(avg), 4) if pd.notna(avg) else None

        audio_feature_averages_scaled = {}
        for i, col in enumerate(feature_info["audio_features"]):
            col_values = X_scaled_cluster[:, i]
            valid_values = col_values[~pd.isna(col_values)]
            audio_feature_averages_scaled[col] = round(float(valid_values.mean()), 4) if len(valid_values) > 0 else None

        clusters.append({
            "playlist_id": str(uuid.uuid4()),
            "cluster_id": int(cluster_id),
            "song_count": int(mask.sum()),
            "duration_ms": int(cluster_songs["duration_ms"].sum()) if "duration_ms" in df.columns else None,
            "tracks": tracks,
            "audio_feature_averages": audio_feature_averages,
            "audio_feature_averages_scaled": audio_feature_averages_scaled,
        })

    return {
        "songs_total": len(df),
        "requested_target": request.target.dict(),
        "algorithm": request.algorithm,
        "playlist_count": k,
        "noise_count": noise_count,
        "silhouette": score,
        "clusters": clusters,
        "used_audio_features": feature_info["audio_features"],
        "available_context_features": feature_info["context_features"],
        "excluded_columns": feature_info["excluded"],
        "warnings": feature_info["warnings"],
        "dimensionality_reduction": {
            "method": dr_config.method,
            "requested_n_components": dr_config.n_components,
            "actual_n_components": actual_n_components,
            "kernel": dr_config.kernel if dr_config.method == "kernel_pca" else None,
        },
    }

@app.post("/generations")
async def save_generation(filename: str, request: GenerateRequest):
    result = await generate_playlists(filename, request)

    generation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    generation = {
        "id": generation_id,
        "name": f"{result['playlist_count']} Playlists – {result['songs_total']} Songs",
        "created_at": now,
        "source_filename": filename,
        "songs_total": result["songs_total"],
        "playlist_count": result["playlist_count"],
        "silhouette": result["silhouette"],
        "clusters": result["clusters"],
        "algorithm": request.algorithm,
        "scaler": request.scaler,
        "kmeans": request.kmeans.dict(),
        "agglomerative": request.agglomerative.dict(),
        "gmm": request.gmm.dict(),
        "dbscan": request.dbscan.dict(),
        "hdbscan": request.hdbscan.dict(),
        "used_audio_features": result["used_audio_features"],
        "noise_count": result["noise_count"],
        "dimensionality_reduction": result["dimensionality_reduction"],
        "expert": request.expert.dict(),
    }

    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    generation_file.write_text(json.dumps(generation))

    return {"id": generation_id, "name": generation["name"]}


@app.get("/generations")
async def list_generations():
    conn = get_db()
    archived_ids = {
        row["item_id"] for row in conn.execute(
            "SELECT item_id FROM archive_items WHERE item_type = 'generation'"
        ).fetchall()
    }
    conn.close()

    result = []
    for file in GENERATIONS_DIR.glob("*.json"):
        data = json.loads(file.read_text())
        if data["id"] in archived_ids:
            continue
        result.append({
            "id": data["id"],
            "name": data["name"],
            "created_at": data["created_at"],
            "songs_total": data["songs_total"],
            "playlist_count": data["playlist_count"],
            "silhouette": data["silhouette"],
        })
    result.sort(key=lambda g: g["created_at"], reverse=True)
    return result

@app.get("/generations/trash")
async def list_generations_trash():
    result = []
    for file in GENERATIONS_TRASH_DIR.glob("*.json"):
        data = json.loads(file.read_text())
        result.append({
            "id": data["id"],
            "name": data["name"],
            "created_at": data["created_at"],
            "songs_total": data["songs_total"],
            "playlist_count": data["playlist_count"],
            "source_filename": data.get("source_filename"),
        })
    return result


@app.post("/generations/trash/{generation_id}/restore")
async def restore_generation_from_trash(generation_id: str):
    source = GENERATIONS_TRASH_DIR / f"{generation_id}.json"
    if not source.exists():
        return {"status": "not_found"}
    destination = GENERATIONS_DIR / f"{generation_id}.json"
    source.rename(destination)
    return {"status": "restored"}

@app.get("/generations/{generation_id}")
async def get_generation(generation_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")
    data = json.loads(generation_file.read_text())

    conn = get_db()
    archived_rows = conn.execute(
        "SELECT item_id FROM archive_items WHERE item_type = 'playlist' AND generation_id = ?",
        (generation_id,),
    ).fetchall()
    conn.close()
    archived_playlist_ids = {row["item_id"] for row in archived_rows}

    data["clusters"] = [
        c for c in data.get("clusters", []) if c.get("playlist_id") not in archived_playlist_ids
    ]

    return data

@app.get("/generations/{generation_id}/playlists/{playlist_id}/radar")
async def get_playlist_radar_data(generation_id: str, playlist_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    clusters = data.get("clusters", [])
    cluster = next((c for c in clusters if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found in this generation.")

    if "audio_feature_averages" not in cluster:
        raise HTTPException(status_code=422, detail="This playlist was generated before radar chart support was added.")

    feature_names = data["used_audio_features"]
    raw_ranges = compute_collection_minmax(clusters, feature_names, "audio_feature_averages")

    return {
        "playlist_id": playlist_id,
        "name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
        "features": feature_names,
        "scaler": data["scaler"],
        "normalization": "collection_minmax",
        "normalization_ranges": raw_ranges,
        "raw_values": cluster["audio_feature_averages"],
        "raw_normalized_values": normalize_with_ranges(cluster["audio_feature_averages"], raw_ranges),
        "scaled_values": cluster["audio_feature_averages_scaled"],
    }

def compute_collection_minmax(clusters: list, feature_names: list, value_key: str) -> dict:
    ranges = {}
    for feature in feature_names:
        values = [c[value_key].get(feature) for c in clusters if c.get(value_key, {}).get(feature) is not None]
        if not values:
            ranges[feature] = {"min": 0.0, "max": 1.0}
        else:
            ranges[feature] = {"min": min(values), "max": max(values)}
    return ranges


def normalize_with_ranges(raw_values: dict, ranges: dict) -> dict:
    normalized = {}
    for feature, value in raw_values.items():
        if value is None or feature not in ranges:
            normalized[feature] = None
            continue
        r = ranges[feature]
        span = r["max"] - r["min"]
        normalized[feature] = 0.5 if span == 0 else round((value - r["min"]) / span, 4)
    return normalized


@app.get("/generations/{generation_id}/radar")
async def get_generation_radar_data(generation_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    clusters = data.get("clusters", [])

    if clusters and "audio_feature_averages" not in clusters[0]:
        raise HTTPException(status_code=422, detail="This generation was created before radar chart support was added.")

    feature_names = data["used_audio_features"]
    raw_ranges = compute_collection_minmax(clusters, feature_names, "audio_feature_averages")

    playlists = [
        {
            "playlist_id": c["playlist_id"],
            "name": c.get("custom_name") or f"Playlist {c['cluster_id'] + 1}",
            "raw_values": c["audio_feature_averages"],
            "raw_normalized_values": normalize_with_ranges(c["audio_feature_averages"], raw_ranges),
            "scaled_values": c["audio_feature_averages_scaled"],
        }
        for c in clusters
    ]

    return {
        "generation_id": generation_id,
        "name": data["name"],
        "features": feature_names,
        "scaler": data["scaler"],
        "normalization": "collection_minmax",
        "normalization_ranges": raw_ranges,
        "playlists": playlists,
    }

GENERATIONS_TRASH_DIR = GENERATIONS_DIR / "trash"
GENERATIONS_TRASH_DIR.mkdir(exist_ok=True)

@app.get("/generations/{generation_id}/features")
async def get_generation_features(generation_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    return {"features": data.get("used_audio_features", [])}

@app.get("/generations/{generation_id}/tsne")
async def get_generation_tsne_data(generation_id: str, perplexity: int | None = None):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    clusters = data.get("clusters", [])

    all_points = []
    for cluster in clusters:
        for track in cluster.get("tracks", []):
            if "audio_features_scaled" not in track:
                continue
            all_points.append({
                "name": track.get("name"),
                "playlist_id": cluster["playlist_id"],
                "playlist_name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
                "features": track["audio_features_scaled"],
            })

    if len(all_points) < 4:
        raise HTTPException(status_code=422, detail="Not enough songs with t-SNE support for a meaningful projection (minimum 4).")

    feature_names = data["used_audio_features"]
    matrix = np.array([[p["features"].get(f) or 0.0 for f in feature_names] for p in all_points])

    effective_perplexity = min(perplexity or 30, len(all_points) - 1)
    tsne = TSNE(n_components=2, random_state=42, perplexity=effective_perplexity)
    coords = tsne.fit_transform(matrix)

    points = [
        {
            "name": all_points[i]["name"],
            "playlist_id": all_points[i]["playlist_id"],
            "playlist_name": all_points[i]["playlist_name"],
            "x": round(float(coords[i][0]), 4),
            "y": round(float(coords[i][1]), 4),
        }
        for i in range(len(all_points))
    ]

    return {
        "generation_id": generation_id,
        "name": data["name"],
        "points": points,
        "feature_names": feature_names,
        "perplexity": effective_perplexity,
        "random_state": 42,
        "scaler": data.get("scaler"),
    }


@app.get("/generations/{generation_id}/playlists/{playlist_id}/tsne")
async def get_playlist_tsne_data(generation_id: str, playlist_id: str, perplexity: int | None = None):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found in this generation.")

    points_raw = [t for t in cluster.get("tracks", []) if "audio_features_scaled" in t]

    if len(points_raw) < 4:
        raise HTTPException(status_code=422, detail="Not enough songs with t-SNE support for a meaningful projection (minimum 4).")

    feature_names = data["used_audio_features"]
    matrix = np.array([[t["audio_features_scaled"].get(f) or 0.0 for f in feature_names] for t in points_raw])

    effective_perplexity = min(perplexity or 30, len(points_raw) - 1)
    tsne = TSNE(n_components=2, random_state=42, perplexity=effective_perplexity)
    coords = tsne.fit_transform(matrix)

    points = [
        {
            "name": points_raw[i].get("name"),
            "playlist_id": playlist_id,
            "playlist_name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
            "x": round(float(coords[i][0]), 4),
            "y": round(float(coords[i][1]), 4),
        }
        for i in range(len(points_raw))
    ]

    return {
        "playlist_id": playlist_id,
        "name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
        "points": points,
        "feature_names": feature_names,
        "perplexity": effective_perplexity,
        "random_state": 42,
        "scaler": data.get("scaler"),
    }


@app.delete("/generations/{generation_id}")
async def delete_generation(generation_id: str):
    source = GENERATIONS_DIR / f"{generation_id}.json"
    if not source.exists():
        return {"status": "not_found"}
    destination = GENERATIONS_TRASH_DIR / f"{generation_id}.json"
    source.rename(destination)
    return {"status": "moved_to_trash"}


@app.delete("/generations/{generation_id}/playlists/{playlist_id}")
async def move_playlist_to_trash(
    generation_id: str,
    playlist_id: str,
):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"

    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())

    playlist = next(
        (
            cluster
            for cluster in data["clusters"]
            if cluster.get("playlist_id") == playlist_id
        ),
        None,
    )

    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")

    playlist_trash_dir = GENERATIONS_DIR / "playlist_trash"
    playlist_trash_dir.mkdir(exist_ok=True)

    trash_file = playlist_trash_dir / f"{playlist_id}.json"

    trash_data = {
        "playlist_id": playlist_id,
        "generation_id": generation_id,
        "generation_name": data["name"],
        "playlist": playlist,
        "trashed_at": datetime.now(timezone.utc).isoformat(),
    }

    trash_file.write_text(
        json.dumps(trash_data, ensure_ascii=False)
    )

    data["clusters"] = [
        cluster
        for cluster in data["clusters"]
        if cluster.get("playlist_id") != playlist_id
    ]
    data["playlist_count"] = len(data["clusters"])

    generation_file.write_text(
        json.dumps(data, ensure_ascii=False)
    )

    return {
        "status": "moved_to_trash",
        "playlist_id": playlist_id,
        "generation_id": generation_id,
    }

@app.get("/playlists/trash")
async def list_playlists_trash():
    playlist_trash_dir = GENERATIONS_DIR / "playlist_trash"
    playlist_trash_dir.mkdir(exist_ok=True)

    result = []

    for file in playlist_trash_dir.glob("*.json"):
        data = json.loads(file.read_text())
        playlist = data["playlist"]

        result.append({
            "item_type": "playlist",
            "id": data["playlist_id"],
            "playlist_id": data["playlist_id"],
            "generation_id": data["generation_id"],
            "generation_name": data["generation_name"],
            "name": playlist.get("custom_name") or f"Playlist {playlist['cluster_id'] + 1}",
            "song_count": playlist["song_count"],
            "duration_ms": playlist["duration_ms"],
            "trashed_at": data["trashed_at"],
        })

    return result

@app.post("/playlists/trash/{playlist_id}/restore")
async def restore_playlist_from_trash(playlist_id: str):
    playlist_trash_file = (
        GENERATIONS_DIR / "playlist_trash" / f"{playlist_id}.json"
    )

    if not playlist_trash_file.exists():
        return {"status": "not_found"}

    trash_data = json.loads(playlist_trash_file.read_text())
    generation_id = trash_data["generation_id"]
    playlist = trash_data["playlist"]

    possible_generation_files = [
        GENERATIONS_DIR / f"{generation_id}.json",
        GENERATIONS_TRASH_DIR / f"{generation_id}.json",
    ]

    generation_file = next(
        (file for file in possible_generation_files if file.exists()),
        None,
    )

    if generation_file is None:
        raise HTTPException(
            status_code=404,
            detail="Original generation not found.",
        )

    generation_data = json.loads(generation_file.read_text())

    already_exists = any(
        cluster.get("playlist_id") == playlist_id
        for cluster in generation_data["clusters"]
    )

    if not already_exists:
        generation_data["clusters"].append(playlist)
        generation_data["playlist_count"] = len(generation_data["clusters"])
        generation_file.write_text(
            json.dumps(generation_data, ensure_ascii=False)
        )

    playlist_trash_file.unlink()

    return {
        "status": "restored",
        "playlist_id": playlist_id,
        "generation_id": generation_id,
    }


@app.delete("/playlists/trash/{playlist_id}")
async def delete_playlist_forever(playlist_id: str):
    playlist_trash_file = (
        GENERATIONS_DIR / "playlist_trash" / f"{playlist_id}.json"
    )

    if not playlist_trash_file.exists():
        return {"status": "not_found"}

    playlist_trash_file.unlink()

    return {
        "status": "deleted_forever",
        "playlist_id": playlist_id,
    }


@app.delete("/generations/trash/{generation_id}")
async def delete_generation_forever(generation_id: str):
    generation_trash_file = (
        GENERATIONS_TRASH_DIR / f"{generation_id}.json"
    )

    if not generation_trash_file.exists():
        return {"status": "not_found"}

    generation_trash_file.unlink()

    playlist_trash_dir = GENERATIONS_DIR / "playlist_trash"

    for playlist_file in playlist_trash_dir.glob("*.json"):
        data = json.loads(playlist_file.read_text())

        if data.get("generation_id") == generation_id:
            playlist_file.unlink()

    return {
        "status": "deleted_forever",
        "generation_id": generation_id,
    }

class RenameRequest(BaseModel):
    name: str


@app.patch("/generations/{generation_id}")
async def rename_generation(generation_id: str, request: RenameRequest):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    data["name"] = request.name
    generation_file.write_text(json.dumps(data))

    return {"status": "renamed", "name": data["name"]}

class RenamePlaylistRequest(BaseModel):
    name: str


@app.patch("/generations/{generation_id}/playlists/{playlist_id}")
async def rename_playlist(generation_id: str, playlist_id: str, request: RenamePlaylistRequest):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found in this generation.")

    cluster["custom_name"] = request.name
    generation_file.write_text(json.dumps(data))

    return {"status": "renamed", "name": cluster["custom_name"]}

class CreateFolderRequest(BaseModel):
    name: str
    parent_id: str | None = None


@app.post("/archive/folders")
async def create_folder(request: CreateFolderRequest):
    folder_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db()
    conn.execute(
        "INSERT INTO archive_folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)",
        (folder_id, request.name, request.parent_id, now),
    )
    conn.commit()
    conn.close()
    return {"id": folder_id, "name": request.name, "parent_id": request.parent_id}


@app.get("/archive/folders")
async def list_folders(parent_id: str | None = None):
    conn = get_db()
    if parent_id is None:
        rows = conn.execute("SELECT * FROM archive_folders WHERE parent_id IS NULL").fetchall()
    else:
        rows = conn.execute("SELECT * FROM archive_folders WHERE parent_id = ?", (parent_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.patch("/archive/folders/{folder_id}")
async def rename_folder(folder_id: str, request: RenameRequest):
    conn = get_db()
    conn.execute("UPDATE archive_folders SET name = ? WHERE id = ?", (request.name, folder_id))
    conn.commit()
    conn.close()
    return {"status": "renamed"}


@app.delete("/archive/folders/{folder_id}")
async def delete_folder(folder_id: str):
    conn = get_db()
    conn.execute("DELETE FROM archive_folders WHERE id = ?", (folder_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

class ArchiveMoveRequest(BaseModel):
    folder_id: str | None = None
    generation_id: str | None = None


@app.put("/archive/items/{item_type}/{item_id}")
async def put_archive_item(item_type: str, item_id: str, request: ArchiveMoveRequest):
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM archive_items WHERE item_type = ? AND item_id = ?",
        (item_type, item_id),
    ).fetchone()

    if existing:
        conn.execute("UPDATE archive_items SET folder_id = ? WHERE id = ?", (request.folder_id, existing["id"]))
        item_db_id = existing["id"]
        status = "moved"
    else:
        item_db_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO archive_items (id, item_type, item_id, generation_id, folder_id, archived_at) VALUES (?, ?, ?, ?, ?, ?)",
            (item_db_id, item_type, item_id, request.generation_id, request.folder_id, now),
        )
        status = "archived"

    conn.commit()
    conn.close()
    return {"id": item_db_id, "status": status}


@app.get("/archive/items")
async def list_archived_items(folder_id: str | None = None):
    conn = get_db()
    if folder_id is None:
        rows = conn.execute("SELECT * FROM archive_items WHERE folder_id IS NULL").fetchall()
    else:
        rows = conn.execute("SELECT * FROM archive_items WHERE folder_id = ?", (folder_id,)).fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        lookup_id = item["generation_id"] if item["item_type"] == "playlist" else item["item_id"]
        generation_file = GENERATIONS_DIR / f"{lookup_id}.json"
        if not generation_file.exists():
            continue
        generation_data = json.loads(generation_file.read_text())

        if item["item_type"] == "generation":
            item["name"] = generation_data["name"]
            item["songs_total"] = generation_data["songs_total"]
            item["playlist_count"] = generation_data["playlist_count"]
            item["silhouette"] = generation_data["silhouette"]
        elif item["item_type"] == "playlist":
            cluster = next(
                (c for c in generation_data.get("clusters", []) if c.get("playlist_id") == item.get("item_id")),
                None,
            )
            if cluster is None:
                continue
            item["name"] = f"Playlist {cluster['cluster_id'] + 1}"
            item["song_count"] = cluster["song_count"]
            item["duration_ms"] = cluster["duration_ms"]
            item["parent_generation_name"] = generation_data["name"]
            item["generation_id"] = generation_data["id"]

        result.append(item)

    return result


@app.patch("/archive/items/{archived_item_id}/move")
async def move_archived_item(archived_item_id: str, folder_id: str | None = None):
    conn = get_db()
    conn.execute("UPDATE archive_items SET folder_id = ? WHERE id = ?", (folder_id, archived_item_id))
    conn.commit()
    conn.close()
    return {"status": "moved"}


@app.post("/archive/items/{archived_item_id}/restore")
async def restore_archive_item(archived_item_id: str):
    conn = get_db()
    conn.execute("DELETE FROM archive_items WHERE id = ?", (archived_item_id,))
    conn.commit()
    conn.close()
    return {"status": "restored"}

@app.get("/generations/{generation_id}/dendrogram")
async def get_generation_dendrogram_data(
    generation_id: str,
    mode: str = "scaled",
    linkage_method: str = "ward",
    max_leaves: int = 40,
):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    if mode not in ("raw", "scaled"):
        raise HTTPException(status_code=422, detail="mode must be 'raw' or 'scaled'.")
    if linkage_method not in ("ward", "complete", "average", "single"):
        raise HTTPException(status_code=422, detail="linkage_method must be one of: ward, complete, average, single.")
    if max_leaves < 3 or max_leaves > 200:
        raise HTTPException(status_code=422, detail="max_leaves must be between 3 and 200.")

    data = json.loads(generation_file.read_text())
    clusters = data.get("clusters", [])

    feature_key = "audio_features_scaled" if mode == "scaled" else "audio_features"

    all_points = []
    for cluster in clusters:
        for track in cluster.get("tracks", []):
            if feature_key not in track:
                continue
            all_points.append({
                "name": track.get("name"),
                "playlist_id": cluster["playlist_id"],
                "playlist_name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
                "features": track[feature_key],
            })

    if len(all_points) < 3:
        raise HTTPException(status_code=422, detail="Not enough songs with feature data for a dendrogram (minimum 3).")

    feature_names = data["used_audio_features"]
    matrix = np.array([[p["features"].get(f) or 0.0 for f in feature_names] for p in all_points])

    if linkage_method == "ward":
        Z = linkage(matrix, method="ward")
    else:
        Z = linkage(matrix, method=linkage_method, metric="euclidean")

    truncated = len(all_points) > max_leaves
    truncate_kwargs = {"truncate_mode": "lastp", "p": max_leaves} if truncated else {}

    dendro = scipy_dendrogram(Z, no_plot=True, labels=[p["name"] for p in all_points], **truncate_kwargs)

    return {
        "generation_id": generation_id,
        "name": data["name"],
        "source_type": "generation",
        "mode": mode,
        "scaler": data.get("scaler"),
        "linkage_method": linkage_method,
        "song_count": len(all_points),
        "feature_names": feature_names,
        "recomputed": True,
        "truncated": truncated,
        "max_leaves": max_leaves,
        "icoord": dendro["icoord"],
        "dcoord": dendro["dcoord"],
        "labels": dendro["ivl"],
        "colors": [MATPLOTLIB_COLOR_MAP.get(c, c) for c in dendro["color_list"]],
    }


@app.get("/generations/{generation_id}/playlists/{playlist_id}/dendrogram")
async def get_playlist_dendrogram_data(
    generation_id: str,
    playlist_id: str,
    mode: str = "scaled",
    linkage_method: str = "ward",
):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    if mode not in ("raw", "scaled"):
        raise HTTPException(status_code=422, detail="mode must be 'raw' or 'scaled'.")
    if linkage_method not in ("ward", "complete", "average", "single"):
        raise HTTPException(status_code=422, detail="linkage_method must be one of: ward, complete, average, single.")

    data = json.loads(generation_file.read_text())
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found in this generation.")

    feature_key = "audio_features_scaled" if mode == "scaled" else "audio_features"
    tracks = [t for t in cluster.get("tracks", []) if feature_key in t]

    if len(tracks) < 3:
        raise HTTPException(status_code=422, detail="Not enough songs with feature data for a dendrogram (minimum 3).")

    feature_names = data["used_audio_features"]
    matrix = np.array([[t[feature_key].get(f) or 0.0 for f in feature_names] for t in tracks])

    if linkage_method == "ward":
        Z = linkage(matrix, method="ward")
    else:
        Z = linkage(matrix, method=linkage_method, metric="euclidean")

    dendro = scipy_dendrogram(Z, no_plot=True, labels=[t.get("name") for t in tracks])

    return {
        "playlist_id": playlist_id,
        "name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
        "source_type": "playlist",
        "mode": mode,
        "scaler": data.get("scaler"),
        "linkage_method": linkage_method,
        "song_count": len(tracks),
        "feature_names": feature_names,
        "recomputed": True,
        "truncated": False,
        "icoord": dendro["icoord"],
        "dcoord": dendro["dcoord"],
        "labels": dendro["ivl"],
        "colors": [MATPLOTLIB_COLOR_MAP.get(c, c) for c in dendro["color_list"]],
    }

def ensure_track_ids(data: dict) -> bool:
    changed = False
    for cluster in data.get("clusters", []):
        for track in cluster.get("tracks", []):
            if not track.get("track_id"):
                track["track_id"] = str(uuid.uuid4())
                changed = True
    return changed


@app.get("/generations/{generation_id}/playlists/{playlist_id}/detail")
async def get_playlist_detail(generation_id: str, playlist_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    if ensure_track_ids(data):
        generation_file.write_text(json.dumps(data))

    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found in this generation.")

    metadata_keys = sorted({key for track in cluster.get("tracks", []) for key in track.get("metadata", {})})

    return {
        "playlist_id": playlist_id,
        "generation_id": generation_id,
        "name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
        "tracks": [
            {
                "track_id": t.get("track_id"),
                "name": t.get("name"),
                "artist": t.get("artist"),
                "duration_ms": t.get("duration_ms"),
                "metadata": t.get("metadata", {}),
            }
            for t in cluster.get("tracks", [])
        ],
        "metadata_keys": metadata_keys,
        "note": cluster.get("note", ""),
    }

class RemoveTrackRequest(BaseModel):
    track_id: str


@app.post("/generations/{generation_id}/playlists/{playlist_id}/tracks/remove")
async def remove_track(generation_id: str, playlist_id: str, request: RemoveTrackRequest):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    ensure_track_ids(data)

    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")

    tracks = cluster.get("tracks", [])
    track = next((t for t in tracks if t.get("track_id") == request.track_id), None)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")

    tracks.remove(track)
    cluster["song_count"] = len(tracks)
    cluster["duration_ms"] = sum(t["duration_ms"] for t in tracks if t.get("duration_ms") is not None) or None
    data["songs_total"] = sum(len(c.get("tracks", [])) for c in data.get("clusters", []))

    generation_file.write_text(json.dumps(data))
    return {"status": "removed", "remaining_tracks": len(tracks)}

class AddTrackRequest(BaseModel):
    name: str
    artist: str
    duration_ms: int | None = None
    metadata: dict = {}


@app.post("/generations/{generation_id}/playlists/{playlist_id}/tracks/add")
async def add_track(generation_id: str, playlist_id: str, request: AddTrackRequest):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    ensure_track_ids(data)

    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")

    new_track = {
        "track_id": str(uuid.uuid4()),
        "name": request.name,
        "artist": request.artist,
        "duration_ms": request.duration_ms,
        "metadata": request.metadata,
    }

    cluster.setdefault("tracks", []).append(new_track)
    tracks = cluster["tracks"]
    cluster["song_count"] = len(tracks)
    cluster["duration_ms"] = sum(t["duration_ms"] for t in tracks if t.get("duration_ms") is not None) or None
    data["songs_total"] = sum(len(c.get("tracks", [])) for c in data.get("clusters", []))

    generation_file.write_text(json.dumps(data))
    return {"status": "added", "track_id": new_track["track_id"], "total_tracks": len(tracks)}