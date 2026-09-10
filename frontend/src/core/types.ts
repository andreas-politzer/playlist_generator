export interface ModulePosition {
  x: number
  y: number
}

export interface AnchoredPlaylist {
  type: 'playlist'
  playlistId: string
  generationId: string
  label: string
  features: string[]
}

export interface AnchoredGeneration {
  type: 'generation'
  generationId: string
  label: string
  features: string[]
}