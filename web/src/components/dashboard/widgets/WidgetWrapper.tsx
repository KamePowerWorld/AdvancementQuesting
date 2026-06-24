import type { ReactNode } from 'react'
import type { DashboardWidget } from '@/types/dashboard.js'
import { WIDGET_LABELS } from '@/types/dashboard.js'

interface Props {
  widget: DashboardWidget
  canEdit: boolean
  children: ReactNode
  onConfigOpen?: () => void
  onRemove?: () => void
}

export function WidgetWrapper({ widget, canEdit, children, onConfigOpen, onRemove }: Props) {
  const displayTitle = widget.customTitle || WIDGET_LABELS[widget.type]

  return (
    <div
      className="flex flex-col h-full rounded overflow-hidden border-2"
      style={{
        backgroundColor: '#1e1f29',
        borderColor: '#3B3B3B',
        borderTopColor: '#555',
        borderLeftColor: '#555',
        fontFamily: '"Courier New", Courier, monospace',
      }}
    >
      {/* ヘッダー — canEdit 時は drag-handle として機能 */}
      <div
        className={[
          'flex items-center justify-between px-2 py-1 shrink-0 border-b-2',
          canEdit ? 'drag-handle select-none' : '',
        ].join(' ')}
        style={{
          backgroundColor: '#2d2f3b',
          borderColor: '#3B3B3B',
          cursor: canEdit ? 'grab' : 'default',
        }}
      >
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-gray-200 truncate block">{displayTitle}</span>
        </div>
        {canEdit && (
          <div className="flex gap-1 shrink-0 ml-1">
            <button
              onClick={(e) => { e.stopPropagation(); onConfigOpen?.() }}
              title="ウィジェット設定"
              className="text-xs px-1 py-0.5 border border-gray-500 text-gray-300 hover:bg-white/10"
              style={{ cursor: 'default' }}
            >
              ⚙
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove?.() }}
              title="ウィジェットを削除"
              className="text-xs px-1 py-0.5 border border-gray-500 text-gray-300 hover:bg-red-900/40"
              style={{ cursor: 'default' }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
      {/* 説明文 */}
      {widget.description && (
        <div
          className="shrink-0 px-2 py-1 text-[10px] text-gray-400 border-b border-[#3B3B3B] whitespace-pre-line"
          style={{ backgroundColor: '#252630' }}
        >
          {widget.description}
        </div>
      )}
      {/* コンテンツ */}
      <div className="flex-1 overflow-auto p-2">
        {children}
      </div>
    </div>
  )
}
