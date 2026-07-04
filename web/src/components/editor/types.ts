/**
 * クエストエディタ内部で使うローカル型定義
 * APIの型 (src/types/) とは別物 — エディタの操作状態・描画データを表す
 */
import type { NamespacedId } from '@/util/NamespacedId.js'

/**
 * ツールバーで選べる操作モード
 * select  : 矢印。背景ドラッグでパン、ノードクリックでモーダル
 * move    : 十字矢印。ノードドラッグで位置変更。editor=全ノード / player提案中=提案ドラフトのみ
 * add_node: キャンバスクリックでノード追加
 * add_link: ノード→ノードで依存エッジを引く
 * delete  : ノードクリックで削除。editor=全ノード / player提案中=提案ドラフトのみ
 */
export type ToolMode = 'select' | 'move' | 'add_node' | 'add_link' | 'delete' | 'add_comment'

/** 2D座標 */
export interface Vec2 {
  x: number
  y: number
}

/** タスク (クエストの達成条件) のエディタ内表現 */
export interface EditorTask {
  id: string
  type: string        // TASK_TYPES の id
  value: string       // 表示テキスト / コマンド文字列など
  itemType?: NamespacedId // type === 'item' / type === 'stat' (アイテムベース統計) の場合のアイテム種別
  count?: number
  nbt?: string        // serializeItemAsJson JSON文字列 (特殊アイテム用)
  displayName?: string // カスタム表示名
  // type === 'advancement' の場合
  advancementId?: NamespacedId
  // type === 'stat' の場合
  statType?: string   // "minecraft:mined" など (閉じた選択肢のカテゴリキー)
  statId?: NamespacedId // "minecraft:diamond" など (カスタム統計は statType 自体に含む)
  // type === 'location' の場合
  locX?: number
  locY?: number
  locZ?: number
  dimension?: string  // "overworld" / "nether" / "end"
  radius?: number
  // type === 'scoreboard' の場合
  objective?: string  // スコアボード名
  score?: number      // この値以上で達成
}

/** 報酬のエディタ内表現 */
export interface EditorReward {
  id: string
  type: string        // REWARD_TYPES の id
  value: string
  itemType?: NamespacedId
  count?: number      // type === 'item' の場合の個数
  nbt?: string        // serializeItemAsJson JSON文字列 (特殊アイテム用)
  displayName?: string // カスタム表示名
  amount?: number     // type === 'point' の場合のポイント数
}

/** 繰り返し設定のエディタ内表現 */
export interface EditorRepeat {
  type: 'none' | 'cooldown' | 'schedule' | 'unlimited'
  cooldownHours?: number
  cron?: string
}

/** マップ上に配置する1つのクエストノード */
export interface EditorNode {
  id: string
  x: number
  y: number
  icon: NamespacedId
  title: string
  subtitle: string
  description: string
  tasks: EditorTask[]
  rewards: EditorReward[]
  creatorName?: string | null
  repeat?: EditorRepeat
  /** クエストの公開状態 ('public' | 'hidden' | 'draft' | 'proposed') */
  status?: string
}

/** マップ上に配置するコメントブロック (UE5ブループリントのコメント枠に相当) */
export interface EditorComment {
  id: string
  x: number
  y: number
  width: number
  height: number
  title: string
  color: string
}

/** クエスト間の依存エッジ */
export interface EditorEdge {
  id: string
  source: string // source node id
  target: string // target node id
}

/**
 * アイテム選択モーダルを開く際の設定
 * discriminated union でコンテキストを型安全に保持し、
 * handleItemSelect 内でどのフィールドを更新すべきか判断する
 */
export type ItemSelectorConfig =
  | { type: 'quest_icon'; nodeId: string }
  | { type: 'task_item'; nodeId: string; taskId: string }
  | { type: 'reward_item'; nodeId: string; rewardId: string }
  // 統計条件: item ベースの統計 (mined / crafted / etc.) でアイテムを選ぶ
  | { type: 'task_stat_item'; nodeId: string; taskId: string }

/** タスク/報酬の詳細編集モーダルを開く際の設定 */
export interface EditingTaskReward {
  nodeId: string
  category: 'task' | 'reward'
  itemId: string
}
