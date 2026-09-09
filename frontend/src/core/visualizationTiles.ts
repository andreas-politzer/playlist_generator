import { useState, useCallback, useRef } from 'react'
import type { ModulePosition } from './types'

export interface ModuleSize {
  width: number
  height: number
}

export type ChartSource =
  | { type: 'playlist'; generationId: string; playlistId: string }
  | { type: 'generation'; generationId: string }

export interface VisualizationTile {
  id: string
  position: ModulePosition
  size: ModuleSize
  zIndex: number
  chartType: 'radar' | 'tsne' | 'dendrogram'
  source: ChartSource
}

const DEFAULT_SIZE: ModuleSize = { width: 480, height: 400 }

export function useVisualizationTiles() {
  const [tiles, setTiles] = useState<VisualizationTile[]>([])
  const nextZRef = useRef(1)

  const addTile = useCallback(
    (position: ModulePosition, chartType: VisualizationTile['chartType'], source: ChartSource) => {
      const id = crypto.randomUUID()
      nextZRef.current += 1
      setTiles((prev) => [
        ...prev,
        { id, position, size: DEFAULT_SIZE, zIndex: nextZRef.current, chartType, source },
      ])
      return id
    },
    [],
  )

  const removeTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((tile) => tile.id !== id))
  }, [])

  const updateTilePosition = useCallback((id: string, position: ModulePosition) => {
    setTiles((prev) => prev.map((tile) => (tile.id === id ? { ...tile, position } : tile)))
  }, [])

  const bringTileToFront = useCallback((id: string) => {
    nextZRef.current += 1
    const nextZ = nextZRef.current
    setTiles((prev) => prev.map((tile) => (tile.id === id ? { ...tile, zIndex: nextZ } : tile)))
  }, [])

  return { tiles, addTile, removeTile, updateTilePosition, bringTileToFront }
}