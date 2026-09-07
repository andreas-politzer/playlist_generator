# Playlist Generator

**Status: 🚧 Frühe Konzept-/Setup-Phase — noch kein funktionierender Code**

## Was ist das?

Ein Tool, das automatisch Spotify-artige Playlists generiert — auf zwei Arten:

1. **Themenbasiert:** Du gibst ein Thema/eine Stimmung vor (z. B. "Party", "Chill", "80er Jahre") oder beschreibst frei in eigenen Worten, wonach dir ist (z. B. "wie es ist, im Regen spazieren zu gehen") — das Tool sucht dir passende Songs aus einer Songbibliothek zusammen.
2. **Bulk-Sortierung:** Du lädst eine komplette Songbibliothek hoch, das Tool teilt sie automatisch in mehrere sinnvolle, in sich stimmige Playlists auf (z. B. 100 Playlists à ca. 50 Songs).

## Hintergrund

Entstanden als Weiterentwicklung der "Moosic"-Case-Study aus einem Data-Science-Kurs (WBS Coding School), in der es um K-Means-Clustering von Spotify-Songs anhand von Audio-Features (Tempo, Energie, Tanzbarkeit, etc.) ging. Reines Feature-Clustering stieß dabei an Grenzen (z. B. wurden Bossa-Nova- und Klassik-Songs im selben Cluster gruppiert, weil beide akustisch/ruhig sind, obwohl musikalisch-kulturell sehr unterschiedlich). Dieses Projekt erweitert den Ansatz um LLM-generierte Genre-/Mood-Einordnung, um dieses Problem zu adressieren.

## Tech-Stack (geplant)

- **Backend:** Python, FastAPI
- **Frontend:** React
- **ML/Data:** scikit-learn (K-Means, Scaler), Embeddings für Genre/Mood
- **Optional später:** Vektordatenbank (Chroma/FAISS) für Ähnlichkeitssuche

## Projektstruktur

    playlist_generator/
    ├── backend/          # FastAPI-Backend
    │   ├── app/
    │   │   ├── api/          # Endpunkte/Routen
    │   │   ├── core/         # Konfiguration
    │   │   ├── models/       # Datenmodelle
    │   │   ├── services/     # Geschäftslogik (Embeddings, Clustering, LLM-Tagging)
    │   │   └── utils/
    │   └── tests/
    ├── frontend/         # React-Frontend
    │   └── src/
    │       ├── components/
    │       ├── hooks/
    │       ├── context/
    │       ├── pages/
    │       ├── services/     # API-Anbindung
    │       ├── styles/
    │       └── utils/
    ├── data/             # Song-Datensätze (nicht versioniert, siehe .gitignore)
    ├── notebooks/        # Experimentelle Jupyter-Notebooks
    └── docs/             # Architektur-/Konzeptdokumentation

## Aktueller Stand

Reine Konzeptphase abgeschlossen (Feature-Sammlung, Architektur-Grobplanung), Projektstruktur angelegt. Nächste Schritte: React-Frontend-Grundgerüst aufsetzen, danach Backend-Logik (LLM-Tagging-Pipeline, Embeddings, Clustering).

Ausführliche Konzeptnotizen liegen im persönlichen Notizsystem des Entwicklers, nicht in diesem Repo.