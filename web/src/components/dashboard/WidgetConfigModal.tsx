import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { DashboardWidget, WidgetType } from '@/types/dashboard.js'

export interface WidgetConfigSavePayload {
  config: Record<string, unknown>
  customTitle?: string
  description?: string
}

interface Props {
  widget: DashboardWidget
  onSave: (payload: WidgetConfigSavePayload) => void
  onClose: () => void
}

function ConfigForm({ type, config, onChange }: { type: WidgetType; config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const num = (k: string) => Number(config[k] ?? 0)
  const str = (k: string) => String(config[k] ?? '')

  const inputCls = 'bg-[#1e1f29] border border-[#3B3B3B] text-gray-200 text-xs px-2 py-1 w-full'
  const selectCls = 'bg-[#1e1f29] border border-[#3B3B3B] text-gray-200 text-xs px-2 py-1 w-full'
  const labelCls = 'text-xs text-gray-400 mb-1 block'

  if (type === 'leaderboard') return (
    <>
      <label className={labelCls}>指標</label>
      <select className={selectCls} value={str('metric')} onChange={(e) => onChange('metric', e.target.value)}>
        <option value="points">ポイント合計</option>
        <option value="completions">クエスト完了数</option>
        <option value="scoreboard">スコアボード</option>
      </select>
      {str('metric') === 'scoreboard' && (
        <>
          <label className={labelCls + ' mt-3'}>スコアボードオブジェクティブ名</label>
          <input
            type="text"
            className={inputCls}
            placeholder="例: kills"
            value={str('scoreboardObjective')}
            onChange={(e) => onChange('scoreboardObjective', e.target.value)}
          />
        </>
      )}
      <label className={labelCls + ' mt-3'}>表示人数</label>
      <input type="number" className={inputCls} min={1} max={50} value={num('limit')} onChange={(e) => onChange('limit', Number(e.target.value))} />
    </>
  )

  if (type === 'timeseries') return (
    <>
      <label className={labelCls}>指標</label>
      <select className={selectCls} value={str('metric')} onChange={(e) => onChange('metric', e.target.value)}>
        <option value="completions">達成クエスト数</option>
        <option value="points">獲得ポイント</option>
      </select>
      <label className={labelCls + ' mt-3'}>期間（日数）</label>
      <select className={selectCls} value={num('days')} onChange={(e) => onChange('days', Number(e.target.value))}>
        <option value={7}>7日</option>
        <option value={14}>14日</option>
        <option value={30}>30日</option>
        <option value={90}>90日</option>
      </select>
    </>
  )

  if (type === 'rewards') return (
    <>
      <label className={labelCls}>表示件数</label>
      <input type="number" className={inputCls} min={1} max={50} value={num('limit')} onChange={(e) => onChange('limit', Number(e.target.value))} />
    </>
  )

  if (type === 'quests') return (
    <>
      <label className={labelCls}>ソート</label>
      <select className={selectCls} value={str('sort')} onChange={(e) => onChange('sort', e.target.value)}>
        <option value="popular">人気順（多い順）</option>
        <option value="hardest">難関順（少ない順）</option>
      </select>
      <label className={labelCls + ' mt-3'}>表示件数</label>
      <input type="number" className={inputCls} min={1} max={30} value={num('limit')} onChange={(e) => onChange('limit', Number(e.target.value))} />
    </>
  )

  if (type === 'activity' || type === 'allrewards') return (
    <div className="text-xs text-gray-500 italic">設定項目はありません</div>
  )

  return null
}

export function WidgetConfigModal({ widget, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...widget.config })
  const [customTitle, setCustomTitle] = useState(widget.customTitle ?? '')
  const [description, setDescription] = useState(widget.description ?? '')

  function handleChange(k: string, v: unknown) {
    setDraft((prev) => ({ ...prev, [k]: v }))
  }

  const inputCls = 'bg-[#1e1f29] border border-[#3B3B3B] text-gray-200 text-xs px-2 py-1 w-full'
  const labelCls = 'text-xs text-gray-400 mb-1 block'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-80 border-2 overflow-hidden"
        style={{
          backgroundColor: '#2d2f3b',
          borderTopColor: '#555',
          borderLeftColor: '#555',
          borderBottomColor: '#1e1f29',
          borderRightColor: '#1e1f29',
          fontFamily: '"Courier New", Courier, monospace',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#3B3B3B]">
          <span className="text-xs font-bold text-gray-200">ウィジェット設定</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xs">✕</button>
        </div>
        {/* フォーム */}
        <div className="p-4 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {/* 共通フィールド */}
          <div>
            <label className={labelCls}>タイトル（任意）</label>
            <input
              type="text"
              className={inputCls}
              placeholder="空欄時はデフォルト名を表示"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>説明文（複数行可）</label>
            <textarea
              className={inputCls + ' resize-none'}
              rows={3}
              placeholder="ウィジェット上部に表示されます"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {/* タイプ別フィールド */}
          <div className="border-t border-[#3B3B3B] pt-3">
            <ConfigForm type={widget.type} config={draft} onChange={handleChange} />
          </div>
        </div>
        {/* フッター */}
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1 border border-gray-600 text-gray-300 hover:bg-white/5"
          >
            キャンセル
          </button>
          <button
            onClick={() => {
              onSave({
                config: draft,
                customTitle: customTitle || undefined,
                description: description || undefined,
              })
              onClose()
            }}
            className="text-xs px-3 py-1 border text-white font-bold"
            style={{ backgroundColor: '#3B7B3B', borderColor: '#7BC67B' }}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
