export interface ConditionProgress {
  conditionId: string
  current?: number
  required?: number
  completed: boolean
}

export interface PlayerProgress {
  id: number
  playerUuid: string
  questId: number
  progress: ConditionProgress[]
  completed: boolean
  rewardClaimed: boolean
  /** 完了済みかつ未受取 (mock-server が計算して付与) */
  rewardClaimable?: boolean
  startedAt: string
  completedAt: string | null
  completedCount: number
  pendingRewards: number
}
