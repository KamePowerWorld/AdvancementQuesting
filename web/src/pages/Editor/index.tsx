import { useEffect, useCallback, useMemo } from 'react'
import type { ToolMode } from '@/components/editor/types.js'
import { INITIAL_NODES, INITIAL_EDGES, DEFAULT_ITEM_ID } from '@/components/editor/constants.js'
import { EdgePattern } from '@/components/editor/EdgePattern.js'
import { useAuth } from '@/contexts/AuthContext.js'
import { ViewAsContext } from '@/contexts/ViewAsContext.js'
import { useViewAs } from '@/hooks/useViewAs.js'
import { useEditor } from '@/contexts/EditorContext.js'
import { questsApi } from '@/api/quests.js'
import { authApi } from '@/api/auth.js'
import { commentsApi } from '@/api/comments.js'
import { progressApi } from '@/api/progress.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMcLang } from '@/hooks/useMcData.js'
import { useClaimReward, useCompleteCheckmark, useDeliverItems, useToggleQuestStatus } from '@/hooks/mutations.js'
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
import { EditorToolbar } from './components/EditorToolbar.js'
import { CommentLayer } from './components/CommentLayer.js'
import { EditorModals } from './components/EditorModals.js'
import { ViewAsBanner, ViewAsPanel } from './components/ViewAsPanel.js'
import { NodeHoverTooltip, LongPressPopover } from './components/NodePopovers.js'
import { questToNode, questsToEdges, proposalsToNodes } from './utils/conversions.js'
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
      icon: DEFAULT_ITEM_ID, title: '新規提案クエスト', subtitle: '', description: '',
      tasks: [], rewards: [],
    }])
  }, [])

  const openNode = (nodeId: string, isOtherProposal: boolean) => {
    if (isOtherProposal) { s.setEditingProposalNodeId(nodeId); return }
    if (!canOpenNode(nodeId)) return
    s.setEditingNodeId(nodeId)
  }

  // --- other proposal nodes ---
  const otherProposalNodes: ProposalNode[] = useMemo(
    () => proposalsToNodes(existingProposals, s.myProposalEdits),
    [existingProposals, s.myProposalEdits])

  // --- hooks ---
  useHashSync({ nodes: s.nodes, editingNodeId: s.editingNodeId, setEditingNodeId: s.setEditingNodeId })

  const { dragCommentTo, saveCommentById } = useCommentBlocks({
    draggingCommentId: s.draggingCommentId, commentDragRef: s.commentDragRef,
    setComments: s.setComments, setNodes: s.setNodes, comments: s.comments,
  })

  useSaveHandler(s, {
    saving, setSaving, questsData, existingProposals, queryClient,
    setSaveQuests, setProposalMode, showToast,
  })

  const { handleVote, handleApprove, handleReject, handleDeleteProposal } = useProposalHandlers(s, {
    existingProposals, setSubmitting, setSubmitProposals, showToast,
  })

  const { handleCanvasMouseDown, handleMouseMove, handleMouseUp, handleCanvasTouchStart, handleCanvasTouchMove, handleCanvasTouchEnd } = useCanvasHandlers(s, {
    proposalMode, isEditor, otherProposalNodes,
    isProposalDraft, addProposalNode, dragCommentTo, saveCommentById, openNode, getNodeIdNearPoint,
  })

  const { handleNodeMouseDown, handleNodeMouseUp, handleNodeTouchStart, handleNodeTouchMove, handleNodeTouchEnd, handleItemSelect, updateNode } = useNodeHandlers(s, {
    otherProposalNodes, proposalMode, isEditor,
    canMoveNode, canDeleteNode, isProposalDraft, connectNodes, openNode, getNodeIdNearPoint,
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
        {viewAs && <ViewAsBanner viewAs={viewAs} onExit={() => setViewAs(null)} />}
        <div className="flex-1 relative flex overflow-hidden min-h-0">
          {viewAs && <ViewAsPanel s={s} viewAs={viewAs} />}

          <EditorToolbar s={s} changeMode={changeMode} me={me} onLogout={handleLogout}
            showMove={showMove} showAddNode={showAddNode} showAddLink={showAddLink}
            showDelete={showDelete} showAddComment={showAddComment} showSettings={showSettings} />

          {s.showStats ? <DashboardPage /> : (<>
            <div ref={s.canvasRef} className={`flex-grow relative overflow-hidden ${s.mode === 'move' && !s.draggingNode ? 'cursor-grab' : s.draggingNode ? 'cursor-grabbing' : s.mode === 'add_node' ? 'cursor-crosshair' : s.mode === 'add_comment' ? 'cursor-crosshair' : 'cursor-default'}`}
              style={{ backgroundColor: '#5d6b5e', backgroundImage: 'linear-gradient(rgba(0,0,0,0.15) 2px, transparent 2px), linear-gradient(90deg, rgba(0,0,0,0.15) 2px, transparent 2px)', backgroundSize: '40px 40px', backgroundPosition: `${s.pan.x}px ${s.pan.y}px`, boxShadow: 'inset 0 0 50px rgba(0, 0, 0, 0.4)', touchAction: 'none' }}
              onMouseDown={handleCanvasMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              onContextMenu={(e) => e.preventDefault()}
              onTouchStart={handleCanvasTouchStart} onTouchMove={handleCanvasTouchMove} onTouchEnd={handleCanvasTouchEnd}
            >
              <div style={{ transform: `translate(${s.pan.x}px, ${s.pan.y}px)`, transformOrigin: '0 0' }} className="absolute inset-0 w-full h-full">
                <CommentLayer s={s} isEditor={isEditor} />

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
                <NodeHoverTooltip node={s.hoveredNode} mousePos={s.mousePos} pan={s.pan} canvasEl={s.canvasRef.current} lang={lang} />
              )}
              <ModeToast label={s.toastLabel} visible={s.toastVisible} />
            </div>

            {s.longPressPopover && (
              <LongPressPopover popover={s.longPressPopover} onClose={() => s.setLongPressPopover(null)} lang={lang} />
            )}

            <EditorModals s={s} isEditor={isEditor} me={me} viewAs={viewAs}
              questsData={questsData} progressData={progressData} existingProposals={existingProposals}
              editingNode={editingNode} editingProposalNode={editingProposalNode} taskRewardNode={taskRewardNode}
              updateNode={updateNode} handleItemSelect={handleItemSelect} isReadOnlyNode={isReadOnlyNode} showToast={showToast}
              claimRewardMutation={claimRewardMutation} completeCheckmarkMutation={completeCheckmarkMutation}
              deliverItemsMutation={deliverItemsMutation} toggleQuestStatusMutation={toggleQuestStatusMutation}
              handleVote={handleVote} handleApprove={handleApprove} handleReject={handleReject} handleDeleteProposal={handleDeleteProposal} />
          </>)}
        </div>
      </div>
    </ViewAsContext.Provider>
  )
}
