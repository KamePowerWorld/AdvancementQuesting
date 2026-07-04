import { describe, it, expect } from 'vitest'
import { questToNode, nodeToApiBody, questsToEdges, proposalToNode, proposalsToNodes } from './conversions.js'
import type { Quest } from '@/types/quest.js'
import type { Proposal } from '@/types/proposal.js'
import type { EditorNode, EditorEdge } from '@/components/editor/types.js'
import { NamespacedId } from '@/util/NamespacedId.js'

// Minimal Quest factory — omits optional fields to pin fallback behaviour
function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 1,
    title: 'Test Quest',
    description: null,
    icon: null,
    category: null,
    prerequisites: [],
    conditions: [],
    rewards: [],
    mapPosition: null,
    customButtons: [],
    status: 'public',
    creatorUuid: null,
    creatorName: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// questToNode — fallback behaviours
// ---------------------------------------------------------------------------
describe('questToNode', () => {
  it('converts id to string', () => {
    const node = questToNode(makeQuest({ id: 42 }))
    expect(node.id).toBe('42')
  })

  it('falls back to x=100, y=100 when mapPosition is null', () => {
    const node = questToNode(makeQuest({ mapPosition: null }))
    expect(node.x).toBe(100)
    expect(node.y).toBe(100)
  })

  it('uses provided mapPosition', () => {
    const node = questToNode(makeQuest({ mapPosition: { x: 250, y: 300 } }))
    expect(node.x).toBe(250)
    expect(node.y).toBe(300)
  })

  it('falls back icon to minecraft:stone when null', () => {
    const node = questToNode(makeQuest({ icon: null }))
    expect(node.icon).toEqual(NamespacedId.parse('minecraft:stone'))
  })

  it('uses provided icon (fullId)', () => {
    const node = questToNode(makeQuest({ icon: 'minecraft:diamond' }))
    expect(node.icon).toEqual(NamespacedId.parse('minecraft:diamond'))
  })

  it('legacy short-form icon is normalized to fullId', () => {
    const node = questToNode(makeQuest({ icon: 'diamond' }))
    expect(node.icon).toEqual(NamespacedId.parse('minecraft:diamond'))
  })

  it('falls back description to empty string when null', () => {
    const node = questToNode(makeQuest({ description: null }))
    expect(node.description).toBe('')
  })

  it('maps item condition with count fallback to 1', () => {
    const node = questToNode(makeQuest({
      conditions: [{ id: 'c1', type: 'item', itemType: 'minecraft:apple' }],
    }))
    const task = node.tasks[0]
    expect(task.type).toBe('item')
    expect(task.itemType).toEqual(NamespacedId.parse('minecraft:apple'))
    expect(task.count).toBe(1)   // count ?? 1 fallback
  })

  it('respects explicit count on item condition', () => {
    const node = questToNode(makeQuest({
      conditions: [{ id: 'c1', type: 'item', itemType: 'minecraft:diamond', count: 5 }],
    }))
    expect(node.tasks[0].count).toBe(5)
  })

  it('maps advancement condition and preserves advancementId', () => {
    const node = questToNode(makeQuest({
      conditions: [{ id: 'c1', type: 'advancement', advancementId: 'minecraft:story/mine_stone' }],
    }))
    const task = node.tasks[0]
    expect(task.type).toBe('advancement')
    expect(task.advancementId).toEqual(NamespacedId.parse('minecraft:story/mine_stone'))
  })

  it('maps item reward with count fallback to 1', () => {
    const node = questToNode(makeQuest({
      rewards: [{ type: 'item', itemId: 'minecraft:bread', count: undefined as unknown as number, nbt: undefined, displayName: undefined }],
    }))
    const reward = node.rewards[0]
    expect(reward.type).toBe('item')
    expect(reward.itemType).toEqual(NamespacedId.parse('minecraft:bread'))
    expect(reward.count).toBe(1)  // count ?? 1 fallback
  })

  it('maps experience reward to xp type', () => {
    const node = questToNode(makeQuest({
      rewards: [{ type: 'experience', amount: 100, isLevel: false }],
    }))
    expect(node.rewards[0].type).toBe('xp')
    expect(node.rewards[0].value).toBe('100')
  })

  it('maps point reward with amount', () => {
    const node = questToNode(makeQuest({
      rewards: [{ type: 'point', amount: 50 }],
    }))
    const reward = node.rewards[0] as any
    expect(reward.type).toBe('point')
    expect(reward.amount).toBe(50)
  })

  it('preserves repeat config when present', () => {
    const node = questToNode(makeQuest({
      repeat: { type: 'cooldown', cooldownHours: 24 },
    }))
    expect(node.repeat?.type).toBe('cooldown')
    expect(node.repeat?.cooldownHours).toBe(24)
  })

  it('leaves repeat undefined when quest has no repeat', () => {
    const node = questToNode(makeQuest({ repeat: undefined }))
    expect(node.repeat).toBeUndefined()
  })

  it('generates task id from quest id when condition id is absent', () => {
    // Condition without an id — id should be "${sid}-t0"
    const q = makeQuest({ id: 7, conditions: [{ type: 'checkmark' } as any] })
    const node = questToNode(q)
    expect(node.tasks[0].id).toBe('7-t0')
  })
})

// ---------------------------------------------------------------------------
// questsToEdges
// ---------------------------------------------------------------------------
describe('questsToEdges', () => {
  it('returns empty array for quests with no prerequisites', () => {
    const quests = [makeQuest({ id: 1 }), makeQuest({ id: 2 })]
    expect(questsToEdges(quests)).toEqual([])
  })

  it('creates one edge per prerequisite relationship', () => {
    const quests = [
      makeQuest({ id: 1, prerequisites: [] }),
      makeQuest({ id: 2, prerequisites: [1] }),
    ]
    const edges = questsToEdges(quests)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ id: 'e-1-2', source: '1', target: '2' })
  })

  it('creates multiple edges when a quest has multiple prerequisites', () => {
    const quests = [
      makeQuest({ id: 1 }),
      makeQuest({ id: 2 }),
      makeQuest({ id: 3, prerequisites: [1, 2] }),
    ]
    const edges = questsToEdges(quests)
    expect(edges).toHaveLength(2)
    const targets = edges.map((e) => e.target)
    expect(targets).toEqual(['3', '3'])
    const sources = edges.map((e) => e.source).sort()
    expect(sources).toEqual(['1', '2'])
  })

  it('encodes source and target as strings (not numbers)', () => {
    const quests = [makeQuest({ id: 10 }), makeQuest({ id: 20, prerequisites: [10] })]
    const edges = questsToEdges(quests)
    expect(typeof edges[0].source).toBe('string')
    expect(typeof edges[0].target).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// nodeToApiBody — selected fallbacks
// ---------------------------------------------------------------------------
describe('nodeToApiBody', () => {
  function makeNode(overrides: Partial<EditorNode> = {}): EditorNode {
    return {
      id: '1',
      x: 100,
      y: 200,
      icon: NamespacedId.parse('minecraft:stone'),
      title: 'Node',
      subtitle: '',
      description: '',
      tasks: [],
      rewards: [],
      ...overrides,
    }
  }

  it('maps mapPosition from x/y', () => {
    const body = nodeToApiBody(makeNode({ x: 150, y: 250 }), [])
    expect(body.mapPosition).toEqual({ x: 150, y: 250 })
  })

  it('collects prerequisites from edges targeting this node', () => {
    const edges: EditorEdge[] = [
      { id: 'e1', source: '2', target: '1' },
      { id: 'e2', source: '3', target: '1' },
      { id: 'e3', source: '2', target: '99' }, // different target — excluded
    ]
    const body = nodeToApiBody(makeNode({ id: '1' }), edges)
    expect(body.prerequisites.sort()).toEqual([2, 3])
  })

  it('excludes non-numeric edge sources from prerequisites', () => {
    const edges: EditorEdge[] = [{ id: 'e1', source: 'abc', target: '1' }]
    const body = nodeToApiBody(makeNode(), edges)
    expect(body.prerequisites).toEqual([])
  })

  it('maps item reward with count fallback to 1', () => {
    const node = makeNode({
      rewards: [{ id: 'r1', type: 'item', itemType: undefined, count: undefined, value: '' }],
    })
    const body = nodeToApiBody(node, [])
    const reward = body.rewards[0] as any
    expect(reward.type).toBe('item')
    expect(reward.itemId).toBe('minecraft:stone')  // itemType デフォルトは minecraft:stone
    expect(reward.count).toBe(1)         // count ?? 1 fallback
  })

  it('maps point reward with amount fallback to 0', () => {
    const node = makeNode({
      rewards: [{ id: 'r1', type: 'point', value: '' } as any],
    })
    const body = nodeToApiBody(node, [])
    const reward = body.rewards[0] as any
    expect(reward.type).toBe('point')
    expect(reward.amount).toBe(0)  // (r as any).amount ?? 0 fallback
  })

  it('sets repeat to null when repeat type is "none"', () => {
    const node = makeNode({ repeat: { type: 'none' } })
    const body = nodeToApiBody(node, [])
    expect(body.repeat).toBeNull()
  })

  it('includes repeat when type is "cooldown"', () => {
    const node = makeNode({ repeat: { type: 'cooldown', cooldownHours: 12 } })
    const body = nodeToApiBody(node, [])
    expect(body.repeat).toEqual({ type: 'cooldown', cooldownHours: 12 })
  })
})

// ---------------------------------------------------------------------------
// proposalToNode / proposalsToNodes
// ---------------------------------------------------------------------------
function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 5,
    questId: 10,
    proposerUuid: 'uuid-1',
    proposerName: 'Steve',
    status: 'pending',
    votesUp: 3,
    votesDown: 0,
    rejectReason: null,
    createdAt: '2024-01-01T00:00:00Z',
    myVote: null,
    ...overrides,
  }
}

describe('proposalToNode', () => {
  it('builds id as existing-proposal-<id> and carries proposal meta', () => {
    const node = proposalToNode(makeProposal())
    expect(node.id).toBe('existing-proposal-5')
    expect(node.proposalId).toBe(5)
    expect(node.proposerName).toBe('Steve')
    expect(node.votesUp).toBe(3)
    expect(node.myVote).toBeNull()
  })

  it('falls back to (100,100) / stone / 提案 when snapshot and position are missing', () => {
    const node = proposalToNode(makeProposal())
    expect(node.x).toBe(100)
    expect(node.y).toBe(100)
    expect(node.icon).toEqual(NamespacedId.parse('minecraft:stone'))
    expect(node.title).toBe('提案')
    expect(node.subtitle).toBe('')
    expect(node.description).toBe('')
    expect(node.tasks).toEqual([])
    expect(node.rewards).toEqual([])
  })

  it('uses mapPosition and snapshot fields when present', () => {
    const node = proposalToNode(makeProposal({
      mapPosition: { x: 250, y: 300 },
      questSnapshot: { title: 'T', subtitle: 'S', description: 'D', icon: 'minecraft:diamond' },
    }))
    expect(node.x).toBe(250)
    expect(node.y).toBe(300)
    expect(node.title).toBe('T')
    expect(node.subtitle).toBe('S')
    expect(node.description).toBe('D')
    expect(node.icon).toEqual(NamespacedId.parse('minecraft:diamond'))
  })

  it('maps advancement condition value to advancementId', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { conditions: [{ type: 'advancement', advancementId: 'minecraft:story/mine_stone' }] },
    }))
    expect(node.tasks).toEqual([
      { id: 'existing-proposal-5-t0', type: 'advancement', value: 'minecraft:story/mine_stone', advancementId: NamespacedId.parse('minecraft:story/mine_stone') },
    ])
  })

  it('maps item condition with defaults count=1 / itemType=stone', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { conditions: [{ type: 'item', itemType: undefined as any }] },
    }))
    expect(node.tasks[0]).toMatchObject({ type: 'item', itemType: NamespacedId.parse('minecraft:stone'), count: 1 })
  })

  it('maps checkmark condition value from label', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { conditions: [{ type: 'checkmark', label: 'やること' }] },
    }))
    expect(node.tasks[0]).toMatchObject({ type: 'checkmark', value: 'やること' })
  })

  it('maps item reward with itemId→itemType and count default 1', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { rewards: [{ type: 'item', itemId: 'minecraft:diamond' } as any] },
    }))
    expect(node.rewards[0]).toMatchObject({ id: 'existing-proposal-5-r0', type: 'item', itemType: NamespacedId.parse('minecraft:diamond'), count: 1 })
  })

  it('maps experience reward to xp with amount as value', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { rewards: [{ type: 'experience', amount: 50, isLevel: false }] },
    }))
    expect(node.rewards[0]).toMatchObject({ type: 'xp', value: '50' })
  })

  it('maps point reward preserving amount (regression: 必ず0になる)', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { rewards: [{ type: 'point', amount: 50 }] },
    }))
    expect(node.rewards[0]).toMatchObject({ type: 'point', amount: 50 })
  })

  it('maps stat condition preserving statType/statId/count (regression: 未設定になる)', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { conditions: [{ type: 'stat', statType: 'minecraft.mined', statId: 'minecraft:stone', count: 32 }] },
    }))
    expect(node.tasks[0]).toMatchObject({ type: 'stat', statType: 'minecraft.mined', statId: NamespacedId.parse('minecraft:stone'), count: 32 })
  })

  it('maps delivery/location/scoreboard conditions', () => {
    const node = proposalToNode(makeProposal({
      questSnapshot: { conditions: [
        { type: 'delivery', itemType: 'minecraft:diamond', count: 3 },
        { type: 'location', x: 1, y: 2, z: 3, dimension: 'the_nether', radius: 20 },
        { type: 'scoreboard', objective: 'pts', score: 5 },
      ] },
    }))
    expect(node.tasks[0]).toMatchObject({ type: 'delivery', itemType: NamespacedId.parse('minecraft:diamond'), count: 3 })
    expect(node.tasks[1]).toMatchObject({ type: 'location', locX: 1, locY: 2, locZ: 3, dimension: 'the_nether', radius: 20 })
    expect(node.tasks[2]).toMatchObject({ type: 'scoreboard', objective: 'pts', score: 5 })
  })

  it('merges localEdit but preserves id and proposal meta', () => {
    const localEdit = { id: 'local', title: 'Edited', x: 999, proposerName: 'Hacker' } as any
    const node = proposalToNode(makeProposal(), localEdit)
    expect(node.title).toBe('Edited')
    expect(node.x).toBe(999)
    expect(node.id).toBe('existing-proposal-5')
    expect(node.proposalId).toBe(5)
    expect(node.proposerName).toBe('Steve')
    expect(node.votesUp).toBe(3)
  })
})

describe('proposalsToNodes', () => {
  it('filters out non-pending proposals', () => {
    const nodes = proposalsToNodes([
      makeProposal({ id: 1, status: 'pending' }),
      makeProposal({ id: 2, status: 'approved' }),
      makeProposal({ id: 3, status: 'rejected' }),
    ], new Map())
    expect(nodes.map((n) => n.proposalId)).toEqual([1])
  })

  it('returns empty array for undefined input', () => {
    expect(proposalsToNodes(undefined, new Map())).toEqual([])
  })

  it('applies localEdits by proposal id', () => {
    const edits = new Map([[2, { title: 'Local' } as any]])
    const nodes = proposalsToNodes([makeProposal({ id: 1 }), makeProposal({ id: 2 })], edits)
    expect(nodes[0].title).toBe('提案')
    expect(nodes[1].title).toBe('Local')
  })
})
