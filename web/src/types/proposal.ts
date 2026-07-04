import type { Condition, Reward } from './quest.js'

export type ProposalStatus = 'pending' | 'approved' | 'rejected'

/** GET /api/proposals が quest から生成するスナップショット */
export interface QuestSnapshot {
  title?: string
  subtitle?: string
  description?: string
  icon?: string
  prerequisites?: string[]
  conditions?: Condition[]
  rewards?: Reward[]
}

export interface Proposal {
  id: number
  questId: number
  proposerUuid: string
  proposerName: string
  status: ProposalStatus
  votesUp: number
  votesDown: number
  rejectReason: string | null
  createdAt: string
  myVote: 'up' | 'down' | null
  mapPosition?: { x: number; y: number }
  questSnapshot?: QuestSnapshot
}

export interface VoteRequest {
  type: 'up' | 'down'
}

export interface RejectRequest {
  reason: string
}
