import { useState, useEffect, useCallback } from 'react'
import { DraggableGlass } from './DraggableGlass'
import { ArchiveFolderRow } from './ArchiveFolderRow'
import type { ModulePosition } from '../core/types'

interface ArchiveFolder {
  id: string
  name: string
  parent_id: string | null
}

interface ArchivedItem {
  id: string
  item_type: string
  item_id: string
  folder_id: string | null
  name?: string
  songs_total?: number
  playlist_count?: number
  silhouette?: number | null
  song_count?: number
  duration_ms?: number | null
  parent_generation_name?: string
}

async function fetchFolders(parentId: string | null): Promise<ArchiveFolder[]> {
  const url = parentId
    ? `http://localhost:8001/archive/folders?parent_id=${parentId}`
    : 'http://localhost:8001/archive/folders'
  const response = await fetch(url)
  return response.json()
}

async function fetchItems(folderId: string | null): Promise<ArchivedItem[]> {
  const url = folderId
    ? `http://localhost:8001/archive/items?folder_id=${folderId}`
    : 'http://localhost:8001/archive/items'
  const response = await fetch(url)
  return response.json()
}

async function createFolder(name: string, parentId: string | null): Promise<void> {
  await fetch('http://localhost:8001/archive/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId }),
  })
}

async function renameFolder(id: string, name: string): Promise<void> {
  await fetch(`http://localhost:8001/archive/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

async function deleteFolder(id: string): Promise<void> {
  await fetch(`http://localhost:8001/archive/folders/${id}`, { method: 'DELETE' })
}

async function moveArchivedItem(itemType: string, itemId: string, folderId: string | null): Promise<void> {
  await fetch(`http://localhost:8001/archive/items/${itemType}/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: folderId }),
  })
}

async function restoreItem(archiveItemId: string): Promise<void> {
  await fetch(`http://localhost:8001/archive/items/${archiveItemId}/restore`, { method: 'POST' })
}

export function ArchiveTile({
  startPosition,
  onDragEnd,
  refreshKey,
  onItemUnarchived,
  containerRef,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  refreshKey?: number
  onItemUnarchived?: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([])
  const [folders, setFolders] = useState<ArchiveFolder[]>([])
  const [items, setItems] = useState<ArchivedItem[]>([])
  const [allFolders, setAllFolders] = useState<ArchiveFolder[]>([])
  const [newFolderName, setNewFolderName] = useState('')
  const [movingItem, setMovingItem] = useState<ArchivedItem | null>(null)

  const load = useCallback(() => {
    fetchFolders(currentFolderId).then(setFolders)
    fetchItems(currentFolderId).then(setItems)
  }, [currentFolderId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Für die "Move to..."-Auswahl brauchen wir alle Ordner, nicht nur die der aktuellen Ebene
  useEffect(() => {
    fetchFolders(null).then(setAllFolders)
  }, [refreshKey])

  const navigateInto = (folder: ArchiveFolder) => {
    setFolderStack((s) => [...s, { id: currentFolderId, name: folder.name }])
    setCurrentFolderId(folder.id)
  }

  const navigateBack = () => {
    const prev = folderStack[folderStack.length - 1]
    setFolderStack((s) => s.slice(0, -1))
    setCurrentFolderId(prev?.id ?? null)
  }

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    await createFolder(name, currentFolderId)
    setNewFolderName('')
    load()
    fetchFolders(null).then(setAllFolders)
  }

  const handleUnarchive = async (itemId: string) => {
    await restoreItem(itemId)
    load()
    onItemUnarchived?.()
  }

  const handleMoveTo = async (targetFolderId: string | null) => {
    if (!movingItem) return
    await moveArchivedItem(movingItem.item_type, movingItem.item_id, targetFolderId)
    setMovingItem(null)
    load()
  }

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 380 }}
      title="Archive"
      className="rounded-3xl"
      collapsible
      defaultOpen={true}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
        {folderStack.length > 0 ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={navigateBack}
            className="shrink-0 text-left text-[10px] font-body uppercase tracking-widest text-white/50 hover:text-white/90 mb-2"
          >
            ← {folderStack[folderStack.length - 1].name}
          </button>
        ) : (
          <span className="shrink-0 text-[10px] font-body text-white/50 uppercase tracking-widest mb-2">
            Archive
          </span>
        )}

        <div className="flex-1 overflow-y-auto space-y-1">
          {folders.map((folder) => (
            <ArchiveFolderRow
              key={folder.id}
              folder={folder}
              onNavigateInto={() => navigateInto(folder)}
              onRename={(name) => renameFolder(folder.id, name).then(load)}
              onDelete={() => deleteFolder(folder.id).then(load)}
            />
          ))}

          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-0.5 bg-white/5 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-body text-white/90 truncate">{item.name}</span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => handleUnarchive(item.id)}
                  title="Move back to Generated Playlists"
                  className="shrink-0 text-white/50 hover:text-white/90 text-[10px]"
                >
                  ↩
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-body text-white/50">
                  {item.item_type === 'generation'
                    ? `${item.songs_total} songs · quality ${item.silhouette ?? '—'}`
                    : `${item.song_count} songs${item.parent_generation_name ? ` · from "${item.parent_generation_name}"` : ''}`}
                </span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setMovingItem(item)}
                  className="shrink-0 text-white/50 hover:text-white/90 text-[10px] underline"
                >
                  Move
                </button>
              </div>
            </div>
          ))}

          {folders.length === 0 && items.length === 0 && (
            <span className="text-xs font-body text-white/40">Empty</span>
          )}
        </div>

        <form onSubmit={handleCreateFolder} className="mt-2 shrink-0">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="+ New folder"
            className="w-full bg-white/10 border border-white/30 rounded-lg px-2 py-1 text-xs text-white placeholder-white/40 font-body focus:outline-none focus:border-white/70"
          />
        </form>
      </div>

      {movingItem && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setMovingItem(null)
          }}
        >
          <div className="bg-black/90 border border-white/30 rounded-xl p-4 flex flex-col gap-2 min-w-[240px] max-w-[300px]">
            <span className="text-sm font-body text-white/90 mb-1">Move "{movingItem.name}" to</span>
            <button
              onClick={() => handleMoveTo(null)}
              className="text-left text-xs font-body text-white/80 hover:bg-white/10 rounded px-2 py-1.5"
            >
              📦 Archive Root
            </button>
            {allFolders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => handleMoveTo(folder.id)}
                className="text-left text-xs font-body text-white/80 hover:bg-white/10 rounded px-2 py-1.5"
              >
                📁 {folder.name}
              </button>
            ))}
            <button
              onClick={() => setMovingItem(null)}
              className="mt-2 self-end rounded-md border border-white/30 px-3 py-1 text-[10px] font-body text-white/70 hover:border-white/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </DraggableGlass>
  )
}