import { useQuery } from '@tanstack/react-query'
import { rewardsApi } from '@/api/rewards.js'
import type { RewardType } from '@/types/rewards.js'

interface Props {
  playerUuid: string
  /** 明細行クリック (取得元クエストへ) */
  onSelectQuest?: (questId: number) => void
}

const TYPE_META: Record<RewardType, { icon: string; label: string; unit: string }> = {
  point:      { icon: '🪙', label: 'ポイント', unit: 'pt' },
  experience: { icon: '✨', label: '経験値',   unit: 'exp' },
  item:       { icon: '📦', label: 'アイテム', unit: '個' },
  command:    { icon: '⚙️', label: 'コマンド', unit: '回' },
}

const TYPE_ORDER: RewardType[] = ['point', 'experience', 'item', 'command']

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

  return (
    <div className="flex flex-col gap-3">
      {/* type別合計 (トータル獲得報酬) */}
      <div className="flex flex-wrap gap-1.5">
        {TYPE_ORDER.filter((t) => (data.totalsByType[t] ?? 0) > 0).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-sm bg-black/40 border border-gray-700"
            title={TYPE_META[t].label}
          >
            <span>{TYPE_META[t].icon}</span>
            <span className="font-bold text-blue-300 tabular-nums">{data.totalsByType[t]!.toLocaleString()}</span>
            <span className="text-gray-400">{TYPE_META[t].unit}</span>
          </span>
        ))}
      </div>

      {/* 明細 (報酬→クエスト導線) */}
      <div className="flex flex-col gap-1">
        {data.items.map((it) => {
          const meta = TYPE_META[it.rewardType]
          return (
            <button
              key={it.id}
              onClick={() => onSelectQuest?.(it.questId)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-black/20 border border-transparent hover:bg-white/10 hover:border-gray-500 text-left transition-colors"
            >
              <span className="shrink-0">{meta?.icon ?? '🎁'}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-gray-100">
                {it.rewardLabel || meta?.label || it.rewardType}
                <span className="text-[11px] text-gray-500 ml-1">／ {it.questTitle}</span>
              </span>
              <span className="shrink-0 text-xs font-bold text-blue-300 tabular-nums">
                {it.amount.toLocaleString()}<span className="text-gray-400 font-normal">{meta?.unit ?? ''}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
