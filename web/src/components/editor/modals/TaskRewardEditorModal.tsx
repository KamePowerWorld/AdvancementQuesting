import { useState, useMemo } from 'react'
import { X } from 'lucide-react'
import type { EditorNode, EditorTask, EditorReward, ItemSelectorConfig } from '../types.js'
import { TASK_TYPES, REWARD_TYPES } from '../constants.js'
import { ItemIcon } from '../ItemIcon.js'
import { useIsMobile } from '@/hooks/useIsMobile.js'
import { useMcItems, getItemName } from '@/hooks/useMcData.js'

interface TaskRewardEditorModalProps {
  node: EditorNode
  category: 'task' | 'reward'
  itemId: string
  close: () => void
  updateNode: (node: EditorNode) => void
  openItemSelector: (config: ItemSelectorConfig) => void
}

// アドバンスメントをモックデータから返す (開発用)
// 本番ではMCサーバーAPIから取得
function useAdvancements() {
  // mcmeta の data ブランチからは fetch が必要だが、現状はモックデータを使用
  // 実際のアドバンスメントIDは `minecraft:story/mine_wood` 形式
  const MOCK_ADVANCEMENTS = [
    { id: 'minecraft:story/root', name: 'Minecraft' },
    { id: 'minecraft:story/mine_wood', name: '木の切り出し' },
    { id: 'minecraft:story/get_wood', name: '木のツール' },
    { id: 'minecraft:story/mine_stone', name: '石の採掘' },
    { id: 'minecraft:story/upgrade_tools', name: 'ストーンエイジ' },
    { id: 'minecraft:story/smelt_iron', name: '鉄の製錬' },
    { id: 'minecraft:story/obtain_armor', name: '武装完了' },
    { id: 'minecraft:story/lava_bucket', name: '溶岩バケツ' },
    { id: 'minecraft:story/iron_tools', name: '鉄のツール' },
    { id: 'minecraft:story/deflect_arrow', name: '矢を弾く' },
    { id: 'minecraft:story/form_obsidian', name: '黒曜石の採掘' },
    { id: 'minecraft:story/mine_diamond', name: 'ダイヤモンドの採掘' },
    { id: 'minecraft:story/enter_the_nether', name: 'ネザーに踏み込む' },
    { id: 'minecraft:story/shiny_gear', name: 'ダイヤの鎧' },
    { id: 'minecraft:story/enchant_item', name: 'エンチャント！' },
    { id: 'minecraft:story/cure_zombie_villager', name: 'ゾンビの村人を治す' },
    { id: 'minecraft:story/follow_ender_eye', name: 'アイ・スパイ' },
    { id: 'minecraft:story/enter_the_end', name: 'エンドに踏み込む' },
    { id: 'minecraft:nether/root', name: 'ネザー' },
    { id: 'minecraft:end/root', name: 'エンド' },
    { id: 'minecraft:adventure/root', name: '冒険' },
    { id: 'minecraft:husbandry/root', name: '農業' },
  ]
  return MOCK_ADVANCEMENTS
}

const STAT_TYPES = [
  { id: 'minecraft:mined', name: '採掘' },
  { id: 'minecraft:crafted', name: 'クラフト' },
  { id: 'minecraft:used', name: '使用' },
  { id: 'minecraft:broken', name: '破壊' },
  { id: 'minecraft:picked_up', name: '拾得' },
  { id: 'minecraft:dropped', name: '破棄' },
  { id: 'minecraft:killed', name: '討伐' },
  { id: 'minecraft:killed_by', name: '被討伐' },
  { id: 'minecraft:custom', name: 'カスタム' },
]

export function TaskRewardEditorModal({
  node,
  category,
  itemId,
  close,
  updateNode,
  openItemSelector,
}: TaskRewardEditorModalProps) {
  const isMobile = useIsMobile()
  const items = category === 'task' ? node.tasks : node.rewards
  const item = items.find((i) => i.id === itemId)
  const { lang } = useMcItems()
  const advancements = useAdvancements()
  const [advSearch, setAdvSearch] = useState('')

  if (!item) return null

  const types = category === 'task' ? TASK_TYPES : REWARD_TYPES
  const typeDef = types.find((t) => t.id === item.type)

  const handleChange = (changes: Partial<EditorTask> | Partial<EditorReward>) => {
    const newItems = items.map((i) => (i.id === itemId ? { ...i, ...changes } : i))
    const iconUpdate = category === 'task' && 'itemType' in changes && changes.itemType
      ? { icon: changes.itemType as string }
      : {}
    updateNode({
      ...node,
      ...iconUpdate,
      [category === 'task' ? 'tasks' : 'rewards']: newItems,
    })
  }

  const handleOpenItemSelector = () => {
    if (category === 'task') {
      openItemSelector({ type: 'task_item', nodeId: node.id, taskId: item.id })
    } else {
      openItemSelector({ type: 'reward_item', nodeId: node.id, rewardId: item.id })
    }
  }

  const currentItemId = (item as EditorTask).itemType ?? 'stone'
  const currentItemName = getItemName(lang, currentItemId)

  const filteredAdv = useMemo(() => {
    const q = advSearch.toLowerCase()
    if (!q) return advancements
    return advancements.filter(
      (a) => a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    )
  }, [advancements, advSearch])

  const taskSpecificField = (() => {
    if (item.type === 'item') {
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
              <span className="text-sm text-white font-bold truncate">{currentItemName}</span>
              <span className="text-xs text-gray-400 truncate">{currentItemId}</span>
              <button
                onClick={handleOpenItemSelector}
                className="text-xs text-blue-400 hover:text-blue-300 text-left mt-1"
              >
                変更する →
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <label className="text-xs text-gray-400">数量</label>
            <input
              type="number"
              min={1}
              value={(item as EditorTask & { count?: number }).count ?? 1}
              onChange={(e) => handleChange({ count: Number(e.target.value) } as any)}
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-24 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )
    }

    if (item.type === 'advancement') {
      const currentAdv = (item as any).advancementId ?? ''
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">進捗 (Advancement)</label>
          <input
            type="text"
            value={advSearch}
            onChange={(e) => setAdvSearch(e.target.value)}
            placeholder="検索..."
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
          />
          {currentAdv && (
            <div className="text-xs text-green-400 px-1">選択中: {currentAdv}</div>
          )}
          <div className="bg-black/30 border border-gray-700 overflow-y-auto max-h-40">
            {filteredAdv.map((adv) => (
              <div
                key={adv.id}
                onClick={() => handleChange({ advancementId: adv.id } as any)}
                className={`px-3 py-2 cursor-pointer text-sm hover:bg-blue-600/30 ${currentAdv === adv.id ? 'bg-blue-600/50 text-blue-200' : 'text-gray-300'}`}
              >
                <div className="font-medium">{adv.name}</div>
                <div className="text-xs text-gray-500">{adv.id}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <label className="text-xs text-gray-400">カスタムID (直接入力)</label>
            <input
              type="text"
              value={currentAdv}
              onChange={(e) => handleChange({ advancementId: e.target.value } as any)}
              placeholder="minecraft:story/mine_wood"
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )
    }

    if (item.type === 'stat') {
      const currentStat = (item as EditorTask & { statType?: string; statId?: string }).statType ?? ''
      const currentStatId = (item as EditorTask & { statType?: string; statId?: string }).statId ?? ''
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">統計タイプ</label>
          <div className="bg-black/30 border border-gray-700 overflow-y-auto max-h-32">
            {STAT_TYPES.map((s) => (
              <div
                key={s.id}
                onClick={() => handleChange({ statType: s.id } as any)}
                className={`px-3 py-2 cursor-pointer text-sm hover:bg-blue-600/30 ${currentStat === s.id ? 'bg-blue-600/50 text-blue-200' : 'text-gray-300'}`}
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-gray-500 ml-2">{s.id}</span>
              </div>
            ))}
          </div>
          {currentStat && currentStat !== 'minecraft:custom' && (
            <div className="flex flex-col gap-1 mt-1">
              <label className="text-xs text-gray-400">対象ID (例: diamond)</label>
              <input
                type="text"
                value={currentStatId}
                onChange={(e) => handleChange({ statId: e.target.value } as any)}
                placeholder="diamond"
                className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">目標値</label>
            <input
              type="number"
              min={1}
              value={(item as EditorTask & { count?: number }).count ?? 1}
              onChange={(e) => handleChange({ count: Number(e.target.value) } as any)}
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-24 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )
    }

    if (item.type === 'checkmark') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">確認メッセージ</label>
          <textarea
            value={item.value}
            onChange={(e) => handleChange({ value: e.target.value })}
            rows={3}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500 resize-none"
            placeholder="プレイヤーに確認してもらう内容..."
          />
        </div>
      )
    }

    if (item.type === 'command') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">コマンド</label>
          <input
            type="text"
            value={item.value}
            onChange={(e) => handleChange({ value: e.target.value })}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white font-mono outline-none focus:border-blue-500"
            placeholder="/say タスク完了!"
          />
          <div className="text-xs text-gray-500">%player% でプレイヤー名に置換されます</div>
        </div>
      )
    }

    if (item.type === 'xp') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">経験値量</label>
          <input
            type="number"
            min={1}
            value={(item as EditorReward & { amount?: number }).amount ?? 0}
            onChange={(e) => handleChange({ amount: Number(e.target.value) } as any)}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
            placeholder="100"
          />
        </div>
      )
    }

    if (item.type === 'loot') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">ルートテーブルID</label>
          <input
            type="text"
            value={item.value}
            onChange={(e) => handleChange({ value: e.target.value })}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white font-mono outline-none focus:border-blue-500"
            placeholder="minecraft:chests/simple_dungeon"
          />
        </div>
      )
    }

    // デフォルト: valueフィールド
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">値</label>
        <input
          type="text"
          value={item.value}
          onChange={(e) => handleChange({ value: e.target.value })}
          className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
          placeholder="値を入力..."
        />
      </div>
    )
  })()

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
        className="bg-[#2d2f3b] border-2 border-[#1e1f29] w-[480px] max-h-[600px] flex flex-col p-5 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  )
}
