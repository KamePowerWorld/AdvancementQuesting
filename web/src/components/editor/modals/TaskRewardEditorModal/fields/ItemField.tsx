import { useState } from 'react'
import type { EditorNode, EditorTask, EditorReward, ItemSelectorConfig } from '../../../types.js'
import { ItemIcon } from '../../../ItemIcon.js'
import { playerApi } from '@/api/player.js'
import { getItemName } from '@/hooks/useMcData.js'

interface ItemFieldProps {
  node: EditorNode
  item: EditorTask | EditorReward
  category: 'task' | 'reward'
  lang?: { ja: Record<string, string>; en: Record<string, string> }
  handleChange: (changes: Partial<EditorTask> | Partial<EditorReward>) => void
  openItemSelector: (config: ItemSelectorConfig) => void
}

export function ItemField({ node, item, category, lang, handleChange, openItemSelector }: ItemFieldProps) {
  const [fetchingHeld, setFetchingHeld] = useState(false)
  const [heldError, setHeldError] = useState<string | null>(null)

  const itemWithExtra = item as EditorTask & EditorReward
  const currentItemId = itemWithExtra.itemType ?? 'stone'
  const currentItemName = getItemName(lang, currentItemId)
  const hasNbt = !!itemWithExtra.nbt
  const hasDisplayName = !!itemWithExtra.displayName

  const handleOpenItemSelector = () => {
    if (category === 'task') {
      openItemSelector({ type: 'task_item', nodeId: node.id, taskId: item.id })
    } else {
      openItemSelector({ type: 'reward_item', nodeId: node.id, rewardId: item.id })
    }
  }

  const handleFetchHeldItem = async () => {
    setFetchingHeld(true)
    setHeldError(null)
    try {
      const held = await playerApi.getHeldItem()
      handleChange({
        itemType: held.itemId,
        count: held.count,
        nbt: held.nbt ?? undefined,
        displayName: held.displayName ?? undefined,
      } as any)
    } catch {
      setHeldError('手持ちアイテムを取得できませんでした。ゲームにログインしているか確認してください。')
    } finally {
      setFetchingHeld(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">アイテム</label>
      <div className="flex items-center gap-3 bg-black/20 p-3 border border-gray-700">
        <div
          className="cursor-pointer bg-[#1e1f29] p-2 active:opacity-70 ring-1 ring-gray-500 shrink-0"
          onClick={handleOpenItemSelector}
          title="アイテムを変更"
        >
          <ItemIcon type={currentItemId} size={36} />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {hasDisplayName && (
            <span className="text-sm text-yellow-300 font-bold truncate">{itemWithExtra.displayName}</span>
          )}
          <span className="text-sm text-white font-bold truncate">{currentItemName}</span>
          <span className="text-xs text-gray-400 truncate">{currentItemId}</span>
          {hasNbt && (
            <span className="text-xs text-purple-400 truncate" title={itemWithExtra.nbt}>
              NBT付き ✦
            </span>
          )}
          <div className="flex gap-3 mt-1">
            <button onClick={handleOpenItemSelector} className="text-xs text-blue-400 hover:text-blue-300 text-left">
              ＋ 選択する
            </button>
            <button
              onClick={handleFetchHeldItem}
              disabled={fetchingHeld}
              className="text-xs text-green-400 hover:text-green-300 text-left disabled:opacity-50"
              title="ゲームで手に持っているアイテムをそのまま登録（エンチャント・NBT含む）"
            >
              {fetchingHeld ? '取得中...' : '🎮 手持ちを登録'}
            </button>
          </div>
          {heldError && <span className="text-xs text-red-400 mt-1">{heldError}</span>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">数量</label>
          <input
            type="number"
            min={1}
            value={itemWithExtra.count ?? 1}
            onChange={(e) => handleChange({ count: Number(e.target.value) } as any)}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-24 outline-none focus:border-blue-500"
          />
        </div>
        {hasNbt && (
          <button
            onClick={() => handleChange({ nbt: undefined, displayName: undefined } as any)}
            className="text-xs text-red-400 hover:text-red-300 mt-4"
            title="NBTと表示名をクリアしてノーマルアイテムに戻す"
          >
            ✕ NBTをクリア
          </button>
        )}
      </div>
    </div>
  )
}
