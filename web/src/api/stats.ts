import { api } from './client.js'
import type {
  LeaderboardResponse,
  TimeseriesResponse,
  RewardsStatsResponse,
  QuestsStatsResponse,
  GlobalActivityPage,
  AllRewardsResponse,
  AllRewardsDetailResponse,
} from '@/types/stats.js'

export const statsApi = {
  leaderboard: (metric: 'points' | 'completions' | 'scoreboard' = 'points', limit = 10, scoreboardObjective?: string) => {
    const params = new URLSearchParams({ metric, limit: String(limit) })
    if (metric === 'scoreboard' && scoreboardObjective) params.set('objective', scoreboardObjective)
    return api.get<LeaderboardResponse>(`/stats/leaderboard?${params}`)
  },

  timeseries: (metric: 'completions' | 'points' = 'completions', days = 30) => {
    const params = new URLSearchParams({ metric, days: String(days) })
    return api.get<TimeseriesResponse>(`/stats/timeseries?${params}`)
  },

  rewards: (limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) })
    return api.get<RewardsStatsResponse>(`/stats/rewards?${params}`)
  },

  quests: (sort: 'popular' | 'hardest' = 'popular', limit = 10) => {
    const params = new URLSearchParams({ sort, limit: String(limit) })
    return api.get<QuestsStatsResponse>(`/stats/quests?${params}`)
  },

  activity: (before?: number) => {
    const params = new URLSearchParams({ limit: '20' })
    if (before != null) params.set('before', String(before))
    return api.get<GlobalActivityPage>(`/stats/activity?${params}`)
  },

  allRewards: () => api.get<AllRewardsResponse>('/stats/all-rewards'),

  allRewardsDetail: (rewardType: string, itemType: string | null) => {
    const params = new URLSearchParams({ rewardType })
    if (itemType != null) params.set('itemType', itemType)
    return api.get<AllRewardsDetailResponse>(`/stats/all-rewards/detail?${params}`)
  },
}
