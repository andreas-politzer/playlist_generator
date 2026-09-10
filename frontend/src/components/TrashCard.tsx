import { useRef, useState } from 'react'
import { useDraggable } from '../core/useDraggable'
import { GlassPane } from './GlassPane'
import { TrashCanIcon } from './TrashCanIcon'
import { TrashContentsCard } from './TrashContentsCard'
import type { ModulePosition } from '../core/types'

const SIZE = { width: 72, height: 72 }
const CLICK_MOVE_THRESHOLD = 6

async function moveToTrash(filename: string) {
  await fetch(`http://localhost:8001/songs/${filename}`, { method: 'DELETE' })
}

export function TrashCard({
  startPosition,
  onDragEnd,
  onDragStart,
  zIndex,
  onItemMoved,
  onGenerationRestored,
  refreshKey,
  containerRef,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  onDragStart?: () => void
  zIndex?: number
  onItemMoved?: () => void
  onGenerationRestored?: () => void
  refreshKey?: number
  containerRef?: React.RefObject<HTMLDivElement | null>
}) {
  const { position, dragHandlers } = useDraggable(startPosition, onDragEnd)
  const localRef = useRef<HTMLDivElement>(null)
  const actualRef = containerRef ?? localRef
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [isContentsOpen, setIsContentsOpen] = useState(false)
  const downPos = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY }
    onDragStart?.()
    dragHandlers.onPointerDown(e)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    dragHandlers.onPointerUp(e, actualRef.current?.getBoundingClientRect())
    if (!downPos.current) return
    const dx = Math.abs(e.clientX - downPos.current.x)
    const dy = Math.abs(e.clientY - downPos.current.y)
    if (dx < CLICK_MOVE_THRESHOLD && dy < CLICK_MOVE_THRESHOLD) {
      setIsContentsOpen(true)
    }
    downPos.current = null
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDropTarget(false)
    const rawListFilename = e.dataTransfer.getData('text/raw-list-filename')
    if (rawListFilename) {
      await moveToTrash(rawListFilename)
      onItemMoved?.()
    }
  }

  if (isContentsOpen) {
    return (
      <TrashContentsCard
        startPosition={position}
        onClose={() => setIsContentsOpen(false)}
        onRestore={onItemMoved}
        onGenerationRestore={onGenerationRestored}
        refreshKey={refreshKey}
        containerRef={actualRef}
      />
    )
  }

  return (
    <div
      ref={actualRef}
      className="absolute"
      style={{ left: position.x, top: position.y, width: SIZE.width, height: SIZE.height, zIndex }}
      onPointerDown={handlePointerDown}
      onPointerMove={dragHandlers.onPointerMove}
      onPointerUp={handlePointerUp}
      onDragOver={(e) => { e.preventDefault(); setIsDropTarget(true) }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={handleDrop}
    >
      <GlassPane
        className={`w-full h-full rounded-2xl cursor-grab active:cursor-grabbing 
      transition-all duration-150 ${
          isDropTarget
            ? 'scale-110 ring-2 ring-white/80 shadow-[0_0_24px_rgba(255,255,255,0.65)]'
            : 'scale-100'
        }`}
      >
        <div className="flex-1 flex items-center justify-center">
          <TrashCanIcon size={28} />
        </div>
      </GlassPane>
    </div>
  )
}