# Playlist Generator

**Status: 🚧 Active prototype — core generation, trash handling, and algorithm configuration are working; production polish is still ongoing.**

## What is this?

Playlist Generator creates playlists from a song library using audio features such as danceability, energy, tempo, acousticness, valence, and instrumentalness.

The application is designed around two future modes:

1. **Bulk playlist generation**  
   Upload a complete song library and split it into multiple playlists using clustering.

2. **Themed playlist creation** *(planned)*  
   Describe a mood, theme, genre, artist, or decade and generate a matching playlist through similarity search and embeddings.

The bulk-generation mode is currently implemented and functional.

## Background

The project grew out of the “Moosic” case study from the WBS Coding School Data Science bootcamp.

The original case study used K-Means clustering on Spotify audio features. It showed that audio-only clustering has clear limitations: musically different genres can appear together when they share similar acoustic properties. For example, calm Bossa Nova and classical pieces may be grouped together even though their cultural and stylistic contexts are very different.

The Playlist Generator is intended to extend this approach with:

- multiple clustering algorithms
- additional metadata such as genre, mood, decade, and artist
- LLM-assisted feature enrichment
- embeddings and similarity search
- capacity-aware playlist balancing
- visual diagnostics and quality scores

## Current functionality

### Song library management

- Upload CSV files by drag and drop or file picker
- Detect duplicate uploads
- Display uploaded raw lists in a dedicated tile
- Move raw lists to the Trash
- Restore raw lists
- Permanently delete raw lists
- Drag tiles between the canvas and the collapsible Rack
- Resize and collapse tiles
- Glassmorphism-based draggable interface

### Automatic feature detection

The backend automatically separates detected columns into categories:

- **Audio features**  
  Numeric features used for clustering, such as:
  - danceability
  - energy
  - key
  - loudness
  - mode
  - speechiness
  - acousticness
  - instrumentalness
  - liveness
  - valence
  - tempo
  - time signature

- **Context features**  
  Potentially useful metadata that is currently kept separate, such as:
  - year
  - release year
  - decade
  - duration
  - popularity
  - rank

- **Technical columns**  
  Identifiers and file-related columns that should not influence clustering, such as:
  - IDs
  - track IDs
  - artist IDs
  - album IDs
  - filenames
  - URLs
  - Spotify URIs
  - indexes

The backend also reports ambiguous numeric columns. For example, `key`, `mode`, and `time_signature` are numeric but may be categorical rather than continuous.

### Playlist generation

The Generate tile supports:

- approximate songs-per-playlist mode
- exact number-of-playlists mode
- algorithm selection
- scaler selection
- algorithm-specific parameters
- quality reporting through the Silhouette Coefficient
- persisted generation results
- drill-down from a generation to its individual playlists and tracks

### Supported clustering algorithms

The current implementation supports four algorithms:

#### K-Means

- configurable number of clusters
- suitable when a target number of playlists is known
- currently the main baseline algorithm

#### DBSCAN

- configurable epsilon
- configurable minimum samples
- determines the number of clusters automatically
- can classify songs as noise
- useful for density-based structures, but sensitive to parameter choice

#### Agglomerative Clustering

- configurable number of clusters
- hierarchical bottom-up clustering
- supports different linkage strategies

#### Gaussian Mixture Models

- configurable number of components
- probabilistic clustering model
- assumes approximately Gaussian cluster structures
- can produce highly unbalanced results on unsuitable datasets

### Supported scalers

The current implementation supports:

- `StandardScaler`
- `MinMaxScaler`
- `RobustScaler`
- `PowerTransformer`

Different scalers can produce noticeably different clusters because they change the relative influence of features and outliers.

### Quality evaluation

The current generation result reports the Silhouette Coefficient.

The score is used as a diagnostic indicator, not as an absolute pass/fail criterion:

- higher values generally indicate better separation
- values near zero indicate overlapping clusters
- negative values indicate potentially poor assignments
- DBSCAN noise points require special interpretation
- a good score does not automatically mean a musically meaningful playlist

Additional evaluation metrics and visual diagnostics are planned.

### Generation library

Generated results are persisted on the backend rather than existing only in browser memory.

The Generated Playlists tile supports:

- listing saved generations
- opening a generation
- viewing individual playlists
- viewing tracks inside playlists
- renaming generations
- displaying generation information
- moving complete generations to the Trash
- moving individual playlists to the Trash
- restoring generations
- restoring individual playlists
- permanently deleting generations
- permanently deleting individual playlists

### Trash

The Trash supports three item types:

- raw song lists
- complete generations
- individual playlists

Supported operations include:

- restore
- permanent deletion
- immediate UI refresh after restore
- immediate UI refresh after moving items to Trash
- compact and expanded Trash views
- dropping items into both the compact and expanded Trash tile
- visual feedback when dragging an item over the Trash

### Archive

An Archive tile and folder structure are present as an additional organization concept for generated results.

The Archive is still under active development and requires further polish for:

- consistent handling of root-level items
- folder navigation
- moving complete generations
- moving individual playlists
- archive context menus
- reliable restore and reorganization workflows

## Quality metrics

The current system exposes the Silhouette Coefficient as a first diagnostic metric.

Future evaluation will also consider:

- Davies-Bouldin Index
- Calinski-Harabasz Index
- playlist size balance
- duration balance
- noise percentage for DBSCAN
- genre and mood coherence
- artist diversity
- user-defined playlist constraints
- human listening tests

No single clustering metric can fully measure musical usefulness.

## Planned features

### Metadata enrichment

- genre tagging
- mood tagging
- decade and release-year enrichment
- artist and band metadata
- detection of missing useful features
- optional LLM-assisted enrichment after upload

### Embeddings and similarity search

- combined audio-feature and metadata embeddings
- separate weighting for audio, genre, mood, and time period
- free-text playlist prompts
- similarity search using cosine similarity
- vector storage using FAISS, Chroma, or a comparable solution

### Themed playlist mode

Users should eventually be able to select or describe:

- mood
- genre
- artist
- decade
- playlist length
- number of songs
- functional categories such as workout, party, driving, or heartbreak

Every category should support a neutral “no preference” option.

### Playlist balancing

Future versions should support:

- approximate or exact playlist sizes
- duration targets
- capacity-aware reassignment
- balancing oversized and undersized clusters
- optional removal or isolation of extreme outliers

### Automatic optimization

A future “Optimize automatically” mode may compare:

- algorithms
- scalers
- cluster counts
- DBSCAN parameters
- linkage strategies
- GMM parameters
- feature weights

The best configuration should be selected using a combined objective that considers both statistical quality and practical playlist balance.

### Visualizations

Planned visual diagnostics include:

- radar charts per playlist
- cluster overview charts
- t-SNE or UMAP projections
- feature distributions
- cluster size and duration comparisons
- algorithm and scaler comparison views

### Export and integrations

- CSV export
- M3U export
- Spotify playlist export
- possible Spotify API integration
- external playlist import

### Long-running jobs

The current generation process is synchronous and suitable for small datasets.

For larger libraries and LLM enrichment, the backend will eventually need:

- background jobs
- progress reporting
- cancellation
- job history
- error recovery
- rate-limit handling

## Tech stack

- **Backend:** Python, FastAPI, pandas, scikit-learn
- **Frontend:** React, TypeScript, Vite
- **Styling:** Tailwind CSS
- **Storage:** JSON files for generations and local SQLite storage for archive data
- **UI:** draggable glassmorphism tiles, collapsible modules, Rack, Trash, and Archive
- **Planned search layer:** FAISS, Chroma, or another vector database
- **Planned AI layer:** LLM-assisted metadata enrichment and free-text interpretation

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
│       │   ├── TrashContentsCard.tsx
│       │   ├── GenerateTile.tsx
│       │   ├── GeneratedPlaylistsTile.tsx
│       │   ├── ArchiveTile.tsx
│       │   └── RackCard.tsx
│       ├── core/
│       │   ├── moduleLocation.ts
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

Runtime data under `data/` is local application data and should not normally be committed to Git.

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

Open the URL printed by Vite. The default is usually:

```text
http://localhost:5173
```

If that port is already in use, Vite selects the next available port.

## Current limitations

- Themed playlist creation is not implemented yet
- No genre, mood, decade, or artist enrichment pipeline
- No LLM integration
- No embeddings or vector database
- No free-text playlist prompts
- Playlist sizes are not yet capacity-balanced
- Statistical quality does not necessarily equal musical quality
- No automatic algorithm and scaler optimization
- No radar charts or t-SNE/UMAP views
- Archive workflows still need further polish
- No CSV or M3U export
- No Spotify API integration
- Generation is currently synchronous
- Runtime test data still needs better Git exclusion and cleanup
- The current UI is a functional prototype rather than a production-ready application