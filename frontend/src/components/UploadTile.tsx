import { useState, useCallback, useRef } from 'react'
import { DraggableGlass } from './DraggableGlass'
import type { ModulePosition } from '../core/types'

interface FileEntry {
  key: string
  file: File
  status: 'staged' | 'uploading' | 'uploaded' | 'error' | 'duplicate'
  songCount?: number
}

async function uploadSongFile(file: File): Promise<{ song_count: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('http://localhost:8001/songs/upload', {
    method: 'POST',
    body: formData,
  })
  if (response.status === 409) {
    throw new Error('DUPLICATE')
  }
  if (!response.ok) throw new Error('GENERIC')
  return response.json()
}

export function UploadTile({
  startPosition,
  onDragEnd,
  onUploadComplete,
}: {
  startPosition: ModulePosition
  onDragEnd?: (bounds: DOMRect | undefined) => void
  onUploadComplete?: () => void
}) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const addFiles = useCallback((fileList: FileList) => {
    const newEntries: FileEntry[] = Array.from(fileList).map((file) => ({
      key: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'staged',
    }))
    setFiles((prev) => [...prev, ...newEntries])
  }, [])

  const removeStaged = (key: string) => {
    setFiles((prev) => prev.filter((f) => f.key !== key))
  }

  const uploadStaged = async () => {
    const toUpload = files.filter((f) => f.status === 'staged')
    for (const entry of toUpload) {
      setFiles((prev) => prev.map((f) => (f.key === entry.key ? { ...f, status: 'uploading' } : f)))
      try {
        const result = await uploadSongFile(entry.file)
        setFiles((prev) =>
          prev.map((f) => (f.key === entry.key ? { ...f, status: 'uploaded', songCount: result.song_count } : f)),
        )
        onUploadComplete?.()
      } catch (err) {
        const isDuplicate = err instanceof Error && err.message === 'DUPLICATE'
        setFiles((prev) =>
          prev.map((f) => (f.key === entry.key ? { ...f, status: isDuplicate ? 'duplicate' : 'error' } : f)),
        )
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files)
    e.target.value = ''
  }

  const hasStaged = files.some((f) => f.status === 'staged')
  const isUploading = files.some((f) => f.status === 'uploading')

  return (
    <DraggableGlass
      initialPosition={startPosition}
      initialSize={{ width: 320, height: 360 }}
      title="Upload Raw Lists"
      className="rounded-3xl"
      collapsible
      defaultOpen={false}
      onDragEnd={onDragEnd}
      containerRef={containerRef}
    >
      <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onPointerDown={(e) => e.stopPropagation()}
          className={`shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
            isDragOver ? 'border-white/80 bg-white/10' : 'border-white/30 hover:border-white/50'
          }`}
        >
          <span className="font-body text-xs text-white/80 text-center">
            Drag &amp; drop CSV<br />or select file
          </span>
          <input type="file" accept=".csv" multiple className="hidden" onChange={handleFileInput} />
        </label>

        <div className="mt-4 flex-1 overflow-y-auto space-y-2">
          {files.map((f) => (
            <div key={f.key} className="flex flex-col gap-1 text-xs font-body">
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/90 truncate">{f.file.name}</span>
                {f.status === 'staged' && (
                  <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeStaged(f.key)}>✕</button>
                )}
                {f.status === 'uploading' && <span className="text-white/50">Uploading…</span>}
                {f.status === 'error' && <span className="text-white/50">Error</span>}
              </div>

              {f.status === 'uploaded' && (
                <div className="flex items-center justify-between gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                  <span className="text-white/90">✓ {f.songCount} songs found</span>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeStaged(f.key)}
                    className="rounded-md border border-white/40 bg-white/10 hover:border-white/70 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/90"
                  >
                    OK
                  </button>
                </div>
              )}

              {f.status === 'duplicate' && (
                <div className="flex items-center justify-between gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                  <span className="text-white/90">This list already exists</span>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeStaged(f.key)}
                    className="rounded-md border border-white/40 bg-white/10 hover:border-white/70 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/90"
                  >
                    OK
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {hasStaged && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={uploadStaged}
            disabled={isUploading}
            className="mt-3 shrink-0 rounded-xl border border-white/40 bg-white/10 hover:border-white/70 py-2 text-xs font-body text-white/90 uppercase tracking-widest disabled:opacity-50"
          >
            Upload now
          </button>
        )}
      </div>
    </DraggableGlass>
  )
}