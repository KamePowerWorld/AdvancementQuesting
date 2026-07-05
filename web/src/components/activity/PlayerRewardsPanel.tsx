import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { rewardsApi } from '@/api/rewards.js'
import { ItemIcon } from '@/components/editor/ItemIcon.js'
import type { RewardType, RewardClaimItem } from '@/types/rewards.js'
import { NamespacedId } from '@/util/NamespacedId.js'

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

interface PopoverPos { top: number; left: number; anchorRight: number }

/** fixed ポップオーバー本体 — overflow を脱出して document.body に Portal する */
function Popover({
  pos, maxHeight = 240, onClose, children,
}: {
  pos: PopoverPos
  maxHeight?: number
  onClose: () => void
  children: React.ReactNode
}) {
  // ビューポート内に必ず収まるよう left・width を計算
  const vw = window.innerWidth
  const maxW = Math.min(280, vw - 16)
  // アンカー左端基準で配置し、右端がはみ出す場合は右端揃え
  const left = Math.min(pos.left, vw - maxW - 8)

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] bg-[#1e1f29] border border-gray-600 rounded shadow-2xl overflow-y-auto"
        style={{ top: pos.top, left, width: maxW, maxHeight }}
        data-testid="reward-popover"
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

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
  const [pos, setPos] = useState<PopoverPos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggle = useCallback(() => {
    if (pos) {
      setPos(null)
      return
    }
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, anchorRight: r.right })
    }
  }, [pos])

  const close = useCallback(() => setPos(null), [])

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-black/40 border border-gray-600 hover:border-gray-400 transition-colors"
        title={`${meta.label}の内訳を見る`}
      >
        <span>{meta.icon}</span>
        <span className="font-bold text-blue-300 tabular-nums">{total.toLocaleString()}</span>
        <span className="text-gray-400">{meta.unit}</span>
      </button>

      {pos && (
        <Popover pos={pos} onClose={close}>
          <div className="sticky top-0 bg-[#1e1f29] px-2 py-1 text-[11px] font-bold text-gray-400 border-b border-gray-700">
            {meta.icon} {meta.label}の内訳
          </div>
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => { close(); onSelectQuest?.(it.questId) }}
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
        </Popover>
      )}
    </>
  )
}

/** アイテムグリッド (インベントリ風) — クリックで内訳ポップオーバー */
function ItemGrid({
  items, onSelectQuest,
}: {
  items: RewardClaimItem[]
  onSelectQuest?: (questId: number) => void
}) {
  const [openState, setOpenState] = useState<{ key: string; pos: PopoverPos } | null>(null)

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
  const openEntry = openState ? byType.get(openState.key) : null

  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 mb-1">📦 アイテム</div>
      <div className="flex flex-wrap gap-1">
        {grouped.map(([itemType, { total, label }]) => (
          <button
            key={itemType}
            onClick={(e) => {
              if (openState?.key === itemType) {
                setOpenState(null)
                return
              }
              const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setOpenState({ key: itemType, pos: { top: r.bottom + 4, left: r.left, anchorRight: r.right } })
            }}
            className="relative flex items-center justify-center w-10 h-10 rounded bg-black/40 border border-gray-600 hover:border-gray-400 transition-colors"
            title={`${label} ×${total}`}
          >
            <ItemIcon type={NamespacedId.parseUserInput(itemType)} size={28} />
            {total > 1 && (
              <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-white tabular-nums leading-none drop-shadow">
                {total > 999 ? '999+' : total}
              </span>
            )}
          </button>
        ))}
      </div>

      {openState && openEntry && (
        <Popover
          pos={openState.pos}
          maxHeight={208}
          onClose={() => setOpenState(null)}
        >
          <div className="sticky top-0 bg-[#1e1f29] px-2 py-1 text-[11px] font-bold text-gray-400 border-b border-gray-700 flex items-center gap-1">
            <ItemIcon type={NamespacedId.parseUserInput(openState.key)} size={14} />
            {openEntry.label}
          </div>
          {openEntry.entries.map((it) => (
            <button
              key={it.id}
              onClick={() => { setOpenState(null); onSelectQuest?.(it.questId) }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/10 transition-colors"
            >
              <span className="flex-1 min-w-0 truncate text-xs text-gray-300">{it.questTitle}</span>
              <span className="shrink-0 text-xs font-bold text-blue-300 tabular-nums">×{it.amount}</span>
            </button>
          ))}
        </Popover>
      )}
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
