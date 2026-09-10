# Playlist Generator

**Status: 🚧 Active prototype.** Core generation, tile-based UI, Trash, Archive, a full Charts/Visualizations module, and an editable Playlist Detail view are all working. Production polish is ongoing.

## What is this?

Playlist Generator turns a song library into a set of playlists using unsupervised machine learning on audio features (danceability, energy, tempo, acousticness, valence, instrumentalness, and more). It grew out of the "Moosic" case study from the WBS Coding School Data Science bootcamp, which showed that audio-only clustering has real limits — e.g. calm Bossa Nova and classical pieces can end up in the same cluster despite being musically unrelated. This project exists to push past that limit.

## Current state (short version)

- **Song library management**: upload, Trash, restore, drag-and-drop tile UI (Rack ↔ Canvas)
- **Generation**: 5 clustering algorithms (K-Means, DBSCAN, HDBSCAN, Agglomerative, GMM), 4 scalers, automatic audio-feature detection, Silhouette scoring, persisted results
- **Expert Mode**: optional PCA / Kernel PCA dimensionality reduction before clustering, manual control over n_init, max_iter, and random_state
- **Music Library**: browse generated Collections, drill into individual Playlists, rename both Collections and individual Playlists, per-playlist context menu (rename, move to Trash)
- **Archive**: folder structure for archiving Collections and Playlists, restore, move between folders
- **Charts**: a dedicated visualization module — anchor a Playlist or Collection by drag-and-drop, generate any of three chart types, compare multiple charts side by side as independent, draggable canvas tiles:
  - **Radar**: raw or scaled values (toggleable), dynamic feature selection, collection-normalized raw values, interactive side legend with hover-highlight and click-to-hide
  - **t-SNE**: custom Canvas rendering (handles thousands of points smoothly), adjustable perplexity
  - **Dendrogram**: choice of linkage method and raw/scaled data, automatic truncation for large collections, colored branches
- **Playlist Detail view**: a large, editable table per playlist — add or remove tracks (including hand-entered ones with no audio features), toggle any extra CSV columns as columns, with confirmation before deletion
- **Fullscreen mode** for the canvas

Full drag-and-drop mechanics (Trash, Archive drop targets, tile resizing/collapsing) all work and are considered a solved problem — not detailed further here.

## The vision

The long-term goal is a tool that goes well beyond single-pass unsupervised clustering, combining several layers:

### 1. Richer unsupervised clustering
- **Multi-stage / consensus clustering**: chain algorithms instead of running one in isolation — e.g. run HDBSCAN first to strip outliers/noise from a large library, then run K-Means on the cleaned remainder to get tighter, more balanced clusters. A further step would run several algorithms in parallel and combine/compare their results (consensus clustering); iterative refinement (re-assigning poorly-fitting songs) is a longer-term stretch goal.
- **Dimensionality reduction** (PCA / Kernel PCA) is already available as an optional pre-clustering step, useful once genre/mood embeddings are added and audio features alone are no longer the only input.

### 2. Clustering quality evaluation (planned)
Beyond the Silhouette score already shown: Calinski-Harabasz and Davies-Bouldin indices, plus practical/business metrics — playlist size balance, noise/outlier ratio, intra-cluster variance of key features (tempo, energy). External metrics (ARI/NMI) are not applicable here since there is no ground truth.

### 3. Metadata enrichment & LLM assistance
- Genre, mood, decade, and artist tagging
- LLM-assisted enrichment of missing metadata after upload
- Detection of gaps in the available feature set

### 4. Embeddings and semantic search
- Combined audio-feature + metadata embeddings
- Separate, tunable weighting for audio vs. genre/mood/era
- Free-text prompts ("chill songs for a rainy Sunday") resolved via similarity search (FAISS, Chroma, or similar)

### 5. Themed playlist mode (planned, not yet started)
Instead of only bulk-clustering a whole library, let a user describe what they want directly — mood, genre, artist, decade, target length, functional category (workout, party, driving) — each with a neutral "no preference" option.

### 6. Playlist balancing & automatic optimization
- Capacity-aware sizing (approximate or exact song counts, duration targets)
- An eventual "optimize automatically" mode that compares algorithms, scalers, and parameters against a combined statistical + practical-usefulness objective, instead of requiring manual tuning

### 7. Export & integration
PDF export for the Playlist Detail view (printable), CSV/M3U export, possibly direct Spotify integration.

## Tech stack

- **Backend:** Python, FastAPI, pandas, scikit-learn, scipy
- **Frontend:** React, TypeScript, Vite, Recharts, native Canvas (for t-SNE and dendrograms)
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
│       │   ├── ChartTile.tsx                 # radar/t-SNE/dendrogram, dynamically spawned
│       │   ├── TsneCanvas.tsx                 # custom Canvas renderer for t-SNE
│       │   ├── DendrogramCanvas.tsx           # custom Canvas renderer for dendrograms
│       │   ├── PlaylistDetailTile.tsx         # editable playlist table, dynamically spawned
│       │   └── RackCard.tsx
│       ├── core/
│       │   ├── moduleLocation.ts             # fixed modules (rack/canvas placement)
│       │   ├── visualizationTiles.ts         # dynamic, multi-instance chart/detail tiles
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
- No consensus/multi-stage clustering yet (single-algorithm generation only)
- No automatic algorithm/parameter optimization yet
- No clustering quality metrics beyond Silhouette yet
- No CSV/M3U/Spotify export yet, no PDF export yet
- No saving/archiving of chart tiles yet
- Generation is synchronous (fine for small libraries; will need background jobs for large ones)
- Tile stacking order (z-index / bring-to-front on click) is only implemented for the dynamic chart/detail tiles so far, not for the fixed modules (Music Library, Trash, Archive, Generate) — known CSS conflict between `z-index` and the glassmorphism blur effect, unresolved
- UI is a functional prototype, not production-polished