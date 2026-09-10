import { useState, useCallback, useRef } from 'react'
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
  zIndex: number
  kind: 'chart' | 'playlist-detail'
  chartType?: 'radar' | 'tsne' | 'dendrogram'
  source: ChartSource
  config: ChartConfig
}

const DEFAULT_SIZE: ModuleSize = { width: 480, height: 400 }

export function useVisualizationTiles() {
  const [tiles, setTiles] = useState<VisualizationTile[]>([])
  const nextZRef = useRef(1)

  const addTile = useCallback(
    (
      position: ModulePosition,
      chartType: VisualizationTile['chartType'],
      source: ChartSource,
      config: ChartConfig = {},
      kind: VisualizationTile['kind'] = 'chart',
    ) => {
      const id = crypto.randomUUID()
      nextZRef.current += 1
      setTiles((prev) => {
        const offset = prev.length * 30
        const offsetPosition = { x: position.x + offset, y: position.y + offset }
        return [...prev, { id, position: offsetPosition, size: DEFAULT_SIZE, zIndex: nextZRef.current, kind, chartType, source, config }]
      })
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