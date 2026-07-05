import { useState } from 'react'
import { X, RotateCw, Sparkles } from 'lucide-react'
import type { EditorNode, ItemSelectorConfig, EditingTaskReward } from '../../types.js'
import { ItemIcon } from '../../ItemIcon.js'
import { getDisplayText } from '../../utils.js'
import { AiAssistPanel } from '../AiAssistPanel.js'
import { useIsMobile } from '@/hooks/useIsMobile.js'
import { useMcLang } from '@/hooks/useMcData.js'
import { NamespacedId } from '@/util/NamespacedId.js'
import type { ConditionProgress } from '@/types/progress.js'
import { cooldownNextFire, formatRevivePreview } from '../../CronParser.js'
import { QuestRankingSection } from '@/components/ranking/QuestRankingSection.js'
import { QuestTaskList } from './QuestTaskList.js'
import { QuestRewardList } from './QuestRewardList.js'
import { QuestRepeatEditor } from './QuestRepeatEditor.js'
import { QuestActionButtons } from './QuestActionButtons.js'

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

interface QuestEditorModalProps {
  node: EditorNode
  updateNode: (node: EditorNode) => void
  close: () => void
  openItemSelector: (config: ItemSelectorConfig) => void
  openTaskRewardEditor: (config: EditingTaskReward) => void
  proposalMeta?: ProposalMeta
  readOnly?: boolean
  conditionProgress?: ConditionProgress[]
  claimReward?: () => Promise<void>
  onCheckmarkComplete?: (conditionId: string) => Promise<void>
  onDeliver?: () => Promise<void>
  pendingRewards?: number
  completedAt?: string | null
  onToggleStatus?: () => Promise<void>
  questStatus?: string
}

export function QuestEditorModal({
  node, updateNode, close, openItemSelector, openTaskRewardEditor,
  proposalMeta, readOnly = false, conditionProgress,
  claimReward, onCheckmarkComplete, onDeliver, pendingRewards, completedAt,
  onToggleStatus, questStatus,
}: QuestEditorModalProps) {
  const [showTaskMenu, setShowTaskMenu] = useState(false)
  const [showRewardMenu, setShowRewardMenu] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [delivering, setDelivering] = useState(false)
  const [checkingConditionId, setCheckingConditionId] = useState<string | null>(null)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const isMobile = useIsMobile()
  const { data: lang } = useMcLang()

  const repeat = node.repeat
  const isRepeatQuest = repeat && repeat.type !== 'none'

  const rankingQuestId = /^\d+$/.test(node.id) ? parseInt(node.id, 10) : null
  const rankingSection = rankingQuestId != null
    ? <QuestRankingSection questId={rankingQuestId} repeatable={!!isRepeatQuest} onSelectPlayer={close} />
    : null

  const repeatCountdown = (() => {
    if (!repeat || repeat.type === 'none' || repeat.type === 'unlimited') return null
    if (repeat.type === 'cooldown' && repeat.cooldownHours && completedAt) {
      const next = cooldownNextFire(completedAt, repeat.cooldownHours)
      if (next <= new Date()) return null
      return formatRevivePreview(next)
    }
    return null
  })()

  const addTask = (type: string) => {
    const newTask = {
      id: `t-${Date.now()}`,
      type,
      value: type === 'checkmark' ? '確認する' : '',
      ...(type === 'item' || type === 'delivery' ? { itemType: NamespacedId.parse('minecraft:stone'), count: 1 } : {}),
    }
    updateNode({ ...node, tasks: [...(node.tasks ?? []), newTask] })
    setShowTaskMenu(false)
    openTaskRewardEditor({ nodeId: node.id, category: 'task', itemId: newTask.id })
  }

  const removeTask = (id: string) => {
    updateNode({ ...node, tasks: node.tasks.filter((t) => t.id !== id) })
  }

  const addReward = (type: string) => {
    const newReward = {
      id: `r-${Date.now()}`,
      type,
      value: '',
      ...(type === 'item' ? { itemType: NamespacedId.parse('minecraft:stone') } : {}),
    }
    updateNode({ ...node, rewards: [...(node.rewards ?? []), newReward] })
    setShowRewardMenu(false)
    openTaskRewardEditor({ nodeId: node.id, category: 'reward', itemId: newReward.id })
  }

  const removeReward = (id: string) => {
    updateNode({ ...node, rewards: node.rewards.filter((r) => r.id !== id) })
  }

  const adoptSuggestion = (title: string, description: string) => {
    updateNode({ ...node, title, description })
    setShowAiPanel(false)
  }

  const statusToggleButton = onToggleStatus && questStatus !== 'proposed' ? (
    <button
      onClick={async () => {
        setTogglingStatus(true)
        try { await onToggleStatus() } finally { setTogglingStatus(false) }
      }}
      disabled={togglingStatus}
      className="text-xs px-3 py-1 border font-bold shrink-0"
      style={questStatus === 'public'
        ? { color: '#0a1f1f', backgroundColor: '#5BC6C6', borderColor: '#3B7B7B', cursor: togglingStatus ? 'wait' : 'pointer' }
        : { color: '#1f1a0a', backgroundColor: '#C6B85B', borderColor: '#7B6B3B', cursor: togglingStatus ? 'wait' : 'pointer' }
      }
      title={questStatus === 'public' ? '公開中 — クリックで非公開にする' : '非公開 — クリックで公開する'}
    >
      {togglingStatus ? '...' : questStatus === 'public' ? '🌐 公開中' : '🔒 非公開'}
    </button>
  ) : null

  const aiToggleButton = !readOnly ? (
    <button
      data-testid="ai-toggle-btn"
      onClick={() => setShowAiPanel((v) => !v)}
      className="text-xs px-3 py-1 border font-bold shrink-0 flex items-center gap-1"
      style={showAiPanel
        ? { color: '#1f1a0a', backgroundColor: '#E8C830', borderColor: '#8B7020', cursor: 'pointer' }
        : { color: '#E8C830', backgroundColor: 'transparent', borderColor: '#8B7020', cursor: 'pointer' }}
      title="AIにクエスト名・説明を提案させる"
    >
      <Sparkles size={14} /> AI
    </button>
  ) : null

  const aiPanel = (
    <AiAssistPanel
      tasks={(node.tasks ?? []).map((t) => getDisplayText(t, 'task', lang))}
      rewards={(node.rewards ?? []).map((r) => getDisplayText(r, 'reward', lang))}
      currentTitle={node.title}
      currentSubtitle={node.subtitle}
      currentDescription={node.description}
      onAdopt={adoptSuggestion}
      onClose={() => setShowAiPanel(false)}
    />
  )

  const sharedListProps = {
    node, readOnly, lang,
    showTaskMenu, setShowTaskMenu, setShowRewardMenu,
    addTask, removeTask, openTaskRewardEditor, openItemSelector,
    checkingConditionId, setCheckingConditionId, onCheckmarkComplete, conditionProgress,
  }

  const sharedRewardProps = {
    node, readOnly, lang,
    showRewardMenu, setShowRewardMenu, setShowTaskMenu,
    addReward, removeReward, openTaskRewardEditor, openItemSelector,
  }

  const actionButtonProps = {
    onDeliver, delivering, setDelivering,
    claimReward, claiming, setClaiming, pendingRewards,
    proposalMeta,
  }

  const repeatBanner = readOnly && isRepeatQuest ? (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold" style={{ backgroundColor: '#1a2a3a', borderLeft: '3px solid #4a9edd', color: '#7bc8f8' }}>
      <span className="flex items-center gap-1"><RotateCw size={13} strokeWidth={2.5} /> 繰り返しクエスト</span>
      {repeatCountdown && <span className="text-gray-300 font-normal">｜ 次の復活: {repeatCountdown}</span>}
    </div>
  ) : null

  if (isMobile) {
    return (
      <div className="absolute inset-0 z-40 flex flex-col bg-[#2d2f3b] text-white">
        <div className="flex flex-col gap-2 p-3 border-b border-gray-600 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={readOnly ? 'bg-black/30 p-2 rounded ring-1 ring-gray-600' : 'cursor-pointer bg-black/30 p-2 rounded active:bg-black/50 ring-1 ring-gray-600'}
              onClick={readOnly ? undefined : () => openItemSelector({ type: 'quest_icon', nodeId: node.id })}
            >
              <ItemIcon type={node.icon} size={28} />
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              <input
                type="text"
                value={node.title}
                onChange={(e) => updateNode({ ...node, title: e.target.value })}
                readOnly={readOnly}
                className={`w-full bg-transparent text-xl font-bold border-b border-transparent outline-none placeholder-gray-500 ${readOnly ? 'cursor-default' : 'focus:border-blue-400'}`}
                placeholder="クエストのタイトル"
              />
              <input
                type="text"
                value={node.subtitle}
                onChange={(e) => updateNode({ ...node, subtitle: e.target.value })}
                readOnly={readOnly}
                className={`w-full bg-transparent text-xs text-gray-400 italic outline-none placeholder-gray-600 ${readOnly ? 'cursor-default' : 'focus:border-gray-500'}`}
                placeholder="補足説明..."
              />
            </div>
            {aiToggleButton}
            {statusToggleButton}
            <button onClick={close} aria-label="閉じる" className="text-gray-400 p-1 shrink-0">
              <X size={24} />
            </button>
          </div>
          {node.creatorName && <div className="text-xs text-gray-400">✨ {node.creatorName} 作成</div>}
          {repeatBanner}
          <QuestActionButtons {...actionButtonProps} />
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 min-h-0">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">タスク</div>
            <QuestTaskList {...sharedListProps} />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">報酬</div>
            <QuestRewardList {...sharedRewardProps} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">詳細</div>
            <textarea
              value={node.description}
              onChange={(e) => updateNode({ ...node, description: e.target.value })}
              readOnly={readOnly}
              rows={4}
              className={`w-full bg-black/30 border border-gray-700 p-3 text-sm text-gray-200 resize-none outline-none rounded-sm leading-relaxed ${readOnly ? 'cursor-default' : 'focus:border-blue-500'}`}
              placeholder="クエストの詳細な説明..."
            />
          </div>
          {!readOnly && <QuestRepeatEditor node={node} updateNode={updateNode} />}
          {rankingSection && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">ランキング</div>
              {rankingSection}
            </div>
          )}
        </div>

        {showAiPanel && (
          <div className="absolute inset-0 z-50 bg-[#2d2f3b] p-3 flex flex-col">
            {aiPanel}
          </div>
        )}
      </div>
    )
  }

  // デスクトップ
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70" onClick={close}>
      <div className="flex items-stretch gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#2d2f3b] border-2 border-[#1e1f29] w-[800px] h-[650px] flex flex-col p-4 shadow-2xl text-white rounded-md">
          <div className="flex flex-col gap-2 mb-4 pb-2 border-b border-gray-600">
            <div className="flex items-center gap-3">
              <div
                className={readOnly ? 'bg-black/30 p-2 rounded ring-1 ring-gray-600' : 'cursor-pointer bg-black/30 p-2 rounded hover:bg-black/50 ring-1 ring-gray-600'}
                onClick={readOnly ? undefined : () => openItemSelector({ type: 'quest_icon', nodeId: node.id })}
                title={readOnly ? undefined : 'アイコンを変更'}
              >
                <ItemIcon type={node.icon} size={32} />
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <input
                  type="text"
                  value={node.title}
                  onChange={(e) => updateNode({ ...node, title: e.target.value })}
                  readOnly={readOnly}
                  className={`w-full bg-transparent text-2xl font-bold border-b border-transparent outline-none placeholder-gray-500 ${readOnly ? 'cursor-default' : 'focus:border-blue-400'}`}
                  placeholder="クエストのタイトル"
                />
                <input
                  type="text"
                  value={node.subtitle}
                  onChange={(e) => updateNode({ ...node, subtitle: e.target.value })}
                  readOnly={readOnly}
                  className={`w-full bg-transparent text-sm text-gray-400 italic outline-none placeholder-gray-600 ${readOnly ? 'cursor-default' : 'focus:border-gray-500'}`}
                  placeholder="補足説明..."
                />
              </div>
              {aiToggleButton}
              {statusToggleButton}
              <button onClick={close} aria-label="閉じる" className="text-gray-400 hover:text-red-400 shrink-0">
                <X size={28} />
              </button>
            </div>
            {node.creatorName && <div className="text-xs text-gray-400">✨ {node.creatorName} 作成</div>}
            {repeatBanner}
            <QuestActionButtons {...actionButtonProps} />
          </div>

          <div className="flex gap-4 mb-4 h-64 min-h-0">
            <QuestTaskList {...sharedListProps} />
            <QuestRewardList {...sharedRewardProps} />
          </div>

          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
            <textarea
              value={node.description}
              onChange={(e) => updateNode({ ...node, description: e.target.value })}
              readOnly={readOnly}
              className={`w-full flex-1 min-h-[120px] bg-black/30 border border-gray-700 p-3 text-sm text-gray-200 resize-none outline-none rounded-sm leading-relaxed ${readOnly ? 'cursor-default' : 'focus:border-blue-500'}`}
              placeholder="クエストの詳細な説明を入力してください..."
            />
            {!readOnly && <QuestRepeatEditor node={node} updateNode={updateNode} />}
          </div>
        </div>

        {rankingSection && (
          <div className="bg-[#2d2f3b] border-2 border-[#1e1f29] w-[280px] h-[650px] flex flex-col p-4 shadow-2xl text-white rounded-md">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 shrink-0">ランキング</div>
            <div className="flex-1 overflow-y-auto min-h-0">{rankingSection}</div>
          </div>
        )}

        {showAiPanel && (
          <div className="bg-[#2d2f3b] border-2 border-[#1e1f29] w-[300px] h-[650px] flex flex-col p-4 shadow-2xl text-white rounded-md">
            {aiPanel}
          </div>
        )}
      </div>
    </div>
  )
}
