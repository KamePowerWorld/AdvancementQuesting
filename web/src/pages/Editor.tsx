import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { MousePointer2, Move, Plus, ArrowRight, Trash2, List, Settings, User } from 'lucide-react'
import type { EditorNode, EditorEdge, ToolMode, Vec2, ItemSelectorConfig, EditingTaskReward } from '@/components/editor/types.js'
import { INITIAL_NODES, INITIAL_EDGES, TASK_TYPES } from '@/components/editor/constants.js'
import { ItemIcon } from '@/components/editor/ItemIcon.js'
import { ToolButton } from '@/components/editor/ToolButton.js'
import { EdgePattern } from '@/components/editor/EdgePattern.js'
import { getDisplayText } from '@/components/editor/utils.js'
import { QuestEditorModal } from '@/components/editor/modals/QuestEditorModal.js'
import { TaskRewardEditorModal } from '@/components/editor/modals/TaskRewardEditorModal.js'
import { ItemSelectorModal } from '@/components/editor/modals/ItemSelectorModal.js'
import { RewardTableModal } from '@/components/editor/modals/RewardTableModal.js'
import { LoginModal } from '@/components/LoginModal.js'
import { useAuth } from '@/contexts/AuthContext.js'
import { useEditor } from '@/contexts/EditorContext.js'
import { proposalsApi } from '@/api/proposals.js'
import { questsApi } from '@/api/quests.js'
import { progressApi } from '@/api/progress.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.js'
import type { Quest, Condition, Reward } from '@/types/quest.js' // Reward は rewards 変換で使用

// ---------------------------------------------------------------------------
// Quest API ↔ EditorNode 変換
// ---------------------------------------------------------------------------

function questToNode(q: Quest): EditorNode {
  const sid = String(q.id)
  return {
    id: sid,
    x: q.mapPosition?.x ?? 100,
    y: q.mapPosition?.y ?? 100,
    icon: q.icon ?? 'stone',
    title: q.title,
    subtitle: '',
    description: q.description ?? '',
    tasks: (q.conditions ?? []).map((c, i) => ({
      id: `${sid}-t${i}`,
      type: c.type,
      value: c.type === 'advancement' ? (c.advancementId ?? '') : ((c as any).label ?? (c as any).value ?? ''),
      ...(c.type === 'item' ? { itemType: c.itemType ?? 'stone', count: c.count ?? 1 } : {}),
    })),
    rewards: (q.rewards ?? []).map((r, i) => {
      const base = { id: `${sid}-r${i}`, value: '' }
      if (r.type === 'item') return { ...base, type: 'item', itemType: r.itemId }
      if (r.type === 'experience') return { ...base, type: 'xp', value: String(r.amount) }
      if (r.type === 'money') return { ...base, type: 'xp', value: `💰${r.amount}` }
      return { ...base, type: r.type }
    }),
  }
}

function questsToEdges(quests: Quest[]): EditorEdge[] {
  const edges: EditorEdge[] = []
  for (const q of quests) {
    for (const prereqId of (q.prerequisites ?? [])) {
      edges.push({ id: `e-${prereqId}-${q.id}`, source: String(prereqId), target: String(q.id) })
    }
  }
  return edges
}

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 提案ノード (EditorNode + 提案メタ情報) */
interface ProposalNode extends EditorNode {
  proposalId?: number
  proposerName?: string
  votesUp?: number
  myVote?: 'up' | 'down' | null
}

// ---------------------------------------------------------------------------
// サブコンポーネント
// ---------------------------------------------------------------------------

function ModeToast({ label, visible }: { label: string; visible: boolean }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 bottom-12 z-50 -translate-x-1/2 px-6 py-2 border-2 font-bold text-sm transition-all duration-300"
      style={{
        fontFamily: '"Courier New", Courier, monospace',
        backgroundColor: '#1a1a1a',
        color: '#d8cbb0',
        borderTopColor: '#555555',
        borderLeftColor: '#555555',
        borderBottomColor: '#C6C6C6',
        borderRightColor: '#C6C6C6',
        opacity: visible ? 1 : 0,
        transform: `translateX(-50%) translateY(${visible ? '0px' : '8px'})`,
      }}
    >
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const modeLabel: Record<ToolMode, string> = {
  select:   '選択',
  move:     '移動',
  add_node: 'クエスト追加',
  add_link: '依存関係の作成',
  delete:   '削除モード',
}

/** クリックと判定する最大移動距離 (px) */
const CLICK_MAX_DIST = 5

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export default function EditorPage() {
  const { isEditor: isEditorRole, viewMode, me } = useAuth()
  const isEditor = isEditorRole && viewMode === 'edit'
  const queryClient = useQueryClient()
  const {
    proposalMode, setProposalMode,
    setProposalCount, setSubmitting,
    setSaveQuests, saving, setSaving,
    lastQuestComplete,
  } = useEditor()

  // ---- クエストデータをAPIから取得 ----
  const { data: questsData } = useQuery({
    queryKey: ['quests'],
    queryFn: () => questsApi.list(),
  })

  // ---- 自分の進捗 (達成済み表示用) ----
  const { data: progressData } = useQuery({
    queryKey: ['progress'],
    queryFn: () => progressApi.list(),
    enabled: !!me,
  })

  // 完了したクエストID集合 (questId は文字列で保持してノードIDと比較)
  const completedQuestIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of progressData ?? []) {
      if (p.completed) set.add(String(p.questId))
    }
    return set
  }, [progressData])

  // ---- マップ演出: 今キラキラ中のノードID ----
  const [celebratingNodeId, setCelebratingNodeId] = useState<string | null>(null)

  // SSE でクエスト完了通知が来たら該当ノードを一定時間キラキラさせる
  useEffect(() => {
    if (!lastQuestComplete) return
    const nodeId = String(lastQuestComplete.questId)
    setCelebratingNodeId(nodeId)
    const timer = setTimeout(() => setCelebratingNodeId(null), 4000)
    return () => clearTimeout(timer)
  }, [lastQuestComplete])

  // ---- マップ状態 (APIデータがあればそちらを使い、なければフォールバック) ----
  const [nodes, setNodes] = useState<EditorNode[]>(INITIAL_NODES)
  const [edges, setEdges] = useState<EditorEdge[]>(INITIAL_EDGES)

  // APIデータが読み込まれたらノード/エッジを更新し、最左上ノードにパンを合わせる
  useEffect(() => {
    if (!questsData) return
    const publicQuests = questsData.filter((q) => q.status === 'public' || (isEditor && q.status !== 'proposed'))
    const newNodes = publicQuests.length > 0 ? publicQuests.map(questToNode) : INITIAL_NODES
    setNodes(newNodes)
    setEdges(publicQuests.length > 0 ? questsToEdges(publicQuests) : INITIAL_EDGES)
    if (newNodes.length > 0) {
      const minX = Math.min(...newNodes.map((n) => n.x))
      const minY = Math.min(...newNodes.map((n) => n.y))
      const PADDING = 80
      setPan({ x: -minX + PADDING, y: -minY + PADDING })
    }
  }, [questsData, isEditor])

  // ---- 提案ドラフト (ローカル) ----
  const [proposalNodes, setProposalNodes] = useState<EditorNode[]>([])
  const [proposalEdges, setProposalEdges] = useState<EditorEdge[]>([])

  // proposalNodes が変わるたびに App 側のカウントを同期
  useEffect(() => { setProposalCount(proposalNodes.length) }, [proposalNodes.length, setProposalCount])

  // 他者の pending 提案を取得
  const { data: existingProposals } = useQuery({
    queryKey: ['proposals'],
    queryFn: () => proposalsApi.list(),
    enabled: proposalMode || isEditor,
  })

  // ---- ツール ----
  const [mode, setMode] = useState<ToolMode>('select')

  // ---- パン ----
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<Vec2>({ x: 0, y: 0 })

  // ---- ドラッグ ----
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<Vec2>({ x: 0, y: 0 })

  // ---- リンク ----
  const [linkStartNode, setLinkStartNode] = useState<string | null>(null)
  const [linkHoverNode, setLinkHoverNode] = useState<string | null>(null)

  // ---- ホバー ----
  const [hoveredNode, setHoveredNode] = useState<EditorNode | null>(null)
  const [mousePos, setMousePos] = useState<Vec2>({ x: 0, y: 0 })

  // ---- select クリック判定: mouseDown 時の座標を記録し mouseUp で距離チェック ----
  const mouseDownPos = useRef<Vec2 | null>(null)
  const mouseDownNodeId = useRef<{ nodeId: string; isProposal: boolean } | null>(null)

  // ---- モーダル ----
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingProposalNodeId, setEditingProposalNodeId] = useState<string | null>(null)
  const [itemSelectorConfig, setItemSelectorConfig] = useState<ItemSelectorConfig | null>(null)
  const [showRewardTableModal, setShowRewardTableModal] = useState(false)
  const [editingTaskReward, setEditingTaskReward] = useState<EditingTaskReward | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // ---- URL ハッシュ同期 (#quest-<id>) ----
  // 共有・ブラウザ履歴に対応する。state(editingNodeId) と URL hash を双方向同期する。

  const hashSyncMountedRef = useRef(false) // マウント完了フラグ (初回の state→hash 書き出しを抑止)

  // (A) editingNodeId → URL hash の書き出し
  //  初回マウント時はスキップする。これをしないと、共有URL #quest-3 を開いた瞬間
  //  (editingNodeId はまだ null) に「自分のハッシュ」と誤認して消してしまうため。
  useEffect(() => {
    if (!hashSyncMountedRef.current) return // 初回は (B) のハッシュ読み取りに任せる
    const base = window.location.pathname + window.location.search
    const desiredHash = editingNodeId ? `#quest-${editingNodeId}` : ''
    if (window.location.hash === desiredHash) return
    window.history.replaceState(null, '', base + desiredHash)
  }, [editingNodeId])

  // (B) URL hash → editingNodeId
  //  - マウント時 / nodes 読込後: ハッシュに該当ノードがあれば開く (共有URL・別タブ対応)
  //  - hashchange (戻る/進む): ハッシュに完全追従して開閉する
  useEffect(() => {
    const idFromHash = () => {
      const m = window.location.hash.match(/^#quest-(.+)$/)
      return m ? decodeURIComponent(m[1]) : null
    }

    // 共有URLで開いた場合に対応 (該当ノードが揃ってから開く)
    const id = idFromHash()
    if (id && nodes.some((n) => n.id === id)) setEditingNodeId(id)

    const onHashChange = () => {
      const hid = idFromHash()
      if (hid && nodes.some((n) => n.id === hid)) setEditingNodeId(hid)
      else setEditingNodeId(null)
    }
    window.addEventListener('hashchange', onHashChange)

    // 初回の (A) スキップを解除 (マウント完了後は state→hash 書き出しを有効化)
    hashSyncMountedRef.current = true

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [nodes])

  // ---- トースト ----
  const [toastVisible, setToastVisible] = useState(false)
  const [toastLabel, setToastLabel] = useState('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- refs (タッチハンドラのクロージャ用) ----
  const canvasRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<Vec2>({ x: 0, y: 0 })
  const panRef = useRef<Vec2>({ x: 0, y: 0 })
  const nodesRef = useRef<EditorNode[]>(INITIAL_NODES)
  const proposalNodesRef = useRef<EditorNode[]>([])
  const modeRef = useRef<ToolMode>('select')

  // ---- 提案ドラフトかどうかの判定 ----
  const isProposalDraft = useCallback((nodeId: string) =>
    proposalNodesRef.current.some((n) => n.id === nodeId), [])

  // ---- ノードを開けるか / 読み取り専用か (selectモード時) ----
  // 未ログイン・プレイヤー通常: 読み取り専用で開ける
  // プレイヤー提案モード: ドラフトのみ編集可、既存は読み取り専用
  // 編集者: 常に編集可
  const canOpenNode = useCallback((_nodeId: string, _isOtherProposal = false): boolean => {
    return true  // 通常ノード・送信済み提案ノードは誰でも開ける (権限に応じて読み取り専用)
  }, [])

  const isReadOnlyNode = useCallback((nodeId: string): boolean => {
    if (isEditor) return false
    if (proposalMode && isProposalDraft(nodeId)) return false
    return true  // 未ログイン・プレイヤー通常・提案モードの既存ノード
  }, [isEditor, proposalMode, isProposalDraft])

  // ---- モード変更 ----
  const changeMode = useCallback((next: ToolMode) => {
    setMode(next)
    modeRef.current = next
    setLinkStartNode(null)
    setToastLabel(modeLabel[next])
    setToastVisible(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2000)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  useEffect(() => { panRef.current = pan }, [pan])
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { proposalNodesRef.current = proposalNodes }, [proposalNodes])

  // 提案モード終了時にドラフトリセット
  useEffect(() => {
    if (!proposalMode) {
      setProposalNodes([])
      setProposalEdges([])
    }
    changeMode('select')
  }, [proposalMode, changeMode])

  // ---------------------------------------------------------------------------
  // 権限チェック
  // ---------------------------------------------------------------------------

  const canMoveNode = useCallback((nodeId: string): boolean => {
    if (isEditor) return true
    if (proposalMode) return isProposalDraft(nodeId)
    return false
  }, [isEditor, proposalMode, isProposalDraft])

  const canDeleteNode = useCallback((nodeId: string): boolean => {
    if (isEditor) return true
    if (proposalMode) return isProposalDraft(nodeId)
    return false
  }, [isEditor, proposalMode, isProposalDraft])

  // ---------------------------------------------------------------------------
  // エッジ操作
  // ---------------------------------------------------------------------------

  const connectNodes = useCallback((startId: string, targetId: string) => {
    if (startId === targetId) return
    if (proposalMode) {
      setProposalEdges((prev) => {
        const existing = prev.find(
          (e) => (e.source === startId && e.target === targetId) ||
                 (e.target === startId && e.source === targetId),
        )
        return existing
          ? prev.filter((e) => e.id !== existing.id)
          : [...prev, { id: `pe-${Date.now()}`, source: startId, target: targetId }]
      })
    } else {
      setEdges((prev) => {
        const existing = prev.find(
          (e) => (e.source === startId && e.target === targetId) ||
                 (e.target === startId && e.source === targetId),
        )
        return existing
          ? prev.filter((e) => e.id !== existing.id)
          : [...prev, { id: `e-${Date.now()}`, source: startId, target: targetId }]
      })
    }
    setLinkStartNode(null)
    setLinkHoverNode(null)
  }, [proposalMode])

  const getNodeIdNearPoint = useCallback((clientX: number, clientY: number, excludeId?: string): string | null => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const wx = clientX - rect.left - panRef.current.x
    const wy = clientY - rect.top - panRef.current.y
    const HIT_R = 30
    const allNodes = [...nodesRef.current, ...proposalNodesRef.current]
    for (const n of allNodes) {
      if (n.id === excludeId) continue
      const dx = n.x - wx
      const dy = n.y - wy
      if (dx * dx + dy * dy <= HIT_R * HIT_R) return n.id
    }
    return null
  }, [])

  // ---------------------------------------------------------------------------
  // 提案ノード追加
  // ---------------------------------------------------------------------------

  const addProposalNode = useCallback((wx: number, wy: number) => {
    const newNode: EditorNode = {
      id: `proposal-${Date.now()}`,
      x: wx, y: wy,
      icon: 'stone', title: '新規提案クエスト', subtitle: '', description: '',
      tasks: [], rewards: [],
    }
    setProposalNodes((prev) => [...prev, newNode])
  }, [])

  // ---------------------------------------------------------------------------
  // 提案送信 (App側のコンテキストに登録)
  // ---------------------------------------------------------------------------

  const { setSubmitProposals } = useEditor()

  const submitProposals = useCallback(async () => {
    if (proposalNodes.length === 0) return
    setSubmitting(true)
    try {
      for (const node of proposalNodes) {
        await proposalsApi.create({
          title: node.title,
          description: node.description,
          icon: node.icon,
          prerequisites: proposalEdges
            .filter((e) => e.target === node.id)
            .map((e) => e.source),
          mapPosition: { x: node.x, y: node.y },
        } as any)
      }
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      // 提案モードは継続 — 送信済み提案をマップ上で確認できるようにする
      setProposalNodes([])
      setProposalEdges([])
      showToast('提案を送信しました！')
    } catch {
      showToast('送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalNodes, proposalEdges, queryClient, setProposalMode, setSubmitting])

  // submitProposals が変わるたびに App 側へ登録
  // useState の setter は関数を渡すと updater として呼ぶため () => fn の形で包む
  useEffect(() => {
    setSubmitProposals(() => submitProposals)
  }, [submitProposals, setSubmitProposals])

  const showToast = (label: string) => {
    setToastLabel(label)
    setToastVisible(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 3000)
  }

  // ---------------------------------------------------------------------------
  // ログアウト
  // ---------------------------------------------------------------------------

  const handleLogout = async () => {
    try { await authApi.logout() } catch (_) {}
    localStorage.removeItem('token')
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
    setProposalMode(false)
  }

  // ---------------------------------------------------------------------------
  // 保存
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      // APIに存在しないノードを新規作成、既存ノードを更新
      // node.id は文字列 (questToNode で String(q.id) 変換済み)
      // API の quest.id は number なので比較時に変換する
      const existingIds = new Set((questsData ?? []).map((q) => String(q.id)))
      await Promise.all(nodes.map(async (node) => {
        // EditorTask → API conditions
        const conditions: Condition[] = (node.tasks ?? []).map((t) => {
          const ta = t as any
          if (t.type === 'advancement') return { id: t.id, type: 'advancement' as const, advancementId: ta.advancementId ?? t.value ?? '' }
          if (t.type === 'item') return { id: t.id, type: 'item' as const, itemType: ta.itemType ?? 'stone', count: ta.count ?? 1 }
          if (t.type === 'checkmark') return { id: t.id, type: 'checkmark' as const, label: ta.label ?? t.value ?? '' }
          if (t.type === 'stat') return { id: t.id, type: 'stat' as const, value: ta.statId ?? t.value ?? '' }
          return { id: t.id, type: 'checkmark' as const, label: t.value }
        })
        // EditorReward → API rewards
        const rewards: Reward[] = (node.rewards ?? []).map((r) => {
          if (r.type === 'item') return { type: 'item' as const, itemId: r.itemType ?? 'stone', count: 1 }
          if (r.type === 'xp') return { type: 'experience' as const, amount: parseInt(r.value || '0', 10), isLevel: false }
          if (r.type === 'command') return { type: 'command' as const, command: r.value, opLevel: 0 }
          return { type: 'command' as const, command: '', opLevel: 0 }
        })
        const body = {
          title: node.title,
          description: node.description,
          icon: node.icon,
          mapPosition: { x: node.x, y: node.y },
          // エッジの source/target は文字列 → API送信時は number 配列に戻す
          prerequisites: edges
            .filter((e) => e.target === node.id)
            .map((e) => parseInt(e.source, 10))
            .filter((n) => !isNaN(n)),
          conditions,
          rewards,
          status: 'public' as const,
        }
        if (existingIds.has(node.id)) {
          await questsApi.update(parseInt(node.id, 10), body)
        } else {
          await questsApi.create({ ...body, category: null, customButtons: [] })
        }
      }))
      queryClient.invalidateQueries({ queryKey: ['quests'] })
      showToast('保存しました')
    } catch {
      showToast('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [saving, nodes, edges, questsData, queryClient])

  // handleSave が変わるたびに App 側へ登録
  useEffect(() => {
    setSaveQuests(() => handleSave)
  }, [handleSave, setSaveQuests])

  // ---------------------------------------------------------------------------
  // キャンバスイベント (マウス)
  // ---------------------------------------------------------------------------

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault()
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      setLinkStartNode(null)
      return
    }
    mouseDownNodeId.current = null
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    if (mode === 'select' || mode === 'move') {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    } else if (mode === 'add_node') {
      const rect = canvasRef.current!.getBoundingClientRect()
      const wx = e.clientX - rect.left - pan.x
      const wy = e.clientY - rect.top - pan.y
      if (proposalMode) {
        addProposalNode(wx, wy)
      } else if (isEditor) {
        setNodes((prev) => [...prev, {
          id: `node-${Date.now()}`, x: wx, y: wy,
          icon: 'stone', title: '新規クエスト', subtitle: '', description: '',
          tasks: [], rewards: [],
        }])
      }
    } else if (mode === 'add_link') {
      setLinkStartNode(null)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    if (isPanning && !draggingNode) setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
    const wx = e.clientX - rect.left - pan.x
    const wy = e.clientY - rect.top - pan.y
    setMousePos({ x: wx, y: wy })
    if (draggingNode && mode === 'move') {
      const tx = wx - dragOffset.x
      const ty = wy - dragOffset.y
      if (proposalMode && isProposalDraft(draggingNode)) {
        setProposalNodes((prev) => prev.map((n) =>
          n.id === draggingNode ? { ...n, x: tx, y: ty } : n))
      } else if (isEditor) {
        setNodes((prev) => prev.map((n) =>
          n.id === draggingNode ? { ...n, x: tx, y: ty } : n))
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) setIsPanning(false)
    if (draggingNode) { setDraggingNode(null); return }

    // select モード: クリック判定 (キャンバス背景クリックでは無視)
    if (mode === 'select' && mouseDownNodeId.current && mouseDownPos.current) {
      const dx = e.clientX - mouseDownPos.current.x
      const dy = e.clientY - mouseDownPos.current.y
      if (dx * dx + dy * dy <= CLICK_MAX_DIST * CLICK_MAX_DIST) {
        const { nodeId, isProposal } = mouseDownNodeId.current
        openNode(nodeId, isProposal)
      }
    }
    mouseDownPos.current = null
    mouseDownNodeId.current = null
  }

  const openNode = (nodeId: string, isOtherProposal: boolean) => {
    if (isOtherProposal) {
      setEditingProposalNodeId(nodeId)
      return
    }
    if (!canOpenNode(nodeId)) return
    setEditingNodeId(nodeId)
  }


  // ---------------------------------------------------------------------------
  // キャンバスイベント (タッチ)
  // ---------------------------------------------------------------------------

  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    mouseDownNodeId.current = null
    mouseDownPos.current = { x: t.clientX, y: t.clientY }
    if (mode === 'select' || mode === 'move') {
      const newStart = { x: t.clientX - panRef.current.x, y: t.clientY - panRef.current.y }
      panStartRef.current = newStart
      setPanStart(newStart)
      setIsPanning(true)
    } else if (mode === 'add_node') {
      e.preventDefault()
      const rect = canvasRef.current!.getBoundingClientRect()
      const wx = t.clientX - rect.left - panRef.current.x
      const wy = t.clientY - rect.top - panRef.current.y
      if (proposalMode) {
        addProposalNode(wx, wy)
      } else if (isEditor) {
        setNodes((prev) => [...prev, {
          id: `node-${Date.now()}`, x: wx, y: wy,
          icon: 'stone', title: '新規クエスト', subtitle: '', description: '',
          tasks: [], rewards: [],
        }])
      }
    }
  }

  const handleCanvasTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !canvasRef.current) return
    const t = e.touches[0]
    e.preventDefault()

    if ((mode === 'select' || mode === 'move') && isPanning && !draggingNode) {
      setPan({ x: t.clientX - panStartRef.current.x, y: t.clientY - panStartRef.current.y })
    }

    if (mode === 'add_link') {
      const rect = canvasRef.current.getBoundingClientRect()
      setMousePos({
        x: t.clientX - rect.left - panRef.current.x,
        y: t.clientY - rect.top - panRef.current.y,
      })
      const hoverId = getNodeIdNearPoint(t.clientX, t.clientY, linkStartNode ?? undefined)
      setLinkHoverNode(hoverId)
    }

    if (mode === 'move' && draggingNode) {
      const rect = canvasRef.current.getBoundingClientRect()
      const wx = t.clientX - rect.left - panRef.current.x
      const wy = t.clientY - rect.top - panRef.current.y
      const tx = wx - dragOffset.x
      const ty = wy - dragOffset.y
      if (proposalMode && isProposalDraft(draggingNode)) {
        setProposalNodes((prev) => prev.map((n) =>
          n.id === draggingNode ? { ...n, x: tx, y: ty } : n))
      } else if (isEditor) {
        setNodes((prev) => prev.map((n) =>
          n.id === draggingNode ? { ...n, x: tx, y: ty } : n))
      }
    }
  }

  const handleCanvasTouchEnd = (e: React.TouchEvent) => {
    setIsPanning(false)
    setLinkHoverNode(null)

    if (draggingNode) { setDraggingNode(null); return }

    // select タッチクリック判定
    if (modeRef.current === 'select' && mouseDownNodeId.current && mouseDownPos.current) {
      const touch = e.changedTouches[0]
      const dx = touch.clientX - mouseDownPos.current.x
      const dy = touch.clientY - mouseDownPos.current.y
      if (dx * dx + dy * dy <= CLICK_MAX_DIST * CLICK_MAX_DIST) {
        const { nodeId, isProposal } = mouseDownNodeId.current
        openNode(nodeId, isProposal)
      }
    }
    mouseDownPos.current = null
    mouseDownNodeId.current = null
  }

  // ---------------------------------------------------------------------------
  // ノードイベント (マウス)
  // ---------------------------------------------------------------------------

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string, isOtherProposal = false) => {
    e.stopPropagation()
    if (e.button === 1 || e.button === 2) return

    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    mouseDownNodeId.current = { nodeId, isProposal: isOtherProposal }

    if (mode === 'move' && canMoveNode(nodeId)) {
      const node = [...nodes, ...proposalNodes].find((n) => n.id === nodeId)!
      const rect = canvasRef.current!.getBoundingClientRect()
      const wx = e.clientX - rect.left - pan.x
      const wy = e.clientY - rect.top - pan.y
      setDragOffset({ x: wx - node.x, y: wy - node.y })
      setDraggingNode(nodeId)
      setIsPanning(false)
    } else if (mode === 'add_link') {
      if (!linkStartNode) {
        setLinkStartNode(nodeId)
      } else {
        connectNodes(linkStartNode, nodeId)
      }
    } else if (mode === 'delete' && canDeleteNode(nodeId)) {
      if (isOtherProposal) return  // 他者の提案は削除不可
      const isDraft = isProposalDraft(nodeId)
      if (isDraft) {
        setProposalNodes((prev) => prev.filter((n) => n.id !== nodeId))
        setProposalEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      } else {
        setNodes((prev) => prev.filter((n) => n.id !== nodeId))
        setEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      }
    }
    // select モードはここでは何もしない — mouseUp で距離判定してから開く
  }

  const handleNodeMouseUp = (e: React.MouseEvent) => {
    // stopPropagation しない — キャンバスの handleMouseUp にクリック判定を委譲
    if (draggingNode) { e.stopPropagation(); setDraggingNode(null) }
  }

  // ---------------------------------------------------------------------------
  // ノードイベント (タッチ)
  // ---------------------------------------------------------------------------

  const handleNodeTouchStart = (e: React.TouchEvent, nodeId: string, isOtherProposal = false) => {
    e.stopPropagation()
    if (e.touches.length !== 1) return
    const t = e.touches[0]

    mouseDownPos.current = { x: t.clientX, y: t.clientY }
    mouseDownNodeId.current = { nodeId, isProposal: isOtherProposal }

    if (mode === 'move' && canMoveNode(nodeId)) {
      const node = [...nodesRef.current, ...proposalNodesRef.current].find((n) => n.id === nodeId)!
      const rect = canvasRef.current!.getBoundingClientRect()
      const wx = t.clientX - rect.left - panRef.current.x
      const wy = t.clientY - rect.top - panRef.current.y
      setDragOffset({ x: wx - node.x, y: wy - node.y })
      setDraggingNode(nodeId)
      setIsPanning(false)
    } else if (mode === 'add_link') {
      const rect = canvasRef.current!.getBoundingClientRect()
      setMousePos({
        x: t.clientX - rect.left - panRef.current.x,
        y: t.clientY - rect.top - panRef.current.y,
      })
      if (!linkStartNode) setLinkStartNode(nodeId)
    }
  }

  const handleNodeTouchMove = (e: React.TouchEvent, nodeId: string) => {
    e.stopPropagation()
    if (e.touches.length !== 1 || !canvasRef.current) return
    const t = e.touches[0]
    e.preventDefault()

    if (mode === 'move' && draggingNode === nodeId && canMoveNode(nodeId)) {
      const rect = canvasRef.current.getBoundingClientRect()
      const wx = t.clientX - rect.left - panRef.current.x
      const wy = t.clientY - rect.top - panRef.current.y
      const tx = wx - dragOffset.x
      const ty = wy - dragOffset.y
      if (proposalMode && isProposalDraft(nodeId)) {
        setProposalNodes((prev) => prev.map((n) =>
          n.id === nodeId ? { ...n, x: tx, y: ty } : n))
      } else if (isEditor) {
        setNodes((prev) => prev.map((n) =>
          n.id === nodeId ? { ...n, x: tx, y: ty } : n))
      }
    } else if (mode === 'add_link') {
      const rect = canvasRef.current.getBoundingClientRect()
      setMousePos({
        x: t.clientX - rect.left - panRef.current.x,
        y: t.clientY - rect.top - panRef.current.y,
      })
      const hoverId = getNodeIdNearPoint(t.clientX, t.clientY, linkStartNode ?? undefined)
      setLinkHoverNode(hoverId)
    }
  }

  const handleNodeTouchEnd = (e: React.TouchEvent, nodeId: string, isOtherProposal = false) => {
    e.stopPropagation()

    if (mode === 'move') {
      setDraggingNode(null)
      mouseDownPos.current = null
      mouseDownNodeId.current = null
      return
    }

    if (mode === 'add_link') {
      const touch = e.changedTouches[0]
      const targetId = linkHoverNode ?? getNodeIdNearPoint(touch.clientX, touch.clientY, nodeId)
      setLinkHoverNode(null)
      if (!linkStartNode) {
        setLinkStartNode(nodeId)
      } else if (targetId) {
        connectNodes(linkStartNode, targetId)
      } else {
        setLinkStartNode(null)
      }
      mouseDownPos.current = null
      mouseDownNodeId.current = null
      return
    }

    if (mode === 'delete' && canDeleteNode(nodeId) && !isOtherProposal) {
      const isDraft = isProposalDraft(nodeId)
      if (isDraft) {
        setProposalNodes((prev) => prev.filter((n) => n.id !== nodeId))
        setProposalEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      } else {
        setNodes((prev) => prev.filter((n) => n.id !== nodeId))
        setEdges((prev) => prev.filter((ed) => ed.source !== nodeId && ed.target !== nodeId))
      }
      mouseDownPos.current = null
      mouseDownNodeId.current = null
      return
    }

    // select: handleCanvasTouchEnd に委譲 (e.stopPropagation でそちらには届かないのでここで処理)
    if (modeRef.current === 'select' && mouseDownPos.current) {
      const touch = e.changedTouches[0]
      const dx = touch.clientX - mouseDownPos.current.x
      const dy = touch.clientY - mouseDownPos.current.y
      if (dx * dx + dy * dy <= CLICK_MAX_DIST * CLICK_MAX_DIST) {
        openNode(nodeId, isOtherProposal)
      }
    }
    mouseDownPos.current = null
    mouseDownNodeId.current = null
  }

  // ---------------------------------------------------------------------------
  // アイテム選択
  // ---------------------------------------------------------------------------

  const handleItemSelect = (itemType: string) => {
    const config = itemSelectorConfig
    if (!config) return
    const updater = (prev: EditorNode[]) => prev.map((n) => {
      if (n.id !== config.nodeId) return n
      if (config.type === 'quest_icon') return { ...n, icon: itemType }
      if (config.type === 'task_item') return { ...n, tasks: n.tasks.map((t) => t.id === config.taskId ? { ...t, itemType } : t) }
      return { ...n, rewards: n.rewards.map((r) => r.id === config.rewardId ? { ...r, itemType } : r) }
    })
    setProposalNodes(updater)
    setNodes(updater)
    setItemSelectorConfig(null)
  }

  const updateNode = (updated: EditorNode) => {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
    setProposalNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
  }

  // ---------------------------------------------------------------------------
  // 承認・却下
  // ---------------------------------------------------------------------------

  const handleVote = async (proposalId: number, type: 'up' | 'down') => {
    await proposalsApi.vote(proposalId, { type })
    queryClient.invalidateQueries({ queryKey: ['proposals'] })
  }

  const handleApprove = async (proposalId: number) => {
    await proposalsApi.approve(proposalId)
    queryClient.invalidateQueries({ queryKey: ['proposals'] })
    queryClient.invalidateQueries({ queryKey: ['quests'] })
    setEditingProposalNodeId(null)
  }

  const handleReject = async (proposalId: number) => {
    const reason = prompt('却下理由を入力してください (省略可)')
    await proposalsApi.reject(proposalId, { reason: reason ?? '' })
    queryClient.invalidateQueries({ queryKey: ['proposals'] })
    setEditingProposalNodeId(null)
  }

  // ---------------------------------------------------------------------------
  // 他者の提案ノード
  // ---------------------------------------------------------------------------

  const otherProposalNodes: ProposalNode[] = (existingProposals ?? [])
    .filter((p: any) => p.status === 'pending')
    .map((p: any) => ({
      id: `existing-proposal-${p.id}`,
      x: p.mapPosition?.x ?? 100,
      y: p.mapPosition?.y ?? 100,
      icon: p.questSnapshot?.icon ?? 'stone',
      title: p.questSnapshot?.title ?? '提案',
      subtitle: p.questSnapshot?.subtitle ?? '',
      description: p.questSnapshot?.description ?? '',
      tasks: p.questSnapshot?.tasks ?? [],
      rewards: p.questSnapshot?.rewards ?? [],
      proposalId: p.id,
      proposerName: p.proposerName ?? '',
      votesUp: p.votesUp ?? 0,
      myVote: p.myVote ?? null,
    }))

  // ---------------------------------------------------------------------------
  // 編集中ノード
  // ---------------------------------------------------------------------------

  const editingNode = editingNodeId
    ? nodes.find((n) => n.id === editingNodeId) ?? proposalNodes.find((n) => n.id === editingNodeId)
    : null

  const editingProposalNode = editingProposalNodeId
    ? otherProposalNodes.find((n) => n.id === editingProposalNodeId) ?? null
    : null

  const taskRewardNode = editingTaskReward
    ? [...nodes, ...proposalNodes].find((n) => n.id === editingTaskReward.nodeId)
    : null

  // ---------------------------------------------------------------------------
  // ツールバー表示ルール
  // ---------------------------------------------------------------------------

  const showAddNode    = isEditor || proposalMode
  const showAddLink    = isEditor || proposalMode
  const showMove       = isEditor || proposalMode
  const showDelete     = isEditor || proposalMode
  const showRewardTable = isEditor
  const showSettings   = isEditor

  // ---------------------------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------------------------

  return (
      <div
        className="flex-1 relative flex overflow-hidden select-none min-h-0"
        style={{ fontFamily: '"Minecraftia", "Courier New", Courier, monospace' }}
      >
        {/* ===== 左サイドバー: ツールバー ===== */}
        <div className="w-16 bg-[#8B8B8B] border-r-4 border-black p-2 flex flex-col items-center shrink-0 z-20 shadow-[inset_-2px_0_0_rgba(0,0,0,0.2)]">
          <ToolButton icon={MousePointer2} active={mode === 'select'} onClick={() => changeMode('select')} tooltip="選択" />
          {showMove     && <ToolButton icon={Move}       active={mode === 'move'}     onClick={() => changeMode('move')}     tooltip="移動" />}
          {showAddNode  && <ToolButton icon={Plus}       active={mode === 'add_node'} onClick={() => changeMode('add_node')} tooltip="クエストを追加" />}
          {showAddLink  && <ToolButton icon={ArrowRight} active={mode === 'add_link'} onClick={() => changeMode('add_link')} tooltip="依存関係を追加" />}
          {showDelete   && <ToolButton icon={Trash2}     active={mode === 'delete'}   onClick={() => changeMode('delete')}   tooltip="削除" />}

          <div className="flex-grow" />

          {showRewardTable && <ToolButton icon={List}     active={showRewardTableModal} onClick={() => setShowRewardTableModal(true)} tooltip="報酬テーブル" />}
          {showSettings    && <ToolButton icon={Settings} active={false}               onClick={() => {}}                          tooltip="設定" />}

          {/* ユーザーアイコン */}
          {me ? (
            <button
              onClick={handleLogout}
              title={`${me.playerName} — クリックでログアウト`}
              aria-label="ログアウト"
              className="mt-1 w-10 h-10 flex items-center justify-center border-2 relative overflow-hidden"
              style={{
                backgroundColor: '#6B6B6B',
                borderTopColor: '#9B9B9B',
                borderLeftColor: '#9B9B9B',
                borderBottomColor: '#3B3B3B',
                borderRightColor: '#3B3B3B',
                padding: 0,
              }}
            >
              <img
                src={`https://mc-heads.net/avatar/${me.playerName}/40`}
                alt={me.playerName}
                width={40}
                height={40}
                style={{ imageRendering: 'pixelated', display: 'block' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </button>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              title="ログイン"
              className="mt-1 w-10 h-10 flex items-center justify-center border-2"
              style={{
                backgroundColor: '#6B6B6B',
                borderTopColor: '#9B9B9B',
                borderLeftColor: '#9B9B9B',
                borderBottomColor: '#3B3B3B',
                borderRightColor: '#3B3B3B',
              }}
            >
              <User size={18} style={{ color: '#d8cbb0' }} />
            </button>
          )}
        </div>

        {/* ===== キャンバスエリア ===== */}
        <div
          ref={canvasRef}
          className={`flex-grow relative overflow-hidden ${
            mode === 'move' && !draggingNode ? 'cursor-grab'
            : draggingNode ? 'cursor-grabbing'
            : mode === 'add_node' ? 'cursor-crosshair'
            : 'cursor-default'
          }`}
          style={{
            backgroundColor: '#5d6b5e',
            backgroundImage: `
              linear-gradient(rgba(0,0,0,0.15) 2px, transparent 2px),
              linear-gradient(90deg, rgba(0,0,0,0.15) 2px, transparent 2px)
            `,
            backgroundSize: '40px 40px',
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            boxShadow: 'inset 0 0 50px rgba(0, 0, 0, 0.4)',
            touchAction: 'none',
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
        >
          <div
            style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0' }}
            className="absolute inset-0 w-full h-full"
          >
            {/* エッジ */}
            <svg className="absolute inset-0 overflow-visible pointer-events-none z-0">
              {edges.map((edge) => {
                const src = nodes.find((n) => n.id === edge.source)
                const tgt = nodes.find((n) => n.id === edge.target)
                if (!src || !tgt) return null
                return <EdgePattern key={edge.id} source={src} target={tgt} />
              })}
              {proposalEdges.map((edge) => {
                const allNodes = [...nodes, ...proposalNodes]
                const src = allNodes.find((n) => n.id === edge.source)
                const tgt = allNodes.find((n) => n.id === edge.target)
                if (!src || !tgt) return null
                return <EdgePattern key={edge.id} source={src} target={tgt} />
              })}
              {mode === 'add_link' && linkStartNode && (() => {
                const allNodes = [...nodes, ...proposalNodes]
                const startNode = allNodes.find((n) => n.id === linkStartNode)
                if (!startNode) return null
                return <EdgePattern source={startNode} isPreview targetPos={mousePos} />
              })()}
            </svg>

            {/* 通常ノード */}
            {nodes.map((node) => (
              <NodeEl
                key={node.id}
                node={node}
                mode={mode}
                draggingNode={draggingNode}
                linkStartNode={linkStartNode}
                linkHoverNode={linkHoverNode}
                setHoveredNode={setHoveredNode}
                completed={completedQuestIds.has(node.id)}
                celebrating={celebratingNodeId === node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id, false)}
                onMouseUp={handleNodeMouseUp}
                onTouchStart={(e) => handleNodeTouchStart(e, node.id, false)}
                onTouchMove={(e) => handleNodeTouchMove(e, node.id)}
                onTouchEnd={(e) => handleNodeTouchEnd(e, node.id, false)}
              />
            ))}

            {/* 提案ドラフトノード */}
            {proposalNodes.map((node) => (
              <NodeEl
                key={node.id}
                node={node}
                mode={mode}
                draggingNode={draggingNode}
                linkStartNode={linkStartNode}
                linkHoverNode={linkHoverNode}
                setHoveredNode={setHoveredNode}
                isDraft
                onMouseDown={(e) => handleNodeMouseDown(e, node.id, false)}
                onMouseUp={handleNodeMouseUp}
                onTouchStart={(e) => handleNodeTouchStart(e, node.id, false)}
                onTouchMove={(e) => handleNodeTouchMove(e, node.id)}
                onTouchEnd={(e) => handleNodeTouchEnd(e, node.id, false)}
              />
            ))}

            {/* 他者の提案ノード (半透明) */}
            {(proposalMode || isEditor) && otherProposalNodes.map((node) => (
              <OtherProposalNodeEl
                key={node.id}
                node={node}
                mode={mode}
                isEditor={isEditor}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id, true)}
                onMouseUp={handleNodeMouseUp}
                onTouchStart={(e) => handleNodeTouchStart(e, node.id, true)}
                onTouchMove={(e) => handleNodeTouchMove(e, node.id)}
                onTouchEnd={(e) => handleNodeTouchEnd(e, node.id, true)}
              />
            ))}
          </div>

          {/* ツールチップ */}
          {hoveredNode && !draggingNode && !isPanning && !editingNodeId && !itemSelectorConfig && !editingTaskReward && (
            <div
              className="absolute z-30 bg-black/90 border-2 border-purple-700 text-white p-3 pointer-events-none shadow-xl max-w-xs hidden sm:block"
              style={{
                left: Math.min(mousePos.x + pan.x + 20, (canvasRef.current?.offsetWidth ?? 0) - 200),
                top: Math.min(mousePos.y + pan.y + 20, (canvasRef.current?.offsetHeight ?? 0) - 100),
              }}
            >
              <div className="font-bold text-blue-300 text-lg mb-1">{hoveredNode.title}</div>
              {hoveredNode.subtitle && (
                <div className="text-gray-400 text-xs italic mb-2">{hoveredNode.subtitle}</div>
              )}
              <div className="text-sm space-y-1">
                {hoveredNode.tasks?.map((task) => (
                  <div key={task.id} className="text-gray-300 flex items-center gap-1">
                    <span className="text-gray-500">
                      {TASK_TYPES.find((t) => t.id === task.type)?.icon ?? '•'}
                    </span>
                    {getDisplayText(task, 'task')}
                  </div>
                ))}
                {(!hoveredNode.tasks || hoveredNode.tasks.length === 0) && (
                  <div className="text-gray-500 text-xs">タスクがありません</div>
                )}
              </div>
            </div>
          )}

          <ModeToast label={toastLabel} visible={toastVisible} />
        </div>

        {/* ===== モーダル群 ===== */}

        {editingNode && (
          <QuestEditorModal
            node={editingNode}
            updateNode={updateNode}
            close={() => setEditingNodeId(null)}
            openItemSelector={setItemSelectorConfig}
            openTaskRewardEditor={setEditingTaskReward}
            readOnly={isReadOnlyNode(editingNodeId!)}
          />
        )}

        {editingProposalNode && (
          <QuestEditorModal
            node={editingProposalNode}
            updateNode={() => {}}
            close={() => setEditingProposalNodeId(null)}
            openItemSelector={setItemSelectorConfig}
            openTaskRewardEditor={setEditingTaskReward}
            proposalMeta={editingProposalNode.proposalId != null ? (() => {
              const p = existingProposals?.find((p: any) => p.id === editingProposalNode.proposalId) as any
              return {
                proposalId: editingProposalNode.proposalId,
                proposerName: p?.proposerName ?? '',
                votesUp: editingProposalNode.votesUp ?? 0,
                myVote: p?.myVote ?? null,
                onVote: (type: 'up' | 'down') => handleVote(editingProposalNode.proposalId!, type),
                ...(isEditor ? {
                  onApprove: () => handleApprove(editingProposalNode.proposalId!),
                  onReject: () => handleReject(editingProposalNode.proposalId!),
                } : {}),
              }
            })() : undefined}
            readOnly
          />
        )}

        {editingTaskReward && taskRewardNode && (
          <TaskRewardEditorModal
            node={taskRewardNode}
            category={editingTaskReward.category}
            itemId={editingTaskReward.itemId}
            updateNode={updateNode}
            close={() => setEditingTaskReward(null)}
            openItemSelector={setItemSelectorConfig}
          />
        )}

        {showRewardTableModal && (
          <RewardTableModal close={() => setShowRewardTableModal(false)} />
        )}

        {itemSelectorConfig && (
          <ItemSelectorModal
            close={() => setItemSelectorConfig(null)}
            onSelect={handleItemSelect}
          />
        )}

        {showLoginModal && (
          <LoginModal close={() => setShowLoginModal(false)} />
        )}
      </div>
  )
}

// ---------------------------------------------------------------------------
// ノード描画サブコンポーネント
// ---------------------------------------------------------------------------

interface NodeElProps {
  node: EditorNode
  mode: ToolMode
  draggingNode: string | null
  linkStartNode: string | null
  linkHoverNode: string | null
  setHoveredNode: (n: EditorNode | null) => void
  isDraft?: boolean
  /** クエスト達成済み (金枠 + チェックマーク表示) */
  completed?: boolean
  /** たった今達成した瞬間のキラキラ演出中 */
  celebrating?: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

function NodeEl({ node, mode, draggingNode, linkStartNode, linkHoverNode, setHoveredNode, isDraft, completed, celebrating, onMouseDown, onMouseUp, onTouchStart, onTouchMove, onTouchEnd }: NodeElProps) {
  return (
    <div
      data-node-id={node.id}
      data-completed={completed ? 'true' : undefined}
      data-celebrating={celebrating ? 'true' : undefined}
      className={`absolute w-12 h-12 -ml-6 -mt-6 flex items-center justify-center cursor-pointer z-10 transition-transform ${
        draggingNode === node.id ? 'scale-110 z-20' : ''
      } ${celebrating ? 'z-30' : ''}`}
      style={{ left: node.x, top: node.y, opacity: isDraft ? 0.85 : 1 }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseEnter={() => setHoveredNode(node)}
      onMouseLeave={() => setHoveredNode(null)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* 達成済み: 金色の光輪 */}
      {completed && (
        <div
          className="absolute -inset-1 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(255,215,0,0.45) 0%, rgba(255,215,0,0) 70%)',
            animation: celebrating ? 'none' : 'aq-completed-glow 2.5s ease-in-out infinite',
          }}
        />
      )}

      {/* 達成した瞬間: キラキラ放射エフェクト */}
      {celebrating && (
        <div className="absolute inset-0 pointer-events-none z-20">
          {/* 拡大する金色リング */}
          <div className="absolute inset-0 rounded-full" style={{ animation: 'aq-celebrate-ring 1s ease-out 2', border: '3px solid #FFD700' }} />
          {/* 放射する星 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 text-yellow-300"
              style={{
                fontSize: '14px',
                marginLeft: '-7px',
                marginTop: '-7px',
                ['--r' as string]: `${i * 45}deg`,
                animation: `aq-celebrate-spark 1.2s ease-out ${(i % 4) * 0.05}s`,
              }}
            >
              ✦
            </span>
          ))}
        </div>
      )}

      <div
        className={[
          'absolute inset-0 rounded-full',
          linkStartNode === node.id ? 'ring-4 ring-green-500' : '',
          linkHoverNode === node.id ? 'ring-4 ring-yellow-300 scale-110' : '',
          mode === 'delete' ? 'hover:ring-4 hover:ring-red-500' : '',
          mode === 'select' ? 'hover:ring-4 hover:ring-yellow-400' : '',
          isDraft ? 'ring-2 ring-blue-400 ring-dashed' : '',
          completed ? 'ring-2 ring-yellow-400' : '',
        ].join(' ')}
      >
        <div className={`w-full h-full bg-black/50 border-2 rounded-full shadow-inner flex items-center justify-center ${completed ? 'border-yellow-400' : 'border-[#839384]'}`} />
      </div>
      {isDraft && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full border border-white z-10" title="提案ドラフト" />
      )}

      {/* 達成済みチェックマーク (右下バッジ) */}
      {completed && (
        <div
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-yellow-700 z-20 flex items-center justify-center"
          style={{ backgroundColor: '#FFD700', fontSize: '10px', lineHeight: 1 }}
          title="達成済み"
        >
          ✓
        </div>
      )}

      <div className={`relative pointer-events-none ${celebrating ? 'animate-bounce' : ''}`}>
        <ItemIcon type={node.icon} size={28} />
      </div>
    </div>
  )
}

interface OtherProposalNodeElProps {
  node: ProposalNode
  mode: ToolMode
  isEditor: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

function OtherProposalNodeEl({ node, mode, isEditor: _isEditor, onMouseDown, onMouseUp, onTouchStart, onTouchMove, onTouchEnd }: OtherProposalNodeElProps) {
  return (
    <div
      data-node-id={node.id}
      className="absolute w-12 h-12 -ml-6 -mt-6 flex items-center justify-center cursor-pointer z-10"
      style={{ left: node.x, top: node.y, opacity: 0.7 }}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className={[
        'absolute inset-0 rounded-full ring-2 ring-yellow-400 ring-dashed',
        (mode === 'select') ? 'hover:ring-4 hover:opacity-80' : '',
      ].join(' ')}>
        <div className="w-full h-full bg-black/50 border-2 border-[#a0903a] rounded-full shadow-inner flex items-center justify-center" />
      </div>
      <div className="relative pointer-events-none">
        <ItemIcon type={node.icon} size={28} />
      </div>
      {/* いいね数バッジ */}
      {(node.votesUp ?? 0) > 0 && (
        <div className="absolute -top-1 -right-1 bg-green-600 text-white text-[9px] font-bold px-1 rounded-full border border-white z-10 leading-4">
          👍{node.votesUp}
        </div>
      )}
      {/* 提案者スキンアイコン */}
      {node.proposerName && (
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full overflow-hidden border border-yellow-400 z-10 bg-black">
          <img
            src={`https://mc-heads.net/avatar/${node.proposerName}/20`}
            alt={node.proposerName}
            width={20}
            height={20}
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}
    </div>
  )
}
