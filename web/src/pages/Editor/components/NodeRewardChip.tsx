import type { EditorReward } from '@/components/editor/types.js'
import { ItemIcon } from '@/components/editor/ItemIcon.js'
import { DEFAULT_ITEM_ID } from '@/components/editor/constants.js'

export function NodeRewardChip({ reward }: { reward: EditorReward }) {
  if (reward.type === 'item') {
    return (
      <div className="flex items-center gap-0.5 bg-black/40 border border-gray-600 rounded px-1 py-0.5">
        <ItemIcon type={reward.itemType ?? DEFAULT_ITEM_ID} size={18} />
        {(reward.count ?? 1) > 1 && (
          <span className="text-[11px] text-white tabular-nums">×{reward.count}</span>
        )}
      </div>
    )
  }
  if (reward.type === 'xp') {
    return (
      <span className="text-[11px] bg-black/40 border border-gray-600 rounded px-1.5 py-0.5 text-green-300">
        {reward.value}
      </span>
    )
  }
  if (reward.type === 'point') {
    return (
      <span className="text-[11px] bg-black/40 border border-gray-600 rounded px-1.5 py-0.5 text-yellow-300">
        ⭐ {reward.amount}
      </span>
    )
  }
  return (
    <span className="text-[11px] bg-black/40 border border-gray-600 rounded px-1.5 py-0.5 text-gray-400">⚙️</span>
  )
}
