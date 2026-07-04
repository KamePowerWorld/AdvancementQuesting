import { createPortal } from 'react-dom'
import { TASK_TYPES } from '@/components/editor/constants.js'
import { getDisplayText } from '@/components/editor/utils.js'
import type { EditorNode, Vec2 } from '@/components/editor/types.js'
import { NodeRewardChip } from './NodeRewardChip.js'

type McLang = { ja: Record<string, string>; en: Record<string, string> } | undefined

/** ホバーツールチップと長押しポップオーバーで共通の本文 (タイトル/タスク/報酬) */
function NodeInfoContent({ node, lang, chipTestId }: { node: EditorNode; lang: McLang; chipTestId?: string }) {
  return (
    <>
      <div className="font-bold text-blue-300 text-lg mb-1">{node.title}</div>
      {node.subtitle && <div className="text-gray-400 text-xs italic mb-2">{node.subtitle}</div>}
      <div className="text-sm space-y-1">
        {node.tasks?.map((task) => (<div key={task.id} className="text-gray-300 flex items-center gap-1"><span className="text-gray-500">{TASK_TYPES.find((t) => t.id === task.type)?.icon ?? '•'}</span>{getDisplayText(task, 'task', lang)}</div>))}
        {(!node.tasks || node.tasks.length === 0) && <div className="text-gray-500 text-xs">タスクがありません</div>}
      </div>
      {node.rewards && node.rewards.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="text-[11px] text-gray-500 mb-1.5">🎁 報酬</div>
          <div className="flex flex-wrap gap-1.5" data-testid={chipTestId}>
            {node.rewards.map((r) => <NodeRewardChip key={r.id} reward={r} />)}
          </div>
        </div>
      )}
    </>
  )
}

interface NodeHoverTooltipProps {
  node: EditorNode
  mousePos: Vec2
  pan: Vec2
  canvasEl: HTMLDivElement | null
  lang: McLang
}

/** PC ホバー時のノード情報ツールチップ */
export function NodeHoverTooltip({ node, mousePos, pan, canvasEl, lang }: NodeHoverTooltipProps) {
  return (
    <div className="absolute z-30 bg-black/90 border-2 border-purple-700 text-white p-3 pointer-events-none shadow-xl max-w-xs hidden sm:block"
      style={{ left: Math.min(mousePos.x + pan.x + 20, (canvasEl?.offsetWidth ?? 0) - 200), top: Math.min(mousePos.y + pan.y + 20, (canvasEl?.offsetHeight ?? 0) - 100) }}>
      <NodeInfoContent node={node} lang={lang} chipTestId="hover-reward-chips" />
    </div>
  )
}

interface LongPressPopoverProps {
  popover: { node: EditorNode; x: number; y: number }
  onClose: () => void
  lang: McLang
}

/** モバイル長押し時のノード情報ポップオーバー (portal) */
export function LongPressPopover({ popover, onClose, lang }: LongPressPopoverProps) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} onTouchStart={onClose} />
      <div className="fixed z-[9999] bg-black/90 border-2 border-purple-700 text-white p-3 shadow-xl max-w-[280px]"
        style={{ bottom: window.innerHeight - popover.y + 12, left: Math.max(8, Math.min(popover.x - 140, window.innerWidth - 296)) }}
        data-testid="longtap-reward-popover">
        <NodeInfoContent node={popover.node} lang={lang} />
      </div>
    </>,
    document.body,
  )
}
