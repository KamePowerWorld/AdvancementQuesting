export interface LeaderboardEntry {
  rank: number
  playerUuid: string
  playerName: string
  value: number
}

export interface LeaderboardResponse {
  metric: string
  entries: LeaderboardEntry[]
}

export interface TimeseriesPoint {
  date: string
  value: number
}

export interface TimeseriesResponse {
  metric: string
  days: number
  data: TimeseriesPoint[]
}

export interface RewardAggEntry {
  rewardType: string
  rewardLabel: string | null
  totalAmount: number
  claimCount: number
}

export type RewardsStatsResponse = RewardAggEntry[]

export interface QuestStatEntry {
  questId: number
  questTitle: string
  questIcon: string
  completionCount: number
  uniquePlayers: number
}

export type QuestsStatsResponse = QuestStatEntry[]

export interface ActivityReward {
  type: string
  itemType?: string | null
  amount: number
  label?: string | null
}

export interface GlobalActivityItem {
  id: number
  playerUuid: string
  playerName: string
  questId: number
  questTitle: string
  questIcon: string
  completedAt: string
  rewards: ActivityReward[]
}

export interface GlobalActivityPage {
  items: GlobalActivityItem[]
  nextCursor: number | null
}

export interface AllRewardsEntry {
  rewardType: string
  itemType: string | null
  rewardLabel: string | null
  totalAmount: number
}

export type AllRewardsResponse = AllRewardsEntry[]

export interface AllRewardsDetailResponse {
  players: Array<{ playerUuid: string; playerName: string; totalAmount: number }>
  quests: Array<{ questId: number; questTitle: string; totalAmount: number }>
}
