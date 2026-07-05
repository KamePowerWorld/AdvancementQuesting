import type { EditorNode, EditorEdge } from './types.js'
import { NamespacedId } from '@/util/NamespacedId.js'

/** アイテム/アイコンのデフォルトID */
export const DEFAULT_ITEM_ID = NamespacedId.parse('minecraft:stone')

// ---------------------------------------------------------------------------
// タスク種別 — クエストの達成条件として選べる種類
// ---------------------------------------------------------------------------
export const TASK_TYPES = [
  { id: 'advancement', label: '進捗',     icon: '🏆' },
  { id: 'item',        label: 'アイテム', icon: '📦' },
  { id: 'delivery',    label: '納品',     icon: '🎁' },
  { id: 'stat',        label: '統計',     icon: '📊' },
  { id: 'checkmark',   label: 'チェック', icon: '✅' },
  { id: 'location',    label: '座標',     icon: '📍' },
  { id: 'scoreboard',  label: 'スコア',   icon: '🏅' },
] as const

// ---------------------------------------------------------------------------
// 報酬種別 — クエスト達成時に付与できる報酬の種類
// ---------------------------------------------------------------------------
export const REWARD_TYPES = [
  { id: 'item',        label: 'アイテム',   icon: '📦' },
  { id: 'point',       label: 'ポイント',   icon: '⭐' },
] as const

// ---------------------------------------------------------------------------
// 開発用初期データ — 将来は API から取得したデータに差し替える
// ---------------------------------------------------------------------------
export const INITIAL_NODES: EditorNode[] = [
  {
    id: '1', x: 100, y: 100, icon: NamespacedId.parse('minecraft:book'),
    title: '基本',
    subtitle: 'すべての始まり',
    description: 'この本を手に取ったあなたは、冒険の第一歩を踏み出しました。\nまずは基本を学びましょう。',
    tasks:   [{ id: 't1', type: 'checkmark', value: '確認する' }],
    rewards: [{ id: 'r1', type: 'item', itemType: NamespacedId.parse('minecraft:apple'), value: '' }],
  },
  {
    id: '2', x: 250, y: 100, icon: NamespacedId.parse('minecraft:diamond'),
    title: 'マナ理論',
    subtitle: '高度な知識',
    description: 'ロックされたクエストです。\n前提を完了する必要があります。',
    tasks:   [{ id: 't2', type: 'item', itemType: NamespacedId.parse('minecraft:diamond'), value: '' }],
    rewards: [{ id: 'r2', type: 'xp', value: '100 レベル' }],
  },
  {
    id: '3', x: 250, y: 250, icon: NamespacedId.parse('minecraft:stone'),
    title: '石器時代',
    subtitle: '掘って、切って、壊して！',
    description: '丸石を集めてツールを作りましょう。',
    tasks:   [{ id: 't3', type: 'item', itemType: NamespacedId.parse('minecraft:stone'), value: '' }],
    rewards: [],
  },
  {
    id: '4', x: 400, y: 250, icon: NamespacedId.parse('minecraft:chest'),
    title: '収納',
    subtitle: 'アイテムの整理',
    description: 'チェストを作成してアイテムを保管します。',
    tasks:   [{ id: 't4', type: 'item', itemType: NamespacedId.parse('minecraft:oak_planks'), value: '' }],
    rewards: [{ id: 'r3', type: 'choice', value: 'HV Tier' }],
  },
]

export const INITIAL_EDGES: EditorEdge[] = [
  { id: 'e1', source: '1', target: '2' },
  { id: 'e2', source: '1', target: '3' },
  { id: 'e3', source: '3', target: '4' },
]
