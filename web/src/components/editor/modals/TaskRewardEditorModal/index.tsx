import { X } from 'lucide-react'
import type { EditorNode, EditorTask, EditorReward, ItemSelectorConfig } from '../../types.js'
import { TASK_TYPES, REWARD_TYPES } from '../../constants.js'
import { useIsMobile } from '@/hooks/useIsMobile.js'
import { useMcItems, useMcAdvancements } from '@/hooks/useMcData.js'
import { ItemField } from './fields/ItemField.js'
import { AdvancementField, StatField } from './fields/AdvancementStatField.js'
import { LocationField, ScoreboardField } from './fields/LocationScoreboardField.js'
import { CheckmarkField, CommandField, XpField, PointField, LootField, DefaultValueField } from './fields/SimpleFields.js'

interface TaskRewardEditorModalProps {
  node: EditorNode
  category: 'task' | 'reward'
  itemId: string
  close: () => void
  updateNode: (node: EditorNode) => void
  openItemSelector: (config: ItemSelectorConfig) => void
}

export function TaskRewardEditorModal({
  node, category, itemId, close, updateNode, openItemSelector,
}: TaskRewardEditorModalProps) {
  const isMobile = useIsMobile()
  const items = category === 'task' ? node.tasks : node.rewards
  const item = items.find((i) => i.id === itemId)
  const { lang } = useMcItems()
  const { advancements } = useMcAdvancements()

  if (!item) return null

  const types = category === 'task' ? TASK_TYPES : REWARD_TYPES
  const typeDef = types.find((t) => t.id === item.type)

  const handleChange = (changes: Partial<EditorTask> | Partial<EditorReward>) => {
    const newItems = items.map((i) => (i.id === itemId ? { ...i, ...changes } : i))
    const iconUpdate = category === 'task' && 'itemType' in changes && changes.itemType
      ? { icon: changes.itemType }
      : {}
    updateNode({
      ...node,
      ...iconUpdate,
      [category === 'task' ? 'tasks' : 'rewards']: newItems,
    })
  }

  const taskSpecificField = (() => {
    if (item.type === 'item' || item.type === 'delivery') {
      return <ItemField node={node} item={item} category={category} lang={lang ?? undefined} handleChange={handleChange} openItemSelector={openItemSelector} />
    }
    if (item.type === 'advancement') {
      return <AdvancementField item={item} advancements={advancements ?? undefined} handleChange={handleChange} />
    }
    if (item.type === 'stat') {
      return <StatField item={item} lang={lang ?? undefined} handleChange={handleChange} />
    }
    if (item.type === 'location') {
      return <LocationField item={item} handleChange={handleChange} />
    }
    if (item.type === 'scoreboard') {
      return <ScoreboardField item={item} handleChange={handleChange} />
    }
    if (item.type === 'checkmark') {
      return <CheckmarkField item={item} handleChange={handleChange} />
    }
    if (item.type === 'command') {
      return <CommandField item={item} handleChange={handleChange} />
    }
    if (item.type === 'xp') {
      return <XpField item={item} handleChange={handleChange} />
    }
    if (item.type === 'point') {
      return <PointField item={item} handleChange={handleChange} />
    }
    if (item.type === 'loot') {
      return <LootField item={item} handleChange={handleChange} />
    }
    return <DefaultValueField item={item} handleChange={handleChange} />
  })()

  const noDisplayName = item.type === 'point' || item.type === 'advancement' || item.type === 'stat' || item.type === 'checkmark' || item.type === 'location' || item.type === 'delivery'

  const inner = (
    <>
      <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{typeDef?.icon}</span>
          <h2 className="font-bold text-lg">
            {category === 'task' ? 'タスク編集' : '報酬編集'} — {typeDef?.label}
          </h2>
        </div>
        <button onClick={close} className="text-gray-400 hover:text-red-400 p-1">
          <X size={24} />
        </button>
      </div>

      <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0">
        {taskSpecificField}
        {!noDisplayName && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider">表示名 (省略可)</label>
            <input
              type="text"
              value={item.value}
              onChange={(e) => handleChange({ value: e.target.value })}
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
              placeholder="表示テキスト..."
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end shrink-0 pt-3 border-t border-gray-700">
        <button
          onClick={close}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 border border-blue-700 px-6 py-2 text-sm font-bold shadow-md transition-colors"
        >
          完了
        </button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <div className="absolute inset-0 z-[55] flex flex-col bg-[#2d2f3b] text-white p-5">
        {inner}
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-[55] flex items-center justify-center bg-black/70"
      onClick={close}
    >
      <div
        className="bg-[#2d2f3b] border-2 border-[#1e1f29] w-[480px] max-h-[600px] flex flex-col p-5 shadow-2xl text-white relative"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  )
}
