import { useRef, useState, useCallback, useEffect } from 'react'
import { UploadTile } from './components/UploadTile'
import { RawListsTile } from './components/RawListsTile'
import { TrashCard } from './components/TrashCard'
import { GenerateTile } from './components/GenerateTile'
import { GeneratedPlaylistsTile } from './components/GeneratedPlaylistsTile'
import { ArchiveTile } from './components/ArchiveTile'
import { VisualizationsTile } from './components/VisualizationsTile'
import { QualityStreetTile } from './components/QualityStreetTile'
import { QualityResultTile } from './components/QualityResultTile'
import { ChartTile } from './components/ChartTile'
import { PlaylistDetailTile } from './components/PlaylistDetailTile'
import { useVisualizationTiles } from './core/visualizationTiles'
import { useZIndexManager } from './core/useZIndexManager'
import { RackCard } from './components/RackCard'
import { GlassFilterDefs } from './components/GlassFilterDefs'
import { useModuleLocations } from './core/moduleLocation'
import type { AnchoredPlaylist, AnchoredGeneration, ModulePosition } from './core/types'
import tapeBackground from './assets/backgrounds/Tape2.jpg'

function App() {
  const { locations, moveToRack, moveToCanvas } = useModuleLocations()
  const rackRef = useRef<HTMLDivElement>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const archiveRef = useRef<HTMLDivElement>(null)
  const chartsPlaylistAnchorRef = useRef<HTMLDivElement>(null)
  const chartsGenerationAnchorRef = useRef<HTMLDivElement>(null)
  const qualityPlaylistAnchorRef = useRef<HTMLDivElement>(null)
  const qualityGenerationAnchorRef = useRef<HTMLDivElement>(null)
  const [anchoredPlaylist, setAnchoredPlaylist] = useState<AnchoredPlaylist | null>(null)
  const [anchoredGeneration, setAnchoredGeneration] = useState<AnchoredGeneration | null>(null)
  const [qualityAnchoredPlaylist, setQualityAnchoredPlaylist] = useState<AnchoredPlaylist | null>(null)
  const [qualityAnchoredGeneration, setQualityAnchoredGeneration] = useState<AnchoredGeneration | null>(null)
  const { bringToFront, getZIndex } = useZIndexManager()
  const { tiles: chartTiles, addTile: addChartTile, removeTile: removeChartTile, bringTileToFront: bringChartTileToFront } = useVisualizationTiles({ bringToFront })

  const handleGeneratePlaylistChart = (chartType: 'radar' | 'tsne' | 'dendrogram', config: import('./core/visualizationTiles').ChartConfig) => {
    if (!anchoredPlaylist) return
    addChartTile(
      { x: 400, y: 200 },
      chartType,
      { type: 'playlist', generationId: anchoredPlaylist.generationId, playlistId: anchoredPlaylist.playlistId },
      config,
    )
  }

  const handleGenerateGenerationChart = (chartType: 'radar' | 'tsne' | 'dendrogram', config: import('./core/visualizationTiles').ChartConfig) => {
    if (!anchoredGeneration) return
    addChartTile(
      { x: 400, y: 200 },
      chartType,
      { type: 'generation', generationId: anchoredGeneration.generationId },
      config,
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
  const [isDraggingOverRack, setIsDraggingOverRack] = useState(false)

  const uploadLocation = locations.upload
  const rawListsLocation = locations.rawLists
  const trashLocation = locations.trash
  const generateLocation = locations.generate
  const generatedLocation = locations.generatedPlaylists
  const archiveLocation = locations.archive
  const visualizationsLocation = locations.visualizations
  const qualityStreetLocation = locations.qualityStreet

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

  const RACK_PROXIMITY_MARGIN = 50

  const handleModuleDragMove = (position: ModulePosition) => {
    const rackBounds = rackRef.current?.getBoundingClientRect()
    if (!rackBounds) return
    const isNear =
      position.x < rackBounds.right + RACK_PROXIMITY_MARGIN &&
      position.x + 40 > rackBounds.left - RACK_PROXIMITY_MARGIN &&
      position.y < rackBounds.bottom + RACK_PROXIMITY_MARGIN &&
      position.y + 40 > rackBounds.top - RACK_PROXIMITY_MARGIN
    setIsDraggingOverRack(isNear)
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
          onDragStart={() => bringToFront('upload')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('upload')}
          onUploadComplete={() => setRawListsRefreshKey((k) => k + 1)}
        />
      )}

      {rawListsLocation.place === 'canvas' && (
         <RawListsTile
          startPosition={rawListsLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('rawLists')
          }}
          onDragStart={() => bringToFront('rawLists')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('rawLists')}
          refreshKey={rawListsRefreshKey}
        />
      )}

      {trashLocation.place === 'canvas' && (
         <TrashCard
          startPosition={trashLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('trash')
          }}
          onDragStart={() => bringToFront('trash')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('trash')}
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
          onDragStart={() => bringToFront('generate')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('generate')}
          onGenerated={loadGenerations}
        />
      )}

      {generatedLocation.place === 'canvas' && (
        <GeneratedPlaylistsTile
          startPosition={generatedLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('generatedPlaylists')
          }}
          onDragStart={() => bringToFront('generatedPlaylists')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('generatedPlaylists')}
          generations={generations}
          onGenerationsChanged={loadGenerations}
          onArchiveChanged={() => setArchiveRefreshKey((k) => k + 1)}
          archiveRefreshKey={archiveRefreshKey}
          trashRef={trashRef}
          archiveRef={archiveRef}
          chartsPlaylistAnchorRef={chartsPlaylistAnchorRef}
          chartsGenerationAnchorRef={chartsGenerationAnchorRef}
          onAnchorPlaylist={setAnchoredPlaylist}
          onAnchorGeneration={setAnchoredGeneration}
          onOpenPlaylistDetail={(generationId, playlistId) =>
            addChartTile({ x: 500, y: 150 }, undefined, { type: 'playlist', generationId, playlistId }, {}, 'playlist-detail')
          }
          qualityPlaylistAnchorRef={qualityPlaylistAnchorRef}
          qualityGenerationAnchorRef={qualityGenerationAnchorRef}
          onAnchorQualityPlaylist={setQualityAnchoredPlaylist}
          onAnchorQualityGeneration={setQualityAnchoredGeneration}
        />
      )}
      
      {archiveLocation.place === 'canvas' && (
        <ArchiveTile
          startPosition={archiveLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('archive')
          }}
          onDragStart={() => bringToFront('archive')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('archive')}
          refreshKey={archiveRefreshKey}
          onItemUnarchived={() => { loadGenerations(); setArchiveRefreshKey((k) => k + 1) }} 
          containerRef={archiveRef}
        />
      )}

      {visualizationsLocation.place === 'canvas' && (
        <VisualizationsTile
          startPosition={visualizationsLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('visualizations')
          }}
          onDragStart={() => bringToFront('visualizations')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('visualizations')}
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

       {qualityStreetLocation.place === 'canvas' && (
         <QualityStreetTile
          startPosition={qualityStreetLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('qualityStreet')
          }}
          onDragStart={() => bringToFront('qualityStreet')}
          onDragMove={handleModuleDragMove}
          zIndex={getZIndex('qualityStreet')}
          playlistAnchorRef={qualityPlaylistAnchorRef}
          generationAnchorRef={qualityGenerationAnchorRef}
          anchoredPlaylist={qualityAnchoredPlaylist}
          anchoredGeneration={qualityAnchoredGeneration}
          onClearPlaylist={() => setQualityAnchoredPlaylist(null)}
          onClearGeneration={() => setQualityAnchoredGeneration(null)}
        />
      )}

       <RackCard
        locations={locations}
        onPullOut={(id, position) => moveToCanvas(id, position)}
        rackRef={rackRef}
        isDragOver={isDraggingOverRack}
      />

      {chartTiles.map((tile) =>
        (tile.kind as any) === 'quality-result' ? (
          <QualityResultTile
            key={tile.id}
            id={tile.id}
            position={tile.position}
            target={tile.source.type === 'playlist' ? 'playlist' : 'generation'}
            label={(tile.config as any).qualityLabel ?? 'Quality Result'}
            zIndex={getZIndex(tile.id)}
            onClose={removeChartTile}
            onFocus={bringChartTileToFront}
          />
        ) : tile.kind === 'playlist-detail' && tile.source.type === 'playlist' ? (
          <PlaylistDetailTile
            key={tile.id}
            id={tile.id}
            position={tile.position}
            generationId={tile.source.generationId}
            playlistId={tile.source.playlistId}
            zIndex={getZIndex(tile.id)}
            onClose={removeChartTile}
            onFocus={bringChartTileToFront}
          />
        ) : tile.chartType ? (
          <ChartTile
            key={tile.id}
            id={tile.id}
            position={tile.position}
            chartType={tile.chartType}
            source={tile.source}
            config={tile.config}
            zIndex={getZIndex(tile.id)}
            onClose={removeChartTile}
            onFocus={bringChartTileToFront}
          />
        ) : null,
      )}
    </div>
  )
}

export default App