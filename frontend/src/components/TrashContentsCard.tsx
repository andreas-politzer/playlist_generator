import { useState, useEffect, useCallback } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface TrashItem {
  filename: string
  song_count: number
}

async function fetchTrash(): Promise<TrashItem[]> {
  const response = await fetch('http://localhost:8001/songs/trash')
  if (!response.ok) throw new Error('Failed to fetch trash')
  return response.json()
}

async function restoreItem(filename: string): Promise<void> {
  await fetch(`http://localhost:8001/songs/trash/${filename}/restore`, { method: 'POST' })
}

async function deleteForever(filename: string): Promise<void> {
  await fetch(`http://localhost:8001/songs/trash/${filename}`, { method: 'DELETE' })
}

export function TrashContentsCard({
  startPosition,
  onClose,
  onRestore,
}: {
  startPosition: ModulePosition
  onClose: () => void
  onRestore?: () => void
}) {
  const [items, setItems] = useState<TrashItem[]>([])

  const loadItems = useCallback(() => {
    fetchTrash().then(setItems).catch(() => setItems([]))
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const handleRestore = async (filename: string) => {
    await restoreItem(filename)
    loadItems()
    onRestore?.()
  }

  const handleDeleteForever = async (filename: string) => {
    await deleteForever(filename)
    loadItems()
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 320 }}
      title="Trash"
      className="rounded-3xl"
      onClose={onClose}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-2">
          {items.length === 0 && (
            <span className="text-xs font-body text-white/40">Trash is empty</span>
          )}
          {items.map((item) => (
            <div key={item.filename} className="flex flex-col gap-1 bg-white/5 rounded-lg px-2 py-1.5">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-body text-white/90 truncate">{item.filename}</span>
                <span className="text-[10px] font-body text-white/50">{item.song_count} songs</span>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => handleRestore(item.filename)}
                  className="flex-1 rounded-md border border-white/40 bg-white/10 hover:border-white/70 py-1 text-[10px] uppercase tracking-widest text-white/90"
                >
                  Restore
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => handleDeleteForever(item.filename)}
                  className="flex-1 rounded-md border border-white/40 bg-white/10 hover:border-white/70 py-1 text-[10px] uppercase tracking-widest text-white/90"
                >
                  Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DraggableGlass>
  )
}