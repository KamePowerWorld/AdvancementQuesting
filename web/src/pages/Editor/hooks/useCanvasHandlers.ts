import type React from 'react'
import { commentsApi } from '@/api/comments.js'
import { COMMENT_COLORS } from '@/components/editor/CommentBlockEl.js'
import type { ProposalNode } from '../types.js'
import { CLICK_MAX_DIST } from '../types.js'
import type { EditorState } from './useEditorState.js'

interface UseCanvasHandlersDeps {
  proposalMode: boolean
  isEditor: boolean
  otherProposalNodes: ProposalNode[]
  isProposalDraft: (nodeId: string) => boolean
  addProposalNode: (wx: number, wy: number) => void
  dragCommentTo: (wx: number, wy: number) => void
  saveCommentById: (id: string | null) => void
  openNode: (nodeId: string, isOtherProposal: boolean) => void
  getNodeIdNearPoint: (clientX: number, clientY: number, excludeId?: string) => string | null
}

export function useCanvasHandlers(s: EditorState, deps: UseCanvasHandlersDeps) {
  const {
    proposalMode, isEditor, otherProposalNodes,
    isProposalDraft, addProposalNode, dragCommentTo, saveCommentById, openNode, getNodeIdNearPoint,
  } = deps

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault()
      s.setIsPanning(true)
      s.setPanStart({ x: e.clientX - s.pan.x, y: e.clientY - s.pan.y })
      s.setLinkStartNode(null)
      return
    }
    s.mouseDownNodeId.current = null
    s.mouseDownPos.current = { x: e.clientX, y: e.clientY }
    s.touchJustPlacedNode.current = false
    if (s.mode === 'select' || s.mode === 'move') {
      s.setIsPanning(true)
      s.setPanStart({ x: e.clientX - s.pan.x, y: e.clientY - s.pan.y })
    } else if (s.mode === 'add_node') {
      const rect = s.canvasRef.current!.getBoundingClientRect()
      const wx = e.clientX - rect.left - s.pan.x
      const wy = e.clientY - rect.top - s.pan.y
      if (proposalMode) {
        addProposalNode(wx, wy)
      } else if (isEditor) {
        s.setNodes((prev) => [...prev, {
          id: `node-${Date.now()}`, x: wx, y: wy,
          icon: 'stone', title: '新規クエスト', subtitle: '', description: '',
          tasks: [], rewards: [],
        }])
      }
    } else if (s.mode === 'add_link') {
      s.setLinkStartNode(null)
    } else if (s.mode === 'add_comment' && isEditor) {
      const rect = s.canvasRef.current!.getBoundingClientRect()
      const wx = e.clientX - rect.left - s.pan.x
      const wy = e.clientY - rect.top - s.pan.y
      s.commentDraftStartRef.current = { wx, wy }
      s.setCommentDraft({ x: wx, y: wy, w: 0, h: 0 })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!s.canvasRef.current) return
    const rect = s.canvasRef.current.getBoundingClientRect()
    if (s.isPanning && !s.draggingNode && !s.draggingCommentId && !s.resizingCommentId) s.setPan({ x: e.clientX - s.panStart.x, y: e.clientY - s.panStart.y })
    const wx = e.clientX - rect.left - s.pan.x
    const wy = e.clientY - rect.top - s.pan.y
    s.setMousePos({ x: wx, y: wy })

    if (s.mode === 'add_comment' && s.commentDraftStartRef.current) {
      const sx = s.commentDraftStartRef.current.wx
      const sy = s.commentDraftStartRef.current.wy
      s.setCommentDraft({ x: Math.min(sx, wx), y: Math.min(sy, wy), w: Math.abs(wx - sx), h: Math.abs(wy - sy) })
    }

    if (s.draggingCommentId) { dragCommentTo(wx, wy) }

    if (s.resizingCommentId && s.commentResizeStartRef.current) {
      const { mouseX, mouseY, origX, origY, origW, origH, dir } = s.commentResizeStartRef.current
      const dx = e.clientX - mouseX
      const dy = e.clientY - mouseY
      let newX = origX, newY = origY, newW = origW, newH = origH
      if (dir === 'right' || dir === 'se') newW = Math.max(80, origW + dx)
      if (dir === 'bottom' || dir === 'se') newH = Math.max(60, origH + dy)
      if (dir === 'left') { newW = Math.max(80, origW - dx); newX = origX + origW - newW }
      if (dir === 'top') { newH = Math.max(60, origH - dy); newY = origY + origH - newH }
      s.setComments(prev => prev.map(c =>
        c.id === s.resizingCommentId ? { ...c, x: newX, y: newY, width: newW, height: newH } : c
      ))
    }

    if (s.draggingNode && s.mode === 'move') {
      const tx = wx - s.dragOffset.x
      const ty = wy - s.dragOffset.y
      if (proposalMode && isProposalDraft(s.draggingNode)) {
        s.setProposalNodes((prev) => prev.map((n) => n.id === s.draggingNode ? { ...n, x: tx, y: ty } : n))
      } else if (s.draggingNode.startsWith('existing-proposal-')) {
        const proposalId = parseInt(s.draggingNode.replace('existing-proposal-', ''), 10)
        s.setMyProposalEdits((prev) => {
          const current = prev.get(proposalId) ?? otherProposalNodes.find((n) => n.id === s.draggingNode)
          if (!current) return prev
          const next = new Map(prev)
          next.set(proposalId, { ...current, x: tx, y: ty })
          return next
        })
      } else if (isEditor) {
        s.setNodes((prev) => prev.map((n) => n.id === s.draggingNode ? { ...n, x: tx, y: ty } : n))
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (s.mode === 'add_comment' && s.commentDraftStartRef.current && s.commentDraft) {
      s.commentDraftStartRef.current = null
      const { x, y, w, h } = s.commentDraft
      s.setCommentDraft(null)
      if (w > 30 && h > 30 && isEditor) {
        const newComment = { x, y, width: w, height: h, title: 'コメント', color: COMMENT_COLORS[0].hex }
        commentsApi.create(newComment).then(created => {
          s.setComments(prev => [...prev, created])
        }).catch(() => {})
      }
      return
    }

    if (s.draggingCommentId) {
      saveCommentById(s.draggingCommentId)
      s.commentDragRef.current = null
      s.setDraggingCommentId(null)
      s.setIsPanning(false)
      return
    }

    if (s.resizingCommentId) {
      saveCommentById(s.resizingCommentId)
      s.setResizingCommentId(null)
      s.commentResizeStartRef.current = null
      s.setIsPanning(false)
      return
    }

    if (s.isPanning) s.setIsPanning(false)
    if (s.draggingNode) { s.setDraggingNode(null); return }

    if ((s.mode === 'select' || s.mode === 'add_node') && s.mouseDownNodeId.current && s.mouseDownPos.current && !s.touchJustPlacedNode.current) {
      const dx = e.clientX - s.mouseDownPos.current.x
      const dy = e.clientY - s.mouseDownPos.current.y
      if (dx * dx + dy * dy <= CLICK_MAX_DIST * CLICK_MAX_DIST) {
        const { nodeId, isProposal } = s.mouseDownNodeId.current
        openNode(nodeId, isProposal)
      }
    }
    s.mouseDownPos.current = null
    s.mouseDownNodeId.current = null
    s.touchJustPlacedNode.current = false
  }

  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    s.mouseDownNodeId.current = null
    s.mouseDownPos.current = { x: t.clientX, y: t.clientY }
    s.touchJustPlacedNode.current = false
    if (s.mode === 'select' || s.mode === 'move') {
      const newStart = { x: t.clientX - s.panRef.current.x, y: t.clientY - s.panRef.current.y }
      s.panStartRef.current = newStart
      s.setPanStart(newStart)
      s.setIsPanning(true)
    } else if (s.mode === 'add_node') {
      e.preventDefault()
      const rect = s.canvasRef.current!.getBoundingClientRect()
      const wx = t.clientX - rect.left - s.panRef.current.x
      const wy = t.clientY - rect.top - s.panRef.current.y
      if (proposalMode) {
        addProposalNode(wx, wy)
        s.touchJustPlacedNode.current = true
      } else if (isEditor) {
        s.setNodes((prev) => [...prev, {
          id: `node-${Date.now()}`, x: wx, y: wy,
          icon: 'stone', title: '新規クエスト', subtitle: '', description: '',
          tasks: [], rewards: [],
        }])
        s.touchJustPlacedNode.current = true
      }
    }
  }

  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !s.canvasRef.current) return
    const t = e.touches[0]
    e.preventDefault()

    if ((s.mode === 'select' || s.mode === 'move') && s.isPanning && !s.draggingNode) {
      s.setPan({ x: t.clientX - s.panStartRef.current.x, y: t.clientY - s.panStartRef.current.y })
    }

    if (s.mode === 'add_link') {
      const rect = s.canvasRef.current.getBoundingClientRect()
      s.setMousePos({ x: t.clientX - rect.left - s.panRef.current.x, y: t.clientY - rect.top - s.panRef.current.y })
      const hoverId = getNodeIdNearPoint(t.clientX, t.clientY, s.linkStartNode ?? undefined)
      s.setLinkHoverNode(hoverId)
    }

    if (s.draggingCommentId) {
      const rect = s.canvasRef.current.getBoundingClientRect()
      dragCommentTo(t.clientX - rect.left - s.panRef.current.x, t.clientY - rect.top - s.panRef.current.y)
      return
    }

    if (s.resizingCommentId && s.commentResizeStartRef.current) {
      const { mouseX, mouseY, origX, origY, origW, origH, dir } = s.commentResizeStartRef.current
      const dx = t.clientX - mouseX
      const dy = t.clientY - mouseY
      let newX = origX, newY = origY, newW = origW, newH = origH
      if (dir === 'right' || dir === 'se') newW = Math.max(80, origW + dx)
      if (dir === 'bottom' || dir === 'se') newH = Math.max(60, origH + dy)
      if (dir === 'left') { newW = Math.max(80, origW - dx); newX = origX + origW - newW }
      if (dir === 'top') { newH = Math.max(60, origH - dy); newY = origY + origH - newH }
      s.setComments((prev) => prev.map((c) =>
        c.id === s.resizingCommentId ? { ...c, x: newX, y: newY, width: newW, height: newH } : c))
      return
    }

    if (s.mode === 'move' && s.draggingNode) {
      const rect = s.canvasRef.current.getBoundingClientRect()
      const wx = t.clientX - rect.left - s.panRef.current.x
      const wy = t.clientY - rect.top - s.panRef.current.y
      const tx = wx - s.dragOffset.x
      const ty = wy - s.dragOffset.y
      if (proposalMode && isProposalDraft(s.draggingNode)) {
        s.setProposalNodes((prev) => prev.map((n) => n.id === s.draggingNode ? { ...n, x: tx, y: ty } : n))
      } else if (s.draggingNode.startsWith('existing-proposal-')) {
        const proposalId = parseInt(s.draggingNode.replace('existing-proposal-', ''), 10)
        s.setMyProposalEdits((prev) => {
          const current = prev.get(proposalId) ?? otherProposalNodes.find((n) => n.id === s.draggingNode)
          if (!current) return prev
          const next = new Map(prev)
          next.set(proposalId, { ...current, x: tx, y: ty })
          return next
        })
      } else if (isEditor) {
        s.setNodes((prev) => prev.map((n) => n.id === s.draggingNode ? { ...n, x: tx, y: ty } : n))
      }
    }
  }

  const handleCanvasTouchEnd = (e: React.TouchEvent) => {
    s.setIsPanning(false)
    s.setLinkHoverNode(null)

    if (s.draggingCommentId) {
      saveCommentById(s.draggingCommentId)
      s.commentDragRef.current = null
      s.setDraggingCommentId(null)
      return
    }
    if (s.resizingCommentId) {
      saveCommentById(s.resizingCommentId)
      s.setResizingCommentId(null)
      s.commentResizeStartRef.current = null
      return
    }

    if (s.draggingNode) { s.setDraggingNode(null); return }

    if ((s.mode === 'select' || s.mode === 'add_node') && s.mouseDownNodeId.current && s.mouseDownPos.current && !s.touchJustPlacedNode.current) {
      const touch = e.changedTouches[0]
      const dx = touch.clientX - s.mouseDownPos.current.x
      const dy = touch.clientY - s.mouseDownPos.current.y
      if (dx * dx + dy * dy <= CLICK_MAX_DIST * CLICK_MAX_DIST) {
        const { nodeId, isProposal } = s.mouseDownNodeId.current
        openNode(nodeId, isProposal)
      }
    }
    s.mouseDownPos.current = null
    s.mouseDownNodeId.current = null
  }

  return { handleCanvasMouseDown, handleMouseMove, handleMouseUp, handleCanvasTouchStart, handleCanvasTouchMove, handleCanvasTouchEnd }
}
