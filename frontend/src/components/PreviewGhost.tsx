import type { ReactNode } from 'react'

export function PreviewGhost({
  width,
  height,
  label,
  icon,
}: {
  width: number
  height: number
  label: string
  icon?: ReactNode
}) {
  return (
    <div
      className="rounded-2xl border-2 border-white/60 bg-white/10 flex items-center justify-center px-2"
      style={{ width, height }}
    >
      {icon ?? (
        <span className="font-body text-[10px] tracking-widest text-white/90 uppercase text-center truncate">
          {label}
        </span>
      )}
    </div>
  )
}