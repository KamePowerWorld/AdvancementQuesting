import type React from 'react'
import type { EditorNode } from '@/components/editor/types.js'
import type { NamespacedId } from '@/util/NamespacedId.js'
import type { ProposalNode } from '../types.js'
import { CLICK_MAX_DIST } from '../types.js'
import type { EditorState } from './useEditorState.js'

interface UseNodeHandlersDeps {
  otherProposalNodes: ProposalNode[]
  proposalMode: boolean
  isEditor: boolean
  canMoveNode: (nodeId: string) => boolean
  canDeleteNode: (nodeId: string) => boolean
  isProposalDraft: (nodeId: string) => boolean
  connectNodes: (startId: string, targetId: string) => void
  openNode: (nodeId: string, isOtherProposal: boolean) => void
  getNodeIdNearPoint: (clientX: number, clientY: number, excludeId?: string) => string | null
}

export function useNodeHandlers(s: EditorState, deps: UseNodeHandlersDeps) {
  const {
    otherProposalNodes, proposalMode, isEditor,
    canMoveNode, canDeleteNode, isProposalDraft, connectNodes, openNode, getNodeIdNearPoint,
  } = deps

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string, isOtherProposal = false) => {
    e.stopPropagation()
    if (e.button === 1 || e.button === 2) return

    s.mouseDownPos.current = { x: e.clientX, y: e.clientY }
    s.mouseDownNodeId.current = { nodeId, isProposal: isOtherProposal }

    if (s.mode === 'move' && canMoveNode(nodeId)) {
      const node = [...s.nodes, ...s.proposalNodes, ...otherProposalNodes].find((n) => n.id === nodeId)!
      const rect = s.canvasRef.current!.getBoundingClientRect()
      const wx = (e.clientX - rect.left - s.pan.x) / s.scale
      const wy = (e.clientY - rect.top - s.pan.y) / s.scale
      s.setDragOffset({ x: wx - node.x, y: wy - node.y })
      s.setDraggingNode(nodeId)
      s.setIsPanning(false)
      if (nodeId.startsWith('existing-proposal-')) {
        const proposalId = parseInt(nodeId.replace('existing-proposal-', ''), 10)
        s.setMyProposalEdits((prev) => {
          if (prev.has(proposalId)) return prev
          const next = new Map(prev)
          next.set(proposalId, node)
          return next
        })
      }
    } else if (s.mode === 'add_link') {
      if (!s.linkStartNode) s.setLinkStartNode(nodeId)
      else connectNodes(s.linkStartNode, nodeId)
    } else if (s.mode === 'delete' && canDeleteNode(nodeId)) {
      if (isOtherProposal) return
      if (isProposalDraft(nodeId)) {
        s.setProposalNodes((prev) => prev.filter((n) => n.id !== nodeId))
        s.setProposalEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      } else {
        s.setNodes((prev) => prev.filter((n) => n.id !== nodeId))
        s.setEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      }
    }
  }

  const handleNodeMouseUp = (e: React.MouseEvent) => {
    if (s.draggingNode) { e.stopPropagation(); s.setDraggingNode(null) }
  }

  const handleNodeTouchStart = (e: React.TouchEvent, nodeId: string, isOtherProposal = false) => {
    e.stopPropagation()
    if (e.touches.length !== 1) return
    const t = e.touches[0]

    s.mouseDownPos.current = { x: t.clientX, y: t.clientY }
    s.mouseDownNodeId.current = { nodeId, isProposal: isOtherProposal }

    s.setLongPressPopover(null)
    s.longPressActiveRef.current = false
    if (s.longPressTimerRef.current) clearTimeout(s.longPressTimerRef.current)
    if (s.mode === 'select') {
      const lpNode = [...s.nodesRef.current, ...s.proposalNodesRef.current, ...otherProposalNodes].find((n) => n.id === nodeId) ?? null
      if (lpNode && (lpNode.rewards?.length ?? 0) > 0) {
        s.longPressTimerRef.current = setTimeout(() => {
          s.longPressActiveRef.current = true
          s.longPressTimerRef.current = null
          s.setLongPressPopover({ node: lpNode, x: t.clientX, y: t.clientY })
        }, 500)
      }
    }

    if (s.mode === 'move' && canMoveNode(nodeId)) {
      const node = [...s.nodesRef.current, ...s.proposalNodesRef.current, ...otherProposalNodes].find((n) => n.id === nodeId)!
      const rect = s.canvasRef.current!.getBoundingClientRect()
      const wx = (t.clientX - rect.left - s.panRef.current.x) / s.scaleRef.current
      const wy = (t.clientY - rect.top - s.panRef.current.y) / s.scaleRef.current
      s.setDragOffset({ x: wx - node.x, y: wy - node.y })
      s.setDraggingNode(nodeId)
      s.setIsPanning(false)
      if (nodeId.startsWith('existing-proposal-')) {
        const proposalId = parseInt(nodeId.replace('existing-proposal-', ''), 10)
        s.setMyProposalEdits((prev) => {
          if (prev.has(proposalId)) return prev
          const next = new Map(prev)
          next.set(proposalId, node)
          return next
        })
      }
    } else if (s.mode === 'add_link') {
      const rect = s.canvasRef.current!.getBoundingClientRect()
      s.setMousePos({ x: (t.clientX - rect.left - s.panRef.current.x) / s.scaleRef.current, y: (t.clientY - rect.top - s.panRef.current.y) / s.scaleRef.current })
      if (!s.linkStartNode) s.setLinkStartNode(nodeId)
    }
  }

  const handleNodeTouchMove = (e: React.TouchEvent, nodeId: string) => {
    e.stopPropagation()
    if (e.touches.length !== 1 || !s.canvasRef.current) return
    const t = e.touches[0]
    e.preventDefault()

    if (s.longPressTimerRef.current && s.mouseDownPos.current) {
      const dx = t.clientX - s.mouseDownPos.current.x
      const dy = t.clientY - s.mouseDownPos.current.y
      if (dx * dx + dy * dy > CLICK_MAX_DIST * CLICK_MAX_DIST) {
        clearTimeout(s.longPressTimerRef.current)
        s.longPressTimerRef.current = null
      }
    }

    if (s.mode === 'move' && s.draggingNode === nodeId && canMoveNode(nodeId)) {
      const rect = s.canvasRef.current.getBoundingClientRect()
      const wx = (t.clientX - rect.left - s.panRef.current.x) / s.scaleRef.current
      const wy = (t.clientY - rect.top - s.panRef.current.y) / s.scaleRef.current
      const tx = wx - s.dragOffset.x
      const ty = wy - s.dragOffset.y
      if (proposalMode && isProposalDraft(nodeId)) {
        s.setProposalNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, x: tx, y: ty } : n))
      } else if (nodeId.startsWith('existing-proposal-')) {
        const proposalId = parseInt(nodeId.replace('existing-proposal-', ''), 10)
        s.setMyProposalEdits((prev) => {
          const current = prev.get(proposalId) ?? otherProposalNodes.find((n) => n.id === nodeId)
          if (!current) return prev
          const next = new Map(prev)
          next.set(proposalId, { ...current, x: tx, y: ty })
          return next
        })
      } else if (isEditor) {
        s.setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, x: tx, y: ty } : n))
      }
    } else if (s.mode === 'add_link') {
      const rect = s.canvasRef.current.getBoundingClientRect()
      s.setMousePos({ x: (t.clientX - rect.left - s.panRef.current.x) / s.scaleRef.current, y: (t.clientY - rect.top - s.panRef.current.y) / s.scaleRef.current })
      const hoverId = getNodeIdNearPoint(t.clientX, t.clientY, s.linkStartNode ?? undefined)
      s.setLinkHoverNode(hoverId)
    }
  }

  const handleNodeTouchEnd = (e: React.TouchEvent, nodeId: string, isOtherProposal = false) => {
    e.stopPropagation()

    if (s.longPressTimerRef.current) { clearTimeout(s.longPressTimerRef.current); s.longPressTimerRef.current = null }

    if (s.mode === 'move') {
      s.setDraggingNode(null)
      s.mouseDownPos.current = null
      s.mouseDownNodeId.current = null
      return
    }

    if (s.mode === 'add_link') {
      const touch = e.changedTouches[0]
      const targetId = s.linkHoverNode ?? getNodeIdNearPoint(touch.clientX, touch.clientY, nodeId)
      s.setLinkHoverNode(null)
      if (!s.linkStartNode) {
        s.setLinkStartNode(nodeId)
      } else if (targetId) {
        connectNodes(s.linkStartNode, targetId)
      } else {
        s.setLinkStartNode(null)
      }
      s.mouseDownPos.current = null
      s.mouseDownNodeId.current = null
      return
    }

    if (s.mode === 'delete' && canDeleteNode(nodeId) && !isOtherProposal) {
      if (isProposalDraft(nodeId)) {
        s.setProposalNodes((prev) => prev.filter((n) => n.id !== nodeId))
        s.setProposalEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      } else {
        s.setNodes((prev) => prev.filter((n) => n.id !== nodeId))
        s.setEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      }
      s.mouseDownPos.current = null
      s.mouseDownNodeId.current = null
      return
    }

    if (s.modeRef.current === 'select' && s.mouseDownPos.current) {
      const touch = e.changedTouches[0]
      const dx = touch.clientX - s.mouseDownPos.current.x
      const dy = touch.clientY - s.mouseDownPos.current.y
      if (dx * dx + dy * dy <= CLICK_MAX_DIST * CLICK_MAX_DIST) {
        if (s.longPressActiveRef.current) {
          s.longPressActiveRef.current = false
        } else {
          openNode(nodeId, isOtherProposal)
        }
      }
    }
    s.mouseDownPos.current = null
    s.mouseDownNodeId.current = null
  }

  const handleItemSelect = (itemType: NamespacedId) => {
    const config = s.itemSelectorConfig
    if (!config) return
    const apply = (n: EditorNode): EditorNode => {
      if (n.id !== config.nodeId) return n
      if (config.type === 'quest_icon') return { ...n, icon: itemType }
      if (config.type === 'task_item') return { ...n, icon: itemType, tasks: n.tasks.map((t) => t.id === config.taskId ? { ...t, itemType } : t) }
      if (config.type === 'reward_item') return { ...n, rewards: n.rewards.map((r) => r.id === config.rewardId ? { ...r, itemType } : r) }
      return n
    }
    s.setNodes((prev) => prev.map(apply))
    s.setProposalNodes((prev) => prev.map(apply))
    if (config.nodeId.startsWith('existing-proposal-')) {
      const proposalId = parseInt(config.nodeId.replace('existing-proposal-', ''), 10)
      s.setMyProposalEdits((prev) => {
        const current = prev.get(proposalId) ?? otherProposalNodes.find((n) => n.id === config.nodeId)
        if (!current) return prev
        const next = new Map(prev)
        next.set(proposalId, apply(current))
        return next
      })
    }
    s.setItemSelectorConfig(null)
  }

  const updateNode = (updated: EditorNode) => {
    s.setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
    s.setProposalNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
    if (updated.id.startsWith('existing-proposal-')) {
      const proposalId = parseInt(updated.id.replace('existing-proposal-', ''), 10)
      s.setMyProposalEdits((prev) => {
        const next = new Map(prev)
        next.set(proposalId, updated)
        return next
      })
    }
  }

  return { handleNodeMouseDown, handleNodeMouseUp, handleNodeTouchStart, handleNodeTouchMove, handleNodeTouchEnd, handleItemSelect, updateNode }
}
