import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { EditorNode, ItemSelectorConfig, EditingTaskReward } from '../types.js'
import { TASK_TYPES, REWARD_TYPES } from '../constants.js'
import { ItemIcon } from '../ItemIcon.js'
import { getDisplayText } from '../utils.js'
import { useIsMobile } from '@/hooks/useIsMobile.js'
import { useMcLang } from '@/hooks/useMcData.js'
import type { ConditionProgress } from '@/types/progress.js'
import { nextFire, cooldownNextFire, formatRevivePreview } from '../CronParser.js'

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
  /** 各条件の達成進捗 (ログイン中のみ) */
  conditionProgress?: ConditionProgress[]
  /** クエスト完了済みで未受取の場合に渡す。呼び出すと報酬受取APIを実行する */
  claimReward?: () => Promise<void>
  /** プレイモードでチェックマーク条件を完了する。conditionId を渡す */
  onCheckmarkComplete?: (conditionId: string) => Promise<void>
  /** プレイモードで納品ボタンを押す。インベントリからアイテムを消費して進捗を更新する */
  onDeliver?: () => Promise<void>
  /** 繰り返しクエストの未受取報酬数 */
  pendingRewards?: number
  /** クエスト最終達成時刻 (クールダウン残り計算用) */
  completedAt?: string | null
}

/**
 * クエストの詳細編集モーダル
 * スマホでは全画面、デスクトップでは中央ダイアログ表示
 * スマホではタスク/報酬をタブで切り替えるレイアウトを使用
 */
export function QuestEditorModal({
  node,
  updateNode,
  close,
  openItemSelector,
  openTaskRewardEditor,
  proposalMeta,
  readOnly = false,
  conditionProgress,
  claimReward,
  onCheckmarkComplete,
  onDeliver,
  pendingRewards,
  completedAt,
}: QuestEditorModalProps) {
  const [showTaskMenu, setShowTaskMenu] = useState(false)
  const [showRewardMenu, setShowRewardMenu] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [delivering, setDelivering] = useState(false)
  const [checkingConditionId, setCheckingConditionId] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const { data: lang } = useMcLang()

  // 繰り返し設定
  const repeat = node.repeat
  const isRepeatQuest = repeat && repeat.type !== 'none'
  const repeatCountdown = (() => {
    if (!repeat || repeat.type === 'none' || repeat.type === 'unlimited') return null
    if (repeat.type === 'cooldown' && repeat.cooldownHours && completedAt) {
      const next = cooldownNextFire(completedAt, repeat.cooldownHours)
      if (next <= new Date()) return null // already available
      return formatRevivePreview(next)
    }
    if (repeat.type === 'schedule' && repeat.cron) {
      const next = nextFire(repeat.cron)
      if (!next) return null
      return formatRevivePreview(next)
    }
    return null
  })()

  const addTask = (type: string) => {
    const newTask = {
      id: `t-${Date.now()}`,
      type,
      value: type === 'checkmark' ? '確認する' : '',
      ...(type === 'item' || type === 'delivery' ? { itemType: 'stone', count: 1 } : {}),
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
      ...(type === 'item' ? { itemType: 'stone' } : {}),
    }
    updateNode({ ...node, rewards: [...(node.rewards ?? []), newReward] })
    setShowRewardMenu(false)
    openTaskRewardEditor({ nodeId: node.id, category: 'reward', itemId: newReward.id })
  }

  const removeReward = (id: string) => {
    updateNode({ ...node, rewards: node.rewards.filter((r) => r.id !== id) })
  }

  // ---------------------------------------------------------------------------
  // 共通サブコンポーネント
  // ---------------------------------------------------------------------------

  /** タスクリスト */
  const TaskList = () => (
    <div className="flex-1 flex flex-col bg-black/20 border border-gray-700 rounded-sm min-h-0">
      <div className="flex justify-between items-center bg-[#1e1f29] p-2 border-b border-gray-700 shrink-0">
        <span className="font-bold text-sm text-blue-300">タスク</span>
        <div className="relative">
          {!readOnly && <button
            onClick={() => { setShowTaskMenu(!showTaskMenu); setShowRewardMenu(false) }}
            className="hover:bg-white/10 p-1 rounded"
          >
            <Plus size={18} className="text-green-400" />
          </button>}
          {showTaskMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[#1e1f29] border border-gray-600 p-1 z-50 shadow-xl min-w-[180px] rounded-sm">
              {TASK_TYPES.map((t) => (
                <div
                  key={t.id}
                  className="px-3 py-2 hover:bg-blue-600 cursor-pointer text-sm flex items-center gap-3"
                  onClick={() => addTask(t.id)}
                >
                  <span className="text-lg">{t.icon}</span> {t.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {node.tasks?.map((task) => {
          const cp = conditionProgress?.find((p) => p.conditionId === task.id)
          const isDone = cp?.completed ?? false
          const hasCount = cp != null && cp.current != null && cp.required != null && task.type !== 'item'
          return (
            <div
              key={task.id}
              className={`flex items-center gap-3 p-2 bg-black/30 rounded-sm border transition-colors ${isDone ? 'border-yellow-600/50 bg-yellow-900/10' : 'border-transparent'} ${readOnly ? '' : 'hover:bg-white/5 active:bg-white/10 hover:border-gray-500 cursor-pointer'}`}
              onClick={readOnly ? undefined : () => openTaskRewardEditor({ nodeId: node.id, category: 'task', itemId: task.id })}
            >
              <div className="shrink-0">
                {(task.type === 'item' || task.type === 'delivery') ? (
                  <ItemIcon type={task.itemType ?? 'stone'} size={24} />
                ) : (
                  <span className="text-xl w-6 text-center block">
                    {TASK_TYPES.find((t) => t.id === task.type)?.icon}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate font-semibold ${isDone ? 'text-yellow-300' : 'text-gray-200'}`}>
                  {getDisplayText(task, 'task', lang)}
                </div>
                {hasCount && !isDone && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, ((cp!.current! / cp!.required!) * 100))}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{cp!.current}/{cp!.required}</span>
                  </div>
                )}
              </div>
              {/* 達成チェックマーク / プレイモードのチェック・納品ボタン */}
              {isDone ? (
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#FFD700', fontSize: '13px', color: '#5a4000' }}
                  title="達成済み"
                >
                  ✓
                </div>
              ) : (readOnly && task.type === 'checkmark' && onCheckmarkComplete) ? (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    setCheckingConditionId(task.id)
                    try { await onCheckmarkComplete(task.id) } finally { setCheckingConditionId(null) }
                  }}
                  disabled={checkingConditionId === task.id}
                  className="shrink-0 px-3 py-1 text-xs font-bold border-2 active:translate-y-px"
                  style={{
                    color: '#0a1f0a',
                    backgroundColor: checkingConditionId === task.id ? '#5B9B5B' : '#7BC67B',
                    borderTopColor: '#A0E0A0',
                    borderLeftColor: '#A0E0A0',
                    borderBottomColor: '#3B7B3B',
                    borderRightColor: '#3B7B3B',
                    cursor: checkingConditionId === task.id ? 'wait' : 'pointer',
                  }}
                >
                  {checkingConditionId === task.id ? '処理中...' : '了解'}
                </button>
              ) : (readOnly && task.type === 'delivery') ? (
                <span className="shrink-0 text-xs text-orange-300 font-bold">🎁 納品</span>
              ) : null}
              {!readOnly && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}
                  className="text-red-400 hover:text-red-300 p-1 shrink-0"
                  title="削除"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  /** 報酬リスト */
  const RewardList = () => (
    <div className="flex-1 flex flex-col bg-black/20 border border-gray-700 rounded-sm min-h-0">
      <div className="flex justify-between items-center bg-[#1e1f29] p-2 border-b border-gray-700 shrink-0">
        <span className="font-bold text-sm text-yellow-300">報酬</span>
        <div className="relative">
          {!readOnly && <button
            onClick={() => { setShowRewardMenu(!showRewardMenu); setShowTaskMenu(false) }}
            className="hover:bg-white/10 p-1 rounded"
          >
            <Plus size={18} className="text-green-400" />
          </button>}
          {showRewardMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[#1e1f29] border border-gray-600 p-1 z-50 shadow-xl min-w-[180px] rounded-sm">
              {REWARD_TYPES.map((r) => (
                <div
                  key={r.id}
                  className="px-3 py-2 hover:bg-blue-600 cursor-pointer text-sm flex items-center gap-3"
                  onClick={() => addReward(r.id)}
                >
                  <span className="text-lg">{r.icon}</span> {r.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {node.rewards?.map((reward) => (
          <div
            key={reward.id}
            className={`flex items-center gap-3 p-2 bg-black/30 rounded-sm border border-transparent transition-colors ${readOnly ? '' : 'hover:bg-white/5 active:bg-white/10 hover:border-gray-500 cursor-pointer'}`}
            onClick={readOnly ? undefined : () => openTaskRewardEditor({ nodeId: node.id, category: 'reward', itemId: reward.id })}
          >
            <div className="shrink-0">
              {reward.type === 'item' ? (
                <ItemIcon type={reward.itemType ?? 'stone'} size={24} />
              ) : (
                <span className="text-xl w-6 text-center block">
                  {REWARD_TYPES.find((r) => r.id === reward.type)?.icon}
                </span>
              )}
            </div>
            <div className="flex-1 text-sm text-gray-200 truncate font-semibold">
              {getDisplayText(reward, 'reward', lang)}
            </div>
            {!readOnly && (
              <button
                onClick={(e) => { e.stopPropagation(); removeReward(reward.id) }}
                className="text-red-400 hover:text-red-300 p-1 shrink-0"
                title="削除"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  /** 繰り返し設定エディタ (編集モードのみ) */
  const updateRepeat = (patch: Partial<NonNullable<EditorNode['repeat']>>) => {
    const cur = node.repeat ?? { type: 'none' as const }
    updateNode({ ...node, repeat: { ...cur, ...patch } })
  }

  const repeatForEdit = node.repeat ?? { type: 'none' as const }
  const cooldownTotalHours = repeatForEdit.cooldownHours ?? 24
  const cooldownH = Math.floor(cooldownTotalHours)
  const cooldownM = Math.round((cooldownTotalHours - cooldownH) * 60)
  const setCooldown = (h: number, m: number) => {
    const total = Math.max(0, h) + Math.max(0, Math.min(59, m)) / 60
    updateRepeat({ cooldownHours: total })
  }

  const repeatEditor = (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">繰り返し</div>
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'none', label: 'なし' },
          { id: 'cooldown', label: 'クールダウン' },
          { id: 'schedule', label: '時刻指定' },
          { id: 'unlimited', label: '無制限' },
        ] as const).map((opt) => (
          <button
            key={opt.id}
            onClick={() => updateRepeat({ type: opt.id })}
            className={`text-xs px-3 py-1.5 border rounded-sm font-bold ${repeatForEdit.type === opt.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-black/30 border-gray-600 text-gray-300 hover:bg-white/5'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {repeatForEdit.type === 'cooldown' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-gray-300 flex-wrap">
            <span>復活までの時間</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={cooldownH}
              onChange={(e) => setCooldown(parseInt(e.target.value || '0', 10), cooldownM)}
              className="w-16 bg-black/30 border border-gray-600 px-2 py-1 rounded-sm outline-none focus:border-blue-500"
            />
            <span>時間</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              step={1}
              value={cooldownM}
              onChange={(e) => setCooldown(cooldownH, parseInt(e.target.value || '0', 10))}
              className="w-16 bg-black/30 border border-gray-600 px-2 py-1 rounded-sm outline-none focus:border-blue-500"
            />
            <span>分</span>
          </div>
          {cooldownTotalHours > 0 && (() => {
            const next = new Date(Date.now() + cooldownTotalHours * 3600000)
            return <div className="text-xs text-gray-500">今達成したら: {formatRevivePreview(next)}</div>
          })()}
        </div>
      )}
      {repeatForEdit.type === 'schedule' && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span>cron式</span>
            <input
              type="text"
              value={repeatForEdit.cron ?? '0 0 * * *'}
              onChange={(e) => updateRepeat({ cron: e.target.value })}
              placeholder="分 時 日 月 曜日"
              className="flex-1 bg-black/30 border border-gray-600 px-2 py-1 rounded-sm outline-none focus:border-blue-500 font-mono"
            />
          </label>
          <div className="flex gap-1 flex-wrap">
            {([
              { label: '毎時00分', cron: '0 * * * *' },
              { label: '毎日0時', cron: '0 0 * * *' },
              { label: '毎週月曜0時', cron: '0 0 * * 1' },
              { label: '毎月1日0時', cron: '0 0 1 * *' },
            ] as const).map((p) => (
              <button
                key={p.cron}
                onClick={() => updateRepeat({ cron: p.cron })}
                className="text-[10px] px-2 py-0.5 border border-gray-600 rounded-sm text-gray-400 hover:bg-white/5"
              >
                {p.label}
              </button>
            ))}
          </div>
          {repeatForEdit.cron && (() => {
            const next = nextFire(repeatForEdit.cron)
            return (
              <div className="text-xs text-gray-500">
                {next ? `次の復活: ${formatRevivePreview(next)}` : '⚠ cron式が無効です'}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )

  // ---------------------------------------------------------------------------
  // レイアウト切り替え
  // ---------------------------------------------------------------------------

  if (isMobile) {
    // スマホ: 全画面
    return (
      <div className="absolute inset-0 z-40 flex flex-col bg-[#2d2f3b] text-white">
        {/* ヘッダー */}
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
            <button onClick={close} aria-label="閉じる" className="text-gray-400 p-1 shrink-0">
              <X size={24} />
            </button>
          </div>
          {/* 提案者表示 */}
          {node.creatorName && (
            <div className="text-xs text-gray-400">✨ {node.creatorName} 作成</div>
          )}
          {/* 繰り返しクエストバナー */}
          {readOnly && isRepeatQuest && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold" style={{ backgroundColor: '#1a2a3a', borderLeft: '3px solid #4a9edd', color: '#7bc8f8' }}>
              <span>🔁 繰り返しクエスト</span>
              {repeatCountdown && <span className="text-gray-300 font-normal">｜ 次の復活: {repeatCountdown}</span>}
            </div>
          )}
          {/* 納品ボタン / 報酬受取ボタン / いいね・承認/却下ボタン */}
          {(onDeliver || claimReward || proposalMeta) && (
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
          )}
        </div>

        {/* 縦スクロール: タスク・報酬・詳細を1画面に */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 min-h-0">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">タスク</div>
            <TaskList />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">報酬</div>
            <RewardList />
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
          {!readOnly && repeatEditor}
        </div>
      </div>
    )
  }

  // デスクトップ: 中央ダイアログ
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70" onClick={close}>
      <div
        className="bg-[#2d2f3b] border-2 border-[#1e1f29] w-[800px] h-[650px] flex flex-col p-4 shadow-2xl text-white rounded-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー: アイコン + タイトル */}
        <div className="flex flex-col gap-2 mb-4 pb-2 border-b border-gray-600">
          {/* 1行目: アイコン + タイトル + 閉じるボタン */}
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
            <button onClick={close} aria-label="閉じる" className="text-gray-400 hover:text-red-400 shrink-0">
              <X size={28} />
            </button>
          </div>
          {/* 提案者表示 */}
          {node.creatorName && (
            <div className="text-xs text-gray-400">✨ {node.creatorName} 作成</div>
          )}
          {/* 繰り返しクエストバナー */}
          {readOnly && isRepeatQuest && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold" style={{ backgroundColor: '#1a2a3a', borderLeft: '3px solid #4a9edd', color: '#7bc8f8' }}>
              <span>🔁 繰り返しクエスト</span>
              {repeatCountdown && <span className="text-gray-300 font-normal">｜ 次の復活: {repeatCountdown}</span>}
            </div>
          )}
          {/* 2行目: 報酬受取ボタン / いいね・承認/却下ボタン */}
          {(claimReward || proposalMeta) && (
            <div className="flex items-center gap-2 flex-wrap">
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
          )}
        </div>

        {/* 中段: タスク列 / 報酬列 */}
        <div className="flex gap-4 mb-4 h-64 min-h-0">
          <TaskList />
          <RewardList />
        </div>

        {/* 下段: 説明文 + 繰り返し設定 */}
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          <textarea
            value={node.description}
            onChange={(e) => updateNode({ ...node, description: e.target.value })}
            readOnly={readOnly}
            className={`w-full flex-1 min-h-[120px] bg-black/30 border border-gray-700 p-3 text-sm text-gray-200 resize-none outline-none rounded-sm leading-relaxed ${readOnly ? 'cursor-default' : 'focus:border-blue-500'}`}
            placeholder="クエストの詳細な説明を入力してください..."
          />
          {!readOnly && repeatEditor}
        </div>
      </div>
    </div>
  )
}
