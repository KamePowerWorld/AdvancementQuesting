import { QuestEditorModal } from '@/components/editor/modals/QuestEditorModal/index.js'
import { TaskRewardEditorModal } from '@/components/editor/modals/TaskRewardEditorModal/index.js'
import { ItemSelectorModal } from '@/components/editor/modals/ItemSelectorModal.js'
import { RewardTableModal } from '@/components/editor/modals/RewardTableModal.js'
import { LoginModal } from '@/components/LoginModal.js'
import type { EditorNode } from '@/components/editor/types.js'
import type { Quest } from '@/types/quest.js'
import type { PlayerProgress } from '@/types/progress.js'
import type { Proposal } from '@/types/proposal.js'
import type { PlayerSession } from '@/types/auth.js'
import type { ViewAsTarget } from '@/hooks/useViewAs.js'
import type { useClaimReward, useCompleteCheckmark, useDeliverItems, useToggleQuestStatus } from '@/hooks/mutations.js'
import type { NamespacedId } from '@/util/NamespacedId.js'
import type { EditorState } from '../hooks/useEditorState.js'
import type { ProposalNode } from '../types.js'

interface EditorModalsProps {
  s: EditorState
  isEditor: boolean
  me: PlayerSession | undefined
  viewAs: ViewAsTarget | null
  questsData: Quest[] | undefined
  progressData: PlayerProgress[] | undefined
  existingProposals: Proposal[] | undefined
  editingNode: EditorNode | null | undefined
  editingProposalNode: ProposalNode | null
  taskRewardNode: EditorNode | null | undefined
  updateNode: (updated: EditorNode) => void
  handleItemSelect: (itemType: NamespacedId) => void
  isReadOnlyNode: (nodeId: string) => boolean
  showToast: (label: string) => void
  claimRewardMutation: ReturnType<typeof useClaimReward>
  completeCheckmarkMutation: ReturnType<typeof useCompleteCheckmark>
  deliverItemsMutation: ReturnType<typeof useDeliverItems>
  toggleQuestStatusMutation: ReturnType<typeof useToggleQuestStatus>
  handleVote: (proposalId: number, type: 'up' | 'down') => void
  handleApprove: (proposalId: number) => void
  handleReject: (proposalId: number) => void
  handleDeleteProposal: (proposalId: number) => void
}

/** クエスト編集 / 提案閲覧 / タスク報酬編集 / アイテム選択 / ログイン の各モーダル */
export function EditorModals({
  s, isEditor, me, viewAs, questsData, progressData, existingProposals,
  editingNode, editingProposalNode, taskRewardNode,
  updateNode, handleItemSelect, isReadOnlyNode, showToast,
  claimRewardMutation, completeCheckmarkMutation, deliverItemsMutation, toggleQuestStatusMutation,
  handleVote, handleApprove, handleReject, handleDeleteProposal,
}: EditorModalsProps) {
  return (
    <>
      {editingNode && (
        <QuestEditorModal node={editingNode} updateNode={updateNode} close={() => s.setEditingNodeId(null)} openItemSelector={s.setItemSelectorConfig} openTaskRewardEditor={s.setEditingTaskReward} readOnly={isReadOnlyNode(s.editingNodeId!)}
          conditionProgress={progressData?.find((pr) => String(pr.questId) === s.editingNodeId)?.progress}
          pendingRewards={progressData?.find((pr) => String(pr.questId) === s.editingNodeId)?.pendingRewards}
          completedAt={progressData?.find((pr) => String(pr.questId) === s.editingNodeId)?.completedAt}
          claimReward={(() => {
            if (viewAs) return undefined
            const p = progressData?.find((pr) => String(pr.questId) === s.editingNodeId)
            if (!p) return undefined
            const claimable = p.rewardClaimable ?? (p.completed && !p.rewardClaimed)
            if (!claimable) return undefined
            return async () => { await claimRewardMutation.mutateAsync(s.editingNodeId!); showToast('報酬を受け取りました！') }
          })()}
          onCheckmarkComplete={!viewAs && isReadOnlyNode(s.editingNodeId!) && me ? async (conditionId) => { await completeCheckmarkMutation.mutateAsync({ questId: s.editingNodeId!, conditionId }) } : undefined}
          onDeliver={(() => {
            if (viewAs) return undefined
            const node = s.editingNodeId ? s.nodes.find((n) => n.id === s.editingNodeId) : null
            const hasDelivery = node?.tasks?.some((t) => t.type === 'delivery')
            const p = progressData?.find((pr) => String(pr.questId) === s.editingNodeId)
            if (!hasDelivery || !isReadOnlyNode(s.editingNodeId!) || !me || p?.completed) return undefined
            return async () => { const result = await deliverItemsMutation.mutateAsync(s.editingNodeId!); showToast(Object.keys(result.delivered ?? {}).length > 0 ? '納品しました！' : '納品できるアイテムがありませんでした') }
          })()}
          questStatus={(() => { if (!isEditor || !s.editingNodeId) return undefined; return questsData?.find((q) => String(q.id) === s.editingNodeId)?.status })()}
          onToggleStatus={(() => {
            if (!isEditor || !s.editingNodeId) return undefined
            const q = questsData?.find((q) => String(q.id) === s.editingNodeId)
            if (!q || q.status === 'proposed') return undefined
            return async () => { const { newStatus } = await toggleQuestStatusMutation.mutateAsync({ id: q.id, currentStatus: q.status }); showToast(newStatus === 'public' ? '公開しました' : '非公開にしました') }
          })()}
        />
      )}

      {editingProposalNode && (() => {
        const p = existingProposals?.find((p) => p.id === editingProposalNode.proposalId)
        const canEdit = isEditor
        const isAuthor = !!me && !!p && me.playerUuid === p.proposerUuid
        return (
          <QuestEditorModal node={editingProposalNode} updateNode={canEdit ? updateNode : () => {}} close={() => s.setEditingProposalNodeId(null)} openItemSelector={s.setItemSelectorConfig} openTaskRewardEditor={s.setEditingTaskReward}
            proposalMeta={editingProposalNode.proposalId != null ? {
              proposalId: editingProposalNode.proposalId, proposerName: p?.proposerName ?? '',
              votesUp: editingProposalNode.votesUp ?? 0, myVote: p?.myVote ?? null,
              onVote: (type: 'up' | 'down') => handleVote(editingProposalNode.proposalId!, type),
              ...(isAuthor ? { onDelete: () => handleDeleteProposal(editingProposalNode.proposalId!) } : {}),
              ...(isEditor ? { onApprove: () => handleApprove(editingProposalNode.proposalId!), onReject: () => handleReject(editingProposalNode.proposalId!) } : {}),
            } : undefined}
            readOnly={!canEdit}
          />
        )
      })()}

      {s.editingTaskReward && taskRewardNode && (
        <TaskRewardEditorModal node={taskRewardNode} category={s.editingTaskReward.category} itemId={s.editingTaskReward.itemId} updateNode={updateNode} close={() => s.setEditingTaskReward(null)} openItemSelector={s.setItemSelectorConfig} />
      )}
      {s.showRewardTableModal && <RewardTableModal close={() => s.setShowRewardTableModal(false)} />}
      {s.itemSelectorConfig && <ItemSelectorModal close={() => s.setItemSelectorConfig(null)} onSelect={handleItemSelect} />}
      {s.showLoginModal && <LoginModal close={() => s.setShowLoginModal(false)} />}
    </>
  )
}
