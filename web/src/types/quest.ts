export type QuestStatus = 'draft' | 'proposed' | 'public' | 'hidden'

export type ConditionType = 'advancement' | 'item' | 'delivery' | 'checkmark' | 'stat' | 'location' | 'scoreboard'

export interface AdvancementCondition {
  id?: string
  type: 'advancement'
  advancementId: string
  requiredCount?: number
  combineMode?: 'AND' | 'OR'
}

export interface ItemCondition {
  id?: string
  type: 'item'
  itemType: string
  count?: number
  nbt?: string
  displayName?: string
}

export interface DeliveryCondition {
  id?: string
  type: 'delivery'
  itemType: string
  count?: number
  nbt?: string
  displayName?: string
}

export interface CheckmarkCondition {
  id?: string
  type: 'checkmark'
  label?: string
}

export interface StatCondition {
  id?: string
  type: 'stat'
  // 統計カテゴリ: "minecraft:mined" / "minecraft:crafted" / ... / "minecraft:custom"
  statType: string
  // 対象ID: アイテムベースなら "minecraft:diamond"、カスタムなら "minecraft:jump" 等
  statId: string
  // 目標値 (この値以上で達成)
  count: number
}

export interface LocationCondition {
  id?: string
  type: 'location'
  x: number
  y: number
  z: number
  dimension: string
  radius: number
}

export interface ScoreboardCondition {
  id?: string
  type: 'scoreboard'
  objective: string
  score: number
  label?: string
}

export type Condition = AdvancementCondition | ItemCondition | DeliveryCondition | CheckmarkCondition | StatCondition | LocationCondition | ScoreboardCondition

export type RewardType = 'item' | 'command' | 'experience' | 'permission' | 'money' | 'point'

export interface ItemReward {
  type: 'item'
  itemId: string
  count: number
  nbt?: string
  displayName?: string
}

export interface CommandReward {
  type: 'command'
  command: string
  opLevel: number
}

export interface ExperienceReward {
  type: 'experience'
  amount: number
  isLevel: boolean
}

export interface PermissionReward {
  type: 'permission'
  node: string
}

export interface MoneyReward {
  type: 'money'
  amount: number
}

export interface PointReward {
  type: 'point'
  amount: number
}

export type Reward = ItemReward | CommandReward | ExperienceReward | PermissionReward | MoneyReward | PointReward

export interface RepeatConfig {
  /** "none" | "cooldown" | "schedule" | "unlimited" */
  type: 'none' | 'cooldown' | 'schedule' | 'unlimited'
  /** cooldown 用: 時間数 */
  cooldownHours?: number
  /** schedule 用: cron 式 "分 時 日 月 曜日" */
  cron?: string
}

export interface MapPosition {
  x: number
  y: number
}

export interface CustomButton {
  label: string
  command: string
  slot: number
}

export interface Quest {
  id: number
  title: string
  subtitle?: string | null
  description: string | null
  icon: string | null
  category: string | null
  prerequisites: number[]
  conditions: Condition[]
  rewards: Reward[]
  mapPosition: MapPosition | null
  customButtons: CustomButton[]
  status: QuestStatus
  creatorUuid: string | null
  creatorName: string | null
  createdAt: string
  updatedAt: string
  repeat?: RepeatConfig | null
}

export type QuestCreateInput = Omit<Quest, 'id' | 'createdAt' | 'updatedAt' | 'creatorUuid' | 'creatorName'> & {
  prerequisites: number[]
  creatorUuid?: string | null
}
export type QuestUpdateInput = Partial<QuestCreateInput>
