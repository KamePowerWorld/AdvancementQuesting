import { api } from './client.js'

export interface HeldItem {
  itemId: string
  count: number
  displayName?: string
  nbt?: string
}

export interface PlayerLocation {
  x: number
  y: number
  z: number
  dimension: string
}

export const playerApi = {
  getHeldItem: () => api.get<HeldItem>('/player/held-item'),
  getLocation: () => api.get<PlayerLocation>('/player/location'),
}
