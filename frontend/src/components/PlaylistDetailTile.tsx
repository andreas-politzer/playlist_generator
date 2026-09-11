import { useRef, useState, useEffect } from 'react'
import { DraggableGlass } from './DraggableGlass'
import { ConfirmDialog } from './ConfirmDialog'
import type { ModulePosition } from '../core/types'

interface PlaylistTrack {
  track_id: string | null
  name: string
  artist: string
  duration_ms: number | null
  metadata: Record<string, string | number | null>
}

interface PlaylistDetailData {
  playlist_id: string
  generation_id: string
  name: string
  tracks: PlaylistTrack[]
  metadata_keys: string[]
  note: string
}

async function fetchPlaylistDetail(generationId: string, playlistId: string): Promise<PlaylistDetailData> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/detail`)
  if (!response.ok) throw new Error('Failed to load playlist detail.')
  return response.json()
}

async function removeTrack(generationId: string, playlistId: string, trackId: string): Promise<void> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/tracks/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId }),
  })
  if (!response.ok) throw new Error('Failed to remove track.')
}

async function addTrack(
  generationId: string,
  playlistId: string,
  track: { name: string; artist: string; duration_ms: number | null },
): Promise<void> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/tracks/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...track, metadata: {} }),
  })
  if (!response.ok) throw new Error('Failed to add track.')
}

async function updateNote(generationId: string, playlistId: string, note: string): Promise<void> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
  if (!response.ok) throw new Error('Failed to save note.')
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function PlaylistDetailTile({
  id,
  position,
  generationId,
  playlistId,
  zIndex,
  onClose,
  onFocus,
}: {
  id: string
  position: ModulePosition
  generationId: string
  playlistId: string
  zIndex: number
  onClose: (id: string) => void
  onFocus: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<PlaylistDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [newTrackName, setNewTrackName] = useState('')
  const [newTrackArtist, setNewTrackArtist] = useState('')
  const [confirmingRemoveTrackId, setConfirmingRemoveTrackId] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')
  const [noteSaved, setNoteSaved] = useState(true)
  const noteSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleNoteChange = (value: string) => {
    setNoteValue(value)
    setNoteSaved(false)
    if (noteSaveTimeout.current) clearTimeout(noteSaveTimeout.current)
    noteSaveTimeout.current = setTimeout(() => {
      updateNote(generationId, playlistId, value).then(() => setNoteSaved(true))
    }, 800)
  }

   const reload = () => {
    fetchPlaylistDetail(generationId, playlistId)
      .then((result) => {
        setData(result)
        setVisibleColumns(new Set(result.metadata_keys))
        setNoteValue(result.note)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
  }

  useEffect(() => {
    reload()
  }, [generationId, playlistId])

  const handleRemove = async (trackId: string) => {
    await removeTrack(generationId, playlistId, trackId)
    setConfirmingRemoveTrackId(null)
    reload()
  }

  const handleAdd = async () => {
    if (!newTrackName.trim() || !newTrackArtist.trim()) return
    await addTrack(generationId, playlistId, { name: newTrackName, artist: newTrackArtist, duration_ms: null })
    setNewTrackName('')
    setNewTrackArtist('')
    setShowAddForm(false)
    reload()
  }

  return (
    <DraggableGlass
      initialPosition={position}
      initialSize={{ width: 480, height: 420 }}
      title={data?.name ?? 'Playlist'}
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragStart={() => onFocus(id)}
      zIndex={zIndex}
      onClose={() => onClose(id)}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden gap-2">
        {error && <span className="text-xs font-body text-red-400">{error}</span>}

        {!error && !data && <span className="text-xs font-body text-white/40">Loading...</span>}

        {!error && data && (
          <>
            {data.metadata_keys.length > 0 && (
              <div className="flex flex-wrap gap-2 shrink-0">
                {data.metadata_keys.map((key) => (
                  <label key={key} className="flex items-center gap-1 text-[10px] font-body text-white/60">
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(key)}
                      onChange={(e) => {
                        setVisibleColumns((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(key)
                          else next.delete(key)
                          return next
                        })
                      }}
                    />
                    {key}
                  </label>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs font-body text-white/90">
                <thead>
                  <tr className="text-white/50 text-left text-[10px] uppercase tracking-widest">
                    <th className="pb-1 pr-2">#</th>
                    <th className="pb-1 pr-2">Track</th>
                    <th className="pb-1 pr-2">Artist</th>
                    <th className="pb-1 pr-2">Dur.</th>
                    {data.metadata_keys.filter((k) => visibleColumns.has(k)).map((key) => (
                      <th key={key} className="pb-1 pr-2">{key}</th>
                    ))}
                    <th className="pb-1 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.tracks.map((track, i) => (
                    <tr key={track.track_id ?? i} className="border-t border-white/10 group">
                      <td className="py-1 pr-2 text-white/40">{i + 1}</td>
                      <td className="py-1 pr-2">{track.name}</td>
                      <td className="py-1 pr-2 text-white/70">{track.artist}</td>
                      <td className="py-1 pr-2 text-white/50">{formatDuration(track.duration_ms)}</td>
                      {data.metadata_keys.filter((k) => visibleColumns.has(k)).map((key) => (
                        <td key={key} className="py-1 pr-2 text-white/50">{track.metadata[key] ?? '—'}</td>
                      ))}
                      <td className="py-1 pr-2">
                        {track.track_id && (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => setConfirmingRemoveTrackId(track.track_id)}
                            className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400"
                          >
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Note</span>
                <span className="text-[9px] font-body text-white/30">{noteSaved ? 'Saved' : 'Saving...'}</span>
              </div>
              <textarea
                value={noteValue}
                onChange={(e) => handleNoteChange(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Add a note about this playlist..."
                rows={2}
                className="bg-white/5 border border-white/20 rounded-lg px-2 py-1 text-xs text-white font-body resize-none focus:outline-none focus:border-white/50"
              />
            </div>

            {!showAddForm && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setShowAddForm(true)}
                className="shrink-0 text-left text-[10px] font-body text-white/50 hover:text-white/90 underline"
              >
                + Add track
              </button>
            )}

            {showAddForm && (
              <div className="shrink-0 flex flex-col gap-1.5 bg-white/5 rounded-lg p-2">
                <input
                  type="text"
                  placeholder="Track name"
                  value={newTrackName}
                  onChange={(e) => setNewTrackName(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 border border-white/30 rounded px-2 py-1 text-xs text-white font-body focus:outline-none focus:border-white/70"
                />
                <input
                  type="text"
                  placeholder="Artist"
                  value={newTrackArtist}
                  onChange={(e) => setNewTrackArtist(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 border border-white/30 rounded px-2 py-1 text-xs text-white font-body focus:outline-none focus:border-white/70"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setShowAddForm(false)}
                    className="text-[10px] font-body text-white/50 hover:text-white/90"
                  >
                    Cancel
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleAdd}
                    className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
         </>
        )}
      </div>

      {confirmingRemoveTrackId && (
        <ConfirmDialog
          message="Remove this track from the playlist?"
          onConfirm={() => handleRemove(confirmingRemoveTrackId)}
          onCancel={() => setConfirmingRemoveTrackId(null)}
        />
      )}
    </DraggableGlass>
  )
}