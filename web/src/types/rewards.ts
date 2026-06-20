export type RewardType = 'item' | 'experience' | 'point' | 'command'

export interface RewardClaimItem {
  id: number
  questId: number
  questTitle: string
  rewardType: RewardType
  rewardLabel: string | null
  itemType: string | null
  amount: number
  claimedAt: string
}

export interface PlayerRewards {
  playerUuid: string
  /** reward_type → 合計 amount */
  totalsByType: Partial<Record<RewardType, number>>
  items: RewardClaimItem[]
}
