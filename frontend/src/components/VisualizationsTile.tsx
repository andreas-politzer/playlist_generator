import { useRef, useState } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition, AnchoredPlaylist, AnchoredGeneration } from '../core/types'

type SourceType = 'playlist' | 'generation'
type ChartType = 'radar' | 'tsne' | 'dendrogram'

interface AnchorConfig {
  source: SourceType
  label: string
  placeholder: string
  chartTypes: { type: ChartType; label: string }[]
}

const ANCHOR_CONFIGS: AnchorConfig[] = [
  {
    source: 'playlist',
    label: 'Playlist',
    placeholder: 'Drag a playlist here',
    chartTypes: [
      { type: 'radar', label: 'Radar' },
      { type: 'tsne', label: 't-SNE' },
      { type: 'dendrogram', label: 'Dendrogramm' },
    ],
  },
  {
    source: 'generation',
    label: 'Collection',
    placeholder: 'Drag a collection here',
    chartTypes: [
      { type: 'radar', label: 'Radar' },
      { type: 'tsne', label: 't-SNE' },
      { type: 'dendrogram', label: 'Dendrogramm' },
    ],
  },
]

function AnchorSection({
  config,
  anchorRef,
  anchoredLabel,
  onClear,
  onGenerate,
}: {
  config: AnchorConfig
  anchorRef: React.RefObject<HTMLDivElement | null>
  anchoredLabel: string | null
  onClear: () => void
  onGenerate: (chartType: ChartType) => void
}) {
  const [selectedChartType, setSelectedChartType] = useState<ChartType | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-body uppercase tracking-widest text-white/50">{config.label}</span>

      <div
        ref={anchorRef}
        className={`relative border border-dashed rounded-lg px-2 py-3 text-center text-[10px] font-body ${
          anchoredLabel ? 'border-white/60 text-white/90' : 'border-white/30 text-white/40'
        }`}
      >
        {anchoredLabel ?? config.placeholder}
        {anchoredLabel && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClear}
            className="absolute top-1 right-1 text-white/50 hover:text-white/90 text-[10px] leading-none"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        {config.chartTypes.map((chart) => (
          <button
            key={chart.type}
            onClick={() => setSelectedChartType(chart.type)}
            className={`flex-1 text-[10px] font-body rounded px-2 py-1 ${
              selectedChartType === chart.type ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70'
            }`}
          >
            {chart.label}
          </button>
        ))}
      </div>

            {anchoredLabel && selectedChartType && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onGenerate(selectedChartType)}
          className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1"
        >
          Generate
        </button>
      )}

      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setAdvancedOpen((prev) => !prev)}
        className="text-left text-[9px] font-body uppercase tracking-widest text-white/40 hover:text-white/70"
      >
        {advancedOpen ? '▾' : '▸'} Advanced Settings
      </button>

      {advancedOpen && (
        <div className="border border-white/10 rounded-lg px-2 py-2 text-[10px] font-body text-white/30">
          Nothing here yet.
        </div>
      )}
    </div>
  )
}

export function VisualizationsTile({
  startPosition,
  onDragEnd,
  playlistAnchorRef,
  generationAnchorRef,
  anchoredPlaylist,
  anchoredGeneration,
  onClearPlaylist,
  onClearGeneration,
  onGeneratePlaylistChart,
  onGenerateGenerationChart,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  playlistAnchorRef: React.RefObject<HTMLDivElement | null>
  generationAnchorRef: React.RefObject<HTMLDivElement | null>
  anchoredPlaylist: AnchoredPlaylist | null
  anchoredGeneration: AnchoredGeneration | null
  onClearPlaylist: () => void
  onClearGeneration: () => void
  onGeneratePlaylistChart: (chartType: ChartType) => void
  onGenerateGenerationChart: (chartType: ChartType) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 380 }}
      title="Charts"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col gap-4 overflow-y-auto">
        {ANCHOR_CONFIGS.map((config) => (
          <AnchorSection
            key={config.source}
            config={config}
            anchorRef={config.source === 'playlist' ? playlistAnchorRef : generationAnchorRef}
            anchoredLabel={config.source === 'playlist' ? anchoredPlaylist?.label ?? null : anchoredGeneration?.label ?? null}
            onClear={config.source === 'playlist' ? onClearPlaylist : onClearGeneration}
            onGenerate={config.source === 'playlist' ? onGeneratePlaylistChart : onGenerateGenerationChart}
          />
        ))}
      </div>
    </DraggableGlass>
  )
}