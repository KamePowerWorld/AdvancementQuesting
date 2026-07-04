import { Plus, Trash2 } from 'lucide-react'
import type { EditorNode, ItemSelectorConfig, EditingTaskReward } from '../../types.js'
import { REWARD_TYPES , DEFAULT_ITEM_ID} from '../../constants.js'
import { ItemIcon } from '../../ItemIcon.js'
import { getDisplayText } from '../../utils.js'
interface QuestRewardListProps {
  node: EditorNode
  readOnly: boolean
  lang?: { ja: Record<string, string>; en: Record<string, string> }
  showRewardMenu: boolean
  setShowRewardMenu: (v: boolean) => void
  setShowTaskMenu: (v: boolean) => void
  addReward: (type: string) => void
  removeReward: (id: string) => void
  openTaskRewardEditor: (config: EditingTaskReward) => void
  openItemSelector: (config: ItemSelectorConfig) => void
}

export function QuestRewardList({
  node, readOnly, lang,
  showRewardMenu, setShowRewardMenu, setShowTaskMenu,
  addReward, removeReward, openTaskRewardEditor,
}: QuestRewardListProps) {
  return (
    <div className="flex-1 flex flex-col bg-black/20 border border-gray-700 rounded-sm min-h-0">
      <div className="flex justify-between items-center bg-[#1e1f29] p-2 border-b border-gray-700 shrink-0">
        <span className="font-bold text-sm text-yellow-300">報酬</span>
        <div className="relative">
          {!readOnly && (
            <button
              onClick={() => { setShowRewardMenu(!showRewardMenu); setShowTaskMenu(false) }}
              className="hover:bg-white/10 p-1 rounded"
            >
              <Plus size={18} className="text-green-400" />
            </button>
          )}
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
                <ItemIcon type={reward.itemType ?? DEFAULT_ITEM_ID} size={24} />
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
}
