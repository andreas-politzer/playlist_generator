from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import math
import json
import uuid
import sqlite3
from datetime import datetime, timezone
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, PowerTransformer
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score
from pydantic import BaseModel

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


class AgglomerativeConfig(BaseModel):
    n_clusters: int = 10
    linkage: str = "ward"


class GMMConfig(BaseModel):
    n_components: int = 10


class GenerateRequest(BaseModel):
    target: GenerateTarget
    algorithm: str = "kmeans"  # "kmeans" | "dbscan" | "agglomerative" | "gmm"
    scaler: str = "standard"  # "standard" | "minmax" | "robust" | "power"
    kmeans: KMeansConfig = KMeansConfig()
    dbscan: DBSCANConfig = DBSCANConfig()
    agglomerative: AgglomerativeConfig = AgglomerativeConfig()
    gmm: GMMConfig = GMMConfig()


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
        kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
        labels = kmeans.fit_predict(X_scaled)
        noise_count = 0

    elif request.algorithm == "dbscan":
        dbscan = DBSCAN(eps=request.dbscan.epsilon, min_samples=request.dbscan.min_samples)
        labels = dbscan.fit_predict(X_scaled)
        noise_count = int((labels == -1).sum())
        k = len(set(labels)) - (1 if -1 in labels else 0)

    elif request.algorithm == "agglomerative":
        agglomerative = AgglomerativeClustering(
            n_clusters=request.agglomerative.n_clusters,
            linkage=request.agglomerative.linkage,
        )
        labels = agglomerative.fit_predict(X_scaled)
        noise_count = 0
        k = request.agglomerative.n_clusters

    elif request.algorithm == "gmm":
        gmm = GaussianMixture(n_components=request.gmm.n_components, random_state=42)
        labels = gmm.fit_predict(X_scaled)
        noise_count = 0
        k = request.gmm.n_components

    else:
        raise HTTPException(status_code=422, detail=f"Unknown algorithm: {request.algorithm}")

    score = round(float(silhouette_score(X_scaled, labels)), 3) if k > 1 else None

    name_col = next((c for c in ["name", "song_name", "title"] if c in df.columns), None)
    artist_col = "artist" if "artist" in df.columns else None

    unique_labels = sorted(set(labels) - {-1})

    clusters = []
    for cluster_id in unique_labels:
        mask = labels == cluster_id
        cluster_songs = df[mask]

        tracks = []
        for _, row in cluster_songs.iterrows():
            tracks.append({
                "name": row[name_col] if name_col else None,
                "artist": row[artist_col] if artist_col else None,
                "duration_ms": int(row["duration_ms"]) if "duration_ms" in df.columns else None,
            })

        audio_feature_averages = {}
        for col in feature_info["audio_features"]:
            avg = cluster_songs[col].mean(skipna=True)
            audio_feature_averages[col] = round(float(avg), 4) if pd.notna(avg) else None

        X_scaled_cluster = X_scaled[mask]
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
        "used_audio_features": result["used_audio_features"],
        "noise_count": result["noise_count"],
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
    cluster = next((c for c in data.get("clusters", []) if c.get("playlist_id") == playlist_id), None)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Playlist not found in this generation.")

    if "audio_feature_averages" not in cluster:
        raise HTTPException(status_code=422, detail="This playlist was generated before radar chart support was added.")

    return {
        "playlist_id": playlist_id,
        "name": f"Playlist {cluster['cluster_id'] + 1}",
        "features": data["used_audio_features"],
        "scaler": data["scaler"],
        "raw_values": cluster["audio_feature_averages"],
        "scaled_values": cluster["audio_feature_averages_scaled"],
    }

@app.get("/generations/{generation_id}/radar")
async def get_generation_radar_data(generation_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")

    data = json.loads(generation_file.read_text())
    clusters = data.get("clusters", [])

    if clusters and "audio_feature_averages" not in clusters[0]:
        raise HTTPException(status_code=422, detail="This generation was created before radar chart support was added.")

    playlists = [
        {
            "playlist_id": c["playlist_id"],
            "name": f"Playlist {c['cluster_id'] + 1}",
            "raw_values": c["audio_feature_averages"],
            "scaled_values": c["audio_feature_averages_scaled"],
        }
        for c in clusters
    ]

    return {
        "generation_id": generation_id,
        "name": data["name"],
        "features": data["used_audio_features"],
        "scaler": data["scaler"],
        "playlists": playlists,
    }

GENERATIONS_TRASH_DIR = GENERATIONS_DIR / "trash"
GENERATIONS_TRASH_DIR.mkdir(exist_ok=True)


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
            "name": f"Playlist {playlist['cluster_id'] + 1}",
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