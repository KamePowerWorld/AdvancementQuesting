import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/api/stats.js'
import { ItemIcon } from '@/components/editor/ItemIcon.js'
import type { QuestsConfig } from '@/types/dashboard.js'
import { NamespacedId } from '@/util/NamespacedId.js'

interface Props {
  config: QuestsConfig
}

export function QuestsWidget({ config }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'quests', config.sort, config.limit],
    queryFn: () => statsApi.quests(config.sort, config.limit),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <div className="text-gray-400 text-xs text-center py-4">読み込み中...</div>
  if (!data || data.length === 0) return <div className="text-gray-500 text-xs text-center py-4">データなし</div>

  const label = config.sort === 'hardest' ? '難関クエスト' : '人気クエスト'

  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-400 mb-2">{label} TOP{config.limit}</div>
      {data.map((q, i) => (
        <div key={q.questId} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-4 shrink-0">{i + 1}</span>
          <ItemIcon type={NamespacedId.parseUserInput(q.questIcon)} size={16} />
          <span className="text-xs text-gray-200 flex-1 truncate">{q.questTitle}</span>
          <span className="text-xs text-gray-400 shrink-0">{q.uniquePlayers}人</span>
        </div>
      ))}
    </div>
  )
}
