import { api } from './client.js'
import type { QuestTab } from '@/types/tab.js'

export const tabsApi = {
  list: () => api.get<QuestTab[]>('/tabs'),

  create: (name: string) => api.post<QuestTab>('/tabs', { name }),

  reorder: (names: string[]) => api.put<QuestTab[]>('/tabs/reorder', { names }),

  delete: (name: string) =>
    api.delete<void>(`/tabs/${encodeURIComponent(name)}`),
}
