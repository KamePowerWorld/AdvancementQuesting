import { api } from './client.js'
import type { PlayerRewards } from '@/types/rewards.js'

export const rewardsApi = {
  get: (playerUuid: string) => api.get<PlayerRewards>(`/players/${playerUuid}/rewards`),
}
