import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EditorNode, EditorEdge } from '@/components/editor/types.js'
import { proposalsApi } from '@/api/proposals.js'
import { questsApi } from '@/api/quests.js'
import { nodeToApiBody } from '../utils/conversions.js'
import {
  useVoteProposal,
  useApproveProposal,
  useRejectProposal,
  useDeleteProposal,
} from '@/hooks/mutations.js'

interface UseProposalHandlersParams {
  proposalNodes: EditorNode[]
  proposalEdges: EditorEdge[]
  myProposalEdits: Map<number, EditorNode>
  existingProposals: any[] | undefined
  setSubmitting: (v: boolean) => void
  setSubmitProposals: (fn: () => (() => Promise<void>)) => void
  setProposalNodes: React.Dispatch<React.SetStateAction<EditorNode[]>>
  setProposalEdges: React.Dispatch<React.SetStateAction<EditorEdge[]>>
  setMyProposalEdits: React.Dispatch<React.SetStateAction<Map<number, EditorNode>>>
  setEditingProposalNodeId: (id: string | null) => void
  showToast: (label: string) => void
}

export function useProposalHandlers({
  proposalNodes, proposalEdges, myProposalEdits,
  existingProposals,
  setSubmitting, setSubmitProposals,
  setProposalNodes, setProposalEdges, setMyProposalEdits,
  setEditingProposalNodeId,
  showToast,
}: UseProposalHandlersParams) {
  const queryClient = useQueryClient()
  const voteProposal = useVoteProposal()
  const approveProposal = useApproveProposal()
  const rejectProposal = useRejectProposal()
  const deleteProposal = useDeleteProposal()

  // submitProposals is a multi-step sequence (create many + update many) that
  // does not map cleanly to a single useMutation — kept as a manual async fn.
  const submitProposals = useCallback(async () => {
    if (proposalNodes.length === 0 && myProposalEdits.size === 0) return
    setSubmitting(true)
    try {
      for (const node of proposalNodes) {
        await proposalsApi.create({
          ...nodeToApiBody(node, proposalEdges),
          status: 'proposed',
          category: null,
          customButtons: [],
        } as any)
      }
      for (const [proposalId, node] of myProposalEdits) {
        const p = existingProposals?.find((p: any) => p.id === proposalId) as any
        if (p) await questsApi.update(p.questId, nodeToApiBody(node, proposalEdges))
      }
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      setProposalNodes([])
      setProposalEdges([])
      setMyProposalEdits(new Map())
      showToast('提案を送信しました！')
    } catch {
      showToast('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalNodes, proposalEdges, myProposalEdits, existingProposals, queryClient, setSubmitting, setProposalNodes, setProposalEdges, setMyProposalEdits, showToast])

  useEffect(() => {
    setSubmitProposals(() => submitProposals)
  }, [submitProposals, setSubmitProposals])

  const handleVote = async (proposalId: number, type: 'up' | 'down') => {
    await voteProposal.mutateAsync({ proposalId, type })
  }

  const handleApprove = async (proposalId: number) => {
    await approveProposal.mutateAsync(proposalId)
    setEditingProposalNodeId(null)
  }

  const handleReject = async (proposalId: number) => {
    await rejectProposal.mutateAsync(proposalId)
    setEditingProposalNodeId(null)
  }

  const handleDeleteProposal = async (proposalId: number) => {
    if (!confirm('この提案を取り下げますか？')) return
    await deleteProposal.mutateAsync(proposalId)
    setEditingProposalNodeId(null)
  }

  return { submitProposals, handleVote, handleApprove, handleReject, handleDeleteProposal }
}
