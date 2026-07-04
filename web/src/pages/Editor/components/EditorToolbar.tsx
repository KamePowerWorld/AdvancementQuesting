import { MousePointer2, Move, Plus, ArrowRight, Trash2, MessageSquare, BarChart2, User, Settings, List } from 'lucide-react'
import type { ToolMode } from '@/components/editor/types.js'
import { ToolButton } from '@/components/editor/ToolButton.js'
import type { PlayerSession } from '@/types/auth.js'
import type { EditorState } from '../hooks/useEditorState.js'

interface EditorToolbarProps {
  s: EditorState
  changeMode: (next: ToolMode) => void
  showMove: boolean
  showAddNode: boolean
  showAddLink: boolean
  showDelete: boolean
  showAddComment: boolean
  showSettings: boolean
  me: PlayerSession | undefined
  onLogout: () => void
}

/** 左端の縦ツールバー (モード切替 / 統計 / ログイン・ログアウト) */
export function EditorToolbar({ s, changeMode, showMove, showAddNode, showAddLink, showDelete, showAddComment, showSettings, me, onLogout }: EditorToolbarProps) {
  return (
    <div className="w-16 bg-[#8B8B8B] border-r-4 border-black p-2 flex flex-col items-center shrink-0 z-20 shadow-[inset_-2px_0_0_rgba(0,0,0,0.2)]">
      <ToolButton icon={MousePointer2} active={s.mode === 'select'} onClick={() => changeMode('select')} tooltip="選択" />
      {showMove       && <ToolButton icon={Move}         active={s.mode === 'move'}        onClick={() => changeMode('move')}        tooltip="移動" />}
      {showAddNode    && <ToolButton icon={Plus}         active={s.mode === 'add_node'}    onClick={() => changeMode('add_node')}    tooltip="クエストを追加" />}
      {showAddLink    && <ToolButton icon={ArrowRight}   active={s.mode === 'add_link'}    onClick={() => changeMode('add_link')}    tooltip="依存関係を追加" />}
      {showDelete     && <ToolButton icon={Trash2}       active={s.mode === 'delete'}      onClick={() => changeMode('delete')}      tooltip="削除" />}
      {showAddComment && <ToolButton icon={MessageSquare} active={s.mode === 'add_comment'} onClick={() => changeMode('add_comment')} tooltip="コメントを追加" />}
      <div className="flex-grow" />
      {false          && <ToolButton icon={List}    active={s.showRewardTableModal} onClick={() => s.setShowRewardTableModal(true)} tooltip="報酬テーブル" />}
      {showSettings   && <ToolButton icon={Settings} active={false} onClick={() => {}} tooltip="設定" />}
      <ToolButton icon={BarChart2} active={s.showStats} onClick={() => s.setShowStats((v) => !v)} tooltip="統計ダッシュボード" />
      {me ? (
        <button onClick={onLogout} title={`${me.playerName} — クリックでログアウト`} className="mt-1 w-10 h-10 flex items-center justify-center border-2 relative overflow-hidden" style={{ backgroundColor: '#6B6B6B', borderTopColor: '#9B9B9B', borderLeftColor: '#9B9B9B', borderBottomColor: '#3B3B3B', borderRightColor: '#3B3B3B', padding: 0 }}>
          <img src={`https://mc-heads.net/avatar/${me.playerName}/40`} alt={me.playerName} width={40} height={40} style={{ imageRendering: 'pixelated', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        </button>
      ) : (
        <button onClick={() => s.setShowLoginModal(true)} title="ログイン" className="mt-1 w-10 h-10 flex items-center justify-center border-2" style={{ backgroundColor: '#6B6B6B', borderTopColor: '#9B9B9B', borderLeftColor: '#9B9B9B', borderBottomColor: '#3B3B3B', borderRightColor: '#3B3B3B' }}>
          <User size={18} style={{ color: '#d8cbb0' }} />
        </button>
      )}
    </div>
  )
}
