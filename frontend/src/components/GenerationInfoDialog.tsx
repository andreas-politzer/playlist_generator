import { createPortal } from 'react-dom'

interface GenerationInfo {
  algorithm: string
  scaler: string
  songs_total: number
  playlist_count: number
  silhouette: number | null
  noise_count: number
  used_audio_features: string[]
  kmeans: { cluster_count_mode: string; k: number | null }
  agglomerative: { n_clusters: number; linkage: string }
  gmm: { n_components: number }
  dbscan: { epsilon: number; min_samples: number }
}

const ALGORITHM_LABELS: Record<string, string> = {
  kmeans: 'K-Means',
  dbscan: 'DBSCAN',
  agglomerative: 'Agglomerative Clustering',
  gmm: 'Gaussian Mixture Model',
}

const SCALER_LABELS: Record<string, string> = {
  standard: 'Standard Scaler',
  minmax: 'MinMax Scaler',
  robust: 'Robust Scaler',
  power: 'Power Transformer',
}

function algorithmSpecificDetails(info: GenerationInfo): string[] {
  switch (info.algorithm) {
    case 'kmeans':
      return [
        `Cluster count mode: ${info.kmeans.cluster_count_mode}`,
        info.kmeans.k ? `Manual k: ${info.kmeans.k}` : '',
      ].filter(Boolean)
    case 'agglomerative':
      return [
        `Number of clusters: ${info.agglomerative.n_clusters}`,
        `Linkage: ${info.agglomerative.linkage}`,
      ]
    case 'gmm':
      return [`Number of components: ${info.gmm.n_components}`]
    case 'dbscan':
      return [`Epsilon: ${info.dbscan.epsilon}`, `Min samples: ${info.dbscan.min_samples}`]
    default:
      return []
  }
}

export function GenerationInfoDialog({
  info,
  onClose,
}: {
  info: GenerationInfo
  onClose: () => void
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-black/90 border border-white/30 rounded-xl p-4 flex flex-col gap-2 min-w-[280px] max-w-[340px] text-xs font-body text-white/80">
        <span className="text-sm font-body text-white/90 mb-1">Generation details</span>

        <div className="flex justify-between">
          <span className="text-white/50">Algorithm</span>
          <span>{ALGORITHM_LABELS[info.algorithm] ?? info.algorithm}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50">Scaler</span>
          <span>{SCALER_LABELS[info.scaler] ?? info.scaler}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50">Songs total</span>
          <span>{info.songs_total}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50">Playlists</span>
          <span>{info.playlist_count}</span>
        </div>
        {info.noise_count > 0 && (
          <div className="flex justify-between text-yellow-400/80">
            <span>Noise songs</span>
            <span>{info.noise_count}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-white/50">Silhouette score</span>
          <span>{info.silhouette ?? '—'}</span>
        </div>

        <div className="border-t border-white/10 my-1" />

        {algorithmSpecificDetails(info).map((line, i) => (
          <div key={i} className="text-white/70">{line}</div>
        ))}

        <div className="border-t border-white/10 my-1" />

        <span className="text-white/50">Audio features used</span>
        <span className="text-white/70">{info.used_audio_features?.join(', ') ?? 'unknown'}</span>

        <button
          onClick={onClose}
          className="mt-3 self-end rounded-md border border-white/30 px-3 py-1 text-[10px] font-body text-white/70 hover:border-white/60"
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  )
}