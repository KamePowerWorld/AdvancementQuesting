import type { WidgetType } from '@/types/dashboard.js'
import { WIDGET_LABELS } from '@/types/dashboard.js'

const WIDGET_TYPES: WidgetType[] = ['leaderboard', 'timeseries', 'rewards', 'quests', 'activity', 'allrewards']

interface Props {
  onAdd: (type: WidgetType) => void
}

export function AddWidgetBar({ onAdd }: Props) {
  return (
    <div
      className="shrink-0 flex flex-wrap gap-1 px-3 py-2 border-b-2 border-[#3B3B3B]"
      style={{ backgroundColor: '#2d2f3b', fontFamily: '"Courier New", Courier, monospace' }}
    >
      <span className="text-xs text-gray-400 self-center mr-1">+ ウィジェット追加:</span>
      {WIDGET_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => onAdd(type)}
          className="text-xs px-2 py-0.5 border"
          style={{
            color: '#2a1f0e',
            backgroundColor: '#C6C6C6',
            borderTopColor: 'white',
            borderLeftColor: 'white',
            borderBottomColor: '#555',
            borderRightColor: '#555',
          }}
        >
          {WIDGET_LABELS[type]}
        </button>
      ))}
    </div>
  )
}
