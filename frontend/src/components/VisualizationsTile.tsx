import { useRef, useState, useLayoutEffect, useEffect} from 'react'
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
  anchoredFeatures,
  onClear,
  onGenerate,
}: {
  config: AnchorConfig
  anchorRef: React.RefObject<HTMLDivElement | null>
  anchoredLabel: string | null
  anchoredFeatures: string[]
  onClear: () => void
  onGenerate: (chartType: ChartType, config: import('../core/visualizationTiles').ChartConfig) => void
}) {
  const [selectedChartType, setSelectedChartType] = useState<ChartType | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [dataMode, setDataMode] = useState<'raw' | 'scaled'>('scaled')
  const [linkageMethod, setLinkageMethod] = useState<'ward' | 'complete' | 'average' | 'single'>('ward')
  const [maxLeaves, setMaxLeaves] = useState(40)
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set(anchoredFeatures))
  const [perplexity, setPerplexity] = useState<number | null>(null)

  useEffect(() => {
    setSelectedFeatures(new Set(anchoredFeatures))
    setSelectedChartType(null)
  }, [anchoredFeatures])

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
          disabled={selectedChartType === 'radar' && selectedFeatures.size === 0}
          onClick={() => {
             if (selectedChartType === 'radar') {
              onGenerate(selectedChartType, {
                radarFeatures: Array.from(selectedFeatures),
              })
            } else if (selectedChartType === 'tsne') {
              onGenerate(selectedChartType, { perplexity: perplexity ?? undefined })
            } else {
              onGenerate(selectedChartType, {
                mode: dataMode,
                linkageMethod,
                maxLeaves,
              })
            }
          }}
          className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1 disabled:opacity-30"
        >
          Generate
        </button>
      )}

        <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="text-left text-[9px] font-body uppercase tracking-widest text-white/40 hover:text-white/70"
      >
        {advancedOpen ? '▾' : '▸'} Advanced Settings
      </button>

      {advancedOpen && (
        <div className="border border-white/10 rounded-lg px-2 py-2 flex flex-col gap-2 text-[10px] font-body">
          {selectedChartType === 'dendrogram' && (
            <>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setDataMode('scaled')
                  setLinkageMethod('ward')
                  setMaxLeaves(40)
                }}
                className="self-end text-white/40 hover:text-white/70 underline"
              >
                Reset to defaults
              </button>
              <label className="flex items-center justify-between gap-2">
                <span className="text-white/50">Data</span>
                <select
                  value={dataMode}
                  onChange={(e) => setDataMode(e.target.value as 'raw' | 'scaled')}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 text-white rounded px-1 py-0.5"
                >
                  <option value="scaled">Scaled</option>
                  <option value="raw">Raw</option>
                </select>
              </label>

              <label className="flex items-center justify-between gap-2">
                <span className="text-white/50">Linkage</span>
                <select
                  value={linkageMethod}
                  onChange={(e) => setLinkageMethod(e.target.value as typeof linkageMethod)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 text-white rounded px-1 py-0.5"
                >
                  <option value="ward">Ward</option>
                  <option value="complete">Complete</option>
                  <option value="average">Average</option>
                  <option value="single">Single</option>
                </select>
              </label>

              {config.source === 'generation' && (
                <label className="flex items-center justify-between gap-2">
                  <span className="text-white/50">Max leaves</span>
                  <input
                    type="number"
                    min={3}
                    max={200}
                    value={maxLeaves}
                    onChange={(e) => setMaxLeaves(Number(e.target.value))}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="bg-white/10 text-white rounded px-1 py-0.5 w-16"
                  />
                </label>
              )}
            </>
          )}

          {!selectedChartType && (
            <span className="text-white/30">Select a chart type first.</span>
          )}
          {selectedChartType === 'radar' && (
            <>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-white/50">Features</span>
                      <div className="flex gap-2">
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setSelectedFeatures(new Set(anchoredFeatures))}
                          className="text-white/40 hover:text-white/70 underline"
                        >
                          Select all
                        </button>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setSelectedFeatures(new Set())}
                          className="text-white/40 hover:text-white/70 underline"
                        >
                          Clear all
                        </button>
                      </div>
                    </div>
                    <div className="max-h-24 overflow-y-auto flex flex-col gap-0.5">
                      {anchoredFeatures.map((feature) => (
                        <label key={feature} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selectedFeatures.has(feature)}
                            onChange={(e) => {
                              setSelectedFeatures((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(feature)
                                else next.delete(feature)
                                return next
                              })
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                          <span className="text-white/70">{feature}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                   <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setSelectedFeatures(new Set(anchoredFeatures))}
                    className="self-end text-white/40 hover:text-white/70 underline"
                  >
                    Reset to defaults
                  </button>
            </>
          )}

           {selectedChartType === 'tsne' && (
            <>
              <label className="flex items-center justify-between gap-2">
                <span className="text-white/50">Perplexity</span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={perplexity ?? ''}
                  placeholder="auto"
                  onChange={(e) => setPerplexity(e.target.value ? Number(e.target.value) : null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 text-white rounded px-1 py-0.5 w-16"
                />
              </label>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setPerplexity(null)}
                className="self-end text-white/40 hover:text-white/70 underline"
              >
                Reset to defaults
              </button>
            </>
          )}
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
  onGeneratePlaylistChart: (chartType: ChartType, config: import('../core/visualizationTiles').ChartConfig) => void
  onGenerateGenerationChart: (chartType: ChartType, config: import('../core/visualizationTiles').ChartConfig) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(undefined)

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
      initialSize={{ width: 320, height: 380 }}
      forceMinHeight={measuredHeight}
      title="Charts"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
       <div ref={contentRef} className="px-6 pb-6 flex flex-col gap-4 overflow-visible">
        {ANCHOR_CONFIGS.map((config) => (
          <AnchorSection
            key={config.source}
            config={config}
            anchorRef={config.source === 'playlist' ? playlistAnchorRef : generationAnchorRef}
            anchoredLabel={config.source === 'playlist' ? anchoredPlaylist?.label ?? null : anchoredGeneration?.label ?? null}
            anchoredFeatures={config.source === 'playlist' ? anchoredPlaylist?.features ?? [] : anchoredGeneration?.features ?? []}
            onClear={config.source === 'playlist' ? onClearPlaylist : onClearGeneration}
            onGenerate={config.source === 'playlist' ? onGeneratePlaylistChart : onGenerateGenerationChart}
          />
        ))}
      </div>
    </DraggableGlass>
  )
}