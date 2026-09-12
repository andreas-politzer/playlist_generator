# Playlist Generator

**Status: 🚧 Active prototype.** Core generation, tile-based UI, Trash, Archive, a full Charts/Visualizations module, a complete editable Playlist Detail view with PDF export, and a first Quality Street metrics mockup are all working. Production polish is ongoing.

## What is this?

Playlist Generator turns a song library into a set of playlists using unsupervised machine learning on audio features (danceability, energy, tempo, acousticness, valence, instrumentalness, and more). It grew out of the "Moosic" case study from the WBS Coding School Data Science bootcamp, which showed that audio-only clustering has real limits — e.g. calm Bossa Nova and classical pieces can end up in the same cluster despite being musically unrelated. This project exists to push past that limit.

## Current state (short version)

- **Song library management**: upload, Trash, restore, drag-and-drop tile UI (Rack ↔ Canvas)
- **Generation**: 5 clustering algorithms (K-Means, DBSCAN, HDBSCAN, Agglomerative, GMM), 4 scalers, automatic audio-feature detection, Silhouette scoring, persisted results
- **Expert Mode**: optional PCA / Kernel PCA dimensionality reduction before clustering, manual control over n_init, max_iter, and random_state
- **Music Library**: browse generated Collections, drill into individual Playlists, rename both Collections and individual Playlists, per-playlist context menu (open, rename, move to Archive, move to Trash), a flat "Playlists" view across all Collections in addition to the Collections view, all actions apply optimistic UI updates (instant feedback, no waiting on the network)
- **Archive**: folder structure for archiving Collections and Playlists, restore, move between folders
- **Charts**: a dedicated visualization module — anchor a Playlist or Collection by drag-and-drop, generate any of three chart types, compare multiple charts side by side as independent, draggable canvas tiles:
  - **Radar**: raw or scaled values (toggleable), dynamic feature selection, collection-normalized raw values, interactive side legend with hover-highlight and click-to-hide
  - **t-SNE**: custom Canvas rendering (handles thousands of points smoothly), adjustable perplexity
  - **Dendrogram**: choice of linkage method and raw/scaled data, automatic truncation for large collections, colored branches
- **Playlist Detail view**: a large, editable table per playlist — add or remove tracks (including hand-entered ones with no audio features), toggle any extra CSV columns as columns, add fully custom user-defined columns, an auto-saving free-text note per playlist, and PDF export (respects the currently visible columns)
- **Quality Street (mockup)**: a dedicated module previewing the planned clustering-quality dashboard (see Vision, section 2) — currently static placeholder data, real backend calculation not yet implemented
- **Fullscreen mode** for the canvas
- Tile stacking order (click/drag brings a tile to front) works uniformly across all tiles, fixed and dynamic alike

Full drag-and-drop mechanics (Trash, Archive drop targets, tile resizing/collapsing) all work and are considered a solved problem — not detailed further here.

## The vision

The long-term goal is a tool that goes well beyond single-pass unsupervised clustering, combining several layers:

### 1. Richer unsupervised clustering
- **Multi-stage / consensus clustering**: chain algorithms instead of running one in isolation — e.g. run HDBSCAN first to strip outliers/noise from a large library, then run K-Means on the cleaned remainder to get tighter, more balanced clusters. A further step would run several algorithms in parallel and combine their results via a co-association (consensus) matrix; iterative refinement (re-assigning poorly-fitting songs) is a longer-term stretch goal.
- **Dimensionality reduction** (PCA / Kernel PCA) is already available as an optional pre-clustering step, useful once genre/mood embeddings are added and audio features alone are no longer the only input.

### 2. Clustering quality evaluation ("Quality Street")
Beyond the Silhouette score already shown: Calinski-Harabasz and Davies-Bouldin indices, Elbow/WCSS, plus practical/business metrics — playlist size balance, noise/outlier ratio, intra-cluster variance of key features (tempo, energy) — and music-domain-specific metrics: tempo/energy transition smoothness between consecutive tracks, harmonic (Camelot Wheel) compatibility based on musical key, and artist/genre diversity. External metrics (ARI/NMI) are not applicable here since there is no ground truth. A frontend mockup already exists; backend calculation is the next step.

### 3. "Pinball Wizard": automated hyperparameter optimization
A planned separate module (deliberately kept apart from Quality Street to avoid overloading one tile — Quality Street diagnoses, Pinball Wizard acts) that runs Bayesian optimization (e.g. Optuna) over scaler, dimensionality-reduction, algorithm, and parameter combinations, guided by hard guardrails (noise ratio, cluster size limits) and a user-selected intent preset (e.g. "DJ Flow" favoring smooth transitions vs. "Genre Explorer" favoring strict mathematical separation). Presents the top few Pareto-optimal configurations for one-click application to the Generate module. Naturally combines with consensus clustering: optimize each algorithm individually first, then combine the optimized results.

### 4. Metadata enrichment & LLM assistance
- Genre, mood, decade, and artist tagging
- LLM-assisted enrichment of missing metadata after upload
- Detection of gaps in the available feature set
- Free-text mood/vibe prompts ("chill songs for a rainy Sunday") would need an LLM or audio-text embedding model to bridge language to feature space — pure unsupervised clustering on audio features alone cannot interpret semantic/metaphorical requests

### 5. Embeddings and semantic search
- Combined audio-feature + metadata embeddings
- Separate, tunable weighting for audio vs. genre/mood/era
- Free-text prompts resolved via similarity search (FAISS, Chroma, or similar)

### 6. Themed playlist mode (planned, not yet started)
Instead of only bulk-clustering a whole library, let a user describe what they want directly — mood, genre, artist, decade, target length, functional category (workout, party, driving) — each with a neutral "no preference" option.

### 7. Playlist folder structure
Analogous to the existing Archive folder structure, but for organizing playlists directly within the flat Playlists view (not yet started, would need a new `folder_id` concept for playlists).

### 8. Further export & integration
CSV/M3U export, possibly direct Spotify integration.

## Tech stack

- **Backend:** Python, FastAPI, pandas, scikit-learn, scipy, reportlab (PDF generation)
- **Frontend:** React, TypeScript, Vite, Recharts, native Canvas (for t-SNE and dendrograms)
- **Styling:** Tailwind CSS
- **Storage:** JSON files for generation results, SQLite for archive data
- **Planned:** Optuna (hyperparameter optimization), FAISS/Chroma for semantic search, LLM API integration for enrichment

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
│       │   ├── QualityStreetTile.tsx          # clustering-quality dashboard mockup
│       │   └── RackCard.tsx
│       ├── core/
│       │   ├── moduleLocation.ts             # fixed modules (rack/canvas placement)
│       │   ├── visualizationTiles.ts         # dynamic, multi-instance chart/detail tiles
│       │   ├── useZIndexManager.ts           # shared tile stacking order
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
- No automatic algorithm/parameter optimization ("Pinball Wizard") yet
- Quality Street shows mockup data only; real clustering-quality metrics not yet calculated
- No CSV/M3U/Spotify export yet
- No saving/archiving of chart tiles yet
- No playlist folder structure yet (Archive has one, playlists don't)
- No drag-and-drop for playlists onto Archive/Trash yet (works for Collections; playlists use a context menu instead)
- Generation is synchronous (fine for small libraries; will need background jobs for large ones)
- UI is a functional prototype, not production-polished