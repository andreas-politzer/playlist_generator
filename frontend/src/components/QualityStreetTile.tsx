import { useRef, useState } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

export function QualityStreetTile({
  startPosition,
  onDragEnd,
  onDragStart,
  onDragMove,
  zIndex,
  playlistAnchorRef,
  generationAnchorRef,
  anchoredPlaylistLabel,
  anchoredGenerationLabel,
  onClearPlaylist,
  onClearGeneration,
  onGenerate,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  onDragStart?: () => void
  onDragMove?: (position: ModulePosition) => void
  zIndex?: number
  playlistAnchorRef: React.RefObject<HTMLDivElement | null>
  generationAnchorRef: React.RefObject<HTMLDivElement | null>
  anchoredPlaylistLabel: string | null
  anchoredGenerationLabel: string | null
  onClearPlaylist: () => void
  onClearGeneration: () => void
  onGenerate: (target: 'playlist' | 'generation') => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 320 }}
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
      <div className="px-6 pb-6 flex-1 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Playlist</span>
          <div
            ref={playlistAnchorRef}
            className={`relative border border-dashed rounded-lg px-2 py-3 text-center text-[10px] font-body ${
              anchoredPlaylistLabel ? 'border-white/60 text-white/90' : 'border-white/30 text-white/40'
            }`}
          >
            {anchoredPlaylistLabel ?? 'Drag a playlist here'}
            {anchoredPlaylistLabel && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClearPlaylist}
                className="absolute top-1 right-1 text-white/50 hover:text-white/90 text-[10px] leading-none"
              >
                ✕
              </button>
            )}
          </div>
          {anchoredPlaylistLabel && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onGenerate('playlist')}
              className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1 self-start"
            >
              Analyze Playlist
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Collection</span>
          <div
            ref={generationAnchorRef}
            className={`relative border border-dashed rounded-lg px-2 py-3 text-center text-[10px] font-body ${
              anchoredGenerationLabel ? 'border-white/60 text-white/90' : 'border-white/30 text-white/40'
            }`}
          >
            {anchoredGenerationLabel ?? 'Drag a collection here'}
            {anchoredGenerationLabel && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClearGeneration}
                className="absolute top-1 right-1 text-white/50 hover:text-white/90 text-[10px] leading-none"
              >
                ✕
              </button>
            )}
          </div>
          {anchoredGenerationLabel && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onGenerate('generation')}
              className="text-[10px] font-body bg-white/20 hover:bg-white/30 text-white rounded px-2 py-1 self-start"
            >
              Analyze Collection
            </button>
          )}
        </div>

         <div className="flex flex-col items-center gap-0.5 pt-2 border-t border-white/10">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Overall Quality (preview)</span>
          <span className="text-2xl font-body text-white/90">91.5</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Statistical Metrics</span>
          <div className="flex flex-col gap-0.5 text-[10px] font-body">
            <div className="flex justify-between"><span className="text-white/60">Silhouette Score</span><span className="text-green-400">0.68 · Optimal</span></div>
            <div className="flex justify-between"><span className="text-white/60">Calinski-Harabasz Index</span><span className="text-green-400">1420.5 · Excellent</span></div>
            <div className="flex justify-between"><span className="text-white/60">Davies-Bouldin Index</span><span className="text-green-400">0.42 · Optimal</span></div>
            <div className="flex justify-between"><span className="text-white/60">Cluster Balance</span><span className="text-green-400">0.89 · Balanced</span></div>
            <div className="flex justify-between"><span className="text-white/60">Noise Ratio</span><span className="text-green-400">7.1% · Healthy</span></div>
            <div className="flex justify-between"><span className="text-white/60">Elbow Point</span><span className="text-green-400">k=5 · At Elbow</span></div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-body uppercase tracking-widest text-white/50">Music-Specific Metrics</span>
          <div className="flex flex-col gap-0.5 text-[10px] font-body">
            <div className="flex justify-between"><span className="text-white/60">Tempo Transition</span><span className="text-blue-300">Ø 3.8 BPM · Smooth</span></div>
            <div className="flex justify-between"><span className="text-white/60">Energy Transition</span><span className="text-blue-300">Ø 0.06 · Flowing</span></div>
            <div className="flex justify-between"><span className="text-white/60">Harmonic Compatibility</span><span className="text-blue-300">87.5% · Harmonic</span></div>
            <div className="flex justify-between"><span className="text-white/60">Artist/Genre Diversity</span><span className="text-blue-300">HHI 0.12 · Diverse</span></div>
          </div>
        </div>
      </div>
    </DraggableGlass>
  )
}