import { api } from './client.js'
import type { PlayerProgress } from '@/types/progress.js'

export const progressApi = {
  list: () => api.get<PlayerProgress[]>('/progress'),

  get: (questId: string) => api.get<PlayerProgress>(`/progress/${questId}`),

  claim: (questId: string) =>
    api.post<{ claimed: boolean; rewards: unknown[] }>(`/progress/${questId}/claim`),

  completeCondition: (questId: string, conditionId: string) =>
    api.post<{ status: string }>(`/progress/${questId}/condition/${conditionId}/complete`),
}
