import { useState, useMemo } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile.js'
import { useMcCustomStats } from '@/hooks/useMcData.js'
import { ItemIcon } from '../ItemIcon.js'
import { useMcItems } from '@/hooks/useMcData.js'
import { NamespacedId } from '@/util/NamespacedId.js'

/** カテゴリ毎の表示設定 */
const STAT_CATEGORIES = [
  { id: 'minecraft:mined',      label: '採取した回数',     icon: '⛏️', itemBased: true },
  { id: 'minecraft:broken',     label: '破壊した回数',     icon: '💥', itemBased: true },
  { id: 'minecraft:crafted',    label: 'クラフトした回数', icon: '🔨', itemBased: true },
  { id: 'minecraft:used',       label: '使用した回数',     icon: '🖐️', itemBased: true },
  { id: 'minecraft:picked_up',  label: '拾った回数',       icon: '🤏', itemBased: true },
  { id: 'minecraft:dropped',    label: '捨てた回数',       icon: '🗑️', itemBased: true },
  { id: 'minecraft:killed',     label: '討伐',   icon: '⚔️', itemBased: false },
  { id: 'minecraft:killed_by',  label: '被討伐', icon: '💀', itemBased: false },
  { id: 'minecraft:custom',     label: 'カスタム', icon: '📊', itemBased: false },
] as const

export interface StatSelection {
  statType: string
  statId: NamespacedId
}

interface StatSelectorModalProps {
  close: () => void
  onSelect: (sel: StatSelection) => void
}

export function StatSelectorModal({ close, onSelect }: StatSelectorModalProps) {
  const isMobile = useIsMobile()
  const [step, setStep] = useState<'category' | 'id'>('category')
  const [selectedCategory, setSelectedCategory] = useState<typeof STAT_CATEGORIES[number] | null>(null)
  const [search, setSearch] = useState('')

  const { items, isLoading: itemsLoading } = useMcItems()
  const { stats, isLoading: statsLoading } = useMcCustomStats()

  const isLoading = itemsLoading || statsLoading

  const filteredItems = useMemo(() => {
    if (!items) return []
    const q = search.toLowerCase()
    if (!q) return items
    return items.filter((it) => it.id.toString().includes(q) || it.name.toLowerCase().includes(q))
  }, [items, search])

  const filteredStats = useMemo(() => {
    if (!stats) return []
    const q = search.toLowerCase()
    if (!q) return stats
    return stats.filter((s) => s.id.toString().includes(q) || s.name.toLowerCase().includes(q))
  }, [stats, search])

  const handleCategorySelect = (cat: typeof STAT_CATEGORIES[number]) => {
    setSelectedCategory(cat)
    setSearch('')
    // killed / killed_by はエンティティ指定が必要だが現状は直接ID入力で対応
    // custom はカスタム統計リストへ
    // item ベースはアイテム選択へ
    setStep('id')
  }

  const handleIdSelect = (statId: NamespacedId) => {
    if (!selectedCategory) return
    onSelect({ statType: selectedCategory.id, statId })
    close()
  }

  const searchBar = (
    <div className="shrink-0 px-1 py-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="検索..."
        autoFocus
        className="w-full bg-black/40 border border-gray-500 text-white text-sm px-3 py-1.5 outline-none focus:border-blue-400"
      />
    </div>
  )

  // ステップ1: カテゴリ選択
  const categoryList = (
    <div className="bg-[#2d2f3b] border border-gray-600 overflow-y-auto flex-1">
      {STAT_CATEGORIES.map((cat) => (
        <div
          key={cat.id}
          onClick={() => handleCategorySelect(cat)}
          className="px-4 py-3 cursor-pointer hover:bg-blue-600/30 border-b border-gray-700/50 last:border-0 flex items-center gap-3"
        >
          <span className="text-xl">{cat.icon}</span>
          <div>
            <div className="text-sm font-medium text-white">{cat.label}</div>
            <div className="text-xs text-gray-400">{cat.id}</div>
          </div>
        </div>
      ))}
    </div>
  )

  // ステップ2a: アイテムベース統計のアイテム選択
  const itemList = (
    <div
      className="bg-[#8B8B8B] border-t-[#3B3B3B] border-l-[#3B3B3B] border-b-[#C6C6C6] border-r-[#C6C6C6] border-2 p-2 overflow-y-auto flex-1"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(2.5rem, 1fr))', gap: '4px', alignContent: 'start' }}
    >
      {isLoading ? (
        <div className="col-span-6 text-center text-sm text-black py-8">ロード中...</div>
      ) : filteredItems.length === 0 ? (
        <div className="col-span-6 text-center text-sm text-black py-8">見つかりません</div>
      ) : (
        filteredItems.map((item) => (
          <div
            key={item.id.toString()}
            onClick={() => handleIdSelect(item.id)}
            className="w-10 h-10 bg-[#C6C6C6] border-t-white border-l-white border-b-[#555555] border-r-[#555555] border-2 flex items-center justify-center cursor-pointer active:bg-gray-300"
            title={`${item.name} (${item.id.toString()})`}
          >
            <ItemIcon type={item.id} size={36} />
          </div>
        ))
      )}
    </div>
  )

  // ステップ2b: カスタム統計選択
  const customStatList = (
    <div className="bg-[#2d2f3b] border border-gray-600 overflow-y-auto flex-1">
      {isLoading ? (
        <div className="text-center text-sm text-gray-400 py-8">ロード中...</div>
      ) : filteredStats.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">見つかりません</div>
      ) : (
        filteredStats.map((stat) => (
          <div
            key={stat.id.toString()}
            onClick={() => handleIdSelect(stat.id)}
            className="px-4 py-2.5 cursor-pointer hover:bg-blue-600/30 border-b border-gray-700/50 last:border-0"
          >
            <div className="text-sm font-medium text-white">📊 {stat.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stat.id.toString()}</div>
          </div>
        ))
      )}
    </div>
  )

  // killed/killed_by はエンティティID直接入力 (将来的にエンティティ選択UIに拡張可能)
  const entityInput = (
    <div className="flex flex-col gap-2 flex-1">
      <div className="text-xs text-gray-400">エンティティID (例: minecraft:zombie)</div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && search) handleIdSelect(NamespacedId.parseUserInput(search)) }}
        placeholder="minecraft:zombie"
        className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
      />
      <button
        onClick={() => { if (search) handleIdSelect(NamespacedId.parseUserInput(search)) }}
        className="self-start bg-blue-600 hover:bg-blue-500 border border-blue-700 px-4 py-1.5 text-sm font-bold"
      >
        選択
      </button>
    </div>
  )

  const isItemBased = selectedCategory?.itemBased
  const isKillStat = selectedCategory?.id === 'minecraft:killed' || selectedCategory?.id === 'minecraft:killed_by'
  const isCustom = selectedCategory?.id === 'minecraft:custom'

  const inner = (
    <>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          {step === 'id' && (
            <button
              onClick={() => { setStep('category'); setSearch('') }}
              className="text-gray-400 hover:text-white text-sm px-2 py-1 border border-gray-600 hover:border-gray-400"
            >
              ← 戻る
            </button>
          )}
          <span className="font-bold text-sm">
            {step === 'category'
              ? '統計カテゴリを選択'
              : `${selectedCategory?.icon} ${selectedCategory?.label} — 対象を選択`}
          </span>
        </div>
        <button onClick={close} className="text-gray-400 hover:text-red-400 px-2 py-1">✕</button>
      </div>

      {step === 'category' ? (
        categoryList
      ) : (
        <>
          {!isKillStat && searchBar}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {isItemBased && itemList}
            {isCustom && customStatList}
            {isKillStat && entityInput}
          </div>
        </>
      )}

      <div className="mt-3 flex justify-between items-center shrink-0">
        <span className="text-xs text-gray-500">
          {step === 'id' && isItemBased && `${filteredItems.length} アイテム`}
          {step === 'id' && isCustom && `${filteredStats.length} 件`}
        </span>
        <button
          onClick={close}
          className="bg-gray-700 hover:bg-gray-600 border border-gray-500 px-6 py-1 text-sm"
        >
          キャンセル
        </button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <div className="absolute inset-0 z-[60] flex flex-col bg-[#2d2f3b] text-white p-4">
        {inner}
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={close}
    >
      <div
        className="bg-[#2d2f3b] border border-gray-600 w-[560px] h-[520px] flex flex-col p-4 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  )
}
