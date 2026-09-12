import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function RenameDialog({
  currentName,
  onSave,
  onCancel,
}: {
  currentName: string
  onSave: (newName: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setIsSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename.')
    } finally {
      setIsSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-black/90 border border-white/30 rounded-xl p-4 flex flex-col gap-3 min-w-[260px]"
      >
        <span className="text-xs font-body uppercase tracking-widest text-white/60">Rename</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}
          className="bg-white/10 border border-white/30 rounded-lg px-2 py-1.5 text-sm text-white font-body focus:outline-none focus:border-white/70"
        />
        {error && <span className="text-xs font-body text-red-400">{error}</span>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/30 px-3 py-1 text-xs font-body text-white/70 hover:border-white/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md border border-white/40 bg-white/10 px-3 py-1 text-xs font-body text-white/90 hover:border-white/70 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}