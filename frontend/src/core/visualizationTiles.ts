import { useState, useCallback } from 'react'
import type { ModulePosition } from './types'

export interface ModuleSize {
  width: number
  height: number
}

export type ChartSource =
  | { type: 'playlist'; generationId: string; playlistId: string }
  | { type: 'generation'; generationId: string }

export interface ChartConfig {
  mode?: 'raw' | 'scaled'
  linkageMethod?: 'ward' | 'complete' | 'average' | 'single'
  maxLeaves?: number
  radarFeatures?: string[]
  perplexity?: number
}

export interface VisualizationTile {
  id: string
  position: ModulePosition
  size: ModuleSize
  kind: 'chart' | 'playlist-detail'
  chartType?: 'radar' | 'tsne' | 'dendrogram'
  source: ChartSource
  config: ChartConfig
}

const DEFAULT_SIZE: ModuleSize = { width: 480, height: 400 }

export function useVisualizationTiles(zIndexManager: { bringToFront: (id: string) => void }) {
  const [tiles, setTiles] = useState<VisualizationTile[]>([])

  const addTile = useCallback(
    (
      position: ModulePosition,
      chartType: VisualizationTile['chartType'],
      source: ChartSource,
      config: ChartConfig = {},
      kind: VisualizationTile['kind'] = 'chart',
    ) => {
      const id = crypto.randomUUID()
      setTiles((prev) => {
        const offset = prev.length * 30
        const offsetPosition = { x: position.x + offset, y: position.y + offset }
        return [...prev, { id, position: offsetPosition, size: DEFAULT_SIZE, kind, chartType, source, config }]
      })
      zIndexManager.bringToFront(id)
      return id
    },
    [zIndexManager],
  )

  const removeTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((tile) => tile.id !== id))
  }, [])

  const updateTilePosition = useCallback((id: string, position: ModulePosition) => {
    setTiles((prev) => prev.map((tile) => (tile.id === id ? { ...tile, position } : tile)))
  }, [])

  return { tiles, addTile, removeTile, updateTilePosition, bringTileToFront: zIndexManager.bringToFront }
}