/**
 * Focused useMutation wrappers for the common fetch+invalidate patterns.
 * Toasts and local UI state stay at the call sites — this layer handles
 * only the API call and query invalidation.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { progressApi } from '@/api/progress.js'
import { questsApi } from '@/api/quests.js'
import { proposalsApi } from '@/api/proposals.js'

// ---------------------------------------------------------------------------
// Progress mutations
// ---------------------------------------------------------------------------

/** Claim reward for a quest. Refetches progress on success. */
export function useClaimReward(
  onSuccess?: (data: { claimed: boolean; rewards: unknown[] }) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (questId: string) => progressApi.claim(questId),
    onSuccess: async (data) => {
      await queryClient.refetchQueries({ queryKey: ['progress'] })
      onSuccess?.(data)
    },
  })
}

/** Complete a checkmark condition. Invalidates progress on success. */
export function useCompleteCheckmark(onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ questId, conditionId }: { questId: string; conditionId: string }) =>
      progressApi.completeCondition(questId, conditionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['progress'] })
      onSuccess?.()
    },
  })
}

/** Deliver items for a quest. Invalidates progress on success. */
export function useDeliverItems(
  onSuccess?: (data: { delivered: Record<string, number>; failed: Record<string, number> }) => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (questId: string) => progressApi.deliver(questId),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['progress'] })
      onSuccess?.(data)
    },
  })
}

// ---------------------------------------------------------------------------
// Quest mutations
// ---------------------------------------------------------------------------

/** Toggle quest status between 'public' and 'hidden'. Invalidates quests on success. */
export function useToggleQuestStatus(
  onSuccess?: (newStatus: 'public' | 'hidden') => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, currentStatus }: { id: number; currentStatus: string }) => {
      const newStatus: 'public' | 'hidden' = currentStatus === 'public' ? 'hidden' : 'public'
      return questsApi.update(id, { status: newStatus }).then((result) => ({ result, newStatus }))
    },
    onSuccess: async ({ newStatus }) => {
      await queryClient.invalidateQueries({ queryKey: ['quests'] })
      onSuccess?.(newStatus)
    },
  })
}

// ---------------------------------------------------------------------------
// Proposal mutations
// ---------------------------------------------------------------------------

/** Vote on a proposal (up/down). Invalidates proposals on success. */
export function useVoteProposal(onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ proposalId, type }: { proposalId: number; type: 'up' | 'down' }) =>
      proposalsApi.vote(proposalId, { type }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
      onSuccess?.()
    },
  })
}

/** Approve a proposal. Invalidates proposals and quests on success. */
export function useApproveProposal(onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: number) => proposalsApi.approve(proposalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
      await queryClient.invalidateQueries({ queryKey: ['quests'] })
      onSuccess?.()
    },
  })
}

/** Reject a proposal. Invalidates proposals on success. */
export function useRejectProposal(onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: number) => proposalsApi.reject(proposalId, { reason: '' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
      onSuccess?.()
    },
  })
}

/** Delete (withdraw) a proposal. Invalidates proposals on success. */
export function useDeleteProposal(onSuccess?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: number) => proposalsApi.delete(proposalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['proposals'] })
      onSuccess?.()
    },
  })
}
