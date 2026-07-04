import type { ViewAsTarget } from '@/hooks/useViewAs.js'
import { RecentActivityPanel } from '@/components/activity/RecentActivityPanel.js'
import { PlayerRewardsPanel } from '@/components/activity/PlayerRewardsPanel.js'
import type { EditorState } from '../hooks/useEditorState.js'

/** view-as 中の上部バナー (「◯◯の攻略を見ています」) */
export function ViewAsBanner({ viewAs, onExit }: { viewAs: ViewAsTarget; onExit: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#2a3a4a] border-b-2 border-[#4a9edd] text-sm text-[#cfe8ff] shrink-0 z-30">
      <img src={`https://mc-heads.net/avatar/${viewAs.playerName}/24`} alt={viewAs.playerName} width={24} height={24} style={{ imageRendering: 'pixelated' }} className="rounded-sm" />
      <span>👁 <span className="font-bold text-white">{viewAs.playerName}</span> の攻略を見ています</span>
      <button onClick={onExit} className="ml-auto text-xs px-3 py-1 border border-[#4a9edd] rounded-sm text-white hover:bg-[#4a9edd]/30 font-bold">自分に戻る</button>
    </div>
  )
}

/** view-as 中のアクティビティ / 獲得報酬タブパネル */
export function ViewAsPanel({ s, viewAs }: { s: EditorState; viewAs: ViewAsTarget }) {
  const onSelectQuest = (questId: number) => {
    if (s.nodes.some((n) => n.id === String(questId))) s.setEditingNodeId(String(questId))
  }
  const tabButton = (tab: 'activity' | 'rewards', label: string) => (
    <button
      onClick={() => {
        if (s.viewAsPanelCollapsed) { s.setViewAsPanelCollapsed(false); s.setViewAsTab(tab) }
        else if (s.viewAsTab === tab) { s.setViewAsPanelCollapsed((c) => !c) }
        else { s.setViewAsTab(tab) }
      }}
      className={`flex-1 px-2 py-1.5 transition-colors ${s.viewAsTab === tab && !s.viewAsPanelCollapsed ? 'bg-blue-600 text-white' : 'bg-black/30 text-gray-300 hover:bg-white/5'}`}
    >{label}</button>
  )
  return (
    <div data-testid="viewas-panel" className={['absolute z-30 flex flex-col bg-[#2d2f3b] border-2 border-[#1e1f29] shadow-2xl text-white transition-all duration-200', 'md:top-3 md:right-3 md:w-64 md:max-h-[70%] md:rounded-md md:p-3', 'max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:rounded-t-lg max-md:border-x-0 max-md:border-b-0', s.viewAsPanelCollapsed ? 'max-md:h-auto' : 'max-md:h-[55%]'].join(' ')}>
      <div className="flex shrink-0 rounded-sm md:mb-2 border border-gray-600 overflow-hidden text-xs font-bold">
        {tabButton('activity', 'アクティビティ')}
        {tabButton('rewards', '獲得報酬')}
      </div>
      {!s.viewAsPanelCollapsed && (
        <div className="flex-1 overflow-y-auto min-h-0 md:mt-0 mt-1 px-3 pb-3 md:px-0 md:pb-0">
          {s.viewAsTab === 'activity' ? (
            <RecentActivityPanel playerUuid={viewAs.playerUuid} onSelectQuest={onSelectQuest} />
          ) : (
            <PlayerRewardsPanel playerUuid={viewAs.playerUuid} onSelectQuest={onSelectQuest} />
          )}
        </div>
      )}
    </div>
  )
}
