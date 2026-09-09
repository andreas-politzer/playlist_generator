# Playlist Generator

**Status: 🚧 Active prototype.** Core generation, tile-based UI, Trash, Archive, and a first Charts/Visualizations module are working. Production polish is ongoing.

## What is this?

Playlist Generator turns a song library into a set of playlists using unsupervised machine learning on audio features (danceability, energy, tempo, acousticness, valence, instrumentalness, and more). It grew out of the "Moosic" case study from the WBS Coding School Data Science bootcamp, which showed that audio-only clustering has real limits — e.g. calm Bossa Nova and classical pieces can end up in the same cluster despite being musically unrelated. This project exists to push past that limit.

## Current state (short version)

- **Song library management**: upload, Trash, restore, drag-and-drop tile UI (Rack ↔ Canvas)
- **Generation**: 4 clustering algorithms (K-Means, DBSCAN, Agglomerative, GMM), 4 scalers, automatic audio-feature detection, Silhouette scoring, persisted results
- **Music Library**: browse generated Collections, drill into individual Playlists, rename Collections
- **Archive**: folder structure for archiving Collections and Playlists, restore, move between folders
- **Charts**: a dedicated visualization module — anchor a Playlist or Collection by drag-and-drop, generate a Radar chart (raw or scaled values, toggleable), compare multiple charts side by side as independent canvas tiles
- **Fullscreen mode** for the canvas

Full drag-and-drop mechanics (Trash, Archive drop targets, tile resizing/collapsing) all work and are considered a solved problem — not detailed further here.

## The vision

The long-term goal is a tool that goes well beyond single-pass unsupervised clustering, combining several layers:

### 1. Richer unsupervised clustering
- **Multi-stage / ensemble clustering**: chain algorithms instead of running one in isolation — e.g. run DBSCAN first to strip outliers/noise from a large library, then run K-Means on the cleaned remainder to get tighter, more balanced clusters. Different algorithms are strong at different things; this lets the tool use each for what it does best.
- **Dimensionality reduction (PCA)** for when the feature space grows large — especially once genre/mood embeddings are added and audio features alone are no longer the only input.

### 2. Metadata enrichment & LLM assistance
- Genre, mood, decade, and artist tagging
- LLM-assisted enrichment of missing metadata after upload
- Detection of gaps in the available feature set

### 3. Embeddings and semantic search
- Combined audio-feature + metadata embeddings
- Separate, tunable weighting for audio vs. genre/mood/era
- Free-text prompts ("chill songs for a rainy Sunday") resolved via similarity search (FAISS, Chroma, or similar)

### 4. Themed playlist mode (planned, not yet started)
Instead of only bulk-clustering a whole library, let a user describe what they want directly — mood, genre, artist, decade, target length, functional category (workout, party, driving) — each with a neutral "no preference" option.

### 5. Playlist balancing & automatic optimization
- Capacity-aware sizing (approximate or exact song counts, duration targets)
- An eventual "optimize automatically" mode that compares algorithms, scalers, and parameters against a combined statistical + practical-usefulness objective, instead of requiring manual tuning

### 6. Visual diagnostics (in progress)
Radar charts are live. Planned next: t-SNE/UMAP projections, dendrograms (for Agglomerative-based Collections), cluster size/duration comparisons, and algorithm/scaler comparison views — all as independent, comparable canvas tiles, not a single fixed view.

### 7. Export & integration
CSV/M3U export, a large printable/editable playlist detail view, possibly direct Spotify integration.

## Tech stack

- **Backend:** Python, FastAPI, pandas, scikit-learn
- **Frontend:** React, TypeScript, Vite, Recharts
- **Styling:** Tailwind CSS
- **Storage:** JSON files for generation results, SQLite for archive data
- **Planned:** FAISS/Chroma for semantic search, LLM API integration for enrichment

## Project structure

```text
playlist_generator/
├── backend/
│   └── app/
│       └── main.py
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── UploadTile.tsx
│       │   ├── RawListsTile.tsx
│       │   ├── TrashCard.tsx
│       │   ├── GenerateTile.tsx
│       │   ├── GeneratedPlaylistsTile.tsx   # displayed as "Music Library"
│       │   ├── ArchiveTile.tsx
│       │   ├── VisualizationsTile.tsx        # displayed as "Charts"
│       │   ├── ChartTile.tsx                 # individual chart, dynamically spawned
│       │   └── RackCard.tsx
│       ├── core/
│       │   ├── moduleLocation.ts             # fixed modules (rack/canvas placement)
│       │   ├── visualizationTiles.ts         # dynamic, multi-instance chart tiles
│       │   ├── useDraggable.ts
│       │   └── types.ts
│       └── assets/
├── data/
│   ├── uploaded song lists
│   ├── generated generations
│   ├── Trash data
│   └── archive data
└── docs/
```

Runtime data under `data/` is local application data and should not be committed to Git.

## Running locally

### Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

### Frontend

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Known limitations

- No themed/prompt-based playlist mode yet
- No metadata enrichment, LLM integration, embeddings, or vector search yet
- No ensemble/multi-stage clustering yet
- No automatic algorithm/parameter optimization yet
- No PCA support yet
- t-SNE, dendrograms, and other planned chart types not built yet
- No CSV/M3U/Spotify export yet
- Generation is synchronous (fine for small libraries; will need background jobs for large ones)
- UI is a functional prototype, not production-polished