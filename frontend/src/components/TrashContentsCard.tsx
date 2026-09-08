import { useState, useEffect, useCallback } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface RawListTrashItem {
  filename: string
  song_count: number
}

interface GenerationTrashItem {
  id: string
  name: string
  created_at: string
  songs_total: number
  playlist_count: number
  source_filename: string | null
}

interface PlaylistTrashItem {
  id: string
  playlist_id: string
  generation_id: string
  generation_name: string
  name: string
  song_count: number
  duration_ms: number | null
  trashed_at: string
}

async function fetchRawListTrash(): Promise<RawListTrashItem[]> {
  const response = await fetch('http://localhost:8001/songs/trash')
  if (!response.ok) throw new Error('Failed to fetch raw list trash')
  return response.json()
}

async function restoreRawList(filename: string): Promise<void> {
  await fetch(`http://localhost:8001/songs/trash/${filename}/restore`, {
    method: 'POST',
  })
}

async function deleteRawListForever(filename: string): Promise<void> {
  await fetch(`http://localhost:8001/songs/trash/${filename}`, {
    method: 'DELETE',
  })
}

async function fetchGenerationTrash(): Promise<GenerationTrashItem[]> {
  const response = await fetch('http://localhost:8001/generations/trash')
  if (!response.ok) throw new Error('Failed to fetch generation trash')
  return response.json()
}

async function restoreGeneration(id: string): Promise<void> {
  await fetch(`http://localhost:8001/generations/trash/${id}/restore`, {
    method: 'POST',
  })
}

async function deleteGenerationForever(id: string): Promise<void> {
  await fetch(`http://localhost:8001/generations/trash/${id}`, {
    method: 'DELETE',
  })
}

async function fetchPlaylistTrash(): Promise<PlaylistTrashItem[]> {
  const response = await fetch('http://localhost:8001/playlists/trash')
  if (!response.ok) throw new Error('Failed to fetch playlist trash')
  return response.json()
}

async function restorePlaylist(id: string): Promise<void> {
  await fetch(`http://localhost:8001/playlists/trash/${id}/restore`, {
    method: 'POST',
  })
}

async function deletePlaylistForever(id: string): Promise<void> {
  await fetch(`http://localhost:8001/playlists/trash/${id}`, {
    method: 'DELETE',
  })
}

export function TrashContentsCard({
  startPosition,
  onClose,
  onRestore,
  onGenerationRestore,
  refreshKey,
  containerRef,
}: {
  startPosition: ModulePosition
  onClose: () => void
  onRestore?: () => void
  onGenerationRestore?: () => void
  refreshKey?: number
  containerRef?: React.RefObject<HTMLDivElement | null>
}) {
  const [rawLists, setRawLists] = useState<RawListTrashItem[]>([])
  const [generations, setGenerations] = useState<GenerationTrashItem[]>([])
  const [playlists, setPlaylists] = useState<PlaylistTrashItem[]>([])

  const loadRawLists = useCallback(() => {
    fetchRawListTrash().then(setRawLists).catch(() => setRawLists([]))
  }, [])

  const loadGenerations = useCallback(() => {
    fetchGenerationTrash().then(setGenerations).catch(() => setGenerations([]))
  }, [])

  const loadPlaylists = useCallback(() => {
    fetchPlaylistTrash().then(setPlaylists).catch(() => setPlaylists([]))
  }, [])

  useEffect(() => {
    loadRawLists()
    loadGenerations()
    loadPlaylists()
  }, [loadRawLists, loadGenerations, loadPlaylists, refreshKey])

  const handleRestoreRawList = async (filename: string) => {
    await restoreRawList(filename)
    loadRawLists()
    onRestore?.()
  }

  const handleDeleteRawListForever = async (filename: string) => {
    await deleteRawListForever(filename)
    loadRawLists()
  }

  const handleRestoreGeneration = async (id: string) => {
    await restoreGeneration(id)
    loadGenerations()
    onGenerationRestore?.()
  }

  const handleDeleteGenerationForever = async (id: string) => {
    await deleteGenerationForever(id)
    loadGenerations()
  }

  const handleRestorePlaylist = async (id: string) => {
    await restorePlaylist(id)
    loadPlaylists()
    onGenerationRestore?.()
  }

  const handleDeletePlaylistForever = async (id: string) => {
    await deletePlaylistForever(id)
    loadPlaylists()
  }

  const isEmpty =
    rawLists.length === 0 &&
    generations.length === 0 &&
    playlists.length === 0

  return (
    <DraggableGlass
      initialPosition={startPosition}
      containerRef={containerRef}
      initialSize={{ width: 360, height: 560 }}
      title="Trash"
      className="rounded-3xl"
      onClose={onClose}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden gap-4">
        <div className="flex-1 overflow-y-auto space-y-4">
          {isEmpty && (
            <span className="text-xs font-body text-white/40">
              Trash is empty
            </span>
          )}

          {rawLists.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50">
                Raw Lists
              </span>

              {rawLists.map((item) => (
                <div
                  key={item.filename}
                  className="flex flex-col gap-1 rounded-lg bg-white/5 px-2 py-1.5"
                >
                  <span className="truncate text-xs text-white/90">
                    {item.filename}
                  </span>

                  <span className="text-[10px] text-white/50">
                    {item.song_count} songs
                  </span>

                  <div className="mt-1 flex gap-2">
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleRestoreRawList(item.filename)}
                      className="flex-1 rounded-md border border-white/40 bg-white/10 py-1 text-[10px] uppercase tracking-widest text-white/90"
                    >
                      Restore
                    </button>

                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleDeleteRawListForever(item.filename)}
                      className="flex-1 rounded-md border border-red-400/40 bg-red-400/10 py-1 text-[10px] uppercase tracking-widest text-white/90"
                    >
                      Delete forever
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {generations.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50">
                Generations
              </span>

              {generations.map((gen) => (
                <div
                  key={gen.id}
                  className="flex flex-col gap-1 rounded-lg bg-white/5 px-2 py-1.5"
                >
                  <span className="truncate text-xs text-white/90">
                    {gen.name}
                  </span>

                  <span className="text-[10px] text-white/50">
                    {gen.songs_total} songs · {gen.playlist_count} playlists
                  </span>

                  <div className="mt-1 flex gap-2">
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleRestoreGeneration(gen.id)}
                      className="flex-1 rounded-md border border-white/40 bg-white/10 py-1 text-[10px] uppercase tracking-widest text-white/90"
                    >
                      Restore
                    </button>

                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleDeleteGenerationForever(gen.id)}
                      className="flex-1 rounded-md border border-red-400/40 bg-red-400/10 py-1 text-[10px] uppercase tracking-widest text-white/90"
                    >
                      Delete forever
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {playlists.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50">
                Individual Playlists
              </span>

              {playlists.map((playlist) => (
                <div
                  key={playlist.playlist_id}
                  className="flex flex-col gap-1 rounded-lg bg-white/5 px-2 py-1.5"
                >
                  <span className="truncate text-xs text-white/90">
                    {playlist.name}
                  </span>

                  <span className="text-[10px] text-white/50">
                    {playlist.song_count} songs · {playlist.generation_name}
                  </span>

                  <div className="mt-1 flex gap-2">
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        handleRestorePlaylist(playlist.playlist_id)
                      }
                      className="flex-1 rounded-md border border-white/40 bg-white/10 py-1 text-[10px] uppercase tracking-widest text-white/90"
                    >
                      Restore
                    </button>

                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        handleDeletePlaylistForever(playlist.playlist_id)
                      }
                      className="flex-1 rounded-md border border-red-400/40 bg-red-400/10 py-1 text-[10px] uppercase tracking-widest text-white/90"
                    >
                      Delete forever
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DraggableGlass>
  )
}