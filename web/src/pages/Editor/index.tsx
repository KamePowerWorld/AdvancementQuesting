import { useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { MousePointer2, Move, Plus, ArrowRight, Trash2, MessageSquare, BarChart2, User, Settings, List } from 'lucide-react'
import type { ToolMode } from '@/components/editor/types.js'
import { INITIAL_NODES, INITIAL_EDGES, TASK_TYPES } from '@/components/editor/constants.js'
import { ToolButton } from '@/components/editor/ToolButton.js'
import { EdgePattern } from '@/components/editor/EdgePattern.js'
import { getDisplayText } from '@/components/editor/utils.js'
import { QuestEditorModal } from '@/components/editor/modals/QuestEditorModal/index.js'
import { TaskRewardEditorModal } from '@/components/editor/modals/TaskRewardEditorModal/index.js'
import { ItemSelectorModal } from '@/components/editor/modals/ItemSelectorModal.js'
import { RewardTableModal } from '@/components/editor/modals/RewardTableModal.js'
import { LoginModal } from '@/components/LoginModal.js'
import { useAuth } from '@/contexts/AuthContext.js'
import { ViewAsContext } from '@/contexts/ViewAsContext.js'
import { useViewAs } from '@/hooks/useViewAs.js'
import { RecentActivityPanel } from '@/components/activity/RecentActivityPanel.js'
import { PlayerRewardsPanel } from '@/components/activity/PlayerRewardsPanel.js'
import { useEditor } from '@/contexts/EditorContext.js'
import { questsApi } from '@/api/quests.js'
import { authApi } from '@/api/auth.js'
import { commentsApi } from '@/api/comments.js'
import { progressApi } from '@/api/progress.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMcLang } from '@/hooks/useMcData.js'
import { useClaimReward, useCompleteCheckmark, useDeliverItems, useToggleQuestStatus } from '@/hooks/mutations.js'
import { CommentBlockEl, COMMENT_COLORS } from '@/components/editor/CommentBlockEl.js'
import { proposalsApi } from '@/api/proposals.js'
import { DashboardPage } from '../Dashboard.js'
import { useEditorState } from './hooks/useEditorState.js'
import { useHashSync } from './hooks/useHashSync.js'
import { useCommentBlocks } from './hooks/useCommentBlocks.js'
import { useSaveHandler } from './hooks/useSaveHandler.js'
import { useProposalHandlers } from './hooks/useProposalHandlers.js'
import { useCanvasHandlers } from './hooks/useCanvasHandlers.js'
import { useNodeHandlers } from './hooks/useNodeHandlers.js'
import { NodeEl } from './components/NodeEl.js'
import { OtherProposalNodeEl } from './components/OtherProposalNodeEl.js'
import { ModeToast } from './components/ModeToast.js'
import { NodeRewardChip } from './components/NodeRewardChip.js'
import { questToNode, questsToEdges } from './utils/conversions.js'
import { modeLabel, type ProposalNode } from './types.js'

export default function EditorPage() {
  const { isEditor: isEditorRole, viewMode, me } = useAuth()
  const { viewAs, setViewAs } = useViewAs()
  const { proposalMode, setProposalMode, setProposalCount, setSubmitting, setSaveQuests, saving, setSaving, lastQuestComplete } = useEditor()
  const { setSubmitProposals } = useEditor()
  const queryClient = useQueryClient()
  const isEditor = isEditorRole && viewMode === 'edit' && !viewAs

  const claimRewardMutation = useClaimReward()
  const completeCheckmarkMutation = useCompleteCheckmark()
  const deliverItemsMutation = useDeliverItems()
  const toggleQuestStatusMutation = useToggleQuestStatus()

  const { data: questsData } = useQuery({ queryKey: ['quests'], queryFn: () => questsApi.list() })
  const { data: progressData } = useQuery({
    queryKey: viewAs ? ['progress', viewAs.playerUuid] : ['progress'],
    queryFn: () => viewAs ? progressApi.listByPlayer(viewAs.playerUuid) : progressApi.list(),
    enabled: !!viewAs || !!me,
  })
  const { data: lang } = useMcLang()

  const completedQuestIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of progressData ?? []) { if (p.completed) set.add(String(p.questId)) }
    return set
  }, [progressData])
  const rewardClaimableQuestIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of progressData ?? []) {
      const claimable = p.rewardClaimable ?? (p.completed && !p.rewardClaimed)
      if (claimable) set.add(String(p.questId))
    }
    return set
  }, [progressData])

  const s = useEditorState()

  // --- API data → state effects ---
  useEffect(() => {
    if (!questsData) return
    const publicQuests = questsData.filter((q) => q.status === 'public' || (isEditor && q.status !== 'proposed'))
    const newNodes = publicQuests.length > 0 ? publicQuests.map(questToNode) : INITIAL_NODES
    s.setNodes(newNodes)
    s.setEdges(publicQuests.length > 0 ? questsToEdges(publicQuests) : INITIAL_EDGES)
    if (newNodes.length > 0) {
      const minX = Math.min(...newNodes.map((n) => n.x))
      const minY = Math.min(...newNodes.map((n) => n.y))
      s.setPan({ x: -minX + 80, y: -minY + 80 })
    }
  }, [questsData, isEditor])

  useEffect(() => {
    if (!lastQuestComplete) return
    const nodeId = String(lastQuestComplete.questId)
    s.setCelebratingNodeId(nodeId)
    const timer = setTimeout(() => s.setCelebratingNodeId(null), 4000)
    return () => clearTimeout(timer)
  }, [lastQuestComplete])

  useEffect(() => {
    setProposalCount(s.proposalNodes.length + s.myProposalEdits.size)
  }, [s.proposalNodes.length, s.myProposalEdits.size, setProposalCount])

  const { data: existingProposals } = useQuery({
    queryKey: ['proposals'],
    queryFn: () => proposalsApi.list(),
    enabled: proposalMode || isEditor,
  })

  // --- ref sync ---
  useEffect(() => { s.panRef.current = s.pan }, [s.pan])
  useEffect(() => { s.nodesRef.current = s.nodes }, [s.nodes])
  useEffect(() => { s.proposalNodesRef.current = s.proposalNodes }, [s.proposalNodes])

  // --- toast ---
  const showToast = (label: string) => {
    s.setToastLabel(label)
    s.setToastVisible(true)
    if (s.toastTimerRef.current) clearTimeout(s.toastTimerRef.current)
    s.toastTimerRef.current = setTimeout(() => s.setToastVisible(false), 3000)
  }

  useEffect(() => () => { if (s.toastTimerRef.current) clearTimeout(s.toastTimerRef.current) }, [])

  // --- mode ---
  const changeMode = useCallback((next: ToolMode) => {
    s.setMode(next)
    s.modeRef.current = next
    s.setLinkStartNode(null)
    showToast(modeLabel[next])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!proposalMode) {
      s.setProposalNodes([])
      s.setProposalEdges([])
      s.setMyProposalEdits(new Map())
    }
    changeMode('select')
  }, [proposalMode, changeMode])

  // --- permissions ---
  const isProposalDraft = useCallback((nodeId: string) =>
    s.proposalNodesRef.current.some((n) => n.id === nodeId), [])

  const canOpenNode = useCallback((_nodeId: string, _isOtherProposal = false): boolean => true, [])

  const isReadOnlyNode = useCallback((nodeId: string): boolean => {
    if (proposalMode) return !isProposalDraft(nodeId)
    if (isEditor) return false
    return true
  }, [isEditor, proposalMode, isProposalDraft])

  const canMoveNode = useCallback((nodeId: string): boolean => {
    if (proposalMode) return isProposalDraft(nodeId) || (isEditorRole && nodeId.startsWith('existing-proposal-'))
    if (isEditor) return true
    return false
  }, [isEditor, isEditorRole, proposalMode, isProposalDraft])

  const canDeleteNode = useCallback((nodeId: string): boolean => {
    if (proposalMode) return isProposalDraft(nodeId)
    if (isEditor) return true
    return false
  }, [isEditor, proposalMode, isProposalDraft])

  // --- edge operations ---
  const connectNodes = useCallback((startId: string, targetId: string) => {
    if (startId === targetId) return
    if (proposalMode) {
      s.setProposalEdges((prev) => {
        const existing = prev.find((e) => (e.source === startId && e.target === targetId) || (e.target === startId && e.source === targetId))
        return existing ? prev.filter((e) => e.id !== existing.id) : [...prev, { id: `pe-${Date.now()}`, source: startId, target: targetId }]
      })
    } else {
      s.setEdges((prev) => {
        const existing = prev.find((e) => (e.source === startId && e.target === targetId) || (e.target === startId && e.source === targetId))
        return existing ? prev.filter((e) => e.id !== existing.id) : [...prev, { id: `e-${Date.now()}`, source: startId, target: targetId }]
      })
    }
    s.setLinkStartNode(null)
    s.setLinkHoverNode(null)
  }, [proposalMode])

  const getNodeIdNearPoint = useCallback((clientX: number, clientY: number, excludeId?: string): string | null => {
    const rect = s.canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const wx = clientX - rect.left - s.panRef.current.x
    const wy = clientY - rect.top - s.panRef.current.y
    const HIT_R = 30
    for (const n of [...s.nodesRef.current, ...s.proposalNodesRef.current]) {
      if (n.id === excludeId) continue
      const dx = n.x - wx, dy = n.y - wy
      if (dx * dx + dy * dy <= HIT_R * HIT_R) return n.id
    }
    return null
  }, [])

  const addProposalNode = useCallback((wx: number, wy: number) => {
    s.setProposalNodes((prev) => [...prev, {
      id: `proposal-${Date.now()}`, x: wx, y: wy,
      icon: 'stone', title: '新規提案クエスト', subtitle: '', description: '',
      tasks: [], rewards: [],
    }])
  }, [])

  const openNode = (nodeId: string, isOtherProposal: boolean) => {
    if (isOtherProposal) { s.setEditingProposalNodeId(nodeId); return }
    if (!canOpenNode(nodeId)) return
    s.setEditingNodeId(nodeId)
  }

  // --- other proposal nodes ---
  const otherProposalNodes: ProposalNode[] = useMemo(() => (existingProposals ?? [])
    .filter((p: any) => p.status === 'pending')
    .map((p: any) => {
      const snap = p.questSnapshot ?? {}
      const sid = `existing-proposal-${p.id}`
      const tasks = (snap.conditions ?? []).map((c: any, i: number) => ({
        id: `${sid}-t${i}`, type: c.type,
        value: c.type === 'advancement' ? (c.advancementId ?? '') : (c.label ?? c.value ?? ''),
        ...(c.type === 'item' ? { itemType: c.itemType ?? 'stone', count: c.count ?? 1, ...(c.nbt ? { nbt: c.nbt } : {}), ...(c.displayName ? { displayName: c.displayName } : {}) } : {}),
      }))
      const rewards = (snap.rewards ?? []).map((r: any, i: number) => {
        const base = { id: `${sid}-r${i}`, value: '' }
        if (r.type === 'item') return { ...base, type: 'item', itemType: r.itemId, count: r.count ?? 1, ...(r.nbt ? { nbt: r.nbt } : {}), ...(r.displayName ? { displayName: r.displayName } : {}) }
        if (r.type === 'experience') return { ...base, type: 'xp', value: String(r.amount) }
        return { ...base, type: r.type }
      })
      const base: ProposalNode = {
        id: sid, x: p.mapPosition?.x ?? 100, y: p.mapPosition?.y ?? 100,
        icon: snap.icon ?? 'stone', title: snap.title ?? '提案', subtitle: snap.subtitle ?? '',
        description: snap.description ?? '', tasks, rewards,
        proposalId: p.id, proposerName: p.proposerName ?? '', votesUp: p.votesUp ?? 0, myVote: p.myVote ?? null,
      }
      const localEdit = s.myProposalEdits.get(p.id)
      return localEdit ? { ...base, ...localEdit, id: sid, proposalId: p.id, proposerName: base.proposerName, votesUp: base.votesUp, myVote: base.myVote } : base
    }), [existingProposals, s.myProposalEdits])

  // --- hooks ---
  useHashSync({ nodes: s.nodes, editingNodeId: s.editingNodeId, setEditingNodeId: s.setEditingNodeId })

  const { dragCommentTo, saveCommentById } = useCommentBlocks({
    draggingCommentId: s.draggingCommentId, commentDragRef: s.commentDragRef,
    setComments: s.setComments, setNodes: s.setNodes, comments: s.comments,
  })

  useSaveHandler({
    saving, setSaving, nodes: s.nodes, edges: s.edges, questsData,
    myProposalEdits: s.myProposalEdits, existingProposals, queryClient,
    setSaveQuests, setProposalMode, setMyProposalEdits: s.setMyProposalEdits, showToast,
  })

  const { handleVote, handleApprove, handleReject, handleDeleteProposal } = useProposalHandlers({
    proposalNodes: s.proposalNodes, proposalEdges: s.proposalEdges, myProposalEdits: s.myProposalEdits,
    existingProposals, setSubmitting, setSubmitProposals,
    setProposalNodes: s.setProposalNodes, setProposalEdges: s.setProposalEdges,
    setMyProposalEdits: s.setMyProposalEdits, setEditingProposalNodeId: s.setEditingProposalNodeId, showToast,
  })

  const { handleCanvasMouseDown, handleMouseMove, handleMouseUp, handleCanvasTouchStart, handleCanvasTouchMove, handleCanvasTouchEnd } = useCanvasHandlers({
    mode: s.mode, pan: s.pan, panStart: s.panStart, isPanning: s.isPanning,
    draggingNode: s.draggingNode, dragOffset: s.dragOffset,
    commentDraft: s.commentDraft, commentDraftStartRef: s.commentDraftStartRef,
    draggingCommentId: s.draggingCommentId, commentDragRef: s.commentDragRef,
    resizingCommentId: s.resizingCommentId, commentResizeStartRef: s.commentResizeStartRef,
    mouseDownPos: s.mouseDownPos, mouseDownNodeId: s.mouseDownNodeId, touchJustPlacedNode: s.touchJustPlacedNode,
    linkStartNode: s.linkStartNode, canvasRef: s.canvasRef,
    panStartRef: s.panStartRef, panRef: s.panRef,
    proposalMode, isEditor, otherProposalNodes,
    setIsPanning: s.setIsPanning, setPan: s.setPan, setPanStart: s.setPanStart,
    setNodes: s.setNodes, setProposalNodes: s.setProposalNodes, setMyProposalEdits: s.setMyProposalEdits,
    setMousePos: s.setMousePos, setCommentDraft: s.setCommentDraft, setComments: s.setComments,
    setDraggingCommentId: s.setDraggingCommentId, setResizingCommentId: s.setResizingCommentId,
    setLinkStartNode: s.setLinkStartNode, setLinkHoverNode: s.setLinkHoverNode, setDraggingNode: s.setDraggingNode,
    isProposalDraft, addProposalNode, dragCommentTo, saveCommentById, openNode, getNodeIdNearPoint,
  })

  const { handleNodeMouseDown, handleNodeMouseUp, handleNodeTouchStart, handleNodeTouchMove, handleNodeTouchEnd, handleItemSelect, updateNode } = useNodeHandlers({
    mode: s.mode, pan: s.pan, draggingNode: s.draggingNode, dragOffset: s.dragOffset,
    linkStartNode: s.linkStartNode, linkHoverNode: s.linkHoverNode,
    nodes: s.nodes, proposalNodes: s.proposalNodes, otherProposalNodes,
    mouseDownPos: s.mouseDownPos, mouseDownNodeId: s.mouseDownNodeId,
    longPressTimerRef: s.longPressTimerRef, longPressActiveRef: s.longPressActiveRef, modeRef: s.modeRef,
    canvasRef: s.canvasRef, panRef: s.panRef, nodesRef: s.nodesRef, proposalNodesRef: s.proposalNodesRef,
    proposalMode, isEditor, itemSelectorConfig: s.itemSelectorConfig,
    canMoveNode, canDeleteNode, isProposalDraft, connectNodes, openNode, getNodeIdNearPoint,
    setDraggingNode: s.setDraggingNode, setDragOffset: s.setDragOffset, setIsPanning: s.setIsPanning,
    setLinkStartNode: s.setLinkStartNode, setLinkHoverNode: s.setLinkHoverNode, setMousePos: s.setMousePos,
    setLongPressPopover: s.setLongPressPopover, setNodes: s.setNodes, setEdges: s.setEdges,
    setProposalNodes: s.setProposalNodes, setProposalEdges: s.setProposalEdges,
    setMyProposalEdits: s.setMyProposalEdits, setItemSelectorConfig: s.setItemSelectorConfig,
  })

  // --- comments init ---
  useEffect(() => { commentsApi.list().then(s.setComments).catch(() => {}) }, [])

  // --- derived state ---
  const editingNode = s.editingNodeId
    ? s.nodes.find((n) => n.id === s.editingNodeId) ?? s.proposalNodes.find((n) => n.id === s.editingNodeId)
    : null
  const editingProposalNode = s.editingProposalNodeId
    ? otherProposalNodes.find((n) => n.id === s.editingProposalNodeId) ?? null
    : null
  const taskRewardNode = s.editingTaskReward
    ? [...s.nodes, ...s.proposalNodes, ...otherProposalNodes].find((n) => n.id === s.editingTaskReward!.nodeId)
    : null

  const showAddNode     = isEditor || proposalMode
  const showAddLink     = isEditor || proposalMode
  const showMove        = isEditor || proposalMode
  const showDelete      = isEditor || proposalMode
  const showAddComment  = isEditor
  const showSettings    = isEditor

  // --- logout ---
  const handleLogout = async () => {
    try { await authApi.logout() } catch (_) {}
    localStorage.removeItem('token')
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
    setProposalMode(false)
  }

  return (
    <ViewAsContext.Provider value={{ viewAs, setViewAs }}>
      <div className="flex-1 relative flex flex-col overflow-hidden select-none min-h-0" style={{ fontFamily: '"Minecraftia", "Courier New", Courier, monospace' }}>
        {viewAs && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[#2a3a4a] border-b-2 border-[#4a9edd] text-sm text-[#cfe8ff] shrink-0 z-30">
            <img src={`https://mc-heads.net/avatar/${viewAs.playerName}/24`} alt={viewAs.playerName} width={24} height={24} style={{ imageRendering: 'pixelated' }} className="rounded-sm" />
            <span>👁 <span className="font-bold text-white">{viewAs.playerName}</span> の攻略を見ています</span>
            <button onClick={() => setViewAs(null)} className="ml-auto text-xs px-3 py-1 border border-[#4a9edd] rounded-sm text-white hover:bg-[#4a9edd]/30 font-bold">自分に戻る</button>
          </div>
        )}
        <div className="flex-1 relative flex overflow-hidden min-h-0">
          {viewAs && (
            <div data-testid="viewas-panel" className={['absolute z-30 flex flex-col bg-[#2d2f3b] border-2 border-[#1e1f29] shadow-2xl text-white transition-all duration-200', 'md:top-3 md:right-3 md:w-64 md:max-h-[70%] md:rounded-md md:p-3', 'max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:rounded-t-lg max-md:border-x-0 max-md:border-b-0', s.viewAsPanelCollapsed ? 'max-md:h-auto' : 'max-md:h-[55%]'].join(' ')}>
              <div className="flex shrink-0 rounded-sm md:mb-2 border border-gray-600 overflow-hidden text-xs font-bold">
                <button onClick={() => { if (s.viewAsPanelCollapsed) { s.setViewAsPanelCollapsed(false); s.setViewAsTab('activity') } else if (s.viewAsTab === 'activity') { s.setViewAsPanelCollapsed((c) => !c) } else { s.setViewAsTab('activity') } }} className={`flex-1 px-2 py-1.5 transition-colors ${s.viewAsTab === 'activity' && !s.viewAsPanelCollapsed ? 'bg-blue-600 text-white' : 'bg-black/30 text-gray-300 hover:bg-white/5'}`}>アクティビティ</button>
                <button onClick={() => { if (s.viewAsPanelCollapsed) { s.setViewAsPanelCollapsed(false); s.setViewAsTab('rewards') } else if (s.viewAsTab === 'rewards') { s.setViewAsPanelCollapsed((c) => !c) } else { s.setViewAsTab('rewards') } }} className={`flex-1 px-2 py-1.5 transition-colors ${s.viewAsTab === 'rewards' && !s.viewAsPanelCollapsed ? 'bg-blue-600 text-white' : 'bg-black/30 text-gray-300 hover:bg-white/5'}`}>獲得報酬</button>
              </div>
              {!s.viewAsPanelCollapsed && (
                <div className="flex-1 overflow-y-auto min-h-0 md:mt-0 mt-1 px-3 pb-3 md:px-0 md:pb-0">
                  {s.viewAsTab === 'activity' ? (
                    <RecentActivityPanel playerUuid={viewAs.playerUuid} onSelectQuest={(questId) => { if (s.nodes.some((n) => n.id === String(questId))) s.setEditingNodeId(String(questId)) }} />
                  ) : (
                    <PlayerRewardsPanel playerUuid={viewAs.playerUuid} onSelectQuest={(questId) => { if (s.nodes.some((n) => n.id === String(questId))) s.setEditingNodeId(String(questId)) }} />
                  )}
                </div>
              )}
            </div>
          )}

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
              <button onClick={handleLogout} title={`${me.playerName} — クリックでログアウト`} className="mt-1 w-10 h-10 flex items-center justify-center border-2 relative overflow-hidden" style={{ backgroundColor: '#6B6B6B', borderTopColor: '#9B9B9B', borderLeftColor: '#9B9B9B', borderBottomColor: '#3B3B3B', borderRightColor: '#3B3B3B', padding: 0 }}>
                <img src={`https://mc-heads.net/avatar/${me.playerName}/40`} alt={me.playerName} width={40} height={40} style={{ imageRendering: 'pixelated', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </button>
            ) : (
              <button onClick={() => s.setShowLoginModal(true)} title="ログイン" className="mt-1 w-10 h-10 flex items-center justify-center border-2" style={{ backgroundColor: '#6B6B6B', borderTopColor: '#9B9B9B', borderLeftColor: '#9B9B9B', borderBottomColor: '#3B3B3B', borderRightColor: '#3B3B3B' }}>
                <User size={18} style={{ color: '#d8cbb0' }} />
              </button>
            )}
          </div>

          {s.showStats ? <DashboardPage /> : (<>
            <div ref={s.canvasRef} className={`flex-grow relative overflow-hidden ${s.mode === 'move' && !s.draggingNode ? 'cursor-grab' : s.draggingNode ? 'cursor-grabbing' : s.mode === 'add_node' ? 'cursor-crosshair' : s.mode === 'add_comment' ? 'cursor-crosshair' : 'cursor-default'}`}
              style={{ backgroundColor: '#5d6b5e', backgroundImage: 'linear-gradient(rgba(0,0,0,0.15) 2px, transparent 2px), linear-gradient(90deg, rgba(0,0,0,0.15) 2px, transparent 2px)', backgroundSize: '40px 40px', backgroundPosition: `${s.pan.x}px ${s.pan.y}px`, boxShadow: 'inset 0 0 50px rgba(0, 0, 0, 0.4)', touchAction: 'none' }}
              onMouseDown={handleCanvasMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onContextMenu={(e) => e.preventDefault()}
              onTouchStart={handleCanvasTouchStart} onTouchMove={handleCanvasTouchMove} onTouchEnd={handleCanvasTouchEnd}
            >
              <div style={{ transform: `translate(${s.pan.x}px, ${s.pan.y}px)`, transformOrigin: '0 0' }} className="absolute inset-0 w-full h-full">
                {s.comments.map(comment => (
                  <CommentBlockEl key={comment.id} comment={comment} mode={s.mode} editable={isEditor}
                    onMoveStart={(e) => {
                      if ('button' in e && (e as React.MouseEvent).button !== 0) return
                      e.stopPropagation()
                      const rect = s.canvasRef.current?.getBoundingClientRect()
                      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
                      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
                      const wx = clientX - (rect?.left ?? 0) - s.panRef.current.x
                      const wy = clientY - (rect?.top ?? 0) - s.panRef.current.y
                      const members = isEditor ? s.nodes.filter((n) => n.x >= comment.x && n.x <= comment.x + comment.width && n.y >= comment.y && n.y <= comment.y + comment.height).map((n) => ({ id: n.id, x: n.x, y: n.y })) : []
                      s.commentDragRef.current = { offsetX: wx - comment.x, offsetY: wy - comment.y, startX: comment.x, startY: comment.y, members }
                      s.setDraggingCommentId(comment.id)
                    }}
                    onResizeStart={(e, dir) => {
                      e.stopPropagation()
                      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
                      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
                      s.commentResizeStartRef.current = { mouseX: clientX, mouseY: clientY, origX: comment.x, origY: comment.y, origW: comment.width, origH: comment.height, dir }
                      s.setResizingCommentId(comment.id)
                    }}
                    onDelete={() => { commentsApi.delete(comment.id).then(() => { s.setComments(prev => prev.filter(c => c.id !== comment.id)) }).catch(() => {}) }}
                    onEdit={(updates) => {
                      const updated = { ...comment, ...updates }
                      commentsApi.update(comment.id, { x: updated.x, y: updated.y, width: updated.width, height: updated.height, title: updated.title, color: updated.color }).then(saved => { s.setComments(prev => prev.map(c => c.id === saved.id ? saved : c)) }).catch(() => {})
                    }}
                  />
                ))}

                {s.commentDraft && s.commentDraft.w > 5 && s.commentDraft.h > 5 && (
                  <div className="absolute pointer-events-none" style={{ left: s.commentDraft.x, top: s.commentDraft.y, width: s.commentDraft.w, height: s.commentDraft.h, border: `2px dashed ${COMMENT_COLORS[0].hex}`, background: `${COMMENT_COLORS[0].hex}22`, borderRadius: 6, zIndex: 1 }} />
                )}

                <svg className="absolute inset-0 overflow-visible pointer-events-none z-0">
                  {s.edges.map((edge) => { const src = s.nodes.find((n) => n.id === edge.source); const tgt = s.nodes.find((n) => n.id === edge.target); if (!src || !tgt) return null; return <EdgePattern key={edge.id} source={src} target={tgt} /> })}
                  {s.proposalEdges.map((edge) => { const allN = [...s.nodes, ...s.proposalNodes]; const src = allN.find((n) => n.id === edge.source); const tgt = allN.find((n) => n.id === edge.target); if (!src || !tgt) return null; return <EdgePattern key={edge.id} source={src} target={tgt} /> })}
                  {s.mode === 'add_link' && s.linkStartNode && (() => { const startNode = [...s.nodes, ...s.proposalNodes].find((n) => n.id === s.linkStartNode); if (!startNode) return null; return <EdgePattern source={startNode} isPreview targetPos={s.mousePos} /> })()}
                </svg>

                {s.nodes.map((node) => (
                  <NodeEl key={node.id} node={node} mode={s.mode} draggingNode={s.draggingNode} linkStartNode={s.linkStartNode} linkHoverNode={s.linkHoverNode} setHoveredNode={s.setHoveredNode}
                    completed={completedQuestIds.has(node.id)} celebrating={s.celebratingNodeId === node.id} rewardClaimable={rewardClaimableQuestIds.has(node.id)} isEditor={isEditor}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id, false)} onMouseUp={handleNodeMouseUp}
                    onTouchStart={(e) => handleNodeTouchStart(e, node.id, false)} onTouchMove={(e) => handleNodeTouchMove(e, node.id)} onTouchEnd={(e) => handleNodeTouchEnd(e, node.id, false)}
                  />
                ))}
                {s.proposalNodes.map((node) => (
                  <NodeEl key={node.id} node={node} mode={s.mode} draggingNode={s.draggingNode} linkStartNode={s.linkStartNode} linkHoverNode={s.linkHoverNode} setHoveredNode={s.setHoveredNode} isDraft
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id, false)} onMouseUp={handleNodeMouseUp}
                    onTouchStart={(e) => handleNodeTouchStart(e, node.id, false)} onTouchMove={(e) => handleNodeTouchMove(e, node.id)} onTouchEnd={(e) => handleNodeTouchEnd(e, node.id, false)}
                  />
                ))}
                {(proposalMode || isEditor) && otherProposalNodes.map((node) => (
                  <OtherProposalNodeEl key={node.id} node={node} mode={s.mode} isEditor={isEditor}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id, true)} onMouseUp={handleNodeMouseUp}
                    onTouchStart={(e) => handleNodeTouchStart(e, node.id, true)} onTouchMove={(e) => handleNodeTouchMove(e, node.id)} onTouchEnd={(e) => handleNodeTouchEnd(e, node.id, true)}
                  />
                ))}
              </div>

              {s.hoveredNode && !s.draggingNode && !s.isPanning && !s.editingNodeId && !s.itemSelectorConfig && !s.editingTaskReward && (
                <div className="absolute z-30 bg-black/90 border-2 border-purple-700 text-white p-3 pointer-events-none shadow-xl max-w-xs hidden sm:block"
                  style={{ left: Math.min(s.mousePos.x + s.pan.x + 20, (s.canvasRef.current?.offsetWidth ?? 0) - 200), top: Math.min(s.mousePos.y + s.pan.y + 20, (s.canvasRef.current?.offsetHeight ?? 0) - 100) }}>
                  <div className="font-bold text-blue-300 text-lg mb-1">{s.hoveredNode.title}</div>
                  {s.hoveredNode.subtitle && <div className="text-gray-400 text-xs italic mb-2">{s.hoveredNode.subtitle}</div>}
                  <div className="text-sm space-y-1">
                    {s.hoveredNode.tasks?.map((task) => (<div key={task.id} className="text-gray-300 flex items-center gap-1"><span className="text-gray-500">{TASK_TYPES.find((t) => t.id === task.type)?.icon ?? '•'}</span>{getDisplayText(task, 'task', lang)}</div>))}
                    {(!s.hoveredNode.tasks || s.hoveredNode.tasks.length === 0) && <div className="text-gray-500 text-xs">タスクがありません</div>}
                  </div>
                  {s.hoveredNode.rewards && s.hoveredNode.rewards.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="text-[11px] text-gray-500 mb-1.5">🎁 報酬</div>
                      <div className="flex flex-wrap gap-1.5" data-testid="hover-reward-chips">
                        {s.hoveredNode.rewards.map((r) => <NodeRewardChip key={r.id} reward={r} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <ModeToast label={s.toastLabel} visible={s.toastVisible} />
            </div>

            {s.longPressPopover && createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => s.setLongPressPopover(null)} onTouchStart={() => s.setLongPressPopover(null)} />
                <div className="fixed z-[9999] bg-black/90 border-2 border-purple-700 text-white p-3 shadow-xl max-w-[280px]"
                  style={{ bottom: window.innerHeight - s.longPressPopover.y + 12, left: Math.max(8, Math.min(s.longPressPopover.x - 140, window.innerWidth - 296)) }}
                  data-testid="longtap-reward-popover">
                  <div className="font-bold text-blue-300 text-lg mb-1">{s.longPressPopover.node.title}</div>
                  {s.longPressPopover.node.subtitle && <div className="text-gray-400 text-xs italic mb-2">{s.longPressPopover.node.subtitle}</div>}
                  <div className="text-sm space-y-1">
                    {s.longPressPopover.node.tasks?.map((task) => (<div key={task.id} className="text-gray-300 flex items-center gap-1"><span className="text-gray-500">{TASK_TYPES.find((t) => t.id === task.type)?.icon ?? '•'}</span>{getDisplayText(task, 'task', lang)}</div>))}
                    {(!s.longPressPopover.node.tasks || s.longPressPopover.node.tasks.length === 0) && <div className="text-gray-500 text-xs">タスクがありません</div>}
                  </div>
                  {s.longPressPopover.node.rewards && s.longPressPopover.node.rewards.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="text-[11px] text-gray-500 mb-1.5">🎁 報酬</div>
                      <div className="flex flex-wrap gap-1.5">{s.longPressPopover.node.rewards.map((r) => <NodeRewardChip key={r.id} reward={r} />)}</div>
                    </div>
                  )}
                </div>
              </>,
              document.body,
            )}

            {editingNode && (
              <QuestEditorModal node={editingNode} updateNode={updateNode} close={() => s.setEditingNodeId(null)} openItemSelector={s.setItemSelectorConfig} openTaskRewardEditor={s.setEditingTaskReward} readOnly={isReadOnlyNode(s.editingNodeId!)}
                conditionProgress={progressData?.find((pr) => String(pr.questId) === s.editingNodeId)?.progress}
                pendingRewards={progressData?.find((pr) => String(pr.questId) === s.editingNodeId)?.pendingRewards}
                completedAt={progressData?.find((pr) => String(pr.questId) === s.editingNodeId)?.completedAt}
                claimReward={(() => {
                  if (viewAs) return undefined
                  const p = progressData?.find((pr) => String(pr.questId) === s.editingNodeId)
                  if (!p) return undefined
                  const claimable = p.rewardClaimable ?? (p.completed && !p.rewardClaimed)
                  if (!claimable) return undefined
                  return async () => { await claimRewardMutation.mutateAsync(s.editingNodeId!); showToast('報酬を受け取りました！') }
                })()}
                onCheckmarkComplete={!viewAs && isReadOnlyNode(s.editingNodeId!) && me ? async (conditionId) => { await completeCheckmarkMutation.mutateAsync({ questId: s.editingNodeId!, conditionId }) } : undefined}
                onDeliver={(() => {
                  if (viewAs) return undefined
                  const node = s.editingNodeId ? s.nodes.find((n) => n.id === s.editingNodeId) : null
                  const hasDelivery = node?.tasks?.some((t) => t.type === 'delivery')
                  const p = progressData?.find((pr) => String(pr.questId) === s.editingNodeId)
                  if (!hasDelivery || !isReadOnlyNode(s.editingNodeId!) || !me || p?.completed) return undefined
                  return async () => { const result = await deliverItemsMutation.mutateAsync(s.editingNodeId!); showToast(Object.keys(result.delivered ?? {}).length > 0 ? '納品しました！' : '納品できるアイテムがありませんでした') }
                })()}
                questStatus={(() => { if (!isEditor || !s.editingNodeId) return undefined; return questsData?.find((q) => String(q.id) === s.editingNodeId)?.status })()}
                onToggleStatus={(() => {
                  if (!isEditor || !s.editingNodeId) return undefined
                  const q = questsData?.find((q) => String(q.id) === s.editingNodeId)
                  if (!q || q.status === 'proposed') return undefined
                  return async () => { const { newStatus } = await toggleQuestStatusMutation.mutateAsync({ id: q.id, currentStatus: q.status }); showToast(newStatus === 'public' ? '公開しました' : '非公開にしました') }
                })()}
              />
            )}

            {editingProposalNode && (() => {
              const p = existingProposals?.find((p: any) => p.id === editingProposalNode.proposalId) as any
              const canEdit = isEditor
              return (
                <QuestEditorModal node={editingProposalNode} updateNode={canEdit ? updateNode : () => {}} close={() => s.setEditingProposalNodeId(null)} openItemSelector={s.setItemSelectorConfig} openTaskRewardEditor={s.setEditingTaskReward}
                  proposalMeta={editingProposalNode.proposalId != null ? {
                    proposalId: editingProposalNode.proposalId, proposerName: p?.proposerName ?? '',
                    votesUp: editingProposalNode.votesUp ?? 0, myVote: p?.myVote ?? null,
                    onVote: (type: 'up' | 'down') => handleVote(editingProposalNode.proposalId!, type),
                    ...(canEdit ? { onDelete: () => handleDeleteProposal(editingProposalNode.proposalId!) } : {}),
                    ...(isEditor ? { onApprove: () => handleApprove(editingProposalNode.proposalId!), onReject: () => handleReject(editingProposalNode.proposalId!) } : {}),
                  } : undefined}
                  readOnly={!canEdit}
                />
              )
            })()}

            {s.editingTaskReward && taskRewardNode && (
              <TaskRewardEditorModal node={taskRewardNode} category={s.editingTaskReward.category} itemId={s.editingTaskReward.itemId} updateNode={updateNode} close={() => s.setEditingTaskReward(null)} openItemSelector={s.setItemSelectorConfig} />
            )}
            {s.showRewardTableModal && <RewardTableModal close={() => s.setShowRewardTableModal(false)} />}
            {s.itemSelectorConfig && <ItemSelectorModal close={() => s.setItemSelectorConfig(null)} onSelect={handleItemSelect} />}
            {s.showLoginModal && <LoginModal close={() => s.setShowLoginModal(false)} />}
          </>)}
        </div>
      </div>
    </ViewAsContext.Provider>
  )
}
