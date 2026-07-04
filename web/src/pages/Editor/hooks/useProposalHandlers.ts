import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { proposalsApi } from '@/api/proposals.js'
import { questsApi } from '@/api/quests.js'
import { nodeToApiBody } from '../utils/conversions.js'
import {
  useVoteProposal,
  useApproveProposal,
  useRejectProposal,
  useDeleteProposal,
} from '@/hooks/mutations.js'
import type { Proposal } from '@/types/proposal.js'
import type { EditorState } from './useEditorState.js'

interface UseProposalHandlersDeps {
  existingProposals: Proposal[] | undefined
  setSubmitting: (v: boolean) => void
  setSubmitProposals: (fn: () => (() => Promise<void>)) => void
  showToast: (label: string) => void
}

export function useProposalHandlers(s: EditorState, deps: UseProposalHandlersDeps) {
  const { existingProposals, setSubmitting, setSubmitProposals, showToast } = deps

  const queryClient = useQueryClient()
  const voteProposal = useVoteProposal()
  const approveProposal = useApproveProposal()
  const rejectProposal = useRejectProposal()
  const deleteProposal = useDeleteProposal()

  // submitProposals is a multi-step sequence (create many + update many) that
  // does not map cleanly to a single useMutation — kept as a manual async fn.
  const submitProposals = useCallback(async () => {
    if (s.proposalNodes.length === 0 && s.myProposalEdits.size === 0) return
    setSubmitting(true)
    try {
      for (const node of s.proposalNodes) {
        await proposalsApi.create({
          ...nodeToApiBody(node, s.proposalEdges),
          status: 'proposed',
          category: null,
          customButtons: [],
        })
      }
      for (const [proposalId, node] of s.myProposalEdits) {
        const p = existingProposals?.find((p) => p.id === proposalId)
        if (p) await questsApi.update(p.questId, nodeToApiBody(node, s.proposalEdges))
      }
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      s.setProposalNodes([])
      s.setProposalEdges([])
      s.setMyProposalEdits(new Map())
      showToast('提案を送信しました！')
    } catch {
      showToast('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.proposalNodes, s.proposalEdges, s.myProposalEdits, existingProposals, queryClient, setSubmitting, s.setProposalNodes, s.setProposalEdges, s.setMyProposalEdits, showToast])

  useEffect(() => {
    setSubmitProposals(() => submitProposals)
  }, [submitProposals, setSubmitProposals])

  const handleVote = async (proposalId: number, type: 'up' | 'down') => {
    await voteProposal.mutateAsync({ proposalId, type })
  }

  const handleApprove = async (proposalId: number) => {
    await approveProposal.mutateAsync(proposalId)
    s.setEditingProposalNodeId(null)
  }

  const handleReject = async (proposalId: number) => {
    await rejectProposal.mutateAsync(proposalId)
    s.setEditingProposalNodeId(null)
  }

  const handleDeleteProposal = async (proposalId: number) => {
    if (!confirm('この提案を取り下げますか？')) return
    await deleteProposal.mutateAsync(proposalId)
    s.setEditingProposalNodeId(null)
  }

  return { submitProposals, handleVote, handleApprove, handleReject, handleDeleteProposal }
}
