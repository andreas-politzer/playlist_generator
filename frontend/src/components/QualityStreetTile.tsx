import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface MetricValue {
  available: boolean
  value: number | null
  unavailable_reason: string | null
}

interface GenerationQuality {
  target: 'generation'
  algorithm: string
  scaler: string
  songs_total: number
  songs_evaluated: number
  playlist_count: number
  noise_count: number
  metrics: {
    silhouette_score: MetricValue
    calinski_harabasz_index: MetricValue
    davies_bouldin_index: MetricValue
    cluster_balance: MetricValue
    noise_ratio: MetricValue
  }
}

interface PlaylistQuality {
  target: 'playlist'
  name: string
  songs_total: number
  songs_evaluated_tempo: number
  songs_evaluated_energy: number
  metrics: {
    tempo_dispersion: MetricValue
    energy_dispersion: MetricValue
    artist_diversity_ratio: MetricValue
  }
}

async function fetchGenerationQuality(generationId: string): Promise<GenerationQuality> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/quality`)
  if (!response.ok) throw new Error('Failed to load quality metrics.')
  return response.json()
}

async function fetchPlaylistQuality(generationId: string, playlistId: string): Promise<PlaylistQuality> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/playlists/${playlistId}/quality`)
  if (!response.ok) throw new Error('Failed to load quality metrics.')
  return response.json()
}

function ratingFor(metricKey: string, value: number): string {
  switch (metricKey) {
    case 'silhouette_score':
      return value >= 0.5 ? 'Optimal' : value >= 0.25 ? 'Good' : 'Weak'
    case 'davies_bouldin_index':
      // Pragmatic orientation only, not a universal threshold
      return value < 1.0 ? 'Optimal' : value <= 1.8 ? 'Good' : 'Moderate'
    case 'calinski_harabasz_index':
      return value >= 100 ? 'Optimal' : value >= 20 ? 'Good' : 'Weak'
    case 'cluster_balance':
      return value >= 0.8 ? 'Balanced' : value >= 0.5 ? 'Uneven' : 'Skewed'
    case 'noise_ratio':
      return value <= 0.1 ? 'Healthy' : value <= 0.25 ? 'Moderate' : 'High'
    case 'tempo_dispersion':
      return value <= 10 ? 'Smooth' : value <= 25 ? 'Moderate' : 'Wide'
    case 'energy_dispersion':
      return value <= 0.1 ? 'Flowing' : value <= 0.2 ? 'Moderate' : 'Wide'
    case 'artist_diversity_ratio':
      return value >= 0.7 ? 'Diverse' : value >= 0.4 ? 'Moderate' : 'Repetitive'
    default:
      return ''
  }
}

const RATING_COLORS: Record<string, string> = {
  Optimal: 'text-green-400',
  Good: 'text-green-400',
  Balanced: 'text-green-400',
  Healthy: 'text-green-400',
  Smooth: 'text-blue-300',
  Flowing: 'text-blue-300',
  Diverse: 'text-blue-300',
  Moderate: 'text-yellow-400',
  Uneven: 'text-yellow-400',
  Weak: 'text-orange-400',
  Skewed: 'text-orange-400',
  Wide: 'text-orange-400',
  High: 'text-orange-400',
  Repetitive: 'text-orange-400',
}

const METRIC_LABELS: Record<string, string> = {
  silhouette_score: 'Silhouette Score',
  calinski_harabasz_index: 'Calinski-Harabasz Index',
  davies_bouldin_index: 'Davies-Bouldin Index',
  cluster_balance: 'Cluster Balance',
  noise_ratio: 'Noise Ratio',
  tempo_dispersion: 'Tempo Dispersion',
  energy_dispersion: 'Energy Dispersion',
  artist_diversity_ratio: 'Artist Diversity',
}

const NO_RATING_METRICS = new Set(['calinski_harabasz_index', 'davies_bouldin_index'])

function MetricRow({ metricKey, metric }: { metricKey: string; metric: MetricValue }) {
  const hasRating = !NO_RATING_METRICS.has(metricKey)
  const rating = hasRating && metric.available && metric.value !== null ? ratingFor(metricKey, metric.value) : ''
  return (
    <div className="flex flex-col py-1 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-body text-white/80">{METRIC_LABELS[metricKey] ?? metricKey}</span>
        {metric.available ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-body text-white/90">{metric.value}</span>
            {hasRating && (
              <span className={`text-[10px] font-body uppercase tracking-wide ${RATING_COLORS[rating] ?? 'text-white/50'}`}>
                {rating}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[10px] font-body text-white/30 italic">{metric.unavailable_reason ?? 'Unavailable'}</span>
        )}
      </div>
      {!hasRating && metric.available && (
        <span className="text-[9px] font-body text-white/30 italic">Reference value — only comparable within this collection</span>
      )}
    </div>
  )
}

function PlaceholderRow({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
      <span className="text-xs font-body text-white/50">{label}</span>
      <span className="text-[10px] font-body text-white/30 italic">{reason}</span>
    </div>
  )
}

export function QualityStreetTile({
  startPosition,
  onDragEnd,
  onDragStart,
  onDragMove,
  zIndex,
  playlistAnchorRef,
  generationAnchorRef,
  anchoredPlaylist,
  anchoredGeneration,
  onClearPlaylist,
  onClearGeneration,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  onDragStart?: () => void
  onDragMove?: (position: ModulePosition) => void
  zIndex?: number
  playlistAnchorRef: React.RefObject<HTMLDivElement | null>
  generationAnchorRef: React.RefObject<HTMLDivElement | null>
  anchoredPlaylist: { generationId: string; playlistId: string; label: string } | null
  anchoredGeneration: { generationId: string; label: string } | null
  onClearPlaylist: () => void
  onClearGeneration: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(undefined)
  const [generationQuality, setGenerationQuality] = useState<GenerationQuality | null>(null)
  const [playlistQuality, setPlaylistQuality] = useState<PlaylistQuality | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!anchoredGeneration) {
      setGenerationQuality(null)
      return
    }
    setError(null)
    fetchGenerationQuality(anchoredGeneration.generationId)
      .then(setGenerationQuality)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
  }, [anchoredGeneration])

  useEffect(() => {
    if (!anchoredPlaylist) {
      setPlaylistQuality(null)
      return
    }
    setError(null)
    fetchPlaylistQuality(anchoredPlaylist.generationId, anchoredPlaylist.playlistId)
      .then(setPlaylistQuality)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
  }, [anchoredPlaylist])

  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) return

    const updateHeight = () => {
      setMeasuredHeight(68 + element.scrollHeight + 20)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) return

    const updateHeight = () => {
      setMeasuredHeight(68 + element.scrollHeight + 20)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) return

    const updateHeight = () => {
      setMeasuredHeight(68 + element.scrollHeight + 20)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 340, height: 460 }}
      forceMinHeight={measuredHeight}
      title="Quality Street"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      zIndex={zIndex}
      containerRef={containerRef}
    >
      <div ref={contentRef} className="px-6 pb-6 flex flex-col gap-4 overflow-visible">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Collection</span>
          <div
            ref={generationAnchorRef}
            className={`relative border border-dashed rounded-lg px-2 py-3 text-center text-[10px] font-body ${
              anchoredGeneration ? 'border-white/60 text-white/90' : 'border-white/30 text-white/40'
            }`}
          >
            {anchoredGeneration?.label ?? 'Drag a collection here'}
            {anchoredGeneration && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClearGeneration}
                className="absolute top-1 right-1 text-white/50 hover:text-white/90 text-[10px] leading-none"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Playlist</span>
          <div
            ref={playlistAnchorRef}
            className={`relative border border-dashed rounded-lg px-2 py-3 text-center text-[10px] font-body ${
              anchoredPlaylist ? 'border-white/60 text-white/90' : 'border-white/30 text-white/40'
            }`}
          >
            {anchoredPlaylist?.label ?? 'Drag a playlist here'}
            {anchoredPlaylist && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClearPlaylist}
                className="absolute top-1 right-1 text-white/50 hover:text-white/90 text-[10px] leading-none"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {error && <span className="text-xs font-body text-red-400">{error}</span>}

        {generationQuality && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-body uppercase tracking-widest text-white/50">
              Statistical Metrics · {generationQuality.songs_evaluated}/{generationQuality.songs_total} songs
            </span>
            {Object.entries(generationQuality.metrics).map(([key, metric]) => (
              <MetricRow key={key} metricKey={key} metric={metric} />
            ))}
            <PlaceholderRow label="Elbow Point" reason="Part of Pinball Wizard" />
          </div>
        )}

        {playlistQuality && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-body uppercase tracking-widest text-white/50">
              Music-Specific Metrics · {playlistQuality.songs_total} songs
            </span>
            {Object.entries(playlistQuality.metrics).map(([key, metric]) => (
              <MetricRow key={key} metricKey={key} metric={metric} />
            ))}
            <PlaceholderRow label="Harmonic Compatibility" reason="Requires track ordering" />
          </div>
        )}
      </div>
    </DraggableGlass>
  )
}