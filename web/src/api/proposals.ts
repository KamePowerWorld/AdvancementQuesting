import { api } from './client.js'
import type { Proposal, VoteRequest, RejectRequest } from '@/types/proposal.js'
import type { Quest } from '@/types/quest.js'

export const proposalsApi = {
  list: () => api.get<Proposal[]>('/proposals'),

  create: (body: Partial<Quest>) => api.post<Proposal>('/proposals', body),

  vote: (id: number, body: VoteRequest) =>
    api.post<{ myVote: 'up' | 'down' | null }>(`/proposals/${id}/vote`, body),

  approve: (id: number) => api.post<{ status: string }>(`/proposals/${id}/approve`),

  reject: (id: number, body: RejectRequest) =>
    api.post<{ status: string }>(`/proposals/${id}/reject`, body),

  delete: (id: number) => api.delete<void>(`/proposals/${id}`),
}
