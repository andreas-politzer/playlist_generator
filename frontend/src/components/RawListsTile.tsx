import { useState, useEffect, useCallback, useRef } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface RawList {
  filename: string
  song_count: number
}

async function fetchRawLists(): Promise<RawList[]> {
  const response = await fetch('http://localhost:8001/songs/list')
  if (!response.ok) throw new Error('Failed to fetch raw lists')
  return response.json()
}

async function deleteRawList(filename: string): Promise<void> {
  const response = await fetch(`http://localhost:8001/songs/${filename}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete raw list')
}

export function RawListsTile({
  startPosition,
  onDragEnd,
  onDragStart,
  onDragMove,
  zIndex,
  refreshKey,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  onDragStart?: () => void
  onDragMove?: (position: import('../core/types').ModulePosition) => void
  zIndex?: number
  refreshKey?: number
}) {
  const [lists, setLists] = useState<RawList[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const loadLists = useCallback(() => {
    fetchRawLists().then(setLists).catch(() => setLists([]))
  }, [])

  useEffect(() => {
    loadLists()
  }, [loadLists, refreshKey])

  const handleDelete = async (filename: string) => {
    await deleteRawList(filename)
    loadLists()
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 320 }}
      title="Raw Lists"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      zIndex={zIndex}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-2">
          {lists.length === 0 && (
            <span className="text-xs font-body text-white/40">No raw lists yet</span>
          )}
          {lists.map((list) => (
            <div
              key={list.filename}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/raw-list-filename', list.filename)}
              className="flex items-center justify-between gap-2 bg-white/5 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-body text-white/90 truncate">{list.filename}</span>
                <span className="text-[10px] font-body text-white/50">{list.song_count} songs</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DraggableGlass>
  )
}