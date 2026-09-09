import { useState, useCallback } from 'react'
import type { ModulePosition } from './types'

export type ModuleId = 'upload' | 'rawLists' | 'trash' | 'generate' | 'generatedPlaylists' | 'archive' | 'visualizations'
export type Location = { place: 'canvas'; position: ModulePosition } | { place: 'rack' }

const INITIAL_POSITIONS: Record<ModuleId, ModulePosition> = {
  upload: { x: 100, y: 100 },
  rawLists: { x: 460, y: 100 },
  trash: { x: 820, y: 100 },
  generate: { x: 460, y: 480 },
  generatedPlaylists: { x: 820, y: 300 },
  archive: { x: 1180, y: 300 },
  visualizations: { x: 1180, y: 480 },
}

const INITIAL_LOCATIONS: Record<ModuleId, Location> = {
  upload: { place: 'canvas', position: INITIAL_POSITIONS.upload },
  rawLists: { place: 'rack' },
  trash: { place: 'rack' },
  generate: { place: 'rack' },
  generatedPlaylists: { place: 'rack' },
  archive: { place: 'rack' },
  visualizations: { place: 'rack' },
}

export function useModuleLocations() {
  const [locations, setLocations] = useState<Record<ModuleId, Location>>(INITIAL_LOCATIONS)

  const moveToRack = useCallback((id: ModuleId) => {
    setLocations((prev) => ({ ...prev, [id]: { place: 'rack' } }))
  }, [])

  const moveToCanvas = useCallback((id: ModuleId, position: ModulePosition) => {
    setLocations((prev) => ({ ...prev, [id]: { place: 'canvas', position } }))
  }, [])

  return { locations, moveToRack, moveToCanvas }
}