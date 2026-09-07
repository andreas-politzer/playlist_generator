from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd
import math
import json
import uuid
from datetime import datetime, timezone
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.cluster import KMeans
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


class GenerateRequest(BaseModel):
    target: GenerateTarget
    scaler: str = "standard"


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

    scaler = StandardScaler() if request.scaler == "standard" else MinMaxScaler()
    X_scaled = scaler.fit_transform(X)

    if request.target.type == "playlist_count":
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

    score = round(float(silhouette_score(X_scaled, labels)), 3) if k > 1 else None

    name_col = next((c for c in ["name", "song_name", "title"] if c in df.columns), None)
    artist_col = "artist" if "artist" in df.columns else None

    clusters = []
    for cluster_id in range(k):
        mask = labels == cluster_id
        cluster_songs = df[mask]

        tracks = []
        for _, row in cluster_songs.iterrows():
            tracks.append({
                "name": row[name_col] if name_col else None,
                "artist": row[artist_col] if artist_col else None,
                "duration_ms": int(row["duration_ms"]) if "duration_ms" in df.columns else None,
            })

        clusters.append({
            "cluster_id": cluster_id,
            "song_count": int(mask.sum()),
            "duration_ms": int(cluster_songs["duration_ms"].sum()) if "duration_ms" in df.columns else None,
            "tracks": tracks,
        })

    return {
        "songs_total": len(df),
        "requested_target": request.target.dict(),
        "playlist_count": k,
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
    }

    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    generation_file.write_text(json.dumps(generation))

    return {"id": generation_id, "name": generation["name"]}


@app.get("/generations")
async def list_generations():
    result = []
    for file in GENERATIONS_DIR.glob("*.json"):
        data = json.loads(file.read_text())
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


@app.get("/generations/{generation_id}")
async def get_generation(generation_id: str):
    generation_file = GENERATIONS_DIR / f"{generation_id}.json"
    if not generation_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found.")
    return json.loads(generation_file.read_text())