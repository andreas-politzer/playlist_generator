import { useState, useRef } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

async function saveGeneration(
  filename: string,
  targetType: string,
  targetValue: number,
): Promise<{ id: string; name: string }> {
  const response = await fetch(
    `http://localhost:8001/generations?filename=${encodeURIComponent(filename)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: { type: targetType, value: targetValue },
        scaler: 'standard',
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
  const containerRef = useRef<HTMLDivElement>(null)

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
      await saveGeneration(sourceFile, targetType, targetValue)
      onGenerated?.()
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 360 }}
      title="Generate Playlists"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDropTarget(true) }}
        onDragLeave={() => setIsDropTarget(false)}
        onDrop={handleDrop}
        className="px-6 pb-6 flex-1 flex flex-col gap-4 overflow-hidden"
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
          onClick={handleGenerate}
          disabled={!sourceFile || isGenerating}
          className="mt-auto shrink-0 rounded-xl border border-white/40 bg-white/10 hover:border-white/70 py-2 text-xs font-body text-white/90 uppercase tracking-widest disabled:opacity-50"
        >
          {isGenerating ? 'Generating…' : 'Generate Playlists'}
        </button>
      </div>
    </DraggableGlass>
  )
}