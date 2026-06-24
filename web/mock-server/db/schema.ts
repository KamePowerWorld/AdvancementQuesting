import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const quests = sqliteTable('quests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  icon: text('icon'),
  category: text('category'),
  prerequisites: text('prerequisites', { mode: 'json' }).$type<number[]>().notNull().default([]),
  conditions: text('conditions', { mode: 'json' }).$type<object[]>().notNull().default([]),
  rewards: text('rewards', { mode: 'json' }).$type<object[]>().notNull().default([]),
  mapPosition: text('map_position', { mode: 'json' }).$type<{ x: number; y: number } | null>(),
  customButtons: text('custom_buttons', { mode: 'json' }).$type<object[]>().notNull().default([]),
  repeat: text('repeat', { mode: 'json' }).$type<{ type: string; cooldownHours?: number; cron?: string } | null>(),
  status: text('status', { enum: ['draft', 'proposed', 'public', 'hidden'] }).notNull().default('draft'),
  creatorUuid: text('creator_uuid'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const playerProgress = sqliteTable('player_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerUuid: text('player_uuid').notNull(),
  questId: integer('quest_id').notNull().references(() => quests.id),
  progress: text('progress', { mode: 'json' }).$type<object[]>().notNull().default([]),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  rewardClaimed: integer('reward_claimed', { mode: 'boolean' }).notNull().default(false),
  completedCount: integer('completed_count').notNull().default(0),
  pendingRewards: integer('pending_rewards').notNull().default(0),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('player_quest_unique').on(t.playerUuid, t.questId),
])

export const questCompletions = sqliteTable('quest_completions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerUuid: text('player_uuid').notNull(),
  playerName: text('player_name').notNull(),
  // 本番 (DatabaseManager) と同様に FK 制約は張らない (クリアログは追記専用)
  questId: integer('quest_id').notNull(),
  completedAt: text('completed_at').notNull(),
})

// 報酬受取ログ (報酬1項目=1レコード)。トータル獲得報酬の真実のソース。
export const rewardClaims = sqliteTable('reward_claims', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerUuid: text('player_uuid').notNull(),
  playerName: text('player_name').notNull(),
  questId: integer('quest_id').notNull(),
  questTitle: text('quest_title').notNull(),
  rewardType: text('reward_type').notNull(),
  rewardLabel: text('reward_label'),
  itemType: text('item_type'),
  amount: integer('amount').notNull().default(1),
  claimedAt: text('claimed_at').notNull(),
  source: text('source').notNull().default('claim'),
})

export const questProposals = sqliteTable('quest_proposals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questId: integer('quest_id').notNull().references(() => quests.id),
  proposerUuid: text('proposer_uuid').notNull(),
  proposerName: text('proposer_name').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  votesUp: integer('votes_up').notNull().default(0),
  votesDown: integer('votes_down').notNull().default(0),
  rejectReason: text('reject_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const proposalVotes = sqliteTable('proposal_votes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  proposalId: integer('proposal_id').notNull().references(() => questProposals.id),
  playerUuid: text('player_uuid').notNull(),
  voteType: text('vote_type', { enum: ['up', 'down'] }).notNull(),
  votedAt: integer('voted_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('proposal_player_unique').on(t.proposalId, t.playerUuid),
])

export const playerSessions = sqliteTable('player_sessions', {
  sessionToken: text('session_token').primaryKey(),
  playerUuid: text('player_uuid').notNull(),
  playerName: text('player_name').notNull(),
  role: text('role', { enum: ['player', 'editor', 'admin'] }).notNull().default('player'),
  ipAddress: text('ip_address'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
})

export const dashboardConfigs = sqliteTable('dashboard_configs', {
  key: text('key').primaryKey(),
  configJson: text('config_json').notNull().default('{"widgets":[]}'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const authCodes = sqliteTable('auth_codes', {
  code: text('code').primaryKey(),
  playerUuid: text('player_uuid').notNull(),
  playerName: text('player_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  used: integer('used', { mode: 'boolean' }).notNull().default(false),
})
