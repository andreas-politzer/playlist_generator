# Playlist Generator

**Status: 🚧 Active prototype.** Core generation, tile-based UI, Trash, Archive, a full Charts/Visualizations module, a complete editable Playlist Detail view with PDF export, a fully backed Quality Street metrics dashboard, and a working automated optimizer ("Pinball Wizard") are all working. Production polish is ongoing.

## What is this?

Playlist Generator turns a song library into a set of playlists using unsupervised machine learning on audio features (danceability, energy, tempo, acousticness, valence, instrumentalness, and more). It grew out of the "Moosic" case study from the WBS Coding School Data Science bootcamp, which showed that audio-only clustering has real limits — e.g. calm Bossa Nova and classical pieces can end up in the same cluster despite being musically unrelated. This project exists to push past that limit, and to see how far a bootcamp exercise can be taken when you keep pulling the thread.

## Current state (short version)

- **Song library management**: upload, Trash, restore, drag-and-drop tile UI (Rack ↔ Canvas)
- **Generation**: 5 clustering algorithms (K-Means, DBSCAN, HDBSCAN, Agglomerative, GMM), 4 scalers, automatic audio-feature detection, Silhouette scoring, persisted results
- **Expert Mode**: optional PCA / Kernel PCA dimensionality reduction before clustering, manual control over n_init, max_iter, and random_state
- **Music Library**: browse generated Collections, drill into individual Playlists, rename both Collections and individual Playlists, per-playlist context menu (open, rename, move to Archive, move to Trash, drag-and-drop for Collections), a flat "Playlists" view across all Collections in addition to the Collections view, all actions apply optimistic UI updates (instant feedback, no waiting on the network)
- **Archive**: folder structure for archiving Collections and Playlists, restore, move between folders
- **Charts**: a dedicated visualization module — anchor a Playlist or Collection by drag-and-drop, generate any of three chart types, compare multiple charts side by side as independent, draggable canvas tiles:
  - **Radar**: raw or scaled values (toggleable), dynamic feature selection, collection-normalized raw values, interactive side legend with hover-highlight and click-to-hide
  - **t-SNE**: custom Canvas rendering (handles thousands of points smoothly), adjustable perplexity
  - **Dendrogram**: choice of linkage method and raw/scaled data, automatic truncation for large collections, colored branches
- **Playlist Detail view**: a large, editable table per playlist — add or remove tracks (including hand-entered ones with no audio features), toggle any extra CSV columns as columns, add fully custom user-defined columns, an auto-saving free-text note per playlist, and PDF export (respects the currently visible columns)
- **Quality Street**: a dedicated clustering-quality dashboard, fully backed by live calculations — Statistical Metrics (Silhouette Score, Calinski-Harabasz Index, Davies-Bouldin Index, Cluster Balance, Noise Ratio) for a Collection, Music-Specific Metrics (Tempo Dispersion, Energy Dispersion, Artist Diversity) for a Playlist, all computed dynamically from the current state (reflects edits made in the Playlist Detail view). Includes an interactive Silhouette Plot (per-song values, grouped and colored by cluster) opened from its own icon. Elbow Point and Harmonic Compatibility are shown as visible "not yet available" placeholders, reserved for the Pinball Wizard and future track-ordering support respectively.
- **Pinball Wizard**: an automated hyperparameter optimizer for an existing Collection. Drag a Collection onto its anchor, pick an intent preset (Genre Discovery / DJ Set-Flow / Balanced Default), optionally set a target playlist count, and it runs a background Optuna job (multi-objective, NSGA-II) across all 5 algorithms, 4 scalers, and optional PCA — with escalating guardrail levels (strict → moderate → relaxed) if the strictest rules can't be satisfied, and a live progress bar with cancel support. Presents up to 3 Pareto-optimal, meaningfully different candidates, each with an on-demand permutation-test button to check statistical significance against random cluster assignments. "Create Optimized Collection" runs the winning pipeline on the full collection and saves it as a new, separate Collection (original untouched) with a full audit trail ("Liner Notes": source collection, exact pipeline used, before/after metrics) accessible right from the Music Library.
- **Fullscreen mode** for the canvas
- Tile stacking order (click/drag brings a tile to front) works uniformly across all tiles, fixed and dynamic alike

Full drag-and-drop mechanics (Trash, Archive drop targets, tile resizing/collapsing) all work and are considered a solved problem — not detailed further here.

## The vision

The long-term goal is a tool that goes well beyond single-pass unsupervised clustering, combining several layers:

### 1. Richer unsupervised clustering
- **Multi-stage / consensus clustering**: chain algorithms instead of running one in isolation — e.g. run HDBSCAN first to strip outliers/noise from a large library, then run K-Means on the cleaned remainder to get tighter, more balanced clusters. A further step would run several algorithms in parallel and combine their results via a co-association (consensus) matrix, with a staged strategy for large collections (exact matrix for small collections, sampling/blocking for larger ones); iterative refinement (re-assigning poorly-fitting songs) is a longer-term stretch goal.
- **Dimensionality reduction**: standard PCA is already integrated into the Pinball Wizard's search space. Kernel PCA (for non-linear structure) is a deliberately separate, later step, given its higher memory cost on large collections.
- **"Audio Profile Match"**: inferring rough "sonic character" clusters purely from audio characteristics (e.g. high loudness + high tempo), explicitly NOT framed as genre detection — audio features alone can't reliably distinguish e.g. death metal from aggressive electronic music. A deliberate, honest stretch goal that also illustrates the boundary between unsupervised and supervised approaches.

### 2. Clustering quality evaluation ("Quality Street") — mostly done
Silhouette, Calinski-Harabasz, Davies-Bouldin, Cluster Balance, and Noise Ratio are live for Collections; Tempo/Energy Dispersion and Artist Diversity are live for Playlists. Elbow Point (model-selection tool, better suited to the Pinball Wizard than a post-hoc quality check) and Harmonic Compatibility (needs a meaningful track order, which doesn't exist yet) remain open, visible placeholders. A permutation test (comparing CH/DB against randomized cluster assignments) is available on-demand in the Pinball Wizard for its candidates; bringing the same test into Quality Street itself is a possible next step.

### 3. "Pinball Wizard": automated hyperparameter optimization — implemented, being refined
Runs in the background (thread pool, live job status, cooperative cancellation) so the rest of the app stays responsive. Currently: multi-objective Optuna search, all 5 clustering algorithms, all 4 scalers, PCA, escalating guardrail levels, on-demand permutation testing. Planned refinements: dynamic DBSCAN `eps` derivation (currently a fixed range), Kernel PCA as a separate search option, user-configurable guardrail thresholds, accepting a raw (not-yet-clustered) song list as an alternative input source, and eventually combining with consensus clustering — optimize each algorithm individually first, then combine the optimized results.

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

### 8. Human-in-the-loop listening
Connecting a real streaming API (Spotify, SoundCloud) so playlist candidates can actually be listened to rather than only evaluated numerically — a genuine check against the audio-feature-only blind spots described above. Not yet researched in depth (API/licensing terms for preview playback need verification); would likely live in the Playlist Detail view rather than inside the Wizard itself.

### 9. Further export & integration
CSV/M3U export, possibly direct Spotify integration.

## Tech stack

- **Backend:** Python, FastAPI, pandas, scikit-learn, scipy, reportlab (PDF generation), Optuna (Bayesian/multi-objective hyperparameter optimization)
- **Frontend:** React, TypeScript, Vite, Recharts, native Canvas (for t-SNE, dendrograms, and the silhouette plot)
- **Styling:** Tailwind CSS
- **Storage:** JSON files for generation results, SQLite for archive data, in-memory job store for Pinball Wizard runs (jobs are lost on backend restart — acceptable for a single-user prototype)
- **Planned:** FAISS/Chroma for semantic search, LLM API integration for enrichment, streaming API integration for playback

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
│       │   ├── SilhouetteCanvas.tsx           # custom Canvas renderer for the silhouette plot
│       │   ├── PlaylistDetailTile.tsx         # editable playlist table, dynamically spawned
│       │   ├── QualityStreetTile.tsx          # clustering-quality dashboard
│       │   ├── PinballWizardTile.tsx          # automated hyperparameter optimizer
│       │   ├── LinerNotesTile.tsx             # audit trail for a Wizard-optimized collection
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
- No consensus/multi-stage clustering yet (single-algorithm generation only, including within the Pinball Wizard)
- Pinball Wizard runs synchronously per-request in a single background thread (no distributed job queue); only one optimization can run at a time; job state is in-memory only and lost on backend restart
- Pinball Wizard: DBSCAN's `eps` search range is currently fixed rather than derived from the data; Kernel PCA is not yet in the search space; guardrail thresholds are not yet user-configurable; only accepts an existing Collection as input, not a raw/unclustered song list
- No CSV/M3U/Spotify export yet, no streaming-API listening integration yet
- No saving/archiving of chart, silhouette-plot, or liner-notes tiles yet
- No playlist folder structure yet (Archive has one, playlists don't)
- No drag-and-drop for playlists onto Archive/Trash yet (works for Collections; playlists use a context menu instead)
- Generation and Wizard optimization are backend-blocking while running (Wizard runs are backgrounded but still tie up the single worker thread; large collections will need proper background job infrastructure)
- UI is a functional prototype, not production-polished