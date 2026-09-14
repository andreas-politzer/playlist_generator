import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition, AnchoredGeneration } from '../core/types'

type WizardState = 'idle' | 'preset_selection' | 'running' | 'results' | 'applied'

interface PresetOption {
  id: string
  label: string
  description: string
}

const PRESETS: PresetOption[] = [
  { id: 'genre_discovery', label: 'Genre Discovery', description: 'Prioritizes clean mathematical separation between playlists' },
  { id: 'dj_flow', label: 'DJ Set / Flow', description: 'Prioritizes cluster balance and consistency' },
  { id: 'balanced', label: 'Balanced Default', description: 'Weighs all metrics evenly' },
]

interface WarningTrack {
  name: string
  artist: string
  track_id: string
}

interface CandidateWarning {
  type: string
  cluster_size?: number
  percentage?: number
  tracks?: WarningTrack[]
}

interface CandidateResult {
  id: string
  name: string
  algorithm: string
  scaler: string
  params: Record<string, number | string>
  overall_score: number
  metrics: Record<string, number>
  warnings: CandidateWarning[]
  requires_confirmation: boolean
  guardrail_level_name: string
  sample_playlist_count: number
  reducer_name: string
  reducer_n_components: number | null
}

interface WizardJobStatus {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'
  trial: number
  total_trials: number
  best_score: number | null
  candidates: CandidateResult[]
  error: string | null
  guardrail_stage: number
  guardrail_stage_count: number
  guardrail_level_name: string
  guardrails_relaxed: boolean
}

async function startOptimizeJob(
  generationId: string,
  preset: string,
  targetPlaylistCount: number,
  freeClusterCount: boolean,
): Promise<{ job_id: string }> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset,
      target_playlist_count: freeClusterCount ? null : targetPlaylistCount,
      free_cluster_count: freeClusterCount,
    }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Failed to start optimization.')
  }
  return response.json()
}

async function fetchJobStatus(jobId: string): Promise<WizardJobStatus> {
  const response = await fetch(`http://localhost:8001/wizard/jobs/${jobId}`)
  if (!response.ok) throw new Error('Failed to fetch job status.')
  return response.json()
}

async function cancelJob(jobId: string): Promise<void> {
  await fetch(`http://localhost:8001/wizard/jobs/${jobId}/cancel`, { method: 'POST' })
}

interface SignificanceResult {
  permutations_count: number
  ch_percentile: number
  db_percentile: number
  ch_p_value: number
  db_p_value: number
}

async function validateCandidate(jobId: string, candidateId: string): Promise<SignificanceResult> {
  const response = await fetch(`http://localhost:8001/wizard/jobs/${jobId}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_id: candidateId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Validation failed.')
  }
  return response.json()
}

async function createOptimizedCollection(
  generationId: string,
  preset: string,
  candidate: CandidateResult,
): Promise<{ status: string; generation_id: string; name: string; playlist_count: number }> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/optimize/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset,
      scaler: candidate.scaler,
      algorithm: candidate.algorithm,
      params: candidate.params,
      allow_guardrail_violations: candidate.requires_confirmation,
      guardrail_level_name: candidate.guardrail_level_name,
      reducer_name: candidate.reducer_name,
      reducer_n_components: candidate.reducer_n_components,
    }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : detail?.message ?? 'Failed to create optimized collection.'
    throw new Error(message)
  }
  return response.json()
}

export function PinballWizardTile({
  startPosition,
  onDragEnd,
  onDragStart,
  onDragMove,
  zIndex,
  generationAnchorRef,
  anchoredGeneration,
  onClearGeneration,
  onOptimizedCollectionCreated,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  onDragStart?: () => void
  onDragMove?: (position: ModulePosition) => void
  zIndex?: number
  generationAnchorRef: React.RefObject<HTMLDivElement | null>
  anchoredGeneration: AnchoredGeneration | null
  onClearGeneration: () => void
  onOptimizedCollectionCreated: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(undefined)
  const [wizardState, setWizardState] = useState<WizardState>('idle')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [targetPlaylistCount, setTargetPlaylistCount] = useState<number>(0)
  const [freeClusterCount, setFreeClusterCount] = useState(false)

  useEffect(() => {
    if (anchoredGeneration?.playlistCount) {
      setTargetPlaylistCount(anchoredGeneration.playlistCount)
    }
  }, [anchoredGeneration])
  const [candidates, setCandidates] = useState<CandidateResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [createdName, setCreatedName] = useState<string | null>(null)
  const [createdPlaylistCount, setCreatedPlaylistCount] = useState<number | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<WizardJobStatus | null>(null)
  const currentJobId = useRef<string | null>(null)
  const [significanceResults, setSignificanceResults] = useState<Record<string, SignificanceResult>>({})
  const [validatingId, setValidatingId] = useState<string | null>(null)

  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) return
    const updateHeight = () => setMeasuredHeight(68 + element.scrollHeight + 20)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [wizardState, candidates])

  const startOptimization = async () => {
    if (!anchoredGeneration || !selectedPreset) return
    setWizardState('running')
    setError(null)
    setJobProgress(null)
    try {
      const { job_id } = await startOptimizeJob(anchoredGeneration.generationId, selectedPreset, targetPlaylistCount, freeClusterCount)
      currentJobId.current = job_id
      pollJob(job_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setWizardState('preset_selection')
    }
  }

  const pollJob = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const job = await fetchJobStatus(jobId)
        if (job.status === 'running' || job.status === 'queued') {
          setJobProgress(job)
          return
        }

        clearInterval(interval)
        setJobProgress(null)

        if (job.status === 'cancelled') {
          setWizardState('preset_selection')
          return
        }
        if (job.status === 'failed') {
          setError(job.error ?? 'Optimization failed.')
          setWizardState('preset_selection')
          return
        }
        if (job.status === 'completed') {
          if (job.candidates.length === 0) {
            setError(job.error ?? 'No valid configuration found for this collection.')
            setWizardState('preset_selection')
            return
          }
          setCandidates(job.candidates)
          setWizardState('results')
        }
      } catch (err) {
        clearInterval(interval)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setWizardState('preset_selection')
      }
    }, 1000)
  }

  const cancelOptimization = () => {
    if (currentJobId.current) cancelJob(currentJobId.current)
  }

  const handleValidate = async (candidateId: string) => {
    if (!currentJobId.current) return
    setValidatingId(candidateId)
    try {
      const result = await validateCandidate(currentJobId.current, candidateId)
      setSignificanceResults((prev) => ({ ...prev, [candidateId]: result }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed.')
    } finally {
      setValidatingId(null)
    }
  }

  const applyCandidate = async (candidate: CandidateResult) => {
    if (!anchoredGeneration || !selectedPreset) return
    setApplyingId(candidate.id)
    setError(null)
    try {
      const result = await createOptimizedCollection(anchoredGeneration.generationId, selectedPreset, candidate)
      setCreatedName(result.name)
      setCreatedPlaylistCount(result.playlist_count)
      setWizardState('applied')
      onOptimizedCollectionCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setApplyingId(null)
    }
  }

  const reset = () => {
    setWizardState('preset_selection')
    setSelectedPreset(null)
    setCandidates([])
    setError(null)
    setCreatedName(null)
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 360, height: 420 }}
      forceMinHeight={measuredHeight}
      title="Pinball Wizard"
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
                onClick={() => { onClearGeneration(); setWizardState('idle'); setError(null) }}
                className="absolute top-1 right-1 text-white/50 hover:text-white/90 text-[10px] leading-none"
              >
                ✕
              </button>
            )}
          </div>
          <span className="text-[9px] font-body text-white/30 italic">
            Optimizing the songs currently stored in this collection. Songs previously discarded as noise are not included.
          </span>
        </div>

        {error && <span className="text-xs font-body text-red-400">{error}</span>}

        {anchoredGeneration && wizardState === 'idle' && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={reset}
            className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1 self-start"
          >
            🪄 Auto-Optimize Pipeline
          </button>
        )}

        {wizardState === 'preset_selection' && (
          <div className="flex flex-col gap-2">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { setWizardState('idle'); setError(null) }}
              className="text-[10px] font-body text-white/40 hover:text-white/70 self-start"
            >
              ← Back
            </button>
            <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Choose Intent</span>
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSelectedPreset(preset.id)}
                className={`text-left rounded-lg px-2 py-1.5 border transition-colors ${
                  selectedPreset === preset.id
                    ? 'border-white/60 bg-white/10'
                    : 'border-white/20 hover:border-white/40'
                }`}
              >
                <div className="text-xs font-body text-white/90">{preset.label}</div>
                <div className="text-[9px] font-body text-white/40">{preset.description}</div>
              </button>
            ))}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10">
              <label className="flex items-center gap-1.5 text-[10px] font-body text-white/60">
                <input
                  type="checkbox"
                  checked={freeClusterCount}
                  onChange={(e) => setFreeClusterCount(e.target.checked)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                Let the Wizard choose freely
              </label>
              {!freeClusterCount && (
                <label className="flex items-center gap-2 text-[10px] font-body text-white/60">
                  Target playlist count
                  <input
                    type="number"
                    min={3}
                    value={targetPlaylistCount}
                    onChange={(e) => setTargetPlaylistCount(Number(e.target.value))}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="bg-white/10 border border-white/30 rounded px-2 py-0.5 text-xs text-white font-body w-16 focus:outline-none focus:border-white/70"
                  />
                </label>
              )}
            </div>

            {selectedPreset && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={startOptimization}
                className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1.5 self-start mt-1"
              >
                Start Optimization
              </button>
            )}
          </div>
        )}

        {wizardState === 'running' && (
          <div className="flex flex-col gap-2 items-center py-3">
            <span className="text-[10px] font-body text-white/50">Running Optuna trials on this collection...</span>
            {jobProgress && (
              <>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/60 transition-all duration-300"
                    style={{ width: `${Math.min(100, (jobProgress.trial / jobProgress.total_trials) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-body text-white/40">
                  Trial {jobProgress.trial} / {jobProgress.total_trials}
                  {jobProgress.best_score !== null && ` · Best score so far: ${(jobProgress.best_score * 100).toFixed(0)}%`}
                </span>
                <span className="text-[9px] font-body text-white/30">
                  Guardrail stage {jobProgress.guardrail_stage} / {jobProgress.guardrail_stage_count} — {jobProgress.guardrail_level_name}
                </span>
              </>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={cancelOptimization}
              className="text-[10px] font-body text-white/50 hover:text-white/90 underline"
            >
              Cancel Optimization
            </button>
          </div>
        )}

        {wizardState === 'results' && (
          <div className="flex flex-col gap-2">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { setWizardState('preset_selection'); setError(null); setCandidates([]) }}
              className="text-[10px] font-body text-white/40 hover:text-white/70 self-start"
            >
              ← Back
            </button>
            <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Top Candidates</span>
            {candidates.map((candidate) => (
              <div key={candidate.id} className="flex flex-col gap-1 bg-white/5 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-body text-white/90">{candidate.name}</span>
                  <span className="text-xs font-body text-green-400">{(candidate.overall_score * 100).toFixed(0)}%</span>
                </div>
                {candidate.guardrail_level_name !== 'strict' && (
                  <span className="text-[9px] font-body text-yellow-400">
                    Found with relaxed guardrails ({candidate.guardrail_level_name})
                  </span>
                )}
                {candidate.reducer_name === 'pca' && (
                  <span className="text-[9px] font-body text-blue-300">
                    Uses PCA dimensionality reduction ({candidate.reducer_n_components} components)
                  </span>
                )}
                <span className="text-[9px] font-body text-white/30">
                  ~{candidate.sample_playlist_count} playlists (estimated on search sample)
                </span>
                {significanceResults[candidate.id] ? (
                  <span className="text-[9px] font-body text-green-300">
                    Better than at least {significanceResults[candidate.id].ch_percentile}% of random assignments (CH & DB, p ≤ {significanceResults[candidate.id].ch_p_value})
                  </span>
                ) : (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleValidate(candidate.id)}
                    disabled={validatingId !== null}
                    className="text-[9px] font-body text-white/40 hover:text-white/70 underline self-start disabled:opacity-50"
                  >
                    {validatingId === candidate.id ? 'Validating...' : 'Validate statistical significance'}
                  </button>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="text-[9px] font-body text-white/50">Silhouette: {candidate.metrics.silhouette_score}</span>
                  <span className="text-[9px] font-body text-white/50">Balance: {candidate.metrics.cluster_balance}</span>
                  <span className="text-[9px] font-body text-white/50">Noise: {(candidate.metrics.noise_ratio * 100).toFixed(1)}%</span>
                </div>

                {candidate.warnings && candidate.warnings.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1.5">
                    <span className="text-[9px] font-body text-yellow-400 uppercase tracking-wide">⚠ {candidate.warnings.length} warning{candidate.warnings.length > 1 ? 's' : ''}</span>
                    {candidate.warnings.map((w, i) => (
                      <div key={i} className="text-[9px] font-body text-white/50">
                        {w.type === 'CLUSTER_TOO_SMALL' && w.tracks && (
                          <>Small cluster ({w.cluster_size} songs): {w.tracks.map((t) => `"${t.name}" by ${t.artist}`).join(', ')}</>
                        )}
                        {w.type === 'CLUSTER_TOO_DOMINANT' && (
                          <>One cluster covers {w.percentage}% of the collection</>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => applyCandidate(candidate)}
                  disabled={applyingId !== null}
                  className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1 self-start mt-1 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {applyingId === candidate.id && (
                    <span className="inline-block w-2.5 h-2.5 border border-white/60 border-t-transparent rounded-full animate-spin" />
                  )}
                  {applyingId === candidate.id
                    ? 'Creating optimized collection...'
                    : candidate.requires_confirmation
                      ? 'Create Anyway'
                      : 'Create Optimized Collection'}
                </button>
              </div>
            ))}
          </div>
        )}

        {wizardState === 'applied' && (
          <div className="flex flex-col gap-2 items-center text-center py-2">
            <span className="text-xs font-body text-green-400">✓ "{createdName}" created</span>
            {createdPlaylistCount !== null && (
              <span className="text-[10px] font-body text-white/40">{createdPlaylistCount} playlists in the final collection</span>
            )}
            <span className="text-[10px] font-body text-white/50">Check the Music Library for the new collection.</span>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setWizardState('results')}
              className="text-[10px] font-body text-white/50 hover:text-white/90 underline"
            >
              Back to candidates
            </button>
          </div>
        )}
      </div>
    </DraggableGlass>
  )
}