interface ProposalMeta {
  proposalId: number
  proposerName: string
  votesUp: number
  myVote?: 'up' | 'down' | null
  onVote?: (type: 'up' | 'down') => void
  onDelete?: () => void
  onApprove?: () => void
  onReject?: () => void
}

interface QuestActionButtonsProps {
  onDeliver?: () => Promise<void>
  delivering: boolean
  setDelivering: (v: boolean) => void
  claimReward?: () => Promise<void>
  claiming: boolean
  setClaiming: (v: boolean) => void
  pendingRewards?: number
  proposalMeta?: ProposalMeta
}

export function QuestActionButtons({
  onDeliver, delivering, setDelivering,
  claimReward, claiming, setClaiming, pendingRewards,
  proposalMeta,
}: QuestActionButtonsProps) {
  if (!onDeliver && !claimReward && !proposalMeta) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {onDeliver && (
        <button
          onClick={async () => { setDelivering(true); try { await onDeliver() } finally { setDelivering(false) } }}
          disabled={delivering}
          className="text-sm px-4 py-1.5 border-2 font-bold mr-auto"
          style={{
            color: '#1a0a00',
            backgroundColor: delivering ? '#9B7B3B' : '#E8A830',
            borderTopColor: '#F5C842',
            borderLeftColor: '#F5C842',
            borderBottomColor: '#8B6020',
            borderRightColor: '#8B6020',
            cursor: delivering ? 'wait' : 'pointer',
          }}
        >
          {delivering ? '納品中...' : '🎁 まとめて納品する'}
        </button>
      )}
      {claimReward && (
        <div className="flex items-center gap-3 mr-auto">
          <button
            onClick={async () => { setClaiming(true); try { await claimReward() } finally { setClaiming(false) } }}
            disabled={claiming}
            className="text-sm px-4 py-1.5 border-2 font-bold"
            style={{
              color: '#0a1f0a',
              backgroundColor: claiming ? '#5B9B5B' : '#7BC67B',
              borderTopColor: '#A0E0A0',
              borderLeftColor: '#A0E0A0',
              borderBottomColor: '#3B7B3B',
              borderRightColor: '#3B7B3B',
              cursor: claiming ? 'wait' : 'pointer',
            }}
          >
            {claiming ? '受取中...' : `★ 報酬を受け取る${pendingRewards && pendingRewards > 1 ? ` (×${pendingRewards})` : ''}`}
          </button>
        </div>
      )}
      {proposalMeta && (<>
        <span className="text-xs text-gray-400 mr-auto">by {proposalMeta.proposerName}</span>
        {proposalMeta.onVote && (
          <button
            onClick={() => proposalMeta.onVote!('up')}
            className="text-xs px-3 py-1.5 border font-bold"
            style={{
              color: proposalMeta.myVote === 'up' ? '#fff' : '#0a1f0a',
              backgroundColor: proposalMeta.myVote === 'up' ? '#3B7B3B' : '#7BC67B',
              borderColor: '#3B7B3B',
            }}
          >
            👍 {proposalMeta.votesUp}
          </button>
        )}
        {!proposalMeta.onVote && (
          <span className="text-xs text-gray-400">👍 {proposalMeta.votesUp}</span>
        )}
        {proposalMeta.onDelete && (
          <button
            onClick={proposalMeta.onDelete}
            className="text-xs px-3 py-1.5 border font-bold"
            style={{ color: '#1f0a0a', backgroundColor: '#C67B7B', borderColor: '#7B3B3B' }}
          >
            🗑 取り下げ
          </button>
        )}
        {proposalMeta.onApprove && (
          <button
            onClick={proposalMeta.onApprove}
            className="text-xs px-3 py-1.5 border font-bold"
            style={{ color: '#0a1f0a', backgroundColor: '#7BC67B', borderColor: '#3B7B3B' }}
          >
            ✓ 承認
          </button>
        )}
        {proposalMeta.onReject && (
          <button
            onClick={proposalMeta.onReject}
            className="text-xs px-3 py-1.5 border font-bold"
            style={{ color: '#1f0a0a', backgroundColor: '#C67B7B', borderColor: '#7B3B3B' }}
          >
            ✕ 却下
          </button>
        )}
      </>)}
    </div>
  )
}
