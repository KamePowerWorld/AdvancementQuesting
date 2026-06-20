import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { rewardsApi } from '@/api/rewards.js'
import { ItemIcon } from '@/components/editor/ItemIcon.js'
import type { RewardType, RewardClaimItem } from '@/types/rewards.js'

interface Props {
  playerUuid: string
  onSelectQuest?: (questId: number) => void
}

const TYPE_META: Record<RewardType, { icon: string; label: string; unit: string }> = {
  point:      { icon: '🪙', label: 'ポイント', unit: 'pt' },
  experience: { icon: '✨', label: '経験値',   unit: 'exp' },
  item:       { icon: '📦', label: 'アイテム', unit: '個' },
  command:    { icon: '⚙️', label: 'コマンド', unit: '回' },
}

const TYPE_ORDER: RewardType[] = ['point', 'experience', 'item', 'command']

/** アイテム以外のスカラー報酬チップ (クリックで内訳ポップオーバー) */
function ScalarChip({
  type, total, items, onSelectQuest,
}: {
  type: RewardType
  total: number
  items: RewardClaimItem[]
  onSelectQuest?: (questId: number) => void
}) {
  const meta = TYPE_META[type]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-black/40 border border-gray-600 hover:border-gray-400 transition-colors"
        title={`${meta.label}の内訳を見る`}
      >
        <span>{meta.icon}</span>
        <span className="font-bold text-blue-300 tabular-nums">{total.toLocaleString()}</span>
        <span className="text-gray-400">{meta.unit}</span>
      </button>

      {open && (
        <>
          {/* バックドロップ */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* 内訳ポップオーバー */}
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] max-w-[260px] max-h-60 overflow-y-auto bg-[#1e1f29] border border-gray-600 rounded shadow-xl">
            <div className="sticky top-0 bg-[#1e1f29] px-2 py-1 text-[11px] font-bold text-gray-400 border-b border-gray-700">
              {meta.icon} {meta.label}の内訳
            </div>
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => { setOpen(false); onSelectQuest?.(it.questId) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/10 transition-colors"
              >
                <span className="flex-1 min-w-0 truncate text-xs text-gray-200">
                  {it.rewardLabel || meta.label}
                  <span className="text-gray-500 ml-1">／{it.questTitle}</span>
                </span>
                <span className="shrink-0 text-xs font-bold text-blue-300 tabular-nums">
                  {it.amount.toLocaleString()}<span className="text-gray-500 font-normal">{meta.unit}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** アイテムグリッド (インベントリ風) — クリックで内訳ポップオーバー */
function ItemGrid({
  items, onSelectQuest,
}: {
  items: RewardClaimItem[]
  onSelectQuest?: (questId: number) => void
}) {
  const [openId, setOpenId] = useState<number | null>(null)

  if (items.length === 0) return null

  // itemType ごとに集計
  const byType = new Map<string, { total: number; label: string; entries: RewardClaimItem[] }>()
  for (const it of items) {
    const key = it.itemType ?? '__unknown'
    const existing = byType.get(key)
    if (existing) {
      existing.total += it.amount
      existing.entries.push(it)
    } else {
      byType.set(key, { total: it.amount, label: it.rewardLabel ?? key, entries: [it] })
    }
  }
  const grouped = Array.from(byType.entries())

  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 mb-1">📦 アイテム</div>
      <div className="flex flex-wrap gap-1">
        {grouped.map(([itemType, { total, label, entries }]) => {
          const isOpen = openId === entries[0]!.id
          return (
            <div key={itemType} className="relative">
              <button
                onClick={() => setOpenId(isOpen ? null : entries[0]!.id)}
                className="relative flex items-center justify-center w-10 h-10 rounded bg-black/40 border border-gray-600 hover:border-gray-400 transition-colors"
                title={`${label} ×${total}`}
              >
                <ItemIcon type={itemType} size={28} />
                {total > 1 && (
                  <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-white tabular-nums leading-none drop-shadow">
                    {total > 999 ? '999+' : total}
                  </span>
                )}
              </button>

              {isOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpenId(null)} />
                  <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] max-w-[240px] max-h-52 overflow-y-auto bg-[#1e1f29] border border-gray-600 rounded shadow-xl">
                    <div className="sticky top-0 bg-[#1e1f29] px-2 py-1 text-[11px] font-bold text-gray-400 border-b border-gray-700 flex items-center gap-1">
                      <ItemIcon type={itemType} size={14} />
                      {label}
                    </div>
                    {entries.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => { setOpenId(null); onSelectQuest?.(it.questId) }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/10 transition-colors"
                      >
                        <span className="flex-1 min-w-0 truncate text-xs text-gray-300">{it.questTitle}</span>
                        <span className="shrink-0 text-xs font-bold text-blue-300 tabular-nums">×{it.amount}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PlayerRewardsPanel({ playerUuid, onSelectQuest }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rewards', playerUuid],
    queryFn: () => rewardsApi.get(playerUuid),
  })

  if (isLoading) {
    return <div className="text-center text-sm text-gray-500 py-6">読み込み中...</div>
  }
  if (isError || !data) {
    return <div className="text-center text-sm text-gray-500 py-6">報酬を取得できませんでした</div>
  }
  if (data.items.length === 0) {
    return <div className="text-center text-sm text-gray-500 py-6 border border-dashed border-gray-700 rounded-sm">まだ報酬の受取がありません</div>
  }

  const scalarTypes = TYPE_ORDER.filter((t) => t !== 'item' && (data.totalsByType[t] ?? 0) > 0)
  const itemItems = data.items.filter((it) => it.rewardType === 'item')

  return (
    <div className="flex flex-col gap-3">
      {/* スカラー報酬チップ行 */}
      {scalarTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {scalarTypes.map((t) => (
            <ScalarChip
              key={t}
              type={t}
              total={data.totalsByType[t]!}
              items={data.items.filter((it) => it.rewardType === t)}
              onSelectQuest={onSelectQuest}
            />
          ))}
        </div>
      )}

      {/* アイテムグリッド */}
      {itemItems.length > 0 && (
        <ItemGrid items={itemItems} onSelectQuest={onSelectQuest} />
      )}
    </div>
  )
}
