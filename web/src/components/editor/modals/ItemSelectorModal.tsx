import { useState, useMemo } from 'react'
import { ItemIcon } from '../ItemIcon.js'
import { useMcItems } from '@/hooks/useMcData.js'
import type { NamespacedId } from '@/util/NamespacedId.js'

interface ItemSelectorModalProps {
  close: () => void
  onSelect: (itemType: NamespacedId) => void
}

export function ItemSelectorModal({ close, onSelect }: ItemSelectorModalProps) {
  const [search, setSearch] = useState('')
  const { items, isLoading } = useMcItems()

  const filtered = useMemo(() => {
    if (!items) return []
    const q = search.toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.id.toString().includes(q) ||
        item.name.toLowerCase().includes(q),
    )
  }, [items, search])

  const grid = (
    <div
      className="bg-[#8B8B8B] border-t-[#3B3B3B] border-l-[#3B3B3B] border-b-[#C6C6C6] border-r-[#C6C6C6] border-2 p-2 overflow-y-auto flex-1"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(2.5rem, 1fr))', gap: '4px', alignContent: 'start' }}
    >
      {isLoading ? (
        <div className="col-span-6 text-center text-sm text-black py-8">ロード中...</div>
      ) : filtered.length === 0 ? (
        <div className="col-span-6 text-center text-sm text-black py-8">見つかりません</div>
      ) : (
        filtered.map((item) => (
          <div
            key={item.id.toString()}
            onClick={() => onSelect(item.id)}
            className="w-10 h-10 bg-[#C6C6C6] border-t-white border-l-white border-b-[#555555] border-r-[#555555] border-2 flex items-center justify-center cursor-pointer active:bg-gray-300"
            title={`${item.name} (${item.id})`}
          >
            <ItemIcon type={item.id} size={36} />
          </div>
        ))
      )}
    </div>
  )

  const searchBar = (
    <div className="shrink-0 px-1 py-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="検索..."
        autoFocus
        className="w-full bg-[#1e1f29] border border-gray-500 text-white text-sm px-3 py-1.5 outline-none focus:border-blue-400"
        style={{ fontFamily: '"Courier New", monospace' }}
      />
    </div>
  )

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={close}
    >
      <div
        className="bg-[#C6C6C6] border-t-white border-l-white border-b-[#555555] border-r-[#555555] border-4 p-4 shadow-2xl flex flex-col w-[90vw] max-w-2xl"
        style={{ height: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-black font-bold mb-2 shrink-0">アイテムを選択</div>
        {searchBar}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {grid}
        </div>
        <div className="mt-3 flex justify-between items-center shrink-0">
          <span className="text-xs text-gray-600">
            {filtered.length} アイテム
          </span>
          <button
            onClick={close}
            className="bg-[#C6C6C6] hover:bg-[#D6D6D6] border-t-white border-l-white border-b-[#555555] border-r-[#555555] border-2 px-6 py-1 text-black"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
