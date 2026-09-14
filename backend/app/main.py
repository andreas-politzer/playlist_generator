from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pathlib import Path
import pandas as pd
import numpy as np
import math
import json
import uuid
import sqlite3
import io
import optuna
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, PowerTransformer
from sklearn.cluster import KMeans, DBSCAN, HDBSCAN, AgglomerativeClustering
from sklearn.decomposition import PCA, KernelPCA
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score
from pydantic import BaseModel
from sklearn.manifold import TSNE
from scipy.cluster.hierarchy import linkage, dendrogram as scipy_dendrogram
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

optuna.logging.set_verbosity(optuna.logging.WARNING)

MAX_OPTIMIZE_TRIALS = 250
MAX_OPTIMIZE_SUBSAMPLE = 2000

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

    if k > 1:
        silhouette_sample_size = 5000 if len(X_for_clustering) > 5000 else None
        score = round(float(silhouette_score(X_for_clustering, labels, sample_size=silhouette_sample_size, random_state=request.expert.random_state)), 3)
    else:
        score = None

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

@app.get("/playlists/summary")
async def list_playlists_summary():
    conn = get_db()
    archived_generation_ids = {
        row["item_id"] for row in conn.execute(
            "SELECT item_id FROM archive_items WHERE item_type = 'generation'"
        ).fetchall()
    }
    archived_playlist_ids = {
        row["item_id"] for row in conn.execute(
            "SELECT item_id FROM archive_items WHERE item_type = 'playlist'"
        ).fetchall()
    }
    conn.close()

    result = []
    for file in GENERATIONS_DIR.glob("*.json"):
        data = json.loads(file.read_text())
        if data["id"] in archived_generation_ids:
            continue
        for cluster in data.get("clusters", []):
            if cluster.get("playlist_id") in archived_playlist_ids:
                continue
            result.append({
                "playlist_id": cluster["playlist_id"],
                "generation_id": data["id"],
                "generation_name": data["name"],
                "name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
                "cluster_id": cluster["cluster_id"],
                "song_count": cluster.get("song_count"),
                "duration_ms": cluster.get("duration_ms"),
            })
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

    name_taken = any(
        c.get("playlist_id") != playlist_id
        and (c.get("custom_name") or f"Playlist {c['cluster_id'] + 1}") == request.name
        for c in data.get("clusters", [])
    )
    if name_taken:
        raise HTTPException(status_code=409, detail="A playlist with this name already exists in this collection.")

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
            item["name"] = cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}"
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

class UpdateNoteRequest(BaseModel):
    note: str


@app.post("/generations/{generation_id}/playlists/{playlist_id}/note")
async def update_playlist_note(generation_id: str, playlist_id: str, request: UpdateNoteRequest):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")

    cluster["note"] = request.note
    generation_file.write_text(json.dumps(data))
    return {"status": "saved"}

@app.get("/generations/{generation_id}/playlists/{playlist_id}/pdf")
async def export_playlist_pdf(generation_id: str, playlist_id: str, columns: str = ""):
    extra_columns = [c for c in columns.split(",") if c]
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    ensure_track_ids(data)
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")

    playlist_name = cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}"
    tracks = cluster.get("tracks", [])
    note = cluster.get("note", "")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=15 * mm,
        rightMargin=15 * mm
    )
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(playlist_name, styles["Title"]))
    story.append(Paragraph(f"{len(tracks)} songs", styles["Normal"]))
    if note:
        story.append(Spacer(1, 6))
        story.append(Paragraph(f"<i>{note}</i>", styles["Normal"]))
    story.append(Spacer(1, 12))

    def format_duration(ms):
        if ms is None:
            return "—"
        total_seconds = round(ms / 1000)
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        return f"{minutes}:{seconds:02d}"

    cell_style = styles["Normal"].clone("CellStyle")
    cell_style.fontSize = 8
    cell_style.leading = 10

    header_style = styles["Normal"].clone("HeaderStyle")
    header_style.fontSize = 8
    header_style.textColor = colors.white

    headers = ["#", "Track", "Artist", "Dur."] + extra_columns
    table_data = [[Paragraph(h, header_style) for h in headers]]
    
    for i, track in enumerate(tracks):
        row = [
            Paragraph(str(i + 1), cell_style),
            Paragraph(track.get("name") or "", cell_style),
            Paragraph(track.get("artist") or "", cell_style),
            Paragraph(format_duration(track.get("duration_ms")), cell_style),
        ]
        for col in extra_columns:
            value = track.get("metadata", {}).get(col)
            str_val = str(value) if value is not None else "—"
            
            # Lange URLs/IDs im PDF lesbar einkürzen, damit sie andere Spalten nicht abwürgen
            if col.lower() in ["html", "url"] and len(str_val) > 28:
                str_val = str_val[:25] + "..."
            
            row.append(Paragraph(str_val, cell_style))
        table_data.append(row)

    total_width = 495  # letter width minus 15mm margins

    if extra_columns:
        # Kompaktere Basis-Breiten, wenn Zusatzspalten da sind
        base_widths = [20, 110, 80, 30]  # Summe = 240pt
        remaining_width = total_width - sum(base_widths)  # 255pt übrig für Extras

        raw_extra_widths = []
        for col in extra_columns:
            values = [str(track.get("metadata", {}).get(col) or "") for track in tracks]
            # Auch Header-Länge (z.B. "Genre") mit einberechnen
            max_len = max(len(col), max((len(v) for v in values if v != "—"), default=5))

            # URLs/IDs gedeckelt halten, echte Text-Spalten (Genre, Mood) mindestens 65pt geben!
            if col.lower() in ["html", "url", "id"]:
                raw_width = 80
            else:
                raw_width = min(max(max_len * 6, 65), 140)

            raw_extra_widths.append(raw_width)

        sum_raw = sum(raw_extra_widths)
        if sum_raw > 0:
            scale = remaining_width / sum_raw
            extra_widths = [w * scale for w in raw_extra_widths]
        else:
            extra_widths = [remaining_width / len(extra_columns) for _ in extra_columns]
    else:
        base_widths = [30, 260, 165, 40]
        extra_widths = []

    col_widths = base_widths + extra_widths

    table = Table(table_data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222222")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    safe_filename = "".join(c if c.isalnum() or c in " -_" else "_" for c in playlist_name)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}.pdf"'},
    )


class SetTrackMetadataRequest(BaseModel):
    column: str
    value: str


@app.post("/generations/{generation_id}/playlists/{playlist_id}/tracks/{track_id}/metadata")
async def set_track_metadata(generation_id: str, playlist_id: str, track_id: str, request: SetTrackMetadataRequest):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    ensure_track_ids(data)
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")

    track = next((t for t in cluster.get("tracks", []) if str(t.get("track_id")) == str(track_id) or str(t.get("id")) == str(track_id)), None)
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found.")

    track.setdefault("metadata", {})[request.column] = request.value
    generation_file.write_text(json.dumps(data, indent=2))
    return {"status": "saved"}

def compute_generation_quality(generation_id: str) -> dict:
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    clusters = data.get("clusters", [])
    feature_names = data.get("used_audio_features", [])

    all_points = []
    all_labels = []
    noise_count = data.get("noise_count", 0)
    for cluster in clusters:
        for track in cluster.get("tracks", []):
            if "audio_features_scaled" not in track:
                continue
            all_points.append([track["audio_features_scaled"].get(f) or 0.0 for f in feature_names])
            all_labels.append(cluster["cluster_id"])

    songs_total = sum(len(c.get("tracks", [])) for c in clusters)
    songs_evaluated = len(all_points)

    def metric_result(value=None, reason=None):
        if reason is not None:
            return {"available": False, "value": None, "unavailable_reason": reason}
        return {"available": True, "value": round(float(value), 4), "unavailable_reason": None}

    unique_labels = set(all_labels)
    if len(all_points) < 3 or len(unique_labels) < 2:
        reason = "Not enough valid clusters after noise filtering"
        silhouette = calinski_harabasz = davies_bouldin = metric_result(reason=reason)
    else:
        X = np.array(all_points)
        labels = np.array(all_labels)

        MAX_SAMPLE_SIZE = 6000
        if len(X) > MAX_SAMPLE_SIZE:
            rng = np.random.default_rng(42)
            sample_idx = rng.choice(len(X), size=MAX_SAMPLE_SIZE, replace=False)
            X_sample, labels_sample = X[sample_idx], labels[sample_idx]
        else:
            X_sample, labels_sample = X, labels

        silhouette = metric_result(silhouette_score(X_sample, labels_sample))
        calinski_harabasz = metric_result(calinski_harabasz_score(X_sample, labels_sample))
        davies_bouldin = metric_result(davies_bouldin_score(X_sample, labels_sample))

    playlist_sizes = [len(c.get("tracks", [])) for c in clusters]
    if len(playlist_sizes) < 2 or sum(playlist_sizes) == 0:
        cluster_balance = metric_result(reason="Not enough playlists to compute balance")
    else:
        mean_size = sum(playlist_sizes) / len(playlist_sizes)
        variance = sum((s - mean_size) ** 2 for s in playlist_sizes) / len(playlist_sizes)
        std_dev = variance ** 0.5
        coefficient_of_variation = std_dev / mean_size if mean_size > 0 else 0
        balance_score = max(0.0, 1.0 - coefficient_of_variation)
        cluster_balance = metric_result(balance_score)

    noise_ratio = metric_result(round(noise_count / songs_total, 4)) if songs_total > 0 else metric_result(reason="No songs in collection")

    return {
        "target": "generation",
        "generation_id": generation_id,
        "algorithm": data.get("algorithm"),
        "scaler": data.get("scaler"),
        "songs_total": songs_total,
        "songs_evaluated": songs_evaluated,
        "playlist_count": len(clusters),
        "noise_count": noise_count,
        "metrics": {
            "silhouette_score": silhouette,
            "calinski_harabasz_index": calinski_harabasz,
            "davies_bouldin_index": davies_bouldin,
            "cluster_balance": cluster_balance,
            "noise_ratio": noise_ratio,
        },
    }


@app.get("/generations/{generation_id}/quality")
async def get_generation_quality(generation_id: str):
    return compute_generation_quality(generation_id)

def compute_playlist_quality(generation_id: str, playlist_id: str) -> dict:
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")

    tracks = cluster.get("tracks", [])
    songs_total = len(tracks)

    def metric_result(value=None, reason=None):
        if reason is not None:
            return {"available": False, "value": None, "unavailable_reason": reason}
        return {"available": True, "value": round(float(value), 4), "unavailable_reason": None}

    def dispersion(feature_key):
        values = [
            t["audio_features"].get(feature_key)
            for t in tracks
            if "audio_features" in t and t["audio_features"].get(feature_key) is not None
        ]
        if len(values) < 2:
            return metric_result(reason=f"Not enough tracks with {feature_key} data"), len(values)
        mean_val = sum(values) / len(values)
        variance = sum((v - mean_val) ** 2 for v in values) / len(values)
        return metric_result(variance ** 0.5), len(values)

    tempo_dispersion, tempo_evaluated = dispersion("tempo")
    energy_dispersion, energy_evaluated = dispersion("energy")

    artists = [t.get("artist") or t.get("Artist") or t.get("artist_name") for t in tracks]
    valid_artists = [a for a in artists if a]
    if len(valid_artists) == 0:
        artist_diversity = metric_result(reason="No artist data available")
    else:
        unique_artists = len(set(valid_artists))
        artist_diversity = metric_result(unique_artists / len(valid_artists))

    return {
        "target": "playlist",
        "generation_id": generation_id,
        "playlist_id": playlist_id,
        "name": cluster.get("custom_name") or f"Playlist {cluster['cluster_id'] + 1}",
        "songs_total": songs_total,
        "songs_evaluated_tempo": tempo_evaluated,
        "songs_evaluated_energy": energy_evaluated,
        "metrics": {
            "tempo_dispersion": tempo_dispersion,
            "energy_dispersion": energy_dispersion,
            "artist_diversity_ratio": artist_diversity,
        },
    }


@app.get("/generations/{generation_id}/playlists/{playlist_id}/quality")
async def get_playlist_quality(generation_id: str, playlist_id: str):
    return compute_playlist_quality(generation_id, playlist_id)

from sklearn.metrics import silhouette_samples

@app.get("/generations/{generation_id}/quality/silhouette")
def get_silhouette_samples_api(generation_id: str):
    gen_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not gen_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found")
    
    with open(gen_file, "r") as f:
        data = json.load(f)

    tracks, labels = [], []
    clusters = data.get("clusters", [])
    
    feature_names = data.get("used_audio_features", [])
    for c_idx, cluster in enumerate(clusters):
        for t in cluster.get("tracks", []):
            scaled = t.get("audio_features_scaled")
            if not scaled or not isinstance(scaled, dict):
                continue
            vector = [scaled.get(f) for f in feature_names]
            if any(v is None for v in vector):
                continue
            tracks.append(vector)
            labels.append(c_idx)

    if len(tracks) < 2 or len(set(labels)) < 2:
        return {"available": False, "reason": "Insufficient valid clusters or tracks."}

    X = np.array(tracks)
    y = np.array(labels)

    # Schutz vor Ausreißern (> 6.000 Songs), damit eure 5.235er-Liste voll ausgewertet wird
    if len(X) > 6000:
        rng = np.random.default_rng(42)
        indices = rng.choice(len(X), size=6000, replace=False)
        X, y = X[indices], y[indices]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    sample_values = silhouette_samples(X_scaled, y)
    avg_score = float(np.mean(sample_values))

    # Strukturieren der Werte nach Clustern (absteigend sortiert für saubere Balken)
    cluster_plots = {}
    for c_idx in sorted(list(set(y))):
        c_values = sorted([round(float(v), 4) for v, l in zip(sample_values, y) if l == c_idx], reverse=True)
        cluster_plots[int(c_idx)] = c_values

    return {
        "available": True,
        "average_score": round(avg_score, 4),
        "total_evaluated": len(X),
        "cluster_plots": cluster_plots
    }

class OptimizeRequest(BaseModel):
    preset: str = "balanced"
    target_playlist_count: int | None = None
    free_cluster_count: bool = False


def load_collection_features(generation_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")
    data = json.loads(generation_file.read_text())
    feature_names = data.get("used_audio_features", [])

    points, track_refs = [], []
    for cluster in data.get("clusters", []):
        for track in cluster.get("tracks", []):
            raw = track.get("audio_features")
            if not raw or not isinstance(raw, dict):
                continue
            vector = [raw.get(f) for f in feature_names]
            if any(v is None for v in vector):
                continue
            points.append(vector)
            track_refs.append(track)

    return data, feature_names, points, track_refs


def compute_pareto_front(results):
    """
    Jedes result muss 'objective_values' enthalten: eine Liste von Zahlen,
    wobei für JEDES Ziel höher = besser gilt (Minimierungsziele müssen
    vorher bereits invertiert worden sein, z.B. via -value oder 1/(1+value)).
    Gibt die Teilmenge der results zurück, die nicht von einem anderen
    result in ALLEN Zielen gleichzeitig dominiert wird.
    """
    pareto = []
    for i, r in enumerate(results):
        dominated = False
        for j, other in enumerate(results):
            if i == j:
                continue
            if all(other["objective_values"][k] >= r["objective_values"][k] for k in range(len(r["objective_values"]))) and \
               any(other["objective_values"][k] > r["objective_values"][k] for k in range(len(r["objective_values"]))):
                dominated = True
                break
        if not dominated:
            pareto.append(r)
    return pareto


GUARDRAIL_LEVELS = [
    {"name": "strict", "max_noise_ratio": 0.15, "min_cluster_size": 4, "max_cluster_share": 0.5, "min_clusters": 3},
    {"name": "moderate", "max_noise_ratio": 0.25, "min_cluster_size": 3, "max_cluster_share": 0.6, "min_clusters": 3},
    {"name": "relaxed", "max_noise_ratio": 0.35, "min_cluster_size": 1, "max_cluster_share": 0.7, "min_clusters": 2},
]


def evaluate_pipeline(X, scaler_name, algorithm_name, params, track_refs=None, guardrails=None, reducer_name="none", n_components=None):
    scalers = {
        "standard": StandardScaler(),
        "minmax": MinMaxScaler(),
        "robust": RobustScaler(),
        "power": PowerTransformer(),
    }
    scaler = scalers[scaler_name]
    X_scaled = scaler.fit_transform(X)

    fitted_reducer = None
    X_for_clustering = X_scaled
    if reducer_name == "pca" and n_components is not None:
        max_components = min(X_scaled.shape[0] - 1, X_scaled.shape[1] - 1, 10)
        actual_components = min(n_components, max_components)
        if actual_components >= 2:
            fitted_reducer = PCA(n_components=actual_components, random_state=42)
            X_for_clustering = fitted_reducer.fit_transform(X_scaled)

    if algorithm_name == "kmeans":
        model = KMeans(n_clusters=params["k"], n_init=10, random_state=42)
        labels = model.fit_predict(X_for_clustering)
    elif algorithm_name == "agglomerative":
        model = AgglomerativeClustering(n_clusters=params["k"], linkage="ward")
        labels = model.fit_predict(X_for_clustering)
    elif algorithm_name == "dbscan":
        model = DBSCAN(eps=params["eps"], min_samples=params["min_samples"])
        labels = model.fit_predict(X_for_clustering)
    elif algorithm_name == "hdbscan":
        model = HDBSCAN(min_cluster_size=params["min_cluster_size"])
        labels = model.fit_predict(X_for_clustering)
    elif algorithm_name == "gmm":
        model = GaussianMixture(n_components=params["k"], covariance_type=params.get("covariance_type", "full"), random_state=42)
        labels = model.fit_predict(X_for_clustering)
    else:
        raise ValueError(f"Unknown algorithm: {algorithm_name}")

    non_noise_mask = labels != -1
    noise_count = int((~non_noise_mask).sum())
    songs_total = len(labels)

    if guardrails is None:
        guardrails = GUARDRAIL_LEVELS[0]

    if non_noise_mask.sum() < 3 or len(set(labels[non_noise_mask])) < guardrails["min_clusters"]:
        return {"rejected_reason": "too_few_clusters"}

    cluster_sizes = np.bincount(labels[non_noise_mask][labels[non_noise_mask] >= 0])
    cluster_sizes = cluster_sizes[cluster_sizes > 0]
    if len(cluster_sizes) < guardrails["min_clusters"]:
        return {"rejected_reason": "too_few_clusters"}
    if noise_count / songs_total > guardrails["max_noise_ratio"]:
        return {"rejected_reason": "noise_too_high", "detail": f"Noise ratio is {noise_count / songs_total * 100:.0f}%, maximum is {guardrails['max_noise_ratio'] * 100:.0f}%."}

    warnings = []
    if cluster_sizes.min() < guardrails["min_cluster_size"]:
        small_label_positions = [i for i, size in enumerate(cluster_sizes) if size < 4]
        for label_pos in small_label_positions:
            actual_label = sorted(set(labels[non_noise_mask]))[label_pos]
            track_indices_in_full = [i for i in range(len(labels)) if labels[i] == actual_label]
            warnings.append({
                "type": "CLUSTER_TOO_SMALL",
                "cluster_size": int(cluster_sizes[label_pos]),
                "track_indices": track_indices_in_full,
            })
    if cluster_sizes.max() / songs_total > guardrails["max_cluster_share"]:
        warnings.append({
            "type": "CLUSTER_TOO_DOMINANT",
            "cluster_size": int(cluster_sizes.max()),
            "percentage": round(cluster_sizes.max() / songs_total * 100, 1),
        })

    X_valid = X_for_clustering[non_noise_mask]
    labels_valid = labels[non_noise_mask]

    silhouette = silhouette_score(X_valid, labels_valid)
    calinski = calinski_harabasz_score(X_valid, labels_valid)
    davies = davies_bouldin_score(X_valid, labels_valid)

    balance_mean = cluster_sizes.mean()
    balance_std = cluster_sizes.std()
    cluster_balance = max(0.0, 1.0 - (balance_std / balance_mean if balance_mean > 0 else 0))

    return {
        "labels": labels,
        "scaler": scaler_name,
        "algorithm": algorithm_name,
        "params": params,
        "warnings": warnings,
        "reducer_name": reducer_name if fitted_reducer is not None else "none",
        "reducer_n_components": fitted_reducer.n_components_ if fitted_reducer is not None else None,
        "metrics": {
            "silhouette_score": silhouette,
            "calinski_harabasz_index": calinski,
            "davies_bouldin_index": davies,
            "cluster_balance": cluster_balance,
            "noise_ratio": noise_count / songs_total,
        },
    }


def composite_score(metrics, preset):
    db_norm = 1.0 / (1.0 + metrics["davies_bouldin_index"])
    silhouette_norm = (metrics["silhouette_score"] + 1) / 2

    if preset == "genre_discovery":
        weights = {"silhouette": 0.4, "db": 0.3, "balance": 0.3}
    elif preset == "dj_flow":
        weights = {"silhouette": 0.2, "db": 0.2, "balance": 0.6}
    else:
        weights = {"silhouette": 0.34, "db": 0.33, "balance": 0.33}

    return (
        weights["silhouette"] * silhouette_norm
        + weights["db"] * db_norm
        + weights["balance"] * metrics["cluster_balance"]
    )


wizard_executor = ThreadPoolExecutor(max_workers=1)
wizard_jobs: dict = {}
wizard_jobs_lock = threading.Lock()
wizard_active_job_id: str | None = None


class WizardJob:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.status = "queued"
        self.trial = 0
        self.total_trials = MAX_OPTIMIZE_TRIALS
        self.best_score = None
        self.candidates = []
        self.error = None
        self.cancel_requested = False
        self.guardrail_stage = 1
        self.guardrail_stage_count = len(GUARDRAIL_LEVELS)
        self.guardrail_level_name = GUARDRAIL_LEVELS[0]["name"]
        self.guardrails_used = None
        self.guardrails_relaxed = False
        self.raw_top_candidates = []
        self.search_matrix = None
        self.search_track_refs = None

    def to_dict(self):
        return {
            "job_id": self.job_id,
            "status": self.status,
            "trial": self.trial,
            "total_trials": self.total_trials,
            "best_score": self.best_score,
            "candidates": self.candidates,
            "error": self.error,
            "guardrail_stage": self.guardrail_stage,
            "guardrail_stage_count": self.guardrail_stage_count,
            "guardrail_level_name": self.guardrail_level_name,
            "guardrails_used": self.guardrails_used,
            "guardrails_relaxed": self.guardrails_relaxed,
        }


def run_optimization_job(job: "WizardJob", generation_id: str, request: "OptimizeRequest"):
    try:
        job.status = "running"
        data, feature_names, points, track_refs = load_collection_features(generation_id)

        if len(points) < 10:
            job.status = "failed"
            job.error = "Not enough valid tracks with audio features to optimize."
            return

        X = np.array(points)

        if len(X) > MAX_OPTIMIZE_SUBSAMPLE:
            rng = np.random.default_rng(42)
            idx = rng.choice(len(X), size=MAX_OPTIMIZE_SUBSAMPLE, replace=False)
            X_search = X[idx]
            track_refs_search = [track_refs[i] for i in idx]
        else:
            X_search = X
            track_refs_search = track_refs

        n_search = len(X_search)
        n_full = len(X)

        use_target = request.target_playlist_count is not None and not request.free_cluster_count

        if use_target:
            target = request.target_playlist_count
            max_possible_k_full = min(200, n_full // 4)

            if max_possible_k_full < 3:
                job.status = "failed"
                job.error = "This collection is too small to target a specific playlist count."
                return
            if target < 3 or target > max_possible_k_full:
                job.status = "failed"
                job.error = f"Target playlist count must be between 3 and {max_possible_k_full} for this collection."
                return

            k_low = max(3, target - 3)
            k_high = min(max_possible_k_full, target + 3)
            max_k_for_search = n_search // 4
            k_high = min(k_high, max_k_for_search)

            if k_low > k_high:
                job.status = "failed"
                job.error = "The target playlist count is valid for the full collection, but the search sample is too small. Increase the search sample size or choose a smaller target."
                return
        else:
            k_max = min(50, n_search // 5)
            if k_max < 3:
                job.status = "failed"
                job.error = "Collection or search sample too small for clustering."
                return
            k_low = 3
            k_high = k_max

        results = []
        rejection_reasons = []
        used_guardrail_level = None

        for stage_index, guardrail_level in enumerate(GUARDRAIL_LEVELS):
            if job.cancel_requested:
                job.status = "cancelled"
                return

            job.guardrail_stage = stage_index + 1
            job.guardrail_level_name = guardrail_level["name"]
            job.trial = 0
            stage_results = []
            stage_rejections = []

            def objective(trial):
                if job.cancel_requested:
                    raise optuna.TrialPruned()

                scaler_name = trial.suggest_categorical("scaler", ["standard", "minmax", "robust", "power"])
                algorithm_name = trial.suggest_categorical("algorithm", ["kmeans", "agglomerative", "dbscan", "hdbscan", "gmm"])

                if algorithm_name in ("kmeans", "agglomerative", "gmm"):
                    k = trial.suggest_int("k", k_low, k_high)
                    if algorithm_name == "gmm":
                        covariance_type = trial.suggest_categorical("covariance_type", ["full", "tied", "diag", "spherical"])
                        params = {"k": k, "covariance_type": covariance_type}
                    else:
                        params = {"k": k}
                elif algorithm_name == "dbscan":
                    eps = trial.suggest_float("eps", 0.1, 2.0)
                    min_samples = trial.suggest_int("min_samples", 3, 15)
                    params = {"eps": eps, "min_samples": min_samples}
                else:
                    min_cluster_size = trial.suggest_int("min_cluster_size", 4, max(5, k_high // 2))
                    params = {"min_cluster_size": min_cluster_size}

                reducer_name = trial.suggest_categorical("reducer", ["none", "pca"])
                n_components = trial.suggest_int("n_components", 2, 10) if reducer_name == "pca" else None

                result = evaluate_pipeline(X_search, scaler_name, algorithm_name, params, track_refs_search, guardrail_level, reducer_name, n_components)

                job.trial += 1
                if "rejected_reason" in result:
                    stage_rejections.append(result)
                    raise optuna.TrialPruned()

                m = result["metrics"]
                objective_values = [
                    m["silhouette_score"],
                    m["cluster_balance"],
                    -m["davies_bouldin_index"],
                    -m["noise_ratio"],
                ]
                if use_target:
                    resulting_count = len(set(l for l in result["labels"] if l != -1))
                    objective_values.append(-abs(resulting_count - request.target_playlist_count))

                result["objective_values"] = objective_values
                stage_results.append(result)

                preset_score = composite_score(m, request.preset)
                if job.best_score is None or preset_score > job.best_score:
                    job.best_score = round(preset_score, 4)
                return tuple(objective_values)

            n_objectives = 5 if use_target else 4
            study = optuna.create_study(
                directions=["maximize"] * n_objectives,
                sampler=optuna.samplers.NSGAIISampler(seed=42),
            )
            study.optimize(objective, n_trials=MAX_OPTIMIZE_TRIALS, show_progress_bar=False)

            if job.cancel_requested:
                job.status = "cancelled"
                return

            if stage_results:
                results = stage_results
                rejection_reasons = stage_rejections
                used_guardrail_level = guardrail_level
                break
            else:
                rejection_reasons = stage_rejections

        if not results:
            reason_counts = {}
            for r in rejection_reasons:
                key = r["rejected_reason"]
                reason_counts[key] = reason_counts.get(key, 0) + 1

            if reason_counts:
                most_common_reason = max(reason_counts, key=reason_counts.get)
                example_detail = next((r.get("detail") for r in rejection_reasons if r["rejected_reason"] == most_common_reason and "detail" in r), None)
                reason_labels = {
                    "too_few_clusters": "Not enough songs to form at least 3 valid clusters.",
                    "cluster_too_small": "Resulting clusters were too small (minimum 4 songs per playlist required).",
                    "cluster_too_dominant": "One cluster would have contained more than 50% of all songs.",
                    "noise_too_high": "Too many songs were classified as noise (maximum 15%).",
                }
                message = reason_labels.get(most_common_reason, most_common_reason)
                if example_detail:
                    message += f" ({example_detail})"
                job.status = "completed"
                job.candidates = []
                job.error = message
                return

            job.status = "completed"
            job.candidates = []
            job.error = "No pipeline configuration produced a usable result for this collection."
            return

        pareto_results = compute_pareto_front(results)
        pareto_results.sort(key=lambda r: composite_score(r["metrics"], request.preset), reverse=True)
        results = pareto_results

        job.search_matrix = X_search
        job.search_track_refs = track_refs_search

        seen_algorithms = set()
        top_candidates = []
        for r in results:
            key = (r["algorithm"], r["scaler"], r.get("reducer_name", "none"))
            if key in seen_algorithms:
                continue
            seen_algorithms.add(key)
            top_candidates.append(r)
            if len(top_candidates) >= 3:
                break

        response_candidates = []
        for i, r in enumerate(top_candidates):
            resolved_warnings = []
            for w in r.get("warnings", []):
                resolved_warning = dict(w)
                if "track_indices" in w:
                    resolved_warning["tracks"] = [
                        {
                            "name": track_refs_search[idx].get("name"),
                            "artist": track_refs_search[idx].get("artist"),
                            "track_id": track_refs_search[idx].get("track_id"),
                        }
                        for idx in w["track_indices"]
                    ]
                    del resolved_warning["track_indices"]
                resolved_warnings.append(resolved_warning)

            response_candidates.append({
                "id": str(i),
                "name": f"{r['scaler'].capitalize()}Scaler"
                + (f" + PCA({r['reducer_n_components']})" if r.get("reducer_name") == "pca" else "")
                + f" + {r['algorithm'].capitalize()} ({', '.join(f'{k}={v}' for k, v in r['params'].items())})",
                "algorithm": r["algorithm"],
                "scaler": r["scaler"],
                "params": r["params"],
                "overall_score": round(composite_score(r["metrics"], request.preset), 4),
                "metrics": {k: round(v, 4) for k, v in r["metrics"].items()},
                "warnings": resolved_warnings,
                "requires_confirmation": len(resolved_warnings) > 0,
                "guardrail_level_name": used_guardrail_level["name"],
                "sample_playlist_count": len(set(l for l in r["labels"] if l != -1)),
                "reducer_name": r.get("reducer_name", "none"),
                "reducer_n_components": r.get("reducer_n_components"),
            })

        job.candidates = response_candidates
        job.raw_top_candidates = top_candidates
        job.guardrails_used = used_guardrail_level
        job.guardrails_relaxed = used_guardrail_level["name"] != GUARDRAIL_LEVELS[0]["name"] if used_guardrail_level else False
        job.status = "completed"

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
    finally:
        global wizard_active_job_id
        with wizard_jobs_lock:
            wizard_active_job_id = None


def run_permutation_test(X, labels, n_permutations=500, seed=42):
    non_noise_mask = labels != -1
    X_valid = X[non_noise_mask]
    labels_valid = labels[non_noise_mask]

    if len(set(labels_valid)) < 2:
        return None

    real_ch = calinski_harabasz_score(X_valid, labels_valid)
    real_db = davies_bouldin_score(X_valid, labels_valid)

    rng = np.random.default_rng(seed)
    ch_better_or_equal = 0
    db_better_or_equal = 0

    valid_permutations = 0
    for _ in range(n_permutations):
        shuffled_labels = rng.permutation(labels_valid)
        try:
            perm_ch = calinski_harabasz_score(X_valid, shuffled_labels)
            perm_db = davies_bouldin_score(X_valid, shuffled_labels)
        except ValueError:
            continue
        valid_permutations += 1
        if perm_ch >= real_ch:
            ch_better_or_equal += 1
        if perm_db <= real_db:
            db_better_or_equal += 1

    if valid_permutations == 0:
        return None

    ch_p_value = (ch_better_or_equal + 1) / (valid_permutations + 1)
    db_p_value = (db_better_or_equal + 1) / (valid_permutations + 1)

    return {
        "permutations_count": n_permutations,
        "ch_percentile": round((1 - ch_p_value) * 100, 1),
        "db_percentile": round((1 - db_p_value) * 100, 1),
        "ch_p_value": round(ch_p_value, 4),
        "db_p_value": round(db_p_value, 4),
    }


class ValidateCandidateRequest(BaseModel):
    candidate_id: str


@app.post("/wizard/jobs/{job_id}/validate")
async def validate_candidate_significance(job_id: str, request: ValidateCandidateRequest):
    with wizard_jobs_lock:
        job = wizard_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.search_matrix is None:
        raise HTTPException(status_code=400, detail="No search data available for this job.")

    candidate = next((c for i, c in enumerate(job.raw_top_candidates) if str(i) == request.candidate_id), None)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found in this job.")

    labels = np.asarray(candidate["labels"])

    scalers = {"standard": StandardScaler(), "minmax": MinMaxScaler(), "robust": RobustScaler(), "power": PowerTransformer()}
    fitted_scaler = scalers[candidate["scaler"]]
    X_scaled_for_candidate = fitted_scaler.fit_transform(job.search_matrix)

    X_for_test = X_scaled_for_candidate
    if candidate.get("reducer_name") == "pca" and candidate.get("reducer_n_components"):
        max_components = min(X_scaled_for_candidate.shape[0] - 1, X_scaled_for_candidate.shape[1] - 1, 10)
        actual_components = min(candidate["reducer_n_components"], max_components)
        if actual_components >= 2:
            reducer = PCA(n_components=actual_components, random_state=42)
            X_for_test = reducer.fit_transform(X_scaled_for_candidate)

    result = run_permutation_test(X_for_test, labels)
    if result is None:
        raise HTTPException(status_code=400, detail="Not enough valid clusters to run a permutation test.")

    return result


@app.post("/generations/{generation_id}/optimize", status_code=202)
async def optimize_generation(generation_id: str, request: OptimizeRequest):
    global wizard_active_job_id
    with wizard_jobs_lock:
        if wizard_active_job_id is not None:
            raise HTTPException(status_code=409, detail="An optimization is already running. Please wait for it to finish or cancel it.")
        job_id = str(uuid.uuid4())
        job = WizardJob(job_id)
        wizard_jobs[job_id] = job
        wizard_active_job_id = job_id

    wizard_executor.submit(run_optimization_job, job, generation_id, request)
    return {"job_id": job_id, "status": "queued"}


@app.get("/wizard/jobs/{job_id}")
async def get_wizard_job(job_id: str):
    with wizard_jobs_lock:
        job = wizard_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        return job.to_dict()


@app.post("/wizard/jobs/{job_id}/cancel")
async def cancel_wizard_job(job_id: str):
    with wizard_jobs_lock:
        job = wizard_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        job.cancel_requested = True
        return {"status": "cancellation_requested"}


class CreateOptimizedRequest(BaseModel):
    preset: str
    scaler: str
    algorithm: str
    params: dict
    allow_guardrail_violations: bool = False
    guardrail_level_name: str = "strict"
    reducer_name: str = "none"
    reducer_n_components: int | None = None


def compute_scaled_features(track_features: dict, feature_names: list, scaler):
    vector = [track_features.get(f) for f in feature_names]
    scaled_vector = scaler.transform([vector])[0]
    return {f: float(v) for f, v in zip(feature_names, scaled_vector)}


@app.post("/generations/{generation_id}/optimize/create")
async def create_optimized_generation(generation_id: str, request: CreateOptimizedRequest):
    source_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not source_file.exists():
        raise HTTPException(status_code=404, detail="Source generation not found.")
    source_data = json.loads(source_file.read_text())

    metrics_before = compute_generation_quality(generation_id)

    data, feature_names, points, track_refs = load_collection_features(generation_id)
    if len(points) < 10:
        raise HTTPException(status_code=400, detail="Not enough valid tracks to create optimized collection.")

    X = np.array(points)
    guardrail_level = next((g for g in GUARDRAIL_LEVELS if g["name"] == request.guardrail_level_name), GUARDRAIL_LEVELS[0])
    result = evaluate_pipeline(X, request.scaler, request.algorithm, request.params, track_refs, guardrail_level, request.reducer_name, request.reducer_n_components)
    if "rejected_reason" in result:
        raise HTTPException(status_code=400, detail=f"This pipeline configuration is no longer valid on the full collection: {result.get('detail', result['rejected_reason'])}")

    resolved_warnings = []
    for w in result.get("warnings", []):
        resolved_warning = dict(w)
        if "track_indices" in w:
            resolved_warning["tracks"] = [
                {
                    "name": track_refs[idx].get("name"),
                    "artist": track_refs[idx].get("artist"),
                    "track_id": track_refs[idx].get("track_id"),
                }
                for idx in w["track_indices"]
            ]
            del resolved_warning["track_indices"]
        resolved_warnings.append(resolved_warning)

    if resolved_warnings and not request.allow_guardrail_violations:
        raise HTTPException(status_code=409, detail={"message": "This pipeline has guardrail warnings that require confirmation.", "warnings": resolved_warnings})

    accepted_warnings = resolved_warnings

    labels = np.asarray(result["labels"])

    scalers = {"standard": StandardScaler(), "minmax": MinMaxScaler(), "robust": RobustScaler()}
    fitted_scaler = scalers[request.scaler]
    fitted_scaler.fit(X)

    unique_labels = sorted(set(l for l in labels if l != -1))
    new_clusters = []
    for cluster_id, label in enumerate(unique_labels):
        cluster_tracks = []
        for i, track in enumerate(track_refs):
            if labels[i] != label:
                continue
            new_track = dict(track)
            new_track["audio_features_scaled"] = compute_scaled_features(
                track["audio_features"], feature_names, fitted_scaler
            )
            cluster_tracks.append(new_track)

        total_duration = sum(t.get("duration_ms") or 0 for t in cluster_tracks)

        audio_feature_averages = {}
        audio_feature_averages_scaled = {}
        for f in feature_names:
            raw_values = [t["audio_features"].get(f) for t in cluster_tracks if t["audio_features"].get(f) is not None]
            scaled_values = [t["audio_features_scaled"].get(f) for t in cluster_tracks if t["audio_features_scaled"].get(f) is not None]
            audio_feature_averages[f] = round(sum(raw_values) / len(raw_values), 4) if raw_values else None
            audio_feature_averages_scaled[f] = round(sum(scaled_values) / len(scaled_values), 4) if scaled_values else None

        new_clusters.append({
            "cluster_id": cluster_id,
            "playlist_id": str(uuid.uuid4()),
            "custom_name": None,
            "song_count": len(cluster_tracks),
            "duration_ms": total_duration,
            "audio_feature_averages": audio_feature_averages,
            "audio_feature_averages_scaled": audio_feature_averages_scaled,
            "tracks": cluster_tracks,
        })

    noise_count = int((labels == -1).sum())
    clustered_song_count = sum(len(c["tracks"]) for c in new_clusters)
    new_id = str(uuid.uuid4())

    new_generation = {
        "id": new_id,
        "name": f"{source_data['name']} — Optimized",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_filename": source_data.get("source_filename"),
        "songs_total": clustered_song_count,
        "playlist_count": len(new_clusters),
        "silhouette": result["metrics"]["silhouette_score"],
        "clusters": new_clusters,
        "algorithm": request.algorithm,
        "scaler": request.scaler,
        "used_audio_features": feature_names,
        "noise_count": noise_count,
        "dimensionality_reduction": None,
        "expert": None,
        "source_generation_id": generation_id,
        "optimization_parent": generation_id,
        "optimization_status": "completed",
        "wizard_metadata": {
            "preset_used": request.preset,
            "pipeline_applied": {"scaler": request.scaler, "algorithm": request.algorithm, "params": request.params, "reducer": request.reducer_name, "reducer_n_components": request.reducer_n_components},
            "metrics_before": metrics_before,
            "metrics_after": result["metrics"],
            "input_song_count": len(points),
            "clustered_song_count": clustered_song_count,
            "excluded_noise_count": noise_count,
            "accepted_warnings": accepted_warnings,
        },
    }

    tmp_file = GENERATIONS_DIR / f"{new_id}.json.tmp"
    final_file = GENERATIONS_DIR / f"{new_id}.json"
    tmp_file.write_text(json.dumps(new_generation))
    tmp_file.rename(final_file)

    return {"status": "created", "generation_id": new_id, "name": new_generation["name"], "playlist_count": new_generation["playlist_count"]}

@app.get("/generations/{generation_id}/liner-notes")
async def get_liner_notes(generation_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")
    data = json.loads(generation_file.read_text())

    wizard_metadata = data.get("wizard_metadata")
    if not wizard_metadata:
        raise HTTPException(status_code=404, detail="This collection was not created by the Pinball Wizard.")

    pipeline = wizard_metadata.get("pipeline_applied", {})
    metrics_before = wizard_metadata.get("metrics_before", {}).get("metrics", {})
    metrics_after = wizard_metadata.get("metrics_after", {})

    def metric_row(label, before_key, after_key, unit=""):
        before = metrics_before.get(before_key, {}).get("value")
        after = metrics_after.get(after_key)
        before_str = f"{round(before, 4)}{unit}" if before is not None else "N/A"
        after_str = f"{round(after, 4)}{unit}" if after is not None else "N/A"
        return {"label": label, "before": before_str, "after": after_str}

    warning_section = None
    if wizard_metadata.get("accepted_warnings"):
        warning_rows = []
        for w in wizard_metadata["accepted_warnings"]:
            if w.get("type") == "CLUSTER_TOO_SMALL":
                songs = ", ".join(f"{t['name']} by {t['artist']}" for t in w.get("tracks", []))
                warning_rows.append({"label": f"Small cluster ({w.get('cluster_size')} songs)", "value": songs})
            elif w.get("type") == "CLUSTER_TOO_DOMINANT":
                warning_rows.append({"label": "Dominant cluster", "value": f"{w.get('percentage')}% of collection"})
        warning_section = {"title": "Accepted Warnings", "rows": warning_rows}

    sections = [
        {
            "title": "Source",
            "rows": [
                {"label": "Original Collection", "value": data.get("source_generation_id")},
                {"label": "Preset Used", "value": wizard_metadata.get("preset_used")},
                {"label": "Created", "value": data.get("created_at")},
            ],
        },
        {
            "title": "Pipeline",
            "rows": [
                {"label": "Scaler", "value": pipeline.get("scaler")},
                {"label": "Dimensionality Reduction", "value": f"PCA ({pipeline.get('reducer_n_components')} components)" if pipeline.get("reducer") == "pca" else "None"},
                {"label": "Algorithm", "value": pipeline.get("algorithm")},
                {"label": "Parameters", "value": ", ".join(f"{k}={v}" for k, v in pipeline.get("params", {}).items())},
            ],
        },
        {
            "title": "Collection Size",
            "rows": [
                {"label": "Input Songs", "value": wizard_metadata.get("input_song_count")},
                {"label": "Clustered Songs", "value": wizard_metadata.get("clustered_song_count")},
                {"label": "Excluded as Noise", "value": wizard_metadata.get("excluded_noise_count")},
            ],
        },
    ] + ([{
        "title": "Accepted Warnings",
        "rows": [
            {
                "label": w.get("type", "Warning"),
                "value": (
                    f"{w.get('cluster_size')} songs: " + ", ".join(f"{t['name']} by {t['artist']}" for t in w.get("tracks", []))
                    if w.get("type") == "CLUSTER_TOO_SMALL"
                    else f"{w.get('percentage')}% of collection" if w.get("type") == "CLUSTER_TOO_DOMINANT"
                    else str(w)
                ),
            }
            for w in wizard_metadata.get("accepted_warnings", [])
        ],
    }] if wizard_metadata.get("accepted_warnings") else []) + [
        {
            "title": "Before / After Comparison",
            "comparison_rows": [
                metric_row("Silhouette Score", "silhouette_score", "silhouette_score"),
                metric_row("Calinski-Harabasz Index", "calinski_harabasz_index", "calinski_harabasz_index"),
                metric_row("Davies-Bouldin Index", "davies_bouldin_index", "davies_bouldin_index"),
                metric_row("Cluster Balance", "cluster_balance", "cluster_balance"),
                metric_row("Noise Ratio", "noise_ratio", "noise_ratio"),
            ],
        },
    ]

    if warning_section:
        sections.append(warning_section)

    return {
        "generation_id": generation_id,
        "name": data.get("name"),
        "sections": sections,
    }