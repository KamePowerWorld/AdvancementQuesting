import type { EditorNode, EditorEdge } from '@/components/editor/types.js'
import type { Quest, Condition, Reward } from '@/types/quest.js'
import type { Proposal } from '@/types/proposal.js'
import type { ProposalNode } from '../types.js'

/** 旧保存データに残る label / value フィールドを許容する互換型 */
type LegacyLabeled = { label?: string; value?: string }

export function questToNode(q: Quest): EditorNode {
  const sid = String(q.id)
  return {
    id: sid,
    x: q.mapPosition?.x ?? 100,
    y: q.mapPosition?.y ?? 100,
    icon: q.icon ?? 'stone',
    title: q.title,
    subtitle: q.subtitle ?? '',
    description: q.description ?? '',
    creatorName: q.creatorName ?? null,
    tasks: (q.conditions ?? []).map((c, i) => ({
      id: c.id ?? `${sid}-t${i}`,
      type: c.type,
      value: (c as Condition & LegacyLabeled).label ?? (c as Condition & LegacyLabeled).value ?? '',
      ...(c.type === 'advancement' ? { advancementId: c.advancementId ?? '' } : {}),
      ...(c.type === 'item' ? { itemType: c.itemType ?? 'stone', count: c.count ?? 1, ...(c.nbt ? { nbt: c.nbt } : {}), ...(c.displayName ? { displayName: c.displayName } : {}) } : {}),
      ...(c.type === 'delivery' ? { itemType: c.itemType ?? 'stone', count: c.count ?? 1, ...(c.nbt ? { nbt: c.nbt } : {}), ...(c.displayName ? { displayName: c.displayName } : {}) } : {}),
      ...(c.type === 'stat' ? { statType: c.statType ?? '', statId: c.statId ?? '', count: c.count ?? 1 } : {}),
      ...(c.type === 'location' ? { locX: c.x ?? 0, locY: c.y ?? 0, locZ: c.z ?? 0, dimension: c.dimension ?? 'overworld', radius: c.radius ?? 10 } : {}),
      ...(c.type === 'scoreboard' ? { objective: c.objective ?? '', score: c.score ?? 1 } : {}),
    })),
    rewards: (q.rewards ?? []).map((r, i) => {
      const base = { id: `${sid}-r${i}`, value: '' }
      if (r.type === 'item') return { ...base, type: 'item', itemType: r.itemId, count: r.count ?? 1, ...(r.nbt ? { nbt: r.nbt } : {}), ...(r.displayName ? { displayName: r.displayName } : {}) }
      if (r.type === 'experience') return { ...base, type: 'xp', value: String(r.amount) }
      if (r.type === 'money') return { ...base, type: 'xp', value: `💰${r.amount}` }
      if (r.type === 'point') return { ...base, type: 'point', amount: r.amount }
      return { ...base, type: r.type }
    }),
    repeat: q.repeat ? { type: q.repeat.type, cooldownHours: q.repeat.cooldownHours, cron: q.repeat.cron } : undefined,
    status: q.status,
  }
}

export function nodeToApiBody(node: EditorNode, edgeList: EditorEdge[]) {
  const conditions: Condition[] = (node.tasks ?? []).map((t) => {
    if (t.type === 'advancement') return { id: t.id, type: 'advancement' as const, advancementId: t.advancementId ?? t.value ?? '' }
    if (t.type === 'item') return { id: t.id, type: 'item' as const, itemType: t.itemType ?? 'stone', count: t.count ?? 1, ...(t.nbt ? { nbt: t.nbt } : {}), ...(t.displayName ? { displayName: t.displayName } : {}) }
    if (t.type === 'delivery') return { id: t.id, type: 'delivery' as const, itemType: t.itemType ?? 'stone', count: t.count ?? 1, ...(t.nbt ? { nbt: t.nbt } : {}), ...(t.displayName ? { displayName: t.displayName } : {}) }
    if (t.type === 'checkmark') return { id: t.id, type: 'checkmark' as const, label: t.value ?? '' }
    if (t.type === 'stat') return { id: t.id, type: 'stat' as const, statType: t.statType ?? '', statId: t.statId ?? '', count: t.count ?? 1 }
    if (t.type === 'location') return { id: t.id, type: 'location' as const, x: t.locX ?? 0, y: t.locY ?? 0, z: t.locZ ?? 0, dimension: t.dimension ?? 'overworld', radius: t.radius ?? 10 }
    if (t.type === 'scoreboard') return { id: t.id, type: 'scoreboard' as const, objective: t.objective ?? '', score: t.score ?? 1, ...(t.value ? { label: t.value } : {}) }
    return { id: t.id, type: 'checkmark' as const, label: t.value }
  })
  const rewards: Reward[] = (node.rewards ?? []).map((r) => {
    if (r.type === 'item') return { type: 'item' as const, itemId: r.itemType ?? 'stone', count: r.count ?? 1, ...(r.nbt ? { nbt: r.nbt } : {}), ...(r.displayName ? { displayName: r.displayName } : {}) }
    if (r.type === 'xp') return { type: 'experience' as const, amount: parseInt(r.value || '0', 10), isLevel: false }
    if (r.type === 'command') return { type: 'command' as const, command: r.value, opLevel: 0 }
    if (r.type === 'point') return { type: 'point' as const, amount: r.amount ?? 0 }
    return { type: 'command' as const, command: '', opLevel: 0 }
  })
  return {
    title: node.title,
    subtitle: node.subtitle,
    description: node.description,
    icon: node.icon,
    mapPosition: { x: node.x, y: node.y },
    prerequisites: edgeList
      .filter((e) => e.target === node.id)
      .map((e) => parseInt(e.source, 10))
      .filter((n) => !isNaN(n)),
    conditions,
    rewards,
    repeat: node.repeat && node.repeat.type !== 'none' ? node.repeat : null,
  }
}

/** 既存提案 (GET /api/proposals の1件) を ProposalNode へ変換する */
export function proposalToNode(p: Proposal, localEdit?: EditorNode): ProposalNode {
  const snap = p.questSnapshot ?? {}
  const sid = `existing-proposal-${p.id}`
  const tasks = (snap.conditions ?? []).map((c, i) => {
    const legacy = c as Condition & LegacyLabeled
    return {
      id: `${sid}-t${i}`, type: c.type,
      value: c.type === 'advancement' ? (c.advancementId ?? '') : (legacy.label ?? legacy.value ?? ''),
      ...(c.type === 'item' ? { itemType: c.itemType ?? 'stone', count: c.count ?? 1, ...(c.nbt ? { nbt: c.nbt } : {}), ...(c.displayName ? { displayName: c.displayName } : {}) } : {}),
      ...(c.type === 'delivery' ? { itemType: c.itemType ?? 'stone', count: c.count ?? 1, ...(c.nbt ? { nbt: c.nbt } : {}), ...(c.displayName ? { displayName: c.displayName } : {}) } : {}),
      ...(c.type === 'stat' ? { statType: c.statType ?? '', statId: c.statId ?? '', count: c.count ?? 1 } : {}),
      ...(c.type === 'location' ? { locX: c.x ?? 0, locY: c.y ?? 0, locZ: c.z ?? 0, dimension: c.dimension ?? 'overworld', radius: c.radius ?? 10 } : {}),
      ...(c.type === 'scoreboard' ? { objective: c.objective ?? '', score: c.score ?? 1 } : {}),
    }
  })
  const rewards = (snap.rewards ?? []).map((r, i) => {
    const base = { id: `${sid}-r${i}`, value: '' }
    if (r.type === 'item') return { ...base, type: 'item', itemType: r.itemId, count: r.count ?? 1, ...(r.nbt ? { nbt: r.nbt } : {}), ...(r.displayName ? { displayName: r.displayName } : {}) }
    if (r.type === 'experience') return { ...base, type: 'xp', value: String(r.amount) }
    if (r.type === 'money') return { ...base, type: 'xp', value: `💰${r.amount}` }
    if (r.type === 'point') return { ...base, type: 'point', amount: r.amount }
    return { ...base, type: r.type }
  })
  const base: ProposalNode = {
    id: sid, x: p.mapPosition?.x ?? 100, y: p.mapPosition?.y ?? 100,
    icon: snap.icon ?? 'stone', title: snap.title ?? '提案', subtitle: snap.subtitle ?? '',
    description: snap.description ?? '', tasks, rewards,
    proposalId: p.id, proposerName: p.proposerName ?? '', votesUp: p.votesUp ?? 0, myVote: p.myVote ?? null,
  }
  return localEdit
    ? { ...base, ...localEdit, id: sid, proposalId: p.id, proposerName: base.proposerName, votesUp: base.votesUp, myVote: base.myVote }
    : base
}

/** pending の既存提案一覧を ProposalNode 一覧へ変換する (ローカル編集をマージ) */
export function proposalsToNodes(proposals: Proposal[] | undefined, localEdits: Map<number, EditorNode>): ProposalNode[] {
  return (proposals ?? [])
    .filter((p) => p.status === 'pending')
    .map((p) => proposalToNode(p, localEdits.get(p.id)))
}

export function questsToEdges(quests: Quest[]): EditorEdge[] {
  const edges: EditorEdge[] = []
  for (const q of quests) {
    for (const prereqId of (q.prerequisites ?? [])) {
      edges.push({ id: `e-${prereqId}-${q.id}`, source: String(prereqId), target: String(q.id) })
    }
  }
  return edges
}
