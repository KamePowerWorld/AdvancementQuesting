import { useInfiniteQuery } from '@tanstack/react-query'
import { statsApi } from '@/api/stats.js'
import { ItemIcon } from '@/components/editor/ItemIcon.js'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

const REWARD_ICON: Record<string, string> = {
  point: '⭐',
  experience: '✨',
  command: '⚙️',
}

export function ActivityWidget() {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['stats', 'activity'],
    queryFn: ({ pageParam }) => statsApi.activity(pageParam as number | undefined),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })

  const allItems = data?.pages.flatMap((p) => p.items) ?? []

  if (isLoading) return <div className="text-gray-400 text-xs text-center py-4">読み込み中...</div>
  if (allItems.length === 0) return <div className="text-gray-500 text-xs text-center py-4">データなし</div>

  return (
    <div className="flex flex-col gap-0">
      <ol className="space-y-2">
        {allItems.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <img
              src={`https://mc-heads.net/avatar/${item.playerName}/20`}
              alt={item.playerName}
              width={20}
              height={20}
              style={{ imageRendering: 'pixelated' }}
              className="rounded-sm shrink-0 mt-0.5"
              onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-gray-200 truncate">{item.playerName}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <ItemIcon type={item.questIcon} size={12} />
                <span className="text-xs text-gray-400 truncate">{item.questTitle}</span>
              </div>
              {item.rewards.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.rewards.map((r, i) => (
                    r.type === 'item' ? (
                      <span key={i} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-black/30 border border-gray-700 text-gray-300">
                        <ItemIcon type={r.itemType ?? 'stone'} size={10} />
                        {r.amount > 1 && <span>×{r.amount}</span>}
                      </span>
                    ) : (
                      <span key={i} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-black/30 border border-gray-700 text-gray-300">
                        <span>{REWARD_ICON[r.type] ?? '🎁'}</span>
                        <span>{r.amount > 1 ? `×${r.amount}` : ''}{r.label ?? ''}</span>
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-gray-500 shrink-0 mt-0.5">{relativeTime(item.completedAt)}</span>
          </li>
        ))}
      </ol>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 py-1 px-2 self-center transition-colors"
        >
          {isFetchingNextPage ? '読み込み中...' : 'もっと見る'}
        </button>
      )}
    </div>
  )
}
