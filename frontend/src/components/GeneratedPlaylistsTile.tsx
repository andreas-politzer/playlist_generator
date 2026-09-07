import { useState, useEffect, useCallback, useRef } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

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
  song_count: number
  duration_ms: number | null
  tracks: Track[]
}

interface GenerationDetail extends GenerationSummary {
  clusters: Cluster[]
}

async function fetchGenerations(): Promise<GenerationSummary[]> {
  const response = await fetch('http://localhost:8001/generations')
  if (!response.ok) throw new Error('Failed to fetch generations')
  return response.json()
}

async function fetchGenerationDetail(id: string): Promise<GenerationDetail> {
  const response = await fetch(`http://localhost:8001/generations/${id}`)
  if (!response.ok) throw new Error('Failed to fetch generation detail')
  return response.json()
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const totalMinutes = Math.round(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`
}

export function GeneratedPlaylistsTile({
  startPosition,
  onDragEnd,
  refreshKey,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  refreshKey?: number
}) {
  const [generations, setGenerations] = useState<GenerationSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GenerationDetail | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadGenerations = useCallback(() => {
    fetchGenerations().then(setGenerations).catch(() => setGenerations([]))
  }, [])

  useEffect(() => {
    loadGenerations()
  }, [loadGenerations, refreshKey])

  const openDetail = async (id: string) => {
    setSelectedId(id)
    const data = await fetchGenerationDetail(id)
    setDetail(data)
  }

  const backToList = () => {
    setSelectedId(null)
    setDetail(null)
    setExpandedCluster(null)
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 360, height: 420 }}
      title="Generated Playlists"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
        {!selectedId && (
          <div className="flex-1 overflow-y-auto space-y-2">
            {generations.length === 0 && (
              <span className="text-xs font-body text-white/40">No generations yet</span>
            )}
            {generations.map((gen) => (
              <button
                key={gen.id}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => openDetail(gen.id)}
                className="w-full flex flex-col gap-0.5 bg-white/5 hover:bg-white/10 rounded-lg px-2 py-1.5 text-left"
              >
                <span className="text-xs font-body text-white/90 truncate">{gen.name}</span>
                <span className="text-[10px] font-body text-white/50">
                  {gen.songs_total} songs · quality {gen.silhouette ?? '—'}
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedId && detail && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={backToList}
              className="shrink-0 text-left text-[10px] font-body uppercase tracking-widest text-white/50 hover:text-white/90 mb-2"
            >
              ← Back
            </button>

            <div className="flex-1 overflow-y-auto space-y-2">
              {detail.clusters.map((cluster) => (
                <div key={cluster.cluster_id} className="bg-white/5 rounded-lg overflow-hidden">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      setExpandedCluster(expandedCluster === cluster.cluster_id ? null : cluster.cluster_id)
                    }
                    className="w-full flex items-center justify-between px-2 py-1.5 text-left"
                  >
                    <span className="text-xs font-body text-white/90">Playlist {cluster.cluster_id + 1}</span>
                    <span className="text-[10px] font-body text-white/50">
                      {cluster.song_count} songs · {formatDuration(cluster.duration_ms)}
                    </span>
                  </button>

                  {expandedCluster === cluster.cluster_id && (
                    <div className="px-2 pb-2 space-y-1">
                      {cluster.tracks.map((track, i) => (
                        <div key={i} className="text-[10px] font-body text-white/70 truncate">
                          {track.name} — {track.artist}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DraggableGlass>
  )
}