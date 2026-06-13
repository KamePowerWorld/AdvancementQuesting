/**
 * クエストエディタ内部で使うローカル型定義
 * APIの型 (src/types/) とは別物 — エディタの操作状態・描画データを表す
 */

/**
 * ツールバーで選べる操作モード
 * select  : 矢印。背景ドラッグでパン、ノードクリックでモーダル
 * move    : 十字矢印。ノードドラッグで位置変更。editor=全ノード / player提案中=提案ドラフトのみ
 * add_node: キャンバスクリックでノード追加
 * add_link: ノード→ノードで依存エッジを引く
 * delete  : ノードクリックで削除。editor=全ノード / player提案中=提案ドラフトのみ
 */
export type ToolMode = 'select' | 'move' | 'add_node' | 'add_link' | 'delete'

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
  itemType?: string   // type === 'item' の場合のアイテム種別
  count?: number
  nbt?: string        // NBT文字列 (特殊アイテム用)
  displayName?: string // カスタム表示名
}

/** 報酬のエディタ内表現 */
export interface EditorReward {
  id: string
  type: string        // REWARD_TYPES の id
  value: string
  itemType?: string
  count?: number      // type === 'item' の場合の個数
  nbt?: string        // NBT文字列 (特殊アイテム用)
  displayName?: string // カスタム表示名
}

/** マップ上に配置する1つのクエストノード */
export interface EditorNode {
  id: string
  x: number
  y: number
  icon: string
  title: string
  subtitle: string
  description: string
  tasks: EditorTask[]
  rewards: EditorReward[]
  creatorName?: string | null
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

/** タスク/報酬の詳細編集モーダルを開く際の設定 */
export interface EditingTaskReward {
  nodeId: string
  category: 'task' | 'reward'
  itemId: string
}
