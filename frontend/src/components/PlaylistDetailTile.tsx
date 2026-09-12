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

async function setTrackMetadata(
  generationId: string,
  playlistId: string,
  trackId: string,
  column: string,
  value: string,
): Promise<void> {
  const response = await fetch(
    `http://localhost:8001/generations/${generationId}/playlists/${playlistId}/tracks/${trackId}/metadata`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column, value }),
    },
  )
  if (!response.ok) throw new Error('Failed to save value.')
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
  const [showNewColumnForm, setShowNewColumnForm] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [editingCell, setEditingCell] = useState<{ trackIndex: number; column: string } | null>(null)
  const [editingValue, setEditingValue] = useState('')
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
        setData((prev) => {
          const mergedKeys = Array.from(new Set([...(prev?.metadata_keys ?? []), ...result.metadata_keys]))
          return { ...result, metadata_keys: mergedKeys }
        })
        setVisibleColumns((prev) => new Set([...Array.from(prev), ...result.metadata_keys]))
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

  const handleSaveCell = async (trackIndex: number, column: string, value: string) => {
    if (!data || !data.tracks[trackIndex]) return
    const targetTrack = data.tracks[trackIndex]
    const trackIdentifier = targetTrack.track_id || targetTrack.name

    setData((prev) => {
      if (!prev) return prev
      const nextTracks = [...prev.tracks]
      nextTracks[trackIndex] = {
        ...nextTracks[trackIndex],
        metadata: {
          ...nextTracks[trackIndex].metadata,
          [column]: value,
        },
      }
      return { ...prev, tracks: nextTracks }
    })
    setEditingCell(null)

    if (trackIdentifier) {
      await setTrackMetadata(generationId, playlistId, trackIdentifier, column, value).catch(() => reload())
    }
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

            <div className="flex-1 overflow-x-auto overflow-y-auto max-w-full">
              <table className="min-w-full w-max text-xs font-body text-white/90">
                <thead>
                  <tr className="text-white/50 text-left text-[10px] uppercase tracking-widest border-b border-white/10">
                    <th className="pb-1 pr-2 whitespace-nowrap">#</th>
                    <th className="pb-1 pr-2 whitespace-nowrap">Track</th>
                    <th className="pb-1 pr-2 whitespace-nowrap">Artist</th>
                    <th className="pb-1 pr-2 whitespace-nowrap">Dur.</th>
                    {data.metadata_keys
                      .filter((k) => visibleColumns.has(k))
                      .map((key) => (
                        <th key={key} className="pb-1 pr-2 whitespace-nowrap min-w-[80px]">
                          {key}
                        </th>
                      ))}
                    <th className="pb-1 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.tracks.map((track, i) => (
                    <tr key={track.track_id ?? i} className="border-t border-white/10 group">
                      <td className="py-1 pr-2 text-white/40 whitespace-nowrap">{i + 1}</td>
                      <td className="py-1 pr-2 whitespace-nowrap max-w-[150px] truncate" title={track.name}>
                        {track.name}
                      </td>
                      <td className="py-1 pr-2 text-white/70 whitespace-nowrap max-w-[120px] truncate" title={track.artist}>
                        {track.artist}
                      </td>
                      <td className="py-1 pr-2 text-white/50 whitespace-nowrap">
                        {formatDuration(track.duration_ms)}
                      </td>
                      {data.metadata_keys
                        .filter((k) => visibleColumns.has(k))
                        .map((key) => {
                          const isEditing = editingCell?.trackIndex === i && editingCell?.column === key
                          const val = track.metadata[key] ?? ''

                          return (
                            <td key={key} className="py-1 pr-2 text-white/50 whitespace-nowrap min-w-[80px]">
                              {isEditing ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleSaveCell(i, key, editingValue)
                                    } else if (e.key === 'Escape') {
                                      setEditingCell(null)
                                    }
                                  }}
                                  onBlur={() => handleSaveCell(i, key, editingValue)}
                                  className="bg-white/10 border border-white/30 rounded px-1 py-0.5 text-xs text-white font-body focus:outline-none w-24"
                                />
                              ) : (
                                <span
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => {
                                    setEditingCell({ trackIndex: i, column: key })
                                    setEditingValue(String(val))
                                  }}
                                  className="cursor-pointer hover:text-white hover:bg-white/10 px-1 rounded transition-colors inline-block min-w-[30px] whitespace-nowrap"
                                  title="Klicken zum Bearbeiten"
                                >
                                  {val !== '' ? String(val) : '—'}
                                </span>
                              )}
                            </td>
                          )
                        })}
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

            <div className="shrink-0 flex items-center justify-between">
              {!showAddForm && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setShowAddForm(true)}
                  className="text-left text-[10px] font-body text-white/50 hover:text-white/90 underline"
                >
                  + Add track
                </button>
              )}
              {!showNewColumnForm && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setShowNewColumnForm(true)}
                  className="text-left text-[10px] font-body text-white/50 hover:text-white/90 underline"
                >
                  + Add column
                </button>
              )}

              <a
                href={`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/pdf?columns=${Array.from(visibleColumns).join(',')}`}
                download
                onPointerDown={(e) => e.stopPropagation()}
                className="text-[10px] font-body text-white/50 hover:text-white/90 underline"
              >
                Export PDF
              </a>
            </div>

            {showNewColumnForm && (
              <div className="shrink-0 flex items-center gap-1.5">
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  placeholder="Column name"
                  className="bg-white/10 border border-white/30 rounded px-2 py-1 text-xs text-white font-body focus:outline-none focus:border-white/70 flex-1"
                />
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    const trimmed = newColumnName.trim()
                    if (trimmed) {
                      setVisibleColumns((prev) => new Set(prev).add(trimmed))
                      setData((prev) =>
                        prev
                          ? {
                              ...prev,
                              metadata_keys: prev.metadata_keys.includes(trimmed)
                                ? prev.metadata_keys
                                : [...prev.metadata_keys, trimmed],
                            }
                          : prev,
                      )
                    }
                    setNewColumnName('')
                    setShowNewColumnForm(false)
                  }}
                  className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1"
                >
                  Add
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setNewColumnName('')
                    setShowNewColumnForm(false)
                  }}
                  className="text-[10px] font-body text-white/50 hover:text-white/90"
                >
                  Cancel
                </button>
              </div>
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