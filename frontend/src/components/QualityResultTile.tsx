import { useRef } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface MockMetric {
  label: string
  value: string
  rating: string
  description: string
}

const STATISTICAL_METRICS: MockMetric[] = [
  { label: 'Silhouette Score', value: '0.68', rating: 'Optimal', description: 'High separation between playlists' },
  { label: 'Calinski-Harabasz Index', value: '1420.5', rating: 'Excellent', description: 'Strong compactness within clusters' },
  { label: 'Davies-Bouldin Index', value: '0.42', rating: 'Optimal', description: 'Low overlap between neighboring clusters' },
  { label: 'Cluster Balance', value: '0.89', rating: 'Balanced', description: 'Even distribution, no oversized clusters' },
  { label: 'Noise Ratio', value: '7.1%', rating: 'Healthy', description: 'Outliers cleanly filtered' },
  { label: 'Elbow Point', value: 'k = 5', rating: 'At Elbow', description: 'Optimal cluster count reached' },
]

const MUSIC_METRICS: MockMetric[] = [
  { label: 'Tempo Transition', value: 'Ø 3.8 BPM', rating: 'Smooth', description: 'No abrupt tempo jumps between tracks' },
  { label: 'Energy Transition', value: 'Ø 0.06', rating: 'Flowing', description: 'Harmonic mood transitions' },
  { label: 'Harmonic Compatibility', value: '87.5%', rating: 'Harmonic', description: 'Camelot-compatible key transitions' },
  { label: 'Artist/Genre Diversity', value: 'HHI 0.12', rating: 'Diverse', description: '18 unique artists, no dominance' },
]

const RATING_COLORS: Record<string, string> = {
  Optimal: 'text-green-400',
  Excellent: 'text-green-400',
  Balanced: 'text-green-400',
  Healthy: 'text-green-400',
  'At Elbow': 'text-green-400',
  Smooth: 'text-blue-300',
  Flowing: 'text-blue-300',
  Harmonic: 'text-blue-300',
  Diverse: 'text-blue-300',
}

function MetricRow({ metric }: { metric: MockMetric }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-white/5 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-body text-white/80">{metric.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-body text-white/90">{metric.value}</span>
          <span className={`text-[10px] font-body uppercase tracking-wide ${RATING_COLORS[metric.rating] ?? 'text-white/50'}`}>
            {metric.rating}
          </span>
        </div>
      </div>
      <span className="text-[10px] font-body text-white/40">{metric.description}</span>
    </div>
  )
}

export function QualityResultTile({
  id,
  position,
  target,
  label,
  zIndex,
  onClose,
  onFocus,
}: {
  id: string
  position: ModulePosition
  target: 'playlist' | 'generation'
  label: string
  zIndex: number
  onClose: (id: string) => void
  onFocus: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const metrics = target === 'generation' ? STATISTICAL_METRICS : MUSIC_METRICS

  return (
    <DraggableGlass
      initialPosition={position}
      initialSize={{ width: 340, height: 460 }}
      title={label}
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragStart={() => onFocus(id)}
      zIndex={zIndex}
      onClose={() => onClose(id)}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-y-auto gap-3">
        <div className="flex flex-col items-center gap-0.5 pb-2 border-b border-white/10">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Overall Quality</span>
          <span className="text-2xl font-body text-white/90">91.5</span>
          <span className="text-[10px] font-body text-white/40">
            {target === 'generation' ? 'Cluster statistics' : 'Song-to-song flow'}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">
            {target === 'generation' ? 'Statistical Metrics' : 'Music-Specific Metrics'}
          </span>
          {metrics.map((m) => (
            <MetricRow key={m.label} metric={m} />
          ))}
        </div>
      </div>
    </DraggableGlass>
  )
}