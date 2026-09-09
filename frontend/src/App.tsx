import { useRef, useState, useCallback, useEffect } from 'react'
import { UploadTile } from './components/UploadTile'
import { RawListsTile } from './components/RawListsTile'
import { TrashCard } from './components/TrashCard'
import { GenerateTile } from './components/GenerateTile'
import { GeneratedPlaylistsTile } from './components/GeneratedPlaylistsTile'
import { ArchiveTile } from './components/ArchiveTile'
import { VisualizationsTile } from './components/VisualizationsTile'
import { ChartTile } from './components/ChartTile'
import { useVisualizationTiles } from './core/visualizationTiles'
import { RackCard } from './components/RackCard'
import { GlassFilterDefs } from './components/GlassFilterDefs'
import { useModuleLocations } from './core/moduleLocation'
import type { AnchoredPlaylist, AnchoredGeneration } from './core/types'
import tapeBackground from './assets/backgrounds/Tape2.jpg'

function App() {
  const { locations, moveToRack, moveToCanvas } = useModuleLocations()
  const rackRef = useRef<HTMLDivElement>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const archiveRef = useRef<HTMLDivElement>(null)
  const chartsPlaylistAnchorRef = useRef<HTMLDivElement>(null)
  const chartsGenerationAnchorRef = useRef<HTMLDivElement>(null)
  const [anchoredPlaylist, setAnchoredPlaylist] = useState<AnchoredPlaylist | null>(null)
  const [anchoredGeneration, setAnchoredGeneration] = useState<AnchoredGeneration | null>(null)
  const { tiles: chartTiles, addTile: addChartTile, removeTile: removeChartTile, bringTileToFront: bringChartTileToFront } = useVisualizationTiles()

  const handleGeneratePlaylistChart = (chartType: 'radar' | 'tsne' | 'dendrogram') => {
    if (!anchoredPlaylist) return
    addChartTile(
      { x: 400, y: 200 },
      chartType,
      { type: 'playlist', generationId: anchoredPlaylist.generationId, playlistId: anchoredPlaylist.playlistId },
    )
  }

  const handleGenerateGenerationChart = (chartType: 'radar' | 'tsne' | 'dendrogram') => {
    if (!anchoredGeneration) return
    addChartTile(
      { x: 400, y: 200 },
      chartType,
      { type: 'generation', generationId: anchoredGeneration.generationId },
    )
  }
  const [rawListsRefreshKey, setRawListsRefreshKey] = useState(0)
  const [trashRefreshKey, setTrashRefreshKey] = useState(0)
  const [generations, setGenerations] = useState<any[]>([])

  const loadGenerations = useCallback(async () => {
    const response = await fetch('http://localhost:8001/generations', { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json()
    setGenerations(data)
    setTrashRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    loadGenerations()
  }, [loadGenerations])
  const [archiveRefreshKey, setArchiveRefreshKey] = useState(0)

  const uploadLocation = locations.upload
  const rawListsLocation = locations.rawLists
  const trashLocation = locations.trash
  const generateLocation = locations.generate
  const generatedLocation = locations.generatedPlaylists
  const archiveLocation = locations.archive
  const visualizationsLocation = locations.visualizations

  const checkRackOverlap = (bounds: DOMRect | undefined) => {
    const rackBounds = rackRef.current?.getBoundingClientRect()
    return !!(
      rackBounds &&
      bounds &&
      bounds.left < rackBounds.right &&
      bounds.right > rackBounds.left &&
      bounds.top < rackBounds.bottom &&
      bounds.bottom > rackBounds.top
    )
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        backgroundImage: `url(${tapeBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <GlassFilterDefs />

      <button
        onClick={() => {
          const el = document.documentElement
          if (!document.fullscreenElement) {
            el.requestFullscreen()
          } else {
            document.exitFullscreen()
          }
        }}
        className="fixed top-2 right-2 z-[9999] bg-black/40 hover:bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm"
      >
        ⛶ 
      </button>

      {uploadLocation.place === 'canvas' && (
        <UploadTile
          startPosition={uploadLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('upload')
          }}
          onUploadComplete={() => setRawListsRefreshKey((k) => k + 1)}
        />
      )}

      {rawListsLocation.place === 'canvas' && (
        <RawListsTile
          startPosition={rawListsLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('rawLists')
          }}
          refreshKey={rawListsRefreshKey}
        />
      )}

      {trashLocation.place === 'canvas' && (
        <TrashCard
          startPosition={trashLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('trash')
          }}
          onItemMoved={() => setRawListsRefreshKey((k) => k + 1)}
          onGenerationRestored={loadGenerations}
          refreshKey={trashRefreshKey}
          containerRef={trashRef}
        />
      )}

      {generateLocation.place === 'canvas' && (
        <GenerateTile
          startPosition={generateLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('generate')
          }}
          onGenerated={loadGenerations}
        />
      )}

      {generatedLocation.place === 'canvas' && (
        <GeneratedPlaylistsTile
          startPosition={generatedLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('generatedPlaylists')
          }}
          generations={generations}
          onGenerationsChanged={loadGenerations}
          onArchiveChanged={() => setArchiveRefreshKey((k) => k + 1)}
          trashRef={trashRef}
          archiveRef={archiveRef}
          chartsPlaylistAnchorRef={chartsPlaylistAnchorRef}
          chartsGenerationAnchorRef={chartsGenerationAnchorRef}
          onAnchorPlaylist={setAnchoredPlaylist}
          onAnchorGeneration={setAnchoredGeneration}
        />
      )}
      
      {archiveLocation.place === 'canvas' && (
        <ArchiveTile
          startPosition={archiveLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('archive')
          }}
          refreshKey={archiveRefreshKey}
          onItemUnarchived={loadGenerations} 
          containerRef={archiveRef}
        />
      )}

      {visualizationsLocation.place === 'canvas' && (
        <VisualizationsTile
          startPosition={visualizationsLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('visualizations')
          }}
          playlistAnchorRef={chartsPlaylistAnchorRef}
          generationAnchorRef={chartsGenerationAnchorRef}
          anchoredPlaylist={anchoredPlaylist}
          anchoredGeneration={anchoredGeneration}
          onClearPlaylist={() => setAnchoredPlaylist(null)}
          onClearGeneration={() => setAnchoredGeneration(null)}
          onGeneratePlaylistChart={handleGeneratePlaylistChart}
          onGenerateGenerationChart={handleGenerateGenerationChart}
        />
      )}

      <RackCard
        locations={locations}
        onPullOut={(id, position) => moveToCanvas(id, position)}
        rackRef={rackRef}
      />

      {chartTiles.map((tile) => (
        <ChartTile
          key={tile.id}
          id={tile.id}
          position={tile.position}
          chartType={tile.chartType}
          source={tile.source}
          onClose={removeChartTile}
        />
      ))}
    </div>
  )
}

export default App