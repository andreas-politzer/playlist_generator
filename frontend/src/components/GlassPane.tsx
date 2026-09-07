import type { ReactNode } from 'react'

export function GlassPane({ children, className }: { children: ReactNode; className: string }) {
  return (
    <div className={`relative border border-white/70 ${className}`}>
      {/* Basisebene: Blur + Farbschleier, MUSS überall funktionieren, unabhängig von Verzerrung */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(8px) saturate(160%)',
          WebkitBackdropFilter: 'blur(8px) saturate(160%)',
        }}
      />
      {/* Optionale Zusatzebene: Verzerrung, darf scheitern ohne die Basisebene zu beeinflussen */}
      <div
        className="absolute inset-0 rounded-[inherit] opacity-60 pointer-events-none"
        style={{ backdropFilter: 'url(#glass-distortion)', WebkitBackdropFilter: 'url(#glass-distortion)' }}
      />
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          boxShadow:
            'inset 1.5px 1.5px 1px rgba(255,255,255,1), inset -1px -1px 1px rgba(29,29,31,0.06), 0 24px 60px rgba(29,29,31,0.15)',
        }}
      />
      <div className="relative h-full flex flex-col overflow-hidden">{children}</div>
    </div>
  )
}