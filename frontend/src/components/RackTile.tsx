import { createPortal } from 'react-dom'
import { GlassPane } from './GlassPane'
import { PreviewGhost } from './PreviewGhost'
import { TrashCanIcon } from './TrashCanIcon'
import { useDetach } from '../core/useDetach'
import type { ModuleId } from '../core/moduleLocation'
import type { ModulePosition } from '../core/types'

export const TILE_SIZE = { width: 96, height: 56 }

export function RackTile({
  id,
  label,
  rackRef,
  onPullOut,
}: {
  id: ModuleId
  label: string
  rackRef: React.RefObject<HTMLDivElement | null>
  onPullOut: (id: ModuleId, position: ModulePosition) => void
}) {
  const { isWobbling, previewPos, gripHandlers } = useDetach(
    (finalPosition) => onPullOut(id, finalPosition),
    TILE_SIZE,
    rackRef,
  )

  return (
    <>
      <div
        onPointerDown={gripHandlers.onGripPointerDown}
        onPointerMove={gripHandlers.onGripPointerMove}
        onPointerUp={gripHandlers.onGripPointerUp}
        className={`cursor-grab active:cursor-grabbing select-none touch-none transition-opacity ${
          isWobbling ? 'wobble' : ''
        }`}
        style={{ width: TILE_SIZE.width, height: TILE_SIZE.height, opacity: previewPos ? 0 : 1 }}
      >
        <GlassPane className="w-full h-full rounded-2xl">
          <div className="flex-1 flex items-center justify-center px-2">
            {id === 'trash' ? (
              <TrashCanIcon size={28} />
            ) : (
              <span className="font-body text-[10px] tracking-widest text-white uppercase text-center">{label}</span>
            )}
          </div>
        </GlassPane>
      </div>

      {previewPos &&
        createPortal(
          <div className="fixed z-50 pointer-events-none" style={{ left: previewPos.x, top: previewPos.y }}>
            <PreviewGhost
              width={TILE_SIZE.width}
              height={TILE_SIZE.height}
              label={label}
              icon={id === 'trash' ? <TrashCanIcon size={28} /> : undefined}
            />
          </div>,
          document.body,
        )}
    </>
  )
}