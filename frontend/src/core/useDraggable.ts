import { useCallback, useRef, useState } from 'react'
import type { ModulePosition } from './types'

const INTERACTIVE_TAGS = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT']
const MIN_VISIBLE = 40

export function useDraggable(
  initial: ModulePosition,
  onDragEnd?: (ownBounds: DOMRect | undefined) => void,
  size?: { width: number; height: number },
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

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      let nextX = dragState.current.origin.x + dx
      let nextY = dragState.current.origin.y + dy

      const width = size?.width ?? MIN_VISIBLE

      const minX = -(width - MIN_VISIBLE)
      const maxX = window.innerWidth - MIN_VISIBLE
      const minY = 0
      const maxY = window.innerHeight - MIN_VISIBLE

      nextX = Math.min(Math.max(nextX, minX), maxX)
      nextY = Math.min(Math.max(nextY, minY), maxY)

      setPosition({ x: nextX, y: nextY })
    },
    [size],
  )

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