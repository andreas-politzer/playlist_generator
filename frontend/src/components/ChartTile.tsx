import { useRef, useState, useEffect } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip, ResponsiveContainer,
} from 'recharts'
import { DraggableGlass } from './DraggableGlass'
import { TsneCanvas } from './TsneCanvas'
import { DendrogramCanvas } from './DendrogramCanvas'
import type { ModulePosition } from '../core/types'
import type { ChartSource } from '../core/visualizationTiles'

interface RadarPlaylistData {
  playlist_id: string
  name: string
  raw_values: Record<string, number | null>
  raw_normalized_values: Record<string, number | null>
  scaled_values: Record<string, number | null>
}

interface TsnePoint {
  name: string
  playlist_id: string
  playlist_name: string
  x: number
  y: number
}

const CHART_COLORS = ['#4f46e5', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d', '#0284c7', '#ea580c']

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

async function fetchPlaylistTsne(generationId: string, playlistId: string, perplexity?: number) {
  const params = perplexity ? `?perplexity=${perplexity}` : ''
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/tsne${params}`)
  if (!response.ok) throw new Error('Failed to load t-SNE data for this playlist.')
  return response.json()
}

async function fetchGenerationTsne(generationId: string, perplexity?: number) {
  const params = perplexity ? `?perplexity=${perplexity}` : ''
  const response = await fetch(`http://localhost:8001/generations/${generationId}/tsne${params}`)
  if (!response.ok) throw new Error('Failed to load t-SNE data for this collection.')
  return response.json()
}

async function fetchPlaylistDendrogram(generationId: string, playlistId: string, config: import('../core/visualizationTiles').ChartConfig) {
  const params = new URLSearchParams()
  if (config.mode) params.set('mode', config.mode)
  if (config.linkageMethod) params.set('linkage_method', config.linkageMethod)
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/dendrogram?${params}`)
  if (!response.ok) throw new Error('Failed to load dendrogram data for this playlist.')
  return response.json()
}

async function fetchGenerationDendrogram(generationId: string, config: import('../core/visualizationTiles').ChartConfig) {
  const params = new URLSearchParams()
  if (config.mode) params.set('mode', config.mode)
  if (config.linkageMethod) params.set('linkage_method', config.linkageMethod)
  if (config.maxLeaves) params.set('max_leaves', String(config.maxLeaves))
  const response = await fetch(`http://localhost:8001/generations/${generationId}/dendrogram?${params}`)
  if (!response.ok) throw new Error('Failed to load dendrogram data for this collection.')
  return response.json()
}

export function ChartTile({
  id,
  position,
  chartType,
  source,
  config,
  zIndex,
  onClose,
  onFocus,
}: {
  id: string
  position: ModulePosition
  chartType: 'radar' | 'tsne' | 'dendrogram'
  source: ChartSource
  config: import('../core/visualizationTiles').ChartConfig
  zIndex: number
  onClose: (id: string) => void
  onFocus: (id: string) => void
}) {

  const containerRef = useRef<HTMLDivElement>(null)
  const [radarPlaylists, setRadarPlaylists] = useState<RadarPlaylistData[] | null>(null)
  const [tsnePoints, setTsnePoints] = useState<TsnePoint[] | null>(null)
  const [dendrogramData, setDendrogramData] = useState<{ icoord: number[][]; dcoord: number[][]; labels: string[]; colors: string[] } | null>(null)
  const [collectionName, setCollectionName] = useState<string | null>(null)
  const [features, setFeatures] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [useScaled, setUseScaled] = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        if (chartType === 'radar') {
          const selectedFeatures = config.radarFeatures
          if (source.type === 'playlist') {
            const data = await fetchPlaylistRadar(source.generationId, source.playlistId)
            const activeFeatures = selectedFeatures ?? data.features
            setFeatures(activeFeatures)
            setRadarPlaylists([{
              playlist_id: data.playlist_id,
              name: data.name,
              raw_values: data.raw_values,
              raw_normalized_values: data.raw_normalized_values,
              scaled_values: data.scaled_values,
            }])
          } else {
            const data = await fetchGenerationRadar(source.generationId)
            const activeFeatures = selectedFeatures ?? data.features
            setFeatures(activeFeatures)
            setRadarPlaylists(data.playlists)
            setCollectionName(data.name)
          }
                } else if (chartType === 'tsne') {
          if (source.type === 'playlist') {
            const data = await fetchPlaylistTsne(source.generationId, source.playlistId, config.perplexity)
            setTsnePoints(data.points)
            setCollectionName(data.name)
          } else {
            const data = await fetchGenerationTsne(source.generationId, config.perplexity)
            setTsnePoints(data.points)
            setCollectionName(data.name)
          }
        
        } else if (chartType === 'dendrogram') {
          if (source.type === 'playlist') {
            const data = await fetchPlaylistDendrogram(source.generationId, source.playlistId, config)
            setDendrogramData({ icoord: data.icoord, dcoord: data.dcoord, labels: data.labels, colors: data.colors })
            setCollectionName(data.name)
          } else {
            const data = await fetchGenerationDendrogram(source.generationId, config)
            setDendrogramData({ icoord: data.icoord, dcoord: data.dcoord, labels: data.labels, colors: data.colors })
            setCollectionName(data.name)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error loading chart data.')
      }
    }
    load()
    }, [chartType, source, config])

  const title =
    chartType === 'radar' && radarPlaylists && radarPlaylists.length === 1
      ? radarPlaylists[0].name
      : collectionName ?? (chartType === 'radar' ? 'Radar Chart' : chartType === 'tsne' ? 't-SNE Chart' : 'Dendrogram')

  const radarData = features.map((feature) => {
    const row: Record<string, string | number> = { feature }
    radarPlaylists?.forEach((p) => {
      const values = useScaled ? p.scaled_values : p.raw_normalized_values
      row[p.playlist_id] = values[feature] ?? 0
    })
    return row
  })

  const isLoaded =
    chartType === 'radar' ? radarPlaylists !== null : chartType === 'tsne' ? tsnePoints !== null : dendrogramData !== null
  const hasMultipleRadarPlaylists = (radarPlaylists?.length ?? 0) > 1

  const toggleHidden = (playlistId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(playlistId)) next.delete(playlistId)
      else next.add(playlistId)
      return next
    })
  }

  return (
     <DraggableGlass
      initialPosition={position}
      initialSize={{ width: hasMultipleRadarPlaylists ? 620 : 480, height: 480 }}
      title={title}
      className="rounded-2xl bg-white"
      onClose={() => onClose(id)}
      onDragStart={() => onFocus(id)}
      zIndex={zIndex}
      containerRef={containerRef}
      dark
    >
      <div className="px-4 pb-4 flex-1 flex flex-col overflow-hidden">
        {error && <span className="text-xs font-body text-red-600">{error}</span>}

        {!error && !isLoaded && <span className="text-xs font-body text-black/40">Loading...</span>}

        {!error && chartType === 'radar' && radarPlaylists && (
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

            <div className="flex-1 min-h-0 flex gap-2">
              <div className="flex-1 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="feature" tick={{ fontSize: 9 }} />
                    {!hasMultipleRadarPlaylists && <Tooltip />}
                    {radarPlaylists
                      .filter((p) => !hiddenIds.has(p.playlist_id))
                      .map((p) => {
                        const idx = radarPlaylists.findIndex((rp) => rp.playlist_id === p.playlist_id)
                        const isDimmed = hoveredId !== null && hoveredId !== p.playlist_id
                        return (
                          <Radar
                            key={p.playlist_id}
                            name={p.name}
                            dataKey={p.playlist_id}
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                            fillOpacity={isDimmed ? 0.04 : hoveredId === p.playlist_id ? 0.45 : 0.15}
                            strokeOpacity={isDimmed ? 0.15 : 1}
                            strokeWidth={hoveredId === p.playlist_id ? 2.5 : 1}
                          />
                        )
                      })}
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {hasMultipleRadarPlaylists && (
                <div className="w-32 shrink-0 overflow-y-auto flex flex-col gap-0.5 text-[10px] font-body">
                  {radarPlaylists.map((p, i) => (
                    <button
                      key={p.playlist_id}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseEnter={() => setHoveredId(p.playlist_id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => toggleHidden(p.playlist_id)}
                      className="text-left flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-black/5"
                      style={{ opacity: hiddenIds.has(p.playlist_id) ? 0.3 : 1 }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="truncate text-black/80">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {!error && chartType === 'tsne' && tsnePoints && (
          <div className="flex-1 min-h-0">
            <TsneCanvas points={tsnePoints} hiddenIds={new Set()} />
          </div>
        )}

        {!error && chartType === 'dendrogram' && dendrogramData && (
          <div className="flex-1 min-h-0">
            <DendrogramCanvas icoord={dendrogramData.icoord} dcoord={dendrogramData.dcoord} labels={dendrogramData.labels} colors={dendrogramData.colors} />
          </div>
        )}
      </div>
    </DraggableGlass>
  )
}