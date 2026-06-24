import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/api/stats.js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { RewardsConfig } from '@/types/dashboard.js'

const REWARD_COLORS: Record<string, string> = {
  point: '#EDE09B',
  item: '#7BC67B',
  experience: '#7B9BC6',
  command: '#C67B7B',
}

interface Props {
  config: RewardsConfig
}

export function RewardsWidget({ config }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'rewards', config.limit],
    queryFn: () => statsApi.rewards(config.limit),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <div className="text-gray-400 text-xs text-center py-4">読み込み中...</div>
  if (!data || data.length === 0) return <div className="text-gray-500 text-xs text-center py-4">データなし</div>

  const chartData = data.map((r) => ({
    name: r.rewardLabel ?? r.rewardType,
    value: r.totalAmount,
    type: r.rewardType,
  }))

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs text-gray-400 mb-1">全員の獲得報酬合計</div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 8, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#888', fontSize: 9 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#ccc', fontSize: 9 }} width={70} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e1f29', border: '1px solid #3B3B3B', fontSize: '11px', color: '#ccc' }}
            />
            <Bar dataKey="value" name="合計" radius={[0, 2, 2, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={REWARD_COLORS[entry.type] ?? '#9B9B9B'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
