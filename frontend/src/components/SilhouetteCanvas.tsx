import { useEffect, useRef } from 'react'

interface SilhouetteData {
  available: boolean
  average_score: number
  total_evaluated: number
  cluster_plots: Record<number, number[]>
  reason?: string
}

const CLUSTER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', 
  '#06b6d4', '#f97316', '#84cc16', '#6366f1', '#d946ef'
]

export function SilhouetteCanvas({ data }: { data: SilhouetteData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data || !data.available) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)

    const padding = { top: 20, right: 30, bottom: 30, left: 40 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const valToX = (val: number) => padding.left + ((val + 1) / 2) * plotWidth
    const zeroX = valToX(0)

    const totalBars = Object.values(data.cluster_plots).reduce((acc, v) => acc + v.length, 0)
    const barHeight = Math.max(1, plotHeight / (totalBars + Object.keys(data.cluster_plots).length * 4))

    let currentY = padding.top

    Object.entries(data.cluster_plots).forEach(([_, values], idx) => {
      const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length]
      ctx.fillStyle = color

      values.forEach((val) => {
        const x = valToX(val)
        const barW = x - zeroX
        ctx.fillRect(barW >= 0 ? zeroX : x, currentY, Math.abs(barW), Math.max(1, barHeight))
        currentY += barHeight
      })

      currentY += barHeight * 3
    })

    // Null-Linie (0.0)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(zeroX, padding.top)
    ctx.lineTo(zeroX, height - padding.bottom)
    ctx.stroke()

    // Durchschnittslinie (Rote Gestrichelte Linie)
    const avgX = valToX(data.average_score)
    ctx.strokeStyle = '#ef4444'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(avgX, padding.top)
    ctx.lineTo(avgX, height - padding.bottom)
    ctx.stroke()

    // Achsenbeschriftung
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '10px sans-serif'
    ctx.fillText('-1.0', padding.left, height - 10)
    ctx.fillText('0.0', zeroX - 8, height - 10)
    ctx.fillText('+1.0', width - padding.right - 20, height - 10)

  }, [data])

  if (!data || !data.available) {
    return <div className="p-4 text-xs text-white/40 italic">{data.reason ?? 'Plot not available.'}</div>
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-2">
      <div className="text-[10px] text-white/60 mb-1">
        Avg Score: <span className="text-white font-bold">{data.average_score}</span> 
      </div>
      <canvas ref={canvasRef} width={420} height={320} className="w-full h-auto bg-black/20 rounded-lg" />
    </div>
  )
}