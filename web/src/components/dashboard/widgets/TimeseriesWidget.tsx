import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/api/stats.js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { TimeseriesConfig } from '@/types/dashboard.js'

interface Props {
  config: TimeseriesConfig
}

export function TimeseriesWidget({ config }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'timeseries', config.metric, config.days],
    queryFn: () => statsApi.timeseries(config.metric, config.days),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <div className="text-gray-400 text-xs text-center py-4">読み込み中...</div>
  if (!data || data.data.length === 0) return <div className="text-gray-500 text-xs text-center py-4">データなし</div>

  const metricLabel = config.metric === 'points' ? 'ポイント' : '達成数'
  const color = config.metric === 'points' ? '#EDE09B' : '#7BC67B'

  const chartData = data.data.map((p) => ({
    date: p.date.slice(5),
    value: p.value,
  }))

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs text-gray-400 mb-1">過去 {config.days} 日間の {metricLabel}</div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#888', fontSize: 9 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e1f29', border: '1px solid #3B3B3B', fontSize: '11px', color: '#ccc' }}
              labelStyle={{ color: '#ccc' }}
            />
            <Bar dataKey="value" fill={color} name={metricLabel} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
