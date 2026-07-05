import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/api/stats.js'
import { ItemIcon } from '@/components/editor/ItemIcon.js'
import { useViewAsContext } from '@/contexts/ViewAsContext.js'
import type { AllRewardsEntry } from '@/types/stats.js'
import { NamespacedId } from '@/util/NamespacedId.js'

interface PopoverPos { top: number; left: number }

function Popover({ pos, onClose, children }: { pos: PopoverPos; onClose: () => void; children: React.ReactNode }) {
  const vw = window.innerWidth
  const maxW = Math.min(300, vw - 16)
  const left = Math.min(pos.left, vw - maxW - 8)
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] bg-[#1e1f29] border border-gray-600 rounded shadow-2xl overflow-y-auto"
        style={{ top: pos.top, left, width: maxW, maxHeight: 300 }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

function RewardDetailPopover({
  entry, pos, onClose,
}: {
  entry: AllRewardsEntry
  pos: PopoverPos
  onClose: () => void
}) {
  const { setViewAs } = useViewAsContext()
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'all-rewards-detail', entry.rewardType, entry.itemType],
    queryFn: () => statsApi.allRewardsDetail(entry.rewardType, entry.itemType),
  })

  return (
    <Popover pos={pos} onClose={onClose}>
      <div className="sticky top-0 bg-[#1e1f29] px-2 py-1 text-[11px] font-bold text-gray-400 border-b border-gray-700 flex items-center gap-1">
        {entry.rewardType === 'item' && entry.itemType && <ItemIcon type={NamespacedId.parseUserInput(entry.itemType)} size={14} />}
        {entry.rewardLabel ?? entry.itemType ?? entry.rewardType}
        <span className="ml-auto font-normal text-gray-500">合計 {entry.totalAmount.toLocaleString()}</span>
      </div>
      {isLoading && <div className="text-xs text-gray-500 text-center py-3">読み込み中...</div>}
      {data && (
        <>
          {/* プレイヤー顔アイコン一覧 */}
          {data.players.length > 0 && (
            <div className="p-2 border-b border-gray-800">
              <div className="text-[10px] text-gray-500 mb-1">受け取ったプレイヤー</div>
              <div className="flex flex-wrap gap-1">
                {data.players.map((p) => (
                  <button
                    key={p.playerUuid}
                    onClick={() => { setViewAs({ playerUuid: p.playerUuid, playerName: p.playerName }); onClose() }}
                    title={`${p.playerName} (×${p.totalAmount.toLocaleString()})`}
                    className="relative group"
                  >
                    <img
                      src={`https://mc-heads.net/avatar/${p.playerName}/24`}
                      alt={p.playerName}
                      width={24}
                      height={24}
                      style={{ imageRendering: 'pixelated' }}
                      className="rounded-sm border border-gray-700 hover:border-blue-400 transition-colors"
                      onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* クエスト別内訳 */}
          {data.quests.length > 0 && (
            <div>
              <div className="px-2 pt-1.5 pb-0.5 text-[10px] text-gray-500">クエスト別内訳</div>
              {data.quests.map((q) => (
                <div key={q.questId} className="flex items-center gap-2 px-2 py-1 hover:bg-white/5">
                  <span className="flex-1 min-w-0 truncate text-xs text-gray-300">{q.questTitle}</span>
                  <span className="shrink-0 text-xs font-bold text-blue-300 tabular-nums">×{q.totalAmount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Popover>
  )
}

function ScalarRow({ entry }: { entry: AllRewardsEntry }) {
  const [popover, setPopover] = useState<PopoverPos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const icon = entry.rewardType === 'point' ? '⭐' : entry.rewardType === 'experience' ? '✨' : '⚙️'
  const label = entry.rewardLabel ?? (entry.rewardType === 'point' ? 'ポイント' : entry.rewardType === 'experience' ? '経験値' : entry.rewardType)

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          if (popover) { setPopover(null); return }
          if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect()
            setPopover({ top: r.bottom + 4, left: r.left })
          }
        }}
        className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-white/5 text-left"
      >
        <span className="text-sm">{icon}</span>
        <span className="flex-1 min-w-0 truncate text-xs text-gray-300">{label}</span>
        <span className="shrink-0 text-xs font-bold text-blue-300 tabular-nums">{entry.totalAmount.toLocaleString()}</span>
      </button>
      {popover && (
        <RewardDetailPopover entry={entry} pos={popover} onClose={() => setPopover(null)} />
      )}
    </>
  )
}

function ItemGridSection({ entries }: { entries: AllRewardsEntry[] }) {
  const [popover, setPopover] = useState<{ entry: AllRewardsEntry; pos: PopoverPos } | null>(null)
  const closePopover = useCallback(() => setPopover(null), [])

  if (entries.length === 0) return null

  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 px-2 py-1">📦 アイテム</div>
      <div className="flex flex-wrap gap-1 px-2 pb-2">
        {entries.map((entry) => (
          <button
            key={entry.itemType ?? '__none__'}
            onClick={(e) => {
              if (popover?.entry.itemType === entry.itemType) { setPopover(null); return }
              const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setPopover({ entry, pos: { top: r.bottom + 4, left: r.left } })
            }}
            title={`${entry.rewardLabel ?? entry.itemType ?? 'アイテム'} ×${entry.totalAmount.toLocaleString()}`}
            className="relative flex items-center justify-center w-10 h-10 rounded bg-black/40 border border-gray-600 hover:border-gray-400 transition-colors"
          >
            <ItemIcon type={NamespacedId.parseUserInput(entry.itemType ?? 'minecraft:stone')} size={28} />
            {entry.totalAmount > 1 && (
              <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-white tabular-nums leading-none drop-shadow">
                {entry.totalAmount > 999 ? '999+' : entry.totalAmount}
              </span>
            )}
          </button>
        ))}
      </div>
      {popover && (
        <RewardDetailPopover entry={popover.entry} pos={popover.pos} onClose={closePopover} />
      )}
    </div>
  )
}

export function AllRewardsWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats', 'all-rewards'],
    queryFn: statsApi.allRewards,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <div className="text-gray-400 text-xs text-center py-4">読み込み中...</div>
  if (isError || !data) return <div className="text-gray-500 text-xs text-center py-4">取得失敗</div>
  if (data.length === 0) return <div className="text-gray-500 text-xs text-center py-4">データなし</div>

  const scalars = data.filter((e) => e.rewardType !== 'item')
  const items = data.filter((e) => e.rewardType === 'item')

  return (
    <div className="flex flex-col">
      {scalars.map((e) => (
        <ScalarRow key={`${e.rewardType}:${e.rewardLabel}`} entry={e} />
      ))}
      <ItemGridSection entries={items} />
    </div>
  )
}
