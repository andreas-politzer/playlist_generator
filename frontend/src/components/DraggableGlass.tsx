import { useRef, useState, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { useDraggable } from '../core/useDraggable'
import { useResizable, type ModuleSize } from '../core/useResizable'
import type { ModulePosition } from '../core/types'
import { GlassPane } from './GlassPane'

const CLICK_MOVE_THRESHOLD = 6
const COLLAPSED_HEIGHT = 68

export function DraggableGlass({
  initialPosition,
  initialSize,
  minSize,
  forceMinHeight,
  title,
  className,
  children,
  collapsible = false,
  defaultOpen = true,
  onDragStart,
  onDragEnd,
  onClose,
  containerRef,
  zIndex,
  dark = false,
}: {
  initialPosition: ModulePosition
  initialSize: ModuleSize
  minSize?: ModuleSize
  forceMinHeight?: number
  title: string
  className: string
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  onDragStart?: () => void
  onDragEnd?: (ownBounds: DOMRect | undefined) => void
  onClose?: () => void
  containerRef?: React.RefObject<HTMLDivElement | null>
  zIndex?: number
  dark?: boolean
}) {
  const { size, resizeHandlers, setSize } = useResizable(initialSize, minSize)
  const { position, dragHandlers } = useDraggable(initialPosition, onDragEnd, size)

  useLayoutEffect(() => {
    if (forceMinHeight === undefined) return

    setSize((previous) => {
      const nextHeight = Math.max(minSize?.height ?? 0, forceMinHeight)
      if (nextHeight === previous.height) return previous
      return { ...previous, height: nextHeight }
    })
  }, [forceMinHeight, setSize])

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const downPos = useRef<{ x: number; y: number } | null>(null)

  const headerPointerDown = (e: React.PointerEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY }
    onDragStart?.()
    dragHandlers.onPointerDown(e)
  }

  const headerPointerUp = (e: React.PointerEvent) => {
    dragHandlers.onPointerUp(e, containerRef?.current?.getBoundingClientRect())
    if (!collapsible || !downPos.current) return
    const dx = Math.abs(e.clientX - downPos.current.x)
    const dy = Math.abs(e.clientY - downPos.current.y)
    if (dx < CLICK_MOVE_THRESHOLD && dy < CLICK_MOVE_THRESHOLD) {
      setIsOpen((prev) => !prev)
    }
    downPos.current = null
  }

  const outerHeight = collapsible && !isOpen ? COLLAPSED_HEIGHT : size.height

  return (
    <div
      ref={containerRef}
      className="absolute transition-[height] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ left: position.x, top: position.y, width: size.width, height: outerHeight, zIndex }}
    >
      <GlassPane className={`w-full h-full ${className}`}>
        {onClose && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className={`absolute top-3 right-3 z-10 w-5 h-5 flex items-center justify-center text-xs ${
              dark ? 'text-black/50 hover:text-black/90' : 'text-white/50 hover:text-white/90'
            }`}
          >
            ✕
          </button>
        )}
        <div
          className="px-10 pt-9 pb-2 cursor-grab active:cursor-grabbing select-none touch-none"
          onPointerDown={headerPointerDown}
          onPointerMove={dragHandlers.onPointerMove}
          onPointerUp={headerPointerUp}
        >
          <span className={`font-body text-xs tracking-widest uppercase ${dark ? 'text-black' : 'text-white'}`}>{title}</span>
        </div>
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            transformOrigin: 'top',
            transform: collapsible && !isOpen ? 'perspective(900px) rotateX(-85deg)' : 'perspective(900px) rotateX(0deg)',
            opacity: collapsible && !isOpen ? 0 : 1,
          }}
        >
          {children}
        </div>
      </GlassPane>
      {(!collapsible || isOpen) && (
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 cursor-nwse-resize select-none touch-none"
          {...resizeHandlers}
        />
      )}
    </div>
  )
}