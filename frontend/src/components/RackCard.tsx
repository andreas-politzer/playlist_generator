import { DraggableGlass } from './DraggableGlass'
import { RackTile, TILE_SIZE } from './RackTile'
import type { ModuleId, Location } from '../core/moduleLocation'
import type { ModulePosition } from '../core/types'

const MODULE_LABELS: Record<ModuleId, string> = {
  upload: 'Upload',
  rawLists: 'Raw Lists',
  trash: 'Trash',
  generate: 'Generate',
  generatedPlaylists: 'Generated Playlists',
  archive: 'Archive',
}

const GAP = 12
const PADDING = 32
const HEADER_HEIGHT = 72
const TILES_PER_ROW = 4

function calculateMinSize(moduleCount: number) {
  if (moduleCount === 0) {
    return { width: 320, height: 140 }
  }
  const columns = Math.min(moduleCount, TILES_PER_ROW)
  const rows = Math.ceil(moduleCount / TILES_PER_ROW)

  // +1px Sicherheitsmarge pro Kachel für Border-Rundungsfehler bei Subpixel-Rendering
  const width = columns * (TILE_SIZE.width + 2) + (columns - 1) * GAP + PADDING * 2
  const height = rows * (TILE_SIZE.height + 2) + (rows - 1) * GAP + PADDING * 2 + HEADER_HEIGHT

  return { width, height }
}

export function RackCard({
  locations,
  onPullOut,
  rackRef,
}: {
  locations: Record<ModuleId, Location>
  onPullOut: (id: ModuleId, position: ModulePosition) => void
  rackRef: React.RefObject<HTMLDivElement | null>
}) {
  const modulesInRack = (Object.keys(locations) as ModuleId[]).filter((id) => locations[id].place === 'rack')
  const minSize = calculateMinSize(modulesInRack.length)

  return (
    <DraggableGlass
      containerRef={rackRef}
      initialPosition={{ x: 180, y: 580 }}
      initialSize={minSize}
      minSize={minSize}
      title="Rack"
      className="rounded-3xl"
      collapsible
      defaultOpen={false}
    >
      <div className="px-6 pb-6 flex-1 flex flex-wrap items-start content-start gap-3 overflow-visible">
        {modulesInRack.length === 0 && (
          <span className="text-xs font-body text-white/40">Empty — all modules are on the canvas</span>
        )}
        {modulesInRack.map((id) => (
          <RackTile key={id} id={id} label={MODULE_LABELS[id]} rackRef={rackRef} onPullOut={onPullOut} />
        ))}
      </div>
    </DraggableGlass>
  )
}