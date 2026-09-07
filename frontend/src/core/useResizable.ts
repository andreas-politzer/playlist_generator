import { useCallback, useRef, useState } from 'react'

export interface ModuleSize {
  width: number
  height: number
}

export function useResizable(initial: ModuleSize, minSize: ModuleSize = { width: 180, height: 100 }) {
  const [size, setSize] = useState<ModuleSize>(initial)
  const resizeState = useRef<{ startX: number; startY: number; origin: ModuleSize } | null>(null)

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      resizeState.current = { startX: e.clientX, startY: e.clientY, origin: size }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [size],
  )

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeState.current) return
      const dx = e.clientX - resizeState.current.startX
      const dy = e.clientY - resizeState.current.startY
      setSize({
        width: Math.max(minSize.width, resizeState.current.origin.width + dx),
        height: Math.max(minSize.height, resizeState.current.origin.height + dy),
      })
    },
    [minSize],
  )

  const onResizePointerUp = useCallback(() => {
    resizeState.current = null
  }, [])

  return { size, resizeHandlers: { onPointerDown: onResizePointerDown, onPointerMove: onResizePointerMove, onPointerUp: onResizePointerUp } }
}