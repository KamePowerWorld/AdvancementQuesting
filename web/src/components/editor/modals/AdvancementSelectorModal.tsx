import { useState, useMemo } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile.js'
import { useMcAdvancements } from '@/hooks/useMcData.js'
import type { NamespacedId } from '@/util/NamespacedId.js'

interface AdvancementSelectorModalProps {
  close: () => void
  onSelect: (advancementId: NamespacedId) => void
}

export function AdvancementSelectorModal({ close, onSelect }: AdvancementSelectorModalProps) {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const { advancements, isLoading } = useMcAdvancements()

  const filtered = useMemo(() => {
    if (!advancements) return []
    const q = search.toLowerCase()
    if (!q) return advancements
    return advancements.filter(
      (a) => a.id.toString().toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    )
  }, [advancements, search])

  const list = (
    <div className="bg-[#2d2f3b] border border-gray-600 overflow-y-auto flex-1">
      {isLoading ? (
        <div className="text-center text-sm text-gray-400 py-8">ロード中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">見つかりません</div>
      ) : (
        filtered.map((adv) => (
          <div
            key={adv.id.toString()}
            onClick={() => { onSelect(adv.id); close() }}
            className="px-4 py-2.5 cursor-pointer hover:bg-blue-600/30 border-b border-gray-700/50 last:border-0"
          >
            <div className="text-sm font-medium text-white">🏆 {adv.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{adv.id.toString()}</div>
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
        className="w-full bg-black/40 border border-gray-500 text-white text-sm px-3 py-1.5 outline-none focus:border-blue-400"
      />
    </div>
  )

  if (isMobile) {
    return (
      <div className="absolute inset-0 z-[60] flex flex-col bg-[#2d2f3b] text-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-600 shrink-0">
          <span className="font-bold text-sm">進捗を選択</span>
          <button onClick={close} className="text-gray-400 hover:text-red-400 px-2 py-1">✕</button>
        </div>
        {searchBar}
        <div className="flex-1 overflow-hidden flex flex-col px-1 pb-2">{list}</div>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={close}
    >
      <div
        className="bg-[#2d2f3b] border border-gray-600 w-[520px] h-[500px] flex flex-col p-4 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-bold mb-2 shrink-0">進捗 (Advancement) を選択</div>
        {searchBar}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">{list}</div>
        <div className="mt-3 flex justify-between items-center shrink-0">
          <span className="text-xs text-gray-500">{filtered.length} 件</span>
          <button
            onClick={close}
            className="bg-gray-700 hover:bg-gray-600 border border-gray-500 px-6 py-1 text-sm"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
