import { useState } from 'react'

interface ArchiveFolder {
  id: string
  name: string
  parent_id: string | null
}

export function ArchiveFolderRow({
  folder,
  onNavigateInto,
  onRename,
  onDelete,
}: {
  folder: ArchiveFolder
  onNavigateInto: () => void
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const confirmRename = (e: React.FormEvent) => {
    e.preventDefault()
    if (renameValue.trim()) onRename(renameValue.trim())
    setRenaming(false)
  }

  return (
    <div className="rounded-lg border border-white/20">
      {renaming ? (
        <form onSubmit={confirmRename} className="px-2 py-1">
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={confirmRename}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full bg-transparent text-xs text-white font-body focus:outline-none"
          />
        </form>
      ) : deleteConfirm ? (
        <div className="px-2 py-2">
          <p className="text-[10px] font-body text-white/80 mb-1">
            Delete folder "{folder.name}"? Contents will be moved up one level.
          </p>
          <div className="flex gap-1">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { onDelete(); setDeleteConfirm(false) }}
              className="text-[10px] font-body text-red-300 hover:text-red-200 px-2 py-1 rounded bg-red-400/10"
            >
              Delete
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setDeleteConfirm(false)}
              className="text-[10px] font-body text-white/70 hover:text-white px-2 py-1 rounded bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-2 py-2 gap-1">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onNavigateInto}
            className="flex-1 text-left text-xs font-body text-white/90 truncate"
          >
            📁 {folder.name}
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setRenaming(true)}
            className="text-white/50 hover:text-white/90 shrink-0 text-[10px]"
          >
            ✎
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setDeleteConfirm(true)}
            className="text-white/50 hover:text-red-300 shrink-0 text-[10px]"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}