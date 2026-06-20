export interface ActivityItem {
  /** quest_completions.id (次ページのカーソルに使う) */
  id: number
  questId: number
  questTitle: string
  questIcon: string
  completedAt: string
}

export interface ActivityPage {
  playerUuid: string
  items: ActivityItem[]
  /** 次ページの before に渡すカーソル。null なら末尾。 */
  nextCursor: number | null
}
