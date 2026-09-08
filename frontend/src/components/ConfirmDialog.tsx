import { createPortal } from 'react-dom'

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="bg-black/90 border border-white/30 rounded-xl p-4 flex flex-col gap-4 min-w-[260px] max-w-[320px]">
        <span className="text-sm font-body text-white/90">{message}</span>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-md border border-white/30 px-3 py-1 text-xs font-body text-white/70 hover:border-white/60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md border border-red-400/50 bg-red-500/10 px-3 py-1 text-xs font-body text-red-400 hover:border-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}