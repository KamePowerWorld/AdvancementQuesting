import { Plus, Trash2 } from 'lucide-react'
import type { EditorNode, ItemSelectorConfig, EditingTaskReward } from '../../types.js'
import { TASK_TYPES } from '../../constants.js'
import { ItemIcon } from '../../ItemIcon.js'
import { getDisplayText } from '../../utils.js'
import type { ConditionProgress } from '@/types/progress.js'
interface QuestTaskListProps {
  node: EditorNode
  readOnly: boolean
  conditionProgress?: ConditionProgress[]
  lang?: { ja: Record<string, string>; en: Record<string, string> }
  showTaskMenu: boolean
  setShowTaskMenu: (v: boolean) => void
  setShowRewardMenu: (v: boolean) => void
  addTask: (type: string) => void
  removeTask: (id: string) => void
  openTaskRewardEditor: (config: EditingTaskReward) => void
  openItemSelector: (config: ItemSelectorConfig) => void
  checkingConditionId: string | null
  setCheckingConditionId: (id: string | null) => void
  onCheckmarkComplete?: (conditionId: string) => Promise<void>
}

export function QuestTaskList({
  node, readOnly, conditionProgress, lang,
  showTaskMenu, setShowTaskMenu, setShowRewardMenu,
  addTask, removeTask, openTaskRewardEditor,
  checkingConditionId, setCheckingConditionId, onCheckmarkComplete,
}: QuestTaskListProps) {
  return (
    <div className="flex-1 flex flex-col bg-black/20 border border-gray-700 rounded-sm min-h-0">
      <div className="flex justify-between items-center bg-[#1e1f29] p-2 border-b border-gray-700 shrink-0">
        <span className="font-bold text-sm text-blue-300">タスク</span>
        <div className="relative">
          {!readOnly && (
            <button
              onClick={() => { setShowTaskMenu(!showTaskMenu); setShowRewardMenu(false) }}
              className="hover:bg-white/10 p-1 rounded"
            >
              <Plus size={18} className="text-green-400" />
            </button>
          )}
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
}
