import { useRef, useState, useEffect } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface LinerNotesRow {
  label: string
  value?: string | number
  before?: string
  after?: string
}

interface LinerNotesSection {
  title: string
  rows?: LinerNotesRow[]
  comparison_rows?: LinerNotesRow[]
}

interface LinerNotesData {
  generation_id: string
  name: string
  sections: LinerNotesSection[]
}

async function fetchLinerNotes(generationId: string): Promise<LinerNotesData> {
  const response = await fetch(`http://localhost:8001/generations/${generationId}/liner-notes`)
  if (!response.ok) throw new Error('Failed to load liner notes.')
  return response.json()
}

export function LinerNotesTile({
  id,
  position,
  generationId,
  zIndex,
  onClose,
  onFocus,
}: {
  id: string
  position: ModulePosition
  generationId: string
  zIndex: number
  onClose: (id: string) => void
  onFocus: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<LinerNotesData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLinerNotes(generationId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
  }, [generationId])

  return (
    <DraggableGlass
      initialPosition={position}
      initialSize={{ width: 380, height: 460 }}
      title="Liner Notes"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragStart={() => onFocus(id)}
      zIndex={zIndex}
      onClose={() => onClose(id)}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col gap-4 overflow-y-auto">
        {error && <span className="text-xs font-body text-red-400">{error}</span>}
        {!error && !data && <span className="text-xs font-body text-white/40">Loading...</span>}

        {data?.sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <span className="text-[10px] font-body uppercase tracking-widest text-white/50">{section.title}</span>

            {section.rows?.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-0.5 border-b border-white/5 last:border-0">
                <span className="text-xs font-body text-white/70">{row.label}</span>
                <span className="text-xs font-body text-white/90 text-right max-w-[60%] break-words">{row.value ?? 'N/A'}</span>
              </div>
            ))}

            {section.comparison_rows && (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[9px] font-body text-white/30 uppercase tracking-wide">
                  <span>Metric</span>
                  <div className="flex gap-3">
                    <span>Before</span>
                    <span>After</span>
                  </div>
                </div>
                {section.comparison_rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-0.5 border-b border-white/5 last:border-0">
                    <span className="text-xs font-body text-white/70">{row.label}</span>
                    <div className="flex gap-3">
                      <span className="text-xs font-body text-white/50 w-14 text-right">{row.before}</span>
                      <span className="text-xs font-body text-green-400 w-14 text-right">{row.after}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </DraggableGlass>
  )
}