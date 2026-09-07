import { useCallback, useRef, useState } from 'react'
import type { ModulePosition } from './types'

const INTERACTIVE_TAGS = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT']

export function useDraggable(
  initial: ModulePosition,
  onDragEnd?: (ownBounds: DOMRect | undefined) => void,
) {
  const [position, setPosition] = useState<ModulePosition>(initial)
  const dragState = useRef<{ startX: number; startY: number; origin: ModulePosition } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement
      if (INTERACTIVE_TAGS.includes(target.tagName)) return
      dragState.current = { startX: e.clientX, startY: e.clientY, origin: position }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [position],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setPosition({ x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy })
  }, [])

  const onPointerUp = useCallback(
    (_e: React.PointerEvent, ownBounds?: DOMRect) => {
      if (dragState.current) {
        onDragEnd?.(ownBounds)
      }
      dragState.current = null
    },
    [onDragEnd],
  )

  return { position, dragHandlers: { onPointerDown, onPointerMove, onPointerUp } }
}