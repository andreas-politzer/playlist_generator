import { useState, useRef, useLayoutEffect } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface GenerateConfig {
  targetType: string
  targetValue: number
  algorithm: 'kmeans' | 'dbscan' | 'hdbscan' | 'agglomerative' | 'gmm'
  scaler: 'standard' | 'minmax' | 'robust' | 'power'
  kmeansSettings: { clusterMode: 'automatic' | 'manual'; k: number }
  agglomerativeSettings: { nClusters: number; linkage: 'ward' | 'complete' | 'average' }
  gmmSettings: { nComponents: number }
  dbscanSettings: { epsilon: number; minSamples: number }
  hdbscanSettings: { minClusterSize: number; minSamples: number | null }
  dimensionalityReduction: { method: 'none' | 'pca' | 'kernel_pca'; nComponents: number; kernel: string }
  expertSettings: { nInit: number; maxIter: number; randomState: number }
}

async function saveGeneration(
  filename: string,
  config: GenerateConfig,
): Promise<{ id: string; name: string }> {
  const response = await fetch(
    `http://localhost:8001/generations?filename=${encodeURIComponent(filename)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: { type: config.targetType, value: config.targetValue },
        algorithm: config.algorithm,
        scaler: config.scaler,
        kmeans: { cluster_count_mode: config.kmeansSettings.clusterMode, k: config.kmeansSettings.k },
        agglomerative: {
          n_clusters: config.agglomerativeSettings.nClusters,
          linkage: config.agglomerativeSettings.linkage,
        },
        gmm: { n_components: config.gmmSettings.nComponents },
        dbscan: { epsilon: config.dbscanSettings.epsilon, min_samples: config.dbscanSettings.minSamples },
        hdbscan: { min_cluster_size: config.hdbscanSettings.minClusterSize, min_samples: config.hdbscanSettings.minSamples },
        dimensionality_reduction: {
          method: config.dimensionalityReduction.method,
          n_components: config.dimensionalityReduction.nComponents,
          kernel: config.dimensionalityReduction.kernel,
        },
        expert: {
          n_init: config.expertSettings.nInit,
          max_iter: config.expertSettings.maxIter,
          random_state: config.expertSettings.randomState,
        },
      }),
    },
  )
  if (!response.ok) throw new Error('Generation failed')
  return response.json()
}

export function GenerateTile({
  startPosition,
  onDragEnd,
  onGenerated,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  onGenerated?: () => void
}) {
  const [sourceFile, setSourceFile] = useState<string | null>(null)
  const [targetType, setTargetType] = useState<'songs_per_playlist' | 'playlist_count'>('songs_per_playlist')
  const [targetValue, setTargetValue] = useState(50)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [algorithm, setAlgorithm] = useState<'kmeans' | 'dbscan' | 'hdbscan' | 'agglomerative' | 'gmm'>('kmeans')
  const [scaler, setScaler] = useState<'standard' | 'minmax' | 'robust' | 'power'>('standard')

  const [kmeansSettings, setKmeansSettings] = useState({ clusterMode: 'automatic' as 'automatic' | 'manual', k: 10 })
  const [agglomerativeSettings, setAgglomerativeSettings] = useState({ nClusters: 10, linkage: 'ward' as 'ward' | 'complete' | 'average' })
  const [gmmSettings, setGmmSettings] = useState({ nComponents: 10 })
  const [dbscanSettings, setDbscanSettings] = useState({ epsilon: 0.4, minSamples: 10 })
  const [hdbscanSettings, setHdbscanSettings] = useState<{ minClusterSize: number; minSamples: number | null }>({ minClusterSize: 10, minSamples: null })
  const [expertOpen, setExpertOpen] = useState(false)
  const [dimensionalityReduction, setDimensionalityReduction] = useState<{ method: 'none' | 'pca' | 'kernel_pca'; nComponents: number; kernel: string }>({ method: 'none', nComponents: 5, kernel: 'rbf' })
  const [expertSettings, setExpertSettings] = useState({ nInit: 10, maxIter: 300, randomState: 42 })
  const containerRef = useRef<HTMLDivElement>(null)
  const advancedContentRef = useRef<HTMLDivElement>(null)
  const expertContentRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(undefined)
  const [expertMaxHeight, setExpertMaxHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const element = advancedContentRef.current
    if (!element) return

    const updateHeight = () => {
      const nextHeight = 68 + element.scrollHeight + 20
      setMeasuredHeight((prev) => (prev !== undefined && Math.abs(prev - nextHeight) < 1 ? prev : nextHeight))
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!expertOpen) return

    const BOTTOM_MARGIN = 24
    const MIN_HEIGHT = 80

    const updateExpertMaxHeight = () => {
      const element = expertContentRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const available = window.innerHeight - rect.top - BOTTOM_MARGIN
      const nextHeight = Math.max(MIN_HEIGHT, available)
      setExpertMaxHeight((prev) => (prev !== undefined && Math.abs(prev - nextHeight) < 1 ? prev : nextHeight))
    }

    updateExpertMaxHeight()
    window.addEventListener('resize', updateExpertMaxHeight)
    return () => window.removeEventListener('resize', updateExpertMaxHeight)
  }, [expertOpen])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDropTarget(false)
    const filename = e.dataTransfer.getData('text/raw-list-filename')
    if (filename) setSourceFile(filename)
  }

  const handleGenerate = async () => {
    if (!sourceFile) return
    setIsGenerating(true)
    try {
      await saveGeneration(sourceFile, {
        targetType,
        targetValue,
        algorithm,
        scaler,
        kmeansSettings,
        agglomerativeSettings,
        gmmSettings,
        dbscanSettings,
        hdbscanSettings,
        dimensionalityReduction,
        expertSettings,
      })
      onGenerated?.()
      setShowSuccess(true)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 360 }}
      forceMinHeight={measuredHeight}
      title="Generate Playlists"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
      <div
        ref={advancedContentRef}
        onDragOver={(e) => { e.preventDefault(); setIsDropTarget(true) }}
        onDragLeave={() => setIsDropTarget(false)}
        onDrop={handleDrop}
        className="px-6 pb-6 flex flex-col gap-4 overflow-visible"
      >
        <div
          className={`shrink-0 rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors ${
            isDropTarget ? 'border-white/80 bg-white/10' : 'border-white/30'
          }`}
        >
          <span className="font-body text-xs text-white/80">
            {sourceFile ? sourceFile : 'Drop a raw list here'}
          </span>
        </div>

        <div className="flex flex-col gap-2 text-xs font-body text-white/80">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={targetType === 'songs_per_playlist'}
              onChange={() => setTargetType('songs_per_playlist')}
            />
            Approximately songs per playlist
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={targetType === 'playlist_count'}
              onChange={() => setTargetType('playlist_count')}
            />
            Number of playlists
          </label>
        </div>

        <input
          type="number"
          value={targetValue}
          onChange={(e) => setTargetValue(Number(e.target.value))}
          onPointerDown={(e) => e.stopPropagation()}
          className="bg-white/10 border border-white/30 rounded-lg px-2 py-1 text-xs text-white font-body focus:outline-none focus:border-white/70"
        />

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="shrink-0 text-left text-[10px] font-body uppercase tracking-widest text-white/50 hover:text-white/90"
          >
            {showAdvanced ? '▲ Hide advanced' : '▼ Advanced settings'}
          </button>

          {showAdvanced && (
             <div className="flex flex-col gap-3 text-xs font-body text-white/80 overflow-visible">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-white/50">Algorithm</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setAlgorithm('kmeans')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      algorithm === 'kmeans' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    K-Means
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setAlgorithm('agglomerative')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      algorithm === 'agglomerative' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    Agglomerative
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setAlgorithm('gmm')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      algorithm === 'gmm' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    GMM
                  </button>
                 <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setAlgorithm('dbscan')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      algorithm === 'dbscan' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    DBSCAN ⚠
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setAlgorithm('hdbscan')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      algorithm === 'hdbscan' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    HDBSCAN
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-white/50">Scaler</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setScaler('standard')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      scaler === 'standard' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setScaler('minmax')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      scaler === 'minmax' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    MinMax
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setScaler('robust')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      scaler === 'robust' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    Robust
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setScaler('power')}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      scaler === 'power' ? 'border-white/70 bg-white/10' : 'border-white/30'
                    }`}
                  >
                    Power
                  </button>
                </div>
              </div>
  
              {algorithm === 'kmeans' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Cluster count</span>
                  <span className="text-[10px] text-white/40">
                    With K-Means, cluster count directly equals the number of resulting playlists.
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={kmeansSettings.clusterMode === 'automatic'}
                      onChange={() => setKmeansSettings((s) => ({ ...s, clusterMode: 'automatic' }))}
                    />
                    Automatic (from target above)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={kmeansSettings.clusterMode === 'manual'}
                      onChange={() => setKmeansSettings((s) => ({ ...s, clusterMode: 'manual' }))}
                    />
                    Manual:
                    <input
                      type="number"
                      value={kmeansSettings.k}
                      onChange={(e) => setKmeansSettings((s) => ({ ...s, k: Number(e.target.value) }))}
                      onPointerDown={(e) => e.stopPropagation()}
                      disabled={kmeansSettings.clusterMode !== 'manual'}
                      className="w-16 bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white disabled:opacity-40"
                    />
                  </label>
                </div>
              )}

              {algorithm === 'agglomerative' && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Number of clusters</span>
                  <input
                    type="number"
                    value={agglomerativeSettings.nClusters}
                    onChange={(e) => setAgglomerativeSettings((s) => ({ ...s, nClusters: Number(e.target.value) }))}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-16 bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white"
                  />

                  <span className="text-[10px] uppercase tracking-widest text-white/50 mt-1">Linkage</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['ward', 'complete', 'average'] as const).map((option) => (
                      <button
                        key={option}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setAgglomerativeSettings((s) => ({ ...s, linkage: option }))}
                        className={`rounded-lg border px-2 py-1 text-[10px] capitalize ${
                          agglomerativeSettings.linkage === option ? 'border-white/70 bg-white/10' : 'border-white/30'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {algorithm === 'gmm' && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Number of clusters</span>
                  <input
                    type="number"
                    value={gmmSettings.nComponents}
                    onChange={(e) => setGmmSettings({ nComponents: Number(e.target.value) })}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-16 bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white"
                  />
                </div>
              )}

              {algorithm === 'dbscan' && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Cluster count</span>
                  <span className="text-[10px] text-white/40">
                    Automatic — determined by the parameters below.
                  </span>
                  <span className="text-[10px] text-yellow-400/80">
                    DBSCAN does not guarantee a specific number or size of playlists. Songs may be classified as
                    noise (unassigned).
                  </span>
                  <label className="flex items-center gap-2 mt-1">
                    Epsilon:
                    <input
                      type="number"
                      step="0.1"
                      value={dbscanSettings.epsilon}
                      onChange={(e) => setDbscanSettings((s) => ({ ...s, epsilon: Number(e.target.value) }))}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-16 bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Min samples:
                    <input
                      type="number"
                      value={dbscanSettings.minSamples}
                      onChange={(e) => setDbscanSettings((s) => ({ ...s, minSamples: Number(e.target.value) }))}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-16 bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white"
                    />
                 </label>
                </div>
              )}

              {algorithm === 'hdbscan' && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Cluster count</span>
                  <span className="text-[10px] text-white/40">
                    Automatic — determined by the parameters below. More robust than DBSCAN, handles clusters of varying density.
                  </span>
                  <label className="flex items-center gap-2 mt-1">
                    Min cluster size:
                    <input
                      type="number"
                      value={hdbscanSettings.minClusterSize}
                      onChange={(e) => setHdbscanSettings((s) => ({ ...s, minClusterSize: Number(e.target.value) }))}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-16 bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    Min samples (optional):
                    <input
                      type="number"
                      value={hdbscanSettings.minSamples ?? ''}
                      placeholder="auto"
                      onChange={(e) =>
                        setHdbscanSettings((s) => ({ ...s, minSamples: e.target.value ? Number(e.target.value) : null }))
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-16 bg-white/10 border border-white/30 rounded px-1 py-0.5 text-white"
                    />
                  </label>
                </div>
                            )}
            </div>
          )}

                    <div ref={expertContentRef} className="min-h-0 overflow-y-auto pr-1 flex 
           flex-col gap-3" style={{ maxHeight: expertMaxHeight ? `${expertMaxHeight}px` : 
           undefined }}>

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setExpertOpen((prev) => !prev)}
            className="text-left text-[9px] font-body uppercase tracking-widest text-white/40 hover:text-white/70"
          >
            {expertOpen ? '▾' : '▸'} Expert Mode
          </button>

          {expertOpen && (
            <div className="border border-white/10 rounded-lg px-2 py-2 flex flex-col gap-2 text-[10px] font-body">
              <span className="text-white/50 uppercase tracking-widest">Dimensionality Reduction</span>
              <label className="flex items-center justify-between gap-2">
                <span className="text-white/50">Method</span>
                <select
                  value={dimensionalityReduction.method}
                  onChange={(e) => setDimensionalityReduction((s) => ({ ...s, method: e.target.value as 'none' | 'pca' | 'kernel_pca' }))}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 text-white rounded px-1 py-0.5"
                >
                  <option value="none">None</option>
                  <option value="pca">PCA</option>
                  <option value="kernel_pca">Kernel PCA</option>
                </select>
              </label>

              {dimensionalityReduction.method !== 'none' && (
                <>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-white/50">Components</span>
                    <input
                      type="number"
                      min={1}
                      value={dimensionalityReduction.nComponents}
                      onChange={(e) => setDimensionalityReduction((s) => ({ ...s, nComponents: Number(e.target.value) }))}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="bg-white/10 text-white rounded px-1 py-0.5 w-16"
                    />
                  </label>

                  {dimensionalityReduction.method === 'kernel_pca' && (
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-white/50">Kernel</span>
                      <select
                        value={dimensionalityReduction.kernel}
                        onChange={(e) => setDimensionalityReduction((s) => ({ ...s, kernel: e.target.value }))}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="bg-white/10 text-white rounded px-1 py-0.5"
                      >
                        <option value="linear">Linear</option>
                        <option value="poly">Poly</option>
                        <option value="rbf">RBF</option>
                        <option value="sigmoid">Sigmoid</option>
                        <option value="cosine">Cosine</option>
                      </select>
                    </label>
                  )}
                </>
              )}

              <span className="text-white/50 uppercase tracking-widest mt-1">Algorithm Parameters</span>
              <label className="flex items-center justify-between gap-2">
                <span className="text-white/50">n_init</span>
                <input
                  type="number"
                  min={1}
                  value={expertSettings.nInit}
                  onChange={(e) => setExpertSettings((s) => ({ ...s, nInit: Number(e.target.value) }))}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 text-white rounded px-1 py-0.5 w-16"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-white/50">max_iter</span>
                <input
                  type="number"
                  min={1}
                  value={expertSettings.maxIter}
                  onChange={(e) => setExpertSettings((s) => ({ ...s, maxIter: Number(e.target.value) }))}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 text-white rounded px-1 py-0.5 w-16"
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-white/50">random_state</span>
                <input
                  type="number"
                  value={expertSettings.randomState}
                  onChange={(e) => setExpertSettings((s) => ({ ...s, randomState: Number(e.target.value) }))}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white/10 text-white rounded px-1 py-0.5 w-16"
                />
              </label>

                            <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setDimensionalityReduction({ method: 'none', nComponents: 5, kernel: 'rbf' })
                  setExpertSettings({ nInit: 10, maxIter: 300, randomState: 42 })
                }}
                className="self-end text-white/40 hover:text-white/70 underline"
              >
                Reset to defaults
              </button>
                        </div>
          )}

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleGenerate}
            disabled={!sourceFile || isGenerating}
            className="mt-auto shrink-0 rounded-xl border border-white/40 bg-white/10 hover:border-white/70 py-2 text-xs font-body text-white/90 uppercase tracking-widest disabled:opacity-50"
          >
            {isGenerating ? 'Generating…' : 'Generate Playlists'}
            </button>

            {showSuccess && (
              <div className="shrink-0 flex items-center justify-between gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                <span className="text-xs font-body text-white/90">✓ Playlists generated</span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setShowSuccess(false)}
                  className="rounded-md border border-white/40 bg-white/10 hover:border-white/70 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/90"
                >
                  OK
                </button>
              </div>
            )}
          </div>
      </div>
    </DraggableGlass>
  )
}