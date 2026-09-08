import { useRef, useState, useCallback, useEffect } from 'react'
import { UploadTile } from './components/UploadTile'
import { RawListsTile } from './components/RawListsTile'
import { TrashCard } from './components/TrashCard'
import { GenerateTile } from './components/GenerateTile'
import { GeneratedPlaylistsTile } from './components/GeneratedPlaylistsTile'
import { ArchiveTile } from './components/ArchiveTile'
import { RackCard } from './components/RackCard'
import { GlassFilterDefs } from './components/GlassFilterDefs'
import { DebugPanel, debugLog } from './components/DebugPanel'
import { useModuleLocations } from './core/moduleLocation'
import tapeBackground from './assets/backgrounds/Tape2.jpg'

function App() {
  const appRenderCount = useRef(0)
  appRenderCount.current += 1

  const { locations, moveToRack, moveToCanvas } = useModuleLocations()
  const rackRef = useRef<HTMLDivElement>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const archiveRef = useRef<HTMLDivElement>(null)
  const [rawListsRefreshKey, setRawListsRefreshKey] = useState(0)
  const [trashRefreshKey, setTrashRefreshKey] = useState(0)
  const [generations, setGenerations] = useState<any[]>([])

  const loadGenerations = useCallback(async () => {
    const response = await fetch('http://localhost:8001/generations', { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json()
    setGenerations(data)
    setTrashRefreshKey((k) => k + 1)
    debugLog(`loadGenerations: ${data.length} items, ids: ${data.map((g: any) => 
    g.id.slice(0,8)).join(',')}`)
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
      <div className="fixed left-2 top-2 z-[99999] bg-red-600 px-2 py-1 text-xs text-white">
      APP RENDER: {appRenderCount.current} · GENERATIONS: {generations.length}
      </div>

      <GlassFilterDefs />
      <DebugPanel />

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
          key={generations.map((g) => g.id).join('|')}
          startPosition={generatedLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('generatedPlaylists')
          }}
          generations={generations}
          onGenerationsChanged={loadGenerations}
          trashRef={trashRef}
          archiveRef={archiveRef}
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

      <RackCard
        locations={locations}
        onPullOut={(id, position) => moveToCanvas(id, position)}
        rackRef={rackRef}
      />
    </div>
  )
}

export default App