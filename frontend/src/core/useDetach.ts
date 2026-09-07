import { useState } from 'react'
import type { ModulePosition } from './types'

const WOBBLE_THRESHOLD_PX = 40
const GRAB_OFFSET = 20

export function useDetach(
  onDetach: (finalPosition: ModulePosition) => void,
  previewSize: { width: number; height: number },
  targetRef: React.RefObject<HTMLElement | null>,
) {
  const [isWobbling, setIsWobbling] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [previewPos, setPreviewPos] = useState<ModulePosition | null>(null)

  const onGripPointerDown = (e: React.PointerEvent) => {
    setDragStart({ x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onGripPointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < WOBBLE_THRESHOLD_PX) {
      setIsWobbling(distance > 4)
      setPreviewPos(null)
    } else {
      setIsWobbling(false)
      setPreviewPos({ x: e.clientX - GRAB_OFFSET, y: e.clientY - GRAB_OFFSET })
    }
  }

  const onGripPointerUp = () => {
    if (previewPos) {
      const targetBounds = targetRef.current?.getBoundingClientRect()
      const previewBounds = {
        left: previewPos.x,
        right: previewPos.x + previewSize.width,
        top: previewPos.y,
        bottom: previewPos.y + previewSize.height,
      }
      const overlaps =
        targetBounds &&
        previewBounds.left < targetBounds.right &&
        previewBounds.right > targetBounds.left &&
        previewBounds.top < targetBounds.bottom &&
        previewBounds.bottom > targetBounds.top

      if (!overlaps) {
        onDetach(previewPos)
      }
    }
    setDragStart(null)
    setIsWobbling(false)
    setPreviewPos(null)
  }

  return { isWobbling, previewPos, gripHandlers: { onGripPointerDown, onGripPointerMove, onGripPointerUp } }
}