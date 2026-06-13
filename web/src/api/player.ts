import { api } from './client.js'

export interface HeldItem {
  itemId: string
  count: number
  displayName?: string
  nbt?: string
}

export const playerApi = {
  getHeldItem: () => api.get<HeldItem>('/player/held-item'),
}
