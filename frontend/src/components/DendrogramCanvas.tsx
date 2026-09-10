import { useRef, useEffect, useCallback, useState } from 'react'

const PADDING = 40

export function DendrogramCanvas({
  icoord,
  dcoord,
  labels,
  colors,
}: {
  icoord: number[][]
  dcoord: number[][]
  labels: string[]
  colors: string[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredLabel, setHoveredLabel] = useState<{ text: string; sx: number; sy: number } | null>(null)
  const scaleRef = useRef<{ minX: number; maxX: number; maxY: number; width: number; height: number } | null>(null)
  const pendingMouseRef = useRef<{ x: number; y: number } | null>(null)
  const frameRequestedRef = useRef(false)

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

    const allX = icoord.flat()
    const allY = dcoord.flat()
    const minX = Math.min(...allX)
    const maxX = Math.max(...allX)
    const maxY = Math.max(...allY)

    const drawableWidth = width - PADDING * 2
    const drawableHeight = height - PADDING * 2 - 20

    const toScreen = (x: number, y: number) => ({
      sx: PADDING + ((x - minX) / (maxX - minX || 1)) * drawableWidth,
      sy: PADDING + drawableHeight - (y / (maxY || 1)) * drawableHeight,
    })

    scaleRef.current = { minX, maxX, maxY, width, height }

    ctx.lineWidth = 1.2
    for (let i = 0; i < icoord.length; i++) {
      const xs = icoord[i]
      const ys = dcoord[i]
      ctx.strokeStyle = colors[i] ?? 'rgba(0,0,0,0.6)'
      ctx.beginPath()
      for (let j = 0; j < xs.length; j++) {
        const { sx, sy } = toScreen(xs[j], ys[j])
        if (j === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      }
      ctx.stroke()
    }

    const leafSpacing = drawableWidth / labels.length
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    labels.forEach((label, i) => {
      const x = PADDING + leafSpacing * (i + 0.5)
      const y = PADDING + drawableHeight + 4
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(-Math.PI / 4)
      ctx.fillText(label.length > 14 ? label.slice(0, 14) + '…' : label, 0, 0)
      ctx.restore()
    })
  }, [icoord, dcoord, labels, colors])

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

    const drawableWidth = scale.width - PADDING * 2
    const drawableHeight = scale.height - PADDING * 2 - 20
    const labelAreaTop = PADDING + drawableHeight

    if (mouse.y < labelAreaTop) {
      setHoveredLabel((prev) => (prev === null ? prev : null))
      return
    }

    const leafSpacing = drawableWidth / labels.length
    const idx = Math.floor((mouse.x - PADDING) / leafSpacing)

    setHoveredLabel((prev) => {
      if (idx >= 0 && idx < labels.length) {
        if (prev && prev.text === labels[idx]) return prev
        return { text: labels[idx], sx: mouse.x, sy: mouse.y - 20 }
      }
      return prev === null ? prev : null
    })
  }, [labels])

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
      <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredLabel(null)} />
      {hoveredLabel && (
        <div
          className="absolute pointer-events-none bg-black/90 text-white text-[10px] font-body rounded px-2 py-1 whitespace-nowrap"
          style={{ left: hoveredLabel.sx + 8, top: hoveredLabel.sy - 8 }}
        >
          {hoveredLabel.text}
        </div>
      )}
    </div>
  )
}