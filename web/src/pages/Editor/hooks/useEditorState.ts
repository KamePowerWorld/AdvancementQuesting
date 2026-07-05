import { useState, useRef } from 'react'
import type { EditorNode, EditorEdge, EditorComment, ToolMode, Vec2, ItemSelectorConfig, EditingTaskReward } from '@/components/editor/types.js'
import { INITIAL_NODES, INITIAL_EDGES } from '@/components/editor/constants.js'
import type { ResizeDir } from '@/components/editor/CommentBlockEl.js'

export type EditorState = ReturnType<typeof useEditorState>

export function useEditorState() {
  const [showStats, setShowStats] = useState(false)

  // --- view-as panel ---
  const [viewAsTab, setViewAsTab] = useState<'activity' | 'rewards'>('activity')
  const [viewAsPanelCollapsed, setViewAsPanelCollapsed] = useState(false)

  // --- map celebration ---
  const [celebratingNodeId, setCelebratingNodeId] = useState<string | null>(null)

  // --- nodes & edges ---
  const [nodes, setNodes] = useState<EditorNode[]>(INITIAL_NODES)
  const [edges, setEdges] = useState<EditorEdge[]>(INITIAL_EDGES)

  // --- proposal drafts ---
  const [proposalNodes, setProposalNodes] = useState<EditorNode[]>([])
  const [proposalEdges, setProposalEdges] = useState<EditorEdge[]>([])
  const [myProposalEdits, setMyProposalEdits] = useState<Map<number, EditorNode>>(new Map())

  // --- tool mode ---
  const [mode, setMode] = useState<ToolMode>('select')

  // --- pan / scale ---
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<Vec2>({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)

  // --- drag ---
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<Vec2>({ x: 0, y: 0 })

  // --- link ---
  const [linkStartNode, setLinkStartNode] = useState<string | null>(null)
  const [linkHoverNode, setLinkHoverNode] = useState<string | null>(null)

  // --- hover ---
  const [hoveredNode, setHoveredNode] = useState<EditorNode | null>(null)
  const [mousePos, setMousePos] = useState<Vec2>({ x: 0, y: 0 })

  // --- comment blocks ---
  const [comments, setComments] = useState<EditorComment[]>([])
  const [commentDraft, setCommentDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const commentDraftStartRef = useRef<{ wx: number; wy: number } | null>(null)
  const [draggingCommentId, setDraggingCommentId] = useState<string | null>(null)
  const commentDragRef = useRef<{
    offsetX: number; offsetY: number
    startX: number; startY: number
    members: { id: string; x: number; y: number }[]
  } | null>(null)
  const [resizingCommentId, setResizingCommentId] = useState<string | null>(null)
  const commentResizeStartRef = useRef<{ mouseX: number; mouseY: number; origX: number; origY: number; origW: number; origH: number; dir: ResizeDir } | null>(null)

  // --- long press ---
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressActiveRef = useRef(false)
  const [longPressPopover, setLongPressPopover] = useState<{ node: EditorNode; x: number; y: number } | null>(null)

  // --- click detection ---
  const mouseDownPos = useRef<Vec2 | null>(null)
  const mouseDownNodeId = useRef<{ nodeId: string; isProposal: boolean } | null>(null)
  const touchJustPlacedNode = useRef(false)

  // --- modals ---
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingProposalNodeId, setEditingProposalNodeId] = useState<string | null>(null)
  const [itemSelectorConfig, setItemSelectorConfig] = useState<ItemSelectorConfig | null>(null)
  const [showRewardTableModal, setShowRewardTableModal] = useState(false)
  const [editingTaskReward, setEditingTaskReward] = useState<EditingTaskReward | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // --- toast ---
  const [toastVisible, setToastVisible] = useState(false)
  const [toastLabel, setToastLabel] = useState('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- refs for touch handlers ---
  const canvasRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<Vec2>({ x: 0, y: 0 })
  const panRef = useRef<Vec2>({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  // --- pinch (2本指ズーム) 開始情報 ---
  const pinchStartRef = useRef<{
    dist: number
    midX: number
    midY: number
    panX: number
    panY: number
    scale: number
  } | null>(null)
  const nodesRef = useRef<EditorNode[]>(INITIAL_NODES)
  const proposalNodesRef = useRef<EditorNode[]>([])
  const modeRef = useRef<ToolMode>('select')

  return {
    showStats, setShowStats,
    viewAsTab, setViewAsTab,
    viewAsPanelCollapsed, setViewAsPanelCollapsed,
    celebratingNodeId, setCelebratingNodeId,
    nodes, setNodes,
    edges, setEdges,
    proposalNodes, setProposalNodes,
    proposalEdges, setProposalEdges,
    myProposalEdits, setMyProposalEdits,
    mode, setMode,
    pan, setPan,
    isPanning, setIsPanning,
    panStart, setPanStart,
    scale, setScale,
    draggingNode, setDraggingNode,
    dragOffset, setDragOffset,
    linkStartNode, setLinkStartNode,
    linkHoverNode, setLinkHoverNode,
    hoveredNode, setHoveredNode,
    mousePos, setMousePos,
    comments, setComments,
    commentDraft, setCommentDraft,
    commentDraftStartRef,
    draggingCommentId, setDraggingCommentId,
    commentDragRef,
    resizingCommentId, setResizingCommentId,
    commentResizeStartRef,
    longPressTimerRef,
    longPressActiveRef,
    longPressPopover, setLongPressPopover,
    mouseDownPos,
    mouseDownNodeId,
    touchJustPlacedNode,
    editingNodeId, setEditingNodeId,
    editingProposalNodeId, setEditingProposalNodeId,
    itemSelectorConfig, setItemSelectorConfig,
    showRewardTableModal, setShowRewardTableModal,
    editingTaskReward, setEditingTaskReward,
    showLoginModal, setShowLoginModal,
    toastVisible, setToastVisible,
    toastLabel, setToastLabel,
    toastTimerRef,
    canvasRef,
    panStartRef,
    panRef,
    scaleRef,
    pinchStartRef,
    nodesRef,
    proposalNodesRef,
    modeRef,
  }
}
