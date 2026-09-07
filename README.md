# Playlist Generator

**Status: 🚧 Early development — core vertical slice working, no production polish yet**

## What is this?

A tool that automatically generates playlists from a song library — using audio features (danceability, energy, tempo, etc.) and K-Means clustering.

Two intended modes (only Mode B implemented so far):

1. **Themed playlist creation** (not yet built): describe a mood or theme, get a matching playlist from the pool.
2. **Bulk playlist generation** (working prototype): upload a full song library, the tool splits it into multiple coherent playlists automatically.

## Background

Grew out of the "Moosic" case study from a Data Science bootcamp (WBS Coding School), which explored K-Means clustering on Spotify audio features. Pure feature clustering hit limits there (e.g. Bossa Nova and classical pieces landed in the same cluster because both are acoustic/calm, despite being culturally unrelated). This project is meant to extend that approach further, eventually with LLM-based genre/mood tagging.

## Tech stack

- **Backend:** Python, FastAPI, scikit-learn (K-Means, scalers), pandas
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Storage:** flat files on disk (no database) — raw song lists and generated playlist results are stored as CSV/JSON under `data/`
- **UI concept:** draggable glass-morphism tiles that can be moved between a canvas and a collapsible "Rack" (borrowed from a sibling project, Vroomfondel)

## Current features

- Upload a CSV of songs (drag & drop or file picker), with duplicate detection
- Raw song lists are listed, individually draggable, and can be moved to a trash tile (soft delete — restorable or permanently deletable)
- Automatic feature detection: numeric audio features vs. context columns (year, duration, popularity) vs. technical columns (IDs, filenames) — with warnings for ambiguous columns (key, mode, time_signature)
- Generate playlists from a raw list, targeting either an approximate number of songs per playlist or an exact number of playlists
- Generated results are persisted on the backend (not just in browser memory) and browsable as a small library, with a drill-down view per generation showing individual playlists and their tracks

## Project structure

    playlist_generator/
    ├── backend/
    │   └── app/
    │       └── main.py          # FastAPI app: upload, list, trash, generate, generations
    ├── frontend/
    │   └── src/
    │       ├── components/      # all UI tiles (Upload, RawLists, Trash, Generate, GeneratedPlaylists, Rack)
    │       ├── core/            # shared hooks (drag, resize, detach) and module location state
    │       └── assets/
    ├── data/                    # uploaded CSVs, trash, generated results (not versioned)
    └── docs/

## Running locally

**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```


**Frontend:**
```bash
cd frontend
npm run dev
```

Then open the URL Vite prints (default is `http://localhost:5173`, but it automatically picks the next free port if that one is already in use).


## Known limitations / not yet built

- No renaming for generations or individual playlists yet
- Individual playlists inside a generation are not yet draggable/deletable (only whole raw lists and the generations library as a whole support the drag-to-rack/trash pattern so far)
- No genre/mood/decade filtering, no free-text theme input, no LLM tagging
- No export (CSV/M3U)
- No capacity-aware balancing — playlist sizes from K-Means are approximate, not exact
- No configurable scaler choice in the UI yet (backend supports it, but only "standard" is exposed)
- No Advanced Settings panel (PCA on/off, n_init, max_iter, random_state, feature weighting) — planned as a progressive-disclosure section, not built yet
- No visualization (radar charts per playlist, t-SNE cluster overview) — planned but deferred until the core pipeline is proven
- No automated hyperparameter tuning (comparing scalers/PCA/k automatically by silhouette score) — deferred by design until the basic pipeline is proven
- No job/progress system for long-running generations — current approach is synchronous, fine for small datasets, will need revisiting at scale (thousands of songs, LLM tagging)
- No Spotify API integration — results are browser-viewable only, no direct playlist export to Spotify