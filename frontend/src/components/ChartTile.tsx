import { useRef, useState, useEffect } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'
import type { ChartSource } from '../core/visualizationTiles'

interface RadarPlaylistData {
  playlist_id: string
  name: string
  raw_values: Record<string, number | null>
  scaled_values: Record<string, number | null>
}

async function fetchPlaylistRadar(generationId: string, playlistId: string) {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/radar`)
  if (!response.ok) throw new Error('Failed to load radar data for this playlist.')
  return response.json()
}

async function fetchGenerationRadar(generationId: string) {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/radar`)
  if (!response.ok) throw new Error('Failed to load radar data for this collection.')
  return response.json()
}

const CHART_COLORS = ['#4f46e5', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2']

export function ChartTile({
  id,
  position,
  chartType,
  source,
  onClose,
}: {
  id: string
  position: ModulePosition
  chartType: 'radar' | 'tsne' | 'dendrogram'
  source: ChartSource
  onClose: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [playlists, setPlaylists] = useState<RadarPlaylistData[] | null>(null)
  const [features, setFeatures] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [useScaled, setUseScaled] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        if (source.type === 'playlist') {
          const data = await fetchPlaylistRadar(source.generationId, source.playlistId)
          setFeatures(data.features)
          setPlaylists([{ playlist_id: data.playlist_id, name: data.name, raw_values: data.raw_values, scaled_values: data.scaled_values }])
        } else {
          const data = await fetchGenerationRadar(source.generationId)
          setFeatures(data.features)
          setPlaylists(data.playlists)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error loading chart data.')
      }
    }
    load()
  }, [source])

  const title =
    playlists && playlists.length === 1
      ? playlists[0].name
      : playlists
        ? `${playlists.length} Playlists`
        : 'Radar Chart'

  const chartData = features.map((feature) => {
    const row: Record<string, string | number> = { feature }
    playlists?.forEach((p) => {
      const values = useScaled ? p.scaled_values : p.raw_values
      row[p.playlist_id] = values[feature] ?? 0
    })
    return row
  })

  return (
    <DraggableGlass
      initialPosition={position}
      initialSize={{ width: 480, height: 480 }}
      title={title}
      className="rounded-2xl bg-white"
      onClose={() => onClose(id)}
      containerRef={containerRef}
      dark
    >
      <div className="px-4 pb-4 flex-1 flex flex-col overflow-hidden">
        {error && <span className="text-xs font-body text-red-600">{error}</span>}

        {!error && !playlists && <span className="text-xs font-body text-black/40">Loading...</span>}

        {!error && playlists && (
          <>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-[11px] font-body font-semibold text-black/80 uppercase tracking-wide">
                {useScaled ? 'Scaled Values' : 'Raw Values'}
              </span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setUseScaled((prev) => !prev)}
                className="text-[10px] font-body text-black/50 hover:text-black/80 underline"
              >
                switch
              </button>
            </div>

            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="feature" tick={{ fontSize: 9 }} />
                  <Tooltip />
                  {playlists.length > 1 && <Legend />}
                  {playlists.map((p, i) => (
                    <Radar
                      key={p.playlist_id}
                      name={p.name}
                      dataKey={p.playlist_id}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.25}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </DraggableGlass>
  )
}