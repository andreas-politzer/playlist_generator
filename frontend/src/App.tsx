import { useRef, useState } from 'react'
import { UploadTile } from './components/UploadTile'
import { RawListsTile } from './components/RawListsTile'
import { TrashCard } from './components/TrashCard'
import { GenerateTile } from './components/GenerateTile'
import { GeneratedPlaylistsTile } from './components/GeneratedPlaylistsTile'
import { RackCard } from './components/RackCard'
import { GlassFilterDefs } from './components/GlassFilterDefs'
import { useModuleLocations } from './core/moduleLocation'
import tapeBackground from './assets/backgrounds/Tape2.jpg'

function App() {
  const { locations, moveToRack, moveToCanvas } = useModuleLocations()
  const rackRef = useRef<HTMLDivElement>(null)
  const [rawListsRefreshKey, setRawListsRefreshKey] = useState(0)
  const [generationsRefreshKey, setGenerationsRefreshKey] = useState(0)

  const uploadLocation = locations.upload
  const rawListsLocation = locations.rawLists
  const trashLocation = locations.trash
  const generateLocation = locations.generate
  const generatedLocation = locations.generatedPlaylists

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
        />
      )}

      {generateLocation.place === 'canvas' && (
        <GenerateTile
          startPosition={generateLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('generate')
          }}
          onGenerated={() => setGenerationsRefreshKey((k) => k + 1)}
        />
      )}

      {generatedLocation.place === 'canvas' && (
        <GeneratedPlaylistsTile
          startPosition={generatedLocation.position}
          onDragEnd={(bounds) => {
            if (checkRackOverlap(bounds)) moveToRack('generatedPlaylists')
          }}
          refreshKey={generationsRefreshKey}
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