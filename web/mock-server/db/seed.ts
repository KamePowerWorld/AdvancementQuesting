import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './client.js'
import { quests, authCodes, playerSessions, playerProgress, questProposals, proposalVotes } from './schema.js'

const DEMO_PLAYER_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const DEMO_PLAYER_NAME = 'Steve'
const DEMO_TOKEN = 'demo-session-token-for-development'
const DEMO_CODE = '123456'

const EDITOR_UUID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
const EDITOR_NAME = 'Editor'
const EDITOR_TOKEN = 'demo-editor-token'

const PLAYER_UUID = 'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa'
const PLAYER_NAME = 'Alex'
const PLAYER_TOKEN = 'demo-player-token'

// テスト時に data-node-id で特定できるよう固定 ID を使う
const QUEST_ID_1 = '00000000-0000-0000-0000-000000000001'
const QUEST_ID_2 = '00000000-0000-0000-0000-000000000002'
const QUEST_ID_3 = '00000000-0000-0000-0000-000000000003'
const QUEST_ID_4 = '00000000-0000-0000-0000-000000000004'

async function seed() {
  migrate(db, { migrationsFolder: './mock-server/db/migrations' })
  console.log('Seeding database...')

  // 既存データを全削除 (外部キー制約に配慮した順序)
  await db.delete(proposalVotes)
  await db.delete(questProposals)
  await db.delete(playerProgress)
  await db.delete(authCodes)
  await db.delete(playerSessions)
  await db.delete(quests)

  // クエストデータ
  const questData = [
    {
      id: QUEST_ID_1,
      title: '基本',
      description: 'ゲームを始めよう。木を1つ入手してください。',
      icon: 'oak_log',
      category: '序盤',
      prerequisites: [] as string[],
      conditions: [{ type: 'advancement', advancementId: 'minecraft:story/mine_stone', requiredCount: 1 }],
      rewards: [{ type: 'item', itemId: 'wooden_pickaxe', count: 1 }],
      mapPosition: { x: 100, y: 100 },
      customButtons: [] as object[],
      status: 'public' as const,
      creatorUuid: null,
    },
    {
      id: QUEST_ID_2,
      title: '石器時代',
      description: '石のツルハシを作って採掘を始めよう。',
      icon: 'stone_pickaxe',
      category: '序盤',
      prerequisites: [] as string[],
      conditions: [{ type: 'advancement', advancementId: 'minecraft:story/upgrade_tools', requiredCount: 1 }],
      rewards: [{ type: 'item', itemId: 'stone_pickaxe', count: 1 }, { type: 'experience', amount: 10, isLevel: false }],
      mapPosition: { x: 250, y: 100 },
      customButtons: [] as object[],
      status: 'public' as const,
      creatorUuid: null,
    },
    {
      id: QUEST_ID_3,
      title: 'ダイヤの輝き',
      description: 'ダイヤモンドを手に入れよう。',
      icon: 'diamond',
      category: '中盤',
      prerequisites: [] as string[],
      conditions: [{ type: 'advancement', advancementId: 'minecraft:story/mine_diamond', requiredCount: 1 }],
      rewards: [{ type: 'item', itemId: 'diamond_pickaxe', count: 1 }, { type: 'money', amount: 1000 }],
      mapPosition: { x: 400, y: 100 },
      customButtons: [] as object[],
      status: 'public' as const,
      creatorUuid: null,
    },
    {
      id: QUEST_ID_4,
      title: 'ネザーの扉',
      description: 'ネザーポータルを作って別の次元へ。',
      icon: 'obsidian',
      category: '中盤',
      prerequisites: [] as string[],
      conditions: [{ type: 'advancement', advancementId: 'minecraft:story/enter_the_nether', requiredCount: 1 }],
      rewards: [{ type: 'item', itemId: 'fire_resistance', count: 3 }],
      mapPosition: { x: 400, y: 250 },
      customButtons: [] as object[],
      status: 'draft' as const,
      creatorUuid: DEMO_PLAYER_UUID,
    },
  ]

  // 前提クエスト設定
  questData[1].prerequisites = [QUEST_ID_1]
  questData[2].prerequisites = [QUEST_ID_2]
  questData[3].prerequisites = [QUEST_ID_3]

  await db.insert(quests).values(questData).onConflictDoNothing()

  // デモ用セッショントークン (7日間有効)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.insert(playerSessions).values([
    {
      sessionToken: DEMO_TOKEN,
      playerUuid: DEMO_PLAYER_UUID,
      playerName: DEMO_PLAYER_NAME,
      role: 'editor' as const,
      expiresAt,
    },
    {
      sessionToken: EDITOR_TOKEN,
      playerUuid: EDITOR_UUID,
      playerName: EDITOR_NAME,
      role: 'editor' as const,
      expiresAt,
    },
    {
      sessionToken: PLAYER_TOKEN,
      playerUuid: PLAYER_UUID,
      playerName: PLAYER_NAME,
      role: 'player' as const,
      expiresAt,
    },
  ]).onConflictDoUpdate({
    target: playerSessions.sessionToken,
    set: { expiresAt },
  })

  // デモ用認証コード
  const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000)
  await db.insert(authCodes).values({
    code: DEMO_CODE,
    playerUuid: DEMO_PLAYER_UUID,
    playerName: DEMO_PLAYER_NAME,
    expiresAt: codeExpiresAt,
  }).onConflictDoNothing()

  // デモ用進捗データ
  await db.insert(playerProgress).values({
    playerUuid: DEMO_PLAYER_UUID,
    questId: QUEST_ID_1,
    progress: [{ conditionIndex: 0, currentCount: 1, completed: true }],
    completed: true,
    rewardClaimed: true,
    startedAt: new Date(Date.now() - 3600000),
    completedAt: new Date(Date.now() - 1800000),
  }).onConflictDoNothing()

  console.log(`Seeded ${questData.length} quests`)
  console.log(`[editor] token: ${EDITOR_TOKEN}`)
  console.log(`[player] token: ${PLAYER_TOKEN}`)
  console.log(`[legacy] token: ${DEMO_TOKEN}  code: ${DEMO_CODE}`)
}

seed().catch(console.error)
