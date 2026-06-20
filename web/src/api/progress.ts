import { api } from './client.js'
import type { PlayerProgress } from '@/types/progress.js'

export const progressApi = {
  list: () => api.get<PlayerProgress[]>('/progress'),

  // 任意プレイヤーの全進捗 (view-as 用・認証不要)
  listByPlayer: (playerUuid: string) =>
    api.get<PlayerProgress[]>(`/players/${playerUuid}/progress`),

  get: (questId: string) => api.get<PlayerProgress>(`/progress/${questId}`),

  claim: (questId: string) =>
    api.post<{ claimed: boolean; rewards: unknown[] }>(`/progress/${questId}/claim`),

  completeCondition: (questId: string, conditionId: string) =>
    api.post<{ status: string }>(`/progress/${questId}/condition/${conditionId}/complete`),

  deliver: (questId: string) =>
    api.post<{ delivered: Record<string, number>; failed: Record<string, number> }>(`/progress/${questId}/deliver`),
}
