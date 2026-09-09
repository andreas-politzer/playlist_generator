import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DraggableGlass } from './DraggableGlass'
import { ContextMenu } from './ContextMenu'
import { RenameDialog } from './RenameDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { GenerationInfoDialog } from './GenerationInfoDialog'
import { PreviewGhost } from './PreviewGhost'
import { debugLog } from './DebugPanel'
import type { ModulePosition } from '../core/types'

const WOBBLE_THRESHOLD_PX = 40

interface GenerationSummary {
  id: string
  name: string
  created_at: string
  songs_total: number
  playlist_count: number
  silhouette: number | null
}

interface Track {
  name: string
  artist: string
  duration_ms: number | null
}

interface Cluster {
  cluster_id: number
  playlist_id: string
  song_count: number
  duration_ms: number | null
  tracks: Track[]
}

interface GenerationDetail extends GenerationSummary {
  clusters: Cluster[]
}

async function fetchGenerationDetail(id: string): Promise<GenerationDetail> {
  const response = await fetch(`http://localhost:8001/generations/${id}`)
  if (!response.ok) throw new Error('Failed to fetch generation detail')
  return response.json()
}

async function deleteGeneration(id: string): Promise<void> {
  await fetch(`http://localhost:8001/generations/${id}`, { method: 'DELETE' })
}

async function archiveGeneration(id: string): Promise<void> {
  await fetch(`http://localhost:8001/archive/items/generation/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: null }),
  })
}

async function archivePlaylist(playlistId: string, generationId: string): Promise<void> {
  await fetch(`http://localhost:8001/archive/items/playlist/${playlistId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: null, generation_id: generationId }),
  })
}

async function trashPlaylist(
  playlistId: string,
  generationId: string,
): Promise<void> {
  const response = await fetch(
    `http://localhost:8001/generations/${generationId}/playlists/${playlistId}`,
    { method: 'DELETE' },
  )

  if (!response.ok) {
    throw new Error('Playlist konnte nicht in den Papierkorb verschoben werden.')
  }
}

async function renameGeneration(id: string, name: string): Promise<void> {
  await fetch(`http://localhost:8001/generations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`
}

function checkOverlap(bounds: DOMRect | undefined, targetRef: React.RefObject<HTMLDivElement | null>): boolean {
  const targetBounds = targetRef.current?.getBoundingClientRect()
  if (!bounds || !targetBounds) return false
  return (
    bounds.left < targetBounds.right &&
    bounds.right > targetBounds.left &&
    bounds.top < targetBounds.bottom &&
    bounds.bottom > targetBounds.top
  )
}

// Pointer-basiertes Ziehen mit Wobble + Ghost-Vorschau, prüft beim Loslassen
// Überlappung mit Trash (löschen) ODER Archive (archivieren) — nicht beides gleichzeitig möglich.
function useDropOnTarget(
  onDroppedOnTrash: () => void,
  onDroppedOnArchive: () => void,
  previewSize: { width: number; height: number },
  trashRef: React.RefObject<HTMLDivElement | null>,
  archiveRef: React.RefObject<HTMLDivElement | null>,
  chartsAnchorRef?: React.RefObject<HTMLDivElement | null>,
  onDroppedOnChartsAnchor?: () => void,
) {
  const [isWobbling, setIsWobbling] = useState(false)
  const didDragRef = useRef(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [previewPos, setPreviewPos] = useState<ModulePosition | null>(null)

  const setTargetFeedback = (
    targetRef: React.RefObject<HTMLDivElement | null>,
    active: boolean,
  ) => {
    const element = targetRef.current
    if (!element) return

    element.style.transition = 'transform 150ms ease, filter 150ms ease'
    element.style.transform = active ? 'scale(1.12)' : ''
    element.style.filter = active
      ? 'drop-shadow(0 0 16px rgba(255,255,255,0.8))'
      : ''
  }

  const clearTargetFeedback = () => {
    setTargetFeedback(trashRef, false)
    setTargetFeedback(archiveRef, false)
    if (chartsAnchorRef) setTargetFeedback(chartsAnchorRef, false)
  }

  const onGripPointerDown = (e: React.PointerEvent) => {
    setDragStart({ x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onGripPointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < WOBBLE_THRESHOLD_PX) {
      setIsWobbling(distance > 4)
      setPreviewPos(null)
      clearTargetFeedback()
      return
    }

    setIsWobbling(false)
    didDragRef.current = true

    const nextPreviewPos = {
      x: e.clientX - previewSize.width / 2,
      y: e.clientY - previewSize.height / 2,
    }

    setPreviewPos(nextPreviewPos)

    const bounds = {
      left: nextPreviewPos.x,
      right: nextPreviewPos.x + previewSize.width,
      top: nextPreviewPos.y,
      bottom: nextPreviewPos.y + previewSize.height,
    } as DOMRect

    setTargetFeedback(trashRef, checkOverlap(bounds, trashRef))
    setTargetFeedback(archiveRef, checkOverlap(bounds, archiveRef))
    if (chartsAnchorRef) setTargetFeedback(chartsAnchorRef, checkOverlap(bounds, chartsAnchorRef))
  }

    const onGripPointerUp = () => {
    if (previewPos) {
      const bounds = {
        left: previewPos.x,
        right: previewPos.x + previewSize.width,
        top: previewPos.y,
        bottom: previewPos.y + previewSize.height,
      } as DOMRect

      if (checkOverlap(bounds, trashRef)) {
        debugLog('dropped on trash')
        onDroppedOnTrash()
      } else if (checkOverlap(bounds, archiveRef)) {
        debugLog('dropped on archive')
        onDroppedOnArchive()
      } else if (chartsAnchorRef && checkOverlap(bounds, chartsAnchorRef)) {
        debugLog('dropped on charts anchor')
        onDroppedOnChartsAnchor?.()
      }
    }

    clearTargetFeedback()
    setDragStart(null)
    setIsWobbling(false)
    setPreviewPos(null)
  }

  return {
    isWobbling,
    previewPos,
    didDragRef,
    gripHandlers: {
      onGripPointerDown,
      onGripPointerMove,
      onGripPointerUp,
    },
  }
}

function GenerationRow({
  gen,
  onOpen,
  onContextMenu,
  onDeleted,
  onArchived,
  onArchiveChanged,
  trashRef,
  archiveRef,
  chartsGenerationAnchorRef,
  onAnchorGeneration,
}: {
  gen: GenerationSummary
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDeleted: () => void
  onArchived: () => void
  onArchiveChanged: () => void
  trashRef: React.RefObject<HTMLDivElement | null>
  archiveRef: React.RefObject<HTMLDivElement | null>
  chartsGenerationAnchorRef: React.RefObject<HTMLDivElement | null>
  onAnchorGeneration: (anchor: import('../core/types').AnchoredGeneration) => void
}) {
  const previewSize = { width: 180, height: 40 }
  const { isWobbling, previewPos, didDragRef, gripHandlers } = useDropOnTarget(
    () => deleteGeneration(gen.id).then(onDeleted),
    () => archiveGeneration(gen.id).then(() => { onArchived(); onArchiveChanged() }),
    previewSize,
    trashRef,
    archiveRef,
    chartsGenerationAnchorRef,
    () => onAnchorGeneration({ type: 'generation', generationId: gen.id, label: gen.name }),
  )

  return (
    <>
      <div
        onPointerDown={gripHandlers.onGripPointerDown}
        onPointerMove={gripHandlers.onGripPointerMove}
        onPointerUp={gripHandlers.onGripPointerUp}
        onClick={(e) => {
          if (didDragRef.current) {
            didDragRef.current = false
            e.preventDefault()
            return
          }

          onOpen()
        }}
        onContextMenu={onContextMenu}
        style={{ opacity: previewPos ? 0.3 : 1 }}
        className={`group relative w-full flex flex-col gap-0.5 bg-white/5 hover:bg-white/10 rounded-lg px-2 py-1.5 text-left cursor-grab active:cursor-grabbing select-none touch-none ${
          isWobbling ? 'wobble' : ''
        }`}
      >
        <span className="text-xs font-body text-white/90 truncate pr-5">{gen.name}</span>
        <span className="text-[10px] font-body text-white/50">
          {gen.songs_total} songs · quality {gen.silhouette ?? '—'}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onContextMenu(e) }}
          className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-white/50 hover:text-white/90 px-1"
        >
          ⋮
        </button>
      </div>

      {previewPos &&
        createPortal(
          <div className="fixed z-50 pointer-events-none" style={{ left: previewPos.x, top: previewPos.y }}>
            <PreviewGhost width={previewSize.width} height={previewSize.height} label={gen.name} />
          </div>,
          document.body,
        )}
    </>
  )
}

function PlaylistRow({
  cluster,
  generationId,
  isExpanded,
  onToggleExpand,
  onArchived,
  onArchiveChanged,
  trashRef,
  archiveRef,
  chartsPlaylistAnchorRef,
  onAnchorPlaylist,
}: {
  cluster: Cluster
  generationId: string
  isExpanded: boolean
  onToggleExpand: () => void
  onArchived: () => void
  onArchiveChanged: () => void
  trashRef: React.RefObject<HTMLDivElement | null>
  archiveRef: React.RefObject<HTMLDivElement | null>
  chartsPlaylistAnchorRef: React.RefObject<HTMLDivElement | null>
  onAnchorPlaylist: (anchor: import('../core/types').AnchoredPlaylist) => void
}) {

  const previewSize = { width: 160, height: 36 }
  const { isWobbling, previewPos, didDragRef, gripHandlers } = useDropOnTarget(
    () => trashPlaylist(cluster.playlist_id, generationId).then(onArchived),
    () => archivePlaylist(cluster.playlist_id, generationId).then(() => { onArchived(); onArchiveChanged() }),
    previewSize,
    trashRef,
    archiveRef,
    chartsPlaylistAnchorRef,
    () =>
      onAnchorPlaylist({
        type: 'playlist',
        playlistId: cluster.playlist_id,
        generationId,
        label: `Playlist ${cluster.cluster_id + 1}`,
      }),
  )

  return (
    <>
      <div
        style={{ opacity: previewPos ? 0.3 : 1 }}
        className={`bg-white/5 rounded-lg overflow-hidden select-none touch-none ${isWobbling ? 'wobble' : ''}`}
      >
        <div
          onPointerDown={gripHandlers.onGripPointerDown}
          onPointerMove={gripHandlers.onGripPointerMove}
          onPointerUp={gripHandlers.onGripPointerUp}
          onClick={(e) => {
            e.stopPropagation()

            if (didDragRef.current) {
                didDragRef.current = false
                e.preventDefault()
                return
            }

            onToggleExpand()
          }}
          className="w-full flex items-center justify-between px-2 py-1.5 text-left cursor-grab active:cursor-grabbing"
        >
          <span className="text-xs font-body text-white/90">Playlist {cluster.cluster_id + 1}</span>
          <span className="text-[10px] font-body text-white/50">
            {cluster.song_count} songs · {formatDuration(cluster.duration_ms)}
          </span>
        </div>

        {isExpanded && (
          <div className="px-2 pb-2 space-y-1">
            {cluster.tracks.map((track, i) => (
              <div key={i} className="text-[10px] font-body text-white/70 truncate">
                {track.name} — {track.artist}
              </div>
            ))}
          </div>
        )}
      </div>

      {previewPos &&
        createPortal(
          <div className="fixed z-50 pointer-events-none" style={{ left: previewPos.x, top: previewPos.y }}>
            <PreviewGhost width={previewSize.width} height={previewSize.height} label={`Playlist ${cluster.cluster_id + 1}`} />
          </div>,
          document.body,
        )}
    </>
  )
}

export function GeneratedPlaylistsTile({
  startPosition,
  onDragEnd,
  generations,
  onGenerationsChanged,
  onArchiveChanged,
  trashRef,
  archiveRef,
  chartsPlaylistAnchorRef,
  chartsGenerationAnchorRef,
  onAnchorPlaylist,
  onAnchorGeneration,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  generations: GenerationSummary[]
  onGenerationsChanged: () => void
  onArchiveChanged: () => void
  trashRef: React.RefObject<HTMLDivElement | null>
  archiveRef: React.RefObject<HTMLDivElement | null>
  chartsPlaylistAnchorRef: React.RefObject<HTMLDivElement | null>
  chartsGenerationAnchorRef: React.RefObject<HTMLDivElement | null>
  onAnchorPlaylist: (anchor: import('../core/types').AnchoredPlaylist) => void
  onAnchorGeneration: (anchor: import('../core/types').AnchoredGeneration) => void
}) {

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GenerationDetail | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; generationId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [infoGenerationId, setInfoGenerationId] = useState<string | null>(null)
  const [infoData, setInfoData] = useState<GenerationDetail | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const openDetail = async (id: string) => {
    setSelectedId(id)
    const data = await fetchGenerationDetail(id)
    setDetail(data)
  }

  useEffect(() => {
    if (!selectedId) return

    fetchGenerationDetail(selectedId)
      .then(setDetail)
      .catch(() => {})
  }, [generations, selectedId])

  const backToList = () => {
    setSelectedId(null)
    setDetail(null)
    setExpandedCluster(null)
  }

  const handleGenerationDeleted = async (id: string) => {
    onGenerationsChanged()
    if (selectedId === id) backToList()
  }

  const handleRename = async (id: string, newName: string) => {
    await renameGeneration(id, newName)
    setRenamingId(null)
    onGenerationsChanged()
    if (selectedId === id) {
      const updated = await fetchGenerationDetail(id)
      setDetail(updated)
    }
  }

  const openInfo = async (generationId: string) => {
    const data = await fetchGenerationDetail(generationId)
    setInfoData(data)
    setInfoGenerationId(generationId)
  }

  const openContextMenu = (e: React.MouseEvent, generationId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, generationId })
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 360, height: 420 }}
      title="Music Library"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
        {!selectedId && (
          <div className="flex-1 overflow-y-auto space-y-2">
            <span className="shrink-0 text-[10px] font-body text-white/50 uppercase tracking-widest">
              Collections
            </span>
            {debugLog(`render: generations.length=${generations.length}`) as any}
            {generations.length === 0 && (
              <span className="text-xs font-body text-white/40">No collections yet</span>
            )}
            {generations.map((gen) => { debugLog(`mapping gen ${gen.id.slice(0,8)}`); return (
                <GenerationRow
                key={gen.id}
                gen={gen}
                onOpen={() => openDetail(gen.id)}
                onContextMenu={(e) => openContextMenu(e, gen.id)}
                onDeleted={() => handleGenerationDeleted(gen.id)}
                onArchived={onGenerationsChanged}
                onArchiveChanged={onArchiveChanged}
                trashRef={trashRef}
                archiveRef={archiveRef}
                chartsGenerationAnchorRef={chartsGenerationAnchorRef}
                onAnchorGeneration={onAnchorGeneration}
              />
            )})}
          </div>
        )}

        {selectedId && detail && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={backToList}
              className="shrink-0 text-left text-[10px] font-body uppercase tracking-widest text-white/50 hover:text-white/90 mb-2"
            >
              ← Playlists in "{detail.name}"
            </button>

            <div className="flex-1 overflow-y-auto space-y-2">
              {detail.clusters.map((cluster) => (
                  <PlaylistRow
                  key={cluster.playlist_id}
                  cluster={cluster}
                  generationId={detail.id}
                  isExpanded={expandedCluster === cluster.cluster_id}
                  onToggleExpand={() =>
                    setExpandedCluster(expandedCluster === cluster.cluster_id ? null : cluster.cluster_id)
                  }
                  onArchived={async () => {
                    const updated = await fetchGenerationDetail(detail.id)
                    setDetail(updated)
                    onGenerationsChanged()
                  }}
                  onArchiveChanged={onArchiveChanged}
                  trashRef={trashRef}
                  archiveRef={archiveRef}
                  chartsPlaylistAnchorRef={chartsPlaylistAnchorRef}
                  onAnchorPlaylist={onAnchorPlaylist}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Open', onSelect: () => openDetail(contextMenu.generationId) },
            { label: 'Rename', onSelect: () => setRenamingId(contextMenu.generationId) },
            { label: 'Info', onSelect: () => openInfo(contextMenu.generationId) },
            {
              label: 'Delete',
              destructive: true,
              onSelect: () => setConfirmingDeleteId(contextMenu.generationId),
            },
          ]}
        />
      )}

      {renamingId && (
        <RenameDialog
          currentName={generations.find((g) => g.id === renamingId)?.name ?? ''}
          onSave={(newName) => handleRename(renamingId, newName)}
          onCancel={() => setRenamingId(null)}
        />
      )}

      {confirmingDeleteId && (
        <ConfirmDialog
          message="Delete this mix permanently? This cannot be undone."
          onConfirm={() => {
            deleteGeneration(confirmingDeleteId).then(() => handleGenerationDeleted(confirmingDeleteId))
            setConfirmingDeleteId(null)
          }}
          onCancel={() => setConfirmingDeleteId(null)}
        />
      )}

      {infoGenerationId && infoData && (
        <GenerationInfoDialog
          info={infoData as any}
          onClose={() => {
            setInfoGenerationId(null)
            setInfoData(null)
          }}
        />
      )}
    </DraggableGlass>
  )
}