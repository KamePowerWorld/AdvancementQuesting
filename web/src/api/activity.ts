import { api } from './client.js'
import type { ActivityPage } from '@/types/activity.js'

export const activityApi = {
  get: (playerUuid: string, opts: { limit?: number; before?: number } = {}) => {
    const params = new URLSearchParams()
    if (opts.limit != null) params.set('limit', String(opts.limit))
    if (opts.before != null) params.set('before', String(opts.before))
    const qs = params.toString()
    return api.get<ActivityPage>(`/players/${playerUuid}/activity${qs ? `?${qs}` : ''}`)
  },
}
