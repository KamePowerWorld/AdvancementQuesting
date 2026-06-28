import type { EditorNode } from '../../types.js'
import { nextFire, formatRevivePreview } from '../../CronParser.js'

interface QuestRepeatEditorProps {
  node: EditorNode
  updateNode: (node: EditorNode) => void
}

export function QuestRepeatEditor({ node, updateNode }: QuestRepeatEditorProps) {
  const updateRepeat = (patch: Partial<NonNullable<EditorNode['repeat']>>) => {
    const cur = node.repeat ?? { type: 'none' as const }
    updateNode({ ...node, repeat: { ...cur, ...patch } })
  }

  const repeatForEdit = node.repeat ?? { type: 'none' as const }
  const cooldownTotalHours = repeatForEdit.cooldownHours ?? 24
  const cooldownH = Math.floor(cooldownTotalHours)
  const cooldownM = Math.round((cooldownTotalHours - cooldownH) * 60)
  const setCooldown = (h: number, m: number) => {
    const total = Math.max(0, h) + Math.max(0, Math.min(59, m)) / 60
    updateRepeat({ cooldownHours: total })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">繰り返し</div>
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'none', label: 'なし' },
          { id: 'cooldown', label: 'クールダウン' },
          { id: 'schedule', label: '時刻指定' },
          { id: 'unlimited', label: '無制限' },
        ] as const).map((opt) => (
          <button
            key={opt.id}
            onClick={() => updateRepeat({ type: opt.id })}
            className={`text-xs px-3 py-1.5 border rounded-sm font-bold ${repeatForEdit.type === opt.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-black/30 border-gray-600 text-gray-300 hover:bg-white/5'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {repeatForEdit.type === 'cooldown' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-gray-300 flex-wrap">
            <span>復活までの時間</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={cooldownH}
              onChange={(e) => setCooldown(parseInt(e.target.value || '0', 10), cooldownM)}
              className="w-16 bg-black/30 border border-gray-600 px-2 py-1 rounded-sm outline-none focus:border-blue-500"
            />
            <span>時間</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              step={1}
              value={cooldownM}
              onChange={(e) => setCooldown(cooldownH, parseInt(e.target.value || '0', 10))}
              className="w-16 bg-black/30 border border-gray-600 px-2 py-1 rounded-sm outline-none focus:border-blue-500"
            />
            <span>分</span>
          </div>
          {cooldownTotalHours > 0 && (() => {
            const next = new Date(Date.now() + cooldownTotalHours * 3600000)
            return <div className="text-xs text-gray-500">今達成したら: {formatRevivePreview(next)}</div>
          })()}
        </div>
      )}
      {repeatForEdit.type === 'schedule' && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span>cron式</span>
            <input
              type="text"
              value={repeatForEdit.cron ?? '0 0 * * *'}
              onChange={(e) => updateRepeat({ cron: e.target.value })}
              placeholder="分 時 日 月 曜日"
              className="flex-1 bg-black/30 border border-gray-600 px-2 py-1 rounded-sm outline-none focus:border-blue-500 font-mono"
            />
          </label>
          <div className="flex gap-1 flex-wrap">
            {([
              { label: '毎時00分', cron: '0 * * * *' },
              { label: '毎日0時', cron: '0 0 * * *' },
              { label: '毎週月曜0時', cron: '0 0 * * 1' },
              { label: '毎月1日0時', cron: '0 0 1 * *' },
            ] as const).map((p) => (
              <button
                key={p.cron}
                onClick={() => updateRepeat({ cron: p.cron })}
                className="text-[10px] px-2 py-0.5 border border-gray-600 rounded-sm text-gray-400 hover:bg-white/5"
              >
                {p.label}
              </button>
            ))}
          </div>
          {repeatForEdit.cron && (() => {
            const next = nextFire(repeatForEdit.cron)
            return (
              <div className="text-xs text-gray-500">
                {next ? `次の復活: ${formatRevivePreview(next)}` : '⚠ cron式が無効です'}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
