import { useRef, useEffect, useState, useCallback } from 'react'

interface TsnePoint {
  name: string
  playlist_id: string
  playlist_name: string
  x: number
  y: number
}

const CHART_COLORS = ['#4f46e5', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d', '#0284c7', '#ea580c']
const PADDING = 36

export function TsneCanvas({
  points,
  hiddenIds,
}: {
  points: TsnePoint[]
  hiddenIds: Set<string>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number; scaleX: number; scaleY: number; width: number; height: number } | null>(null)
  const [hoveredPoint, setHoveredPoint] = useState<{ point: TsnePoint; sx: number; sy: number } | null>(null)
  const pendingMouseRef = useRef<{ x: number; y: number } | null>(null)
  const frameRequestedRef = useRef(false)

  const uniquePlaylistIds = Array.from(new Set(points.map((p) => p.playlist_id)))
  const colorForPlaylist = (playlistId: string) => {
    const idx = uniquePlaylistIds.indexOf(playlistId)
    return CHART_COLORS[idx % CHART_COLORS.length]
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const width = container.clientWidth
    const height = container.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const visiblePoints = points.filter((p) => !hiddenIds.has(p.playlist_id))
    if (visiblePoints.length === 0) {
      scaleRef.current = null
      return
    }

    const xs = visiblePoints.map((p) => p.x)
    const ys = visiblePoints.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const scaleX = (width - PADDING * 2) / (maxX - minX || 1)
    const scaleY = (height - PADDING * 2) / (maxY - minY || 1)

    scaleRef.current = { minX, maxX, minY, maxY, scaleX, scaleY, width, height }

    const toScreen = (x: number, y: number) => ({
      sx: PADDING + (x - minX) * scaleX,
      sy: height - PADDING - (y - minY) * scaleY,
    })

    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(PADDING, PADDING, width - PADDING * 2, height - PADDING * 2)

    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('t-SNE Dimension 1', width / 2, height - 8)

    ctx.save()
    ctx.translate(12, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('t-SNE Dimension 2', 0, 0)
    ctx.restore()

    ctx.globalAlpha = 0.75
    for (const point of visiblePoints) {
      const { sx, sy } = toScreen(point.x, point.y)
      ctx.beginPath()
      ctx.arc(sx, sy, 3, 0, Math.PI * 2)
      ctx.fillStyle = colorForPlaylist(point.playlist_id)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }, [points, hiddenIds])

  useEffect(() => {
    draw()
    const container = containerRef.current
    if (!container) return
    const resizeObserver = new ResizeObserver(draw)
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [draw])

  const processHover = useCallback(() => {
    frameRequestedRef.current = false
    const mouse = pendingMouseRef.current
    const scale = scaleRef.current
    if (!mouse || !scale) return

    const visiblePoints = points.filter((p) => !hiddenIds.has(p.playlist_id))
    let closest: TsnePoint | null = null
    let closestDist = Infinity
    let closestScreen = { sx: 0, sy: 0 }

    for (const point of visiblePoints) {
      const sx = PADDING + (point.x - scale.minX) * scale.scaleX
      const sy = scale.height - PADDING - (point.y - scale.minY) * scale.scaleY
      const dist = Math.hypot(sx - mouse.x, sy - mouse.y)
      if (dist < closestDist) {
        closestDist = dist
        closest = point
        closestScreen = { sx, sy }
      }
    }

    setHoveredPoint((prev) => {
      if (closest && closestDist < 10) {
        if (prev && prev.point.name === closest.name && prev.point.playlist_id === closest.playlist_id) return prev
        return { point: closest, sx: closestScreen.sx, sy: closestScreen.sy }
      }
      return prev === null ? prev : null
    })
  }, [points, hiddenIds])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    pendingMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    if (!frameRequestedRef.current) {
      frameRequestedRef.current = true
      requestAnimationFrame(processHover)
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
      />
      {hoveredPoint && (
        <div
          className="absolute pointer-events-none bg-black/90 text-white text-[10px] font-body rounded px-2 py-1 whitespace-nowrap"
          style={{ left: hoveredPoint.sx + 8, top: hoveredPoint.sy - 8 }}
        >
          {hoveredPoint.point.name} — {hoveredPoint.point.playlist_name}
        </div>
      )}
    </div>
  )
}