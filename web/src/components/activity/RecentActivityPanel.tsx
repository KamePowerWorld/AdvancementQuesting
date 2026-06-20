import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { activityApi } from '@/api/activity.js'
import type { ActivityItem } from '@/types/activity.js'

interface Props {
  playerUuid: string
  /** アクティビティ行クリック (クエストモーダルを開く等) */
  onSelectQuest?: (questId: number) => void
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}日前`
  const mo = d.getMonth() + 1
  return `${mo}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 最近のアクティビティ (個人タイムライン)。
 * 下端までスクロールすると次ページを追加読み込みする無限スクロール。
 */
export function RecentActivityPanel({ playerUuid, onSelectQuest }: Props) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['activity', playerUuid],
    queryFn: ({ pageParam }) => activityApi.get(playerUuid, { limit: 20, before: pageParam }),
    initialPageParam: 0 as number,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // 番兵が見えたら次ページ取得
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const ob = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    }, { rootMargin: '80px' })
    ob.observe(el)
    return () => ob.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const items: ActivityItem[] = data?.pages.flatMap((p) => p.items) ?? []

  if (isLoading) {
    return <div className="text-center text-sm text-gray-500 py-6">読み込み中...</div>
  }
  if (isError) {
    return <div className="text-center text-sm text-gray-500 py-6">アクティビティを取得できませんでした</div>
  }
  if (items.length === 0) {
    return <div className="text-center text-sm text-gray-500 py-6 border border-dashed border-gray-700 rounded-sm">まだクリア記録がありません</div>
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onSelectQuest?.(it.questId)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-black/20 border border-transparent hover:bg-white/10 hover:border-gray-500 text-left transition-colors"
        >
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-100">{it.questTitle}</span>
          <span className="shrink-0 text-[11px] text-gray-500 tabular-nums">{formatRelative(it.completedAt)}</span>
        </button>
      ))}
      {/* 無限スクロール番兵 */}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && <div className="text-center text-xs text-gray-500 py-2">読み込み中...</div>}
      {!hasNextPage && <div className="text-center text-[11px] text-gray-600 py-2">これ以上ありません</div>}
    </div>
  )
}
