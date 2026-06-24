import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/api/stats.js'
import type { LeaderboardConfig } from '@/types/dashboard.js'

const MEDALS = ['🥇', '🥈', '🥉']

interface Props {
  config: LeaderboardConfig
}

export function LeaderboardWidget({ config }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'leaderboard', config.metric, config.limit, config.scoreboardObjective],
    queryFn: () => statsApi.leaderboard(config.metric, config.limit, config.scoreboardObjective),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <div className="text-gray-400 text-xs text-center py-4">読み込み中...</div>
  if (!data || data.entries.length === 0) {
    return (
      <div className="text-gray-500 text-xs text-center py-4">
        {config.metric === 'scoreboard' && !config.scoreboardObjective
          ? 'スコアボードオブジェクティブ名を設定してください'
          : 'データなし'}
      </div>
    )
  }

  const metricLabel = config.metric === 'points' ? 'pt' : config.metric === 'completions' ? '回' : 'pt'

  return (
    <ol className="space-y-1">
      {data.entries.map((e) => (
        <li key={e.playerUuid} className="flex items-center gap-2">
          <span className="w-5 text-center text-xs shrink-0">
            {MEDALS[e.rank - 1] ?? <span className="text-gray-400">{e.rank}</span>}
          </span>
          <img
            src={`https://mc-heads.net/avatar/${e.playerName}/20`}
            alt={e.playerName}
            width={20}
            height={20}
            style={{ imageRendering: 'pixelated' }}
            className="rounded-sm shrink-0"
            onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-xs text-gray-200 flex-1 truncate">{e.playerName}</span>
          <span className="text-xs font-bold text-yellow-400 shrink-0">{e.value.toLocaleString()} {metricLabel}</span>
        </li>
      ))}
    </ol>
  )
}
