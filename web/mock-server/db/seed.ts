import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './client.js'
import { quests, authCodes, playerSessions, playerProgress, questProposals, proposalVotes, questCompletions, rewardClaims } from './schema.js'

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
// ファイル名 "00001_基本.json" 形式の連番と対応
const QUEST_ID_1 = 1
const QUEST_ID_2 = 2
const QUEST_ID_3 = 3
const QUEST_ID_4 = 4
const QUEST_ID_5 = 5
const QUEST_ID_6 = 6
const QUEST_ID_7 = 7
const QUEST_ID_8 = 8

export async function seed() {
  migrate(db, { migrationsFolder: './mock-server/db/migrations' })
  console.log('Seeding database...')

  // 既存データを全削除 (外部キー制約に配慮した順序)
  await db.delete(proposalVotes)
  await db.delete(questProposals)
  await db.delete(playerProgress)
  await db.delete(authCodes)
  await db.delete(playerSessions)
  await db.delete(questCompletions)
  await db.delete(rewardClaims)
  await db.delete(quests)

  // クエストデータ — id を明示して連番を強制（AUTOINCREMENT だが seed 時は上書き）
  const questData = [
    {
      id: QUEST_ID_1,
      title: '基本',
      description: 'ゲームを始めよう。木を1つ入手してください。',
      icon: 'oak_log',
      category: '序盤',
      prerequisites: [] as number[],
      conditions: [{ id: 'cond-1-adv', type: 'advancement', advancementId: 'minecraft:story/mine_stone', requiredCount: 1 }],
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
      prerequisites: [] as number[],
      conditions: [
        { id: 'cond-2-adv', type: 'advancement', advancementId: 'minecraft:story/upgrade_tools', requiredCount: 1 },
        { id: 'cond-2-item', type: 'item', itemType: 'oak_log', count: 3 },
      ],
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
      prerequisites: [] as number[],
      conditions: [{ id: 'cond-3-adv', type: 'advancement', advancementId: 'minecraft:story/mine_diamond', requiredCount: 1 }],
      rewards: [{ type: 'item', itemId: 'diamond_pickaxe', count: 1 }, { type: 'money', amount: 1000 }],
      mapPosition: { x: 400, y: 100 },
      customButtons: [] as object[],
      status: 'public' as const,
      creatorUuid: null,
    },
    {
      id: QUEST_ID_5,
      title: 'チェックテスト',
      description: 'チェックマーク条件のテスト用クエスト。',
      icon: 'paper',
      category: 'テスト',
      prerequisites: [] as number[],
      conditions: [
        { id: 'cond-5-check1', type: 'checkmark', label: '確認する' },
        { id: 'cond-5-check2', type: 'checkmark', label: '同意する' },
      ],
      rewards: [],
      mapPosition: { x: 600, y: 100 },
      customButtons: [] as object[],
      status: 'public' as const,
      creatorUuid: null,
    },
    {
      id: QUEST_ID_6,
      title: '座標テスト',
      description: '座標条件のテスト用クエスト。',
      icon: 'compass',
      category: 'テスト',
      prerequisites: [] as number[],
      conditions: [
        { id: 'cond-6-loc', type: 'location', x: 100, y: 64, z: 200, dimension: 'overworld', radius: 10 },
      ],
      rewards: [],
      mapPosition: { x: 600, y: 250 },
      customButtons: [] as object[],
      status: 'public' as const,
      creatorUuid: null,
    },
    {
      id: QUEST_ID_7,
      title: 'スコアボードテスト',
      description: 'スコアボード条件のテスト用クエスト。',
      icon: 'paper',
      category: 'テスト',
      prerequisites: [] as number[],
      conditions: [
        { id: 'cond-7-sb', type: 'scoreboard', objective: 'test_score', score: 100, label: 'スコア100以上' },
      ],
      rewards: [],
      mapPosition: { x: 600, y: 400 },
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
      prerequisites: [] as number[],
      conditions: [{ type: 'advancement', advancementId: 'minecraft:story/enter_the_nether', requiredCount: 1 }],
      rewards: [{ type: 'item', itemId: 'fire_resistance', count: 3 }],
      mapPosition: { x: 400, y: 250 },
      customButtons: [] as object[],
      status: 'draft' as const,
      creatorUuid: DEMO_PLAYER_UUID,
    },
    {
      id: QUEST_ID_8,
      title: '非公開テストクエスト',
      description: '非公開 (hidden) クエストのテスト用。',
      icon: 'barrier',
      category: 'テスト',
      prerequisites: [] as number[],
      conditions: [{ id: 'cond-8-adv', type: 'advancement', advancementId: 'minecraft:story/mine_stone', requiredCount: 1 }],
      rewards: [],
      mapPosition: { x: 100, y: 400 },
      customButtons: [] as object[],
      status: 'hidden' as const,
      creatorUuid: null,
    },
  ]

  // 前提クエスト設定
  questData[1].prerequisites = [QUEST_ID_1]
  questData[2].prerequisites = [QUEST_ID_2]
  questData[3].prerequisites = [QUEST_ID_3]

  // id を明示しつつ upsert — 既存行があれば全フィールドを上書き
  for (const quest of questData) {
    await db.insert(quests).values(quest).onConflictDoUpdate({
      target: quests.id,
      set: {
        title: quest.title,
        description: quest.description,
        icon: quest.icon,
        category: quest.category,
        prerequisites: quest.prerequisites,
        conditions: quest.conditions,
        rewards: quest.rewards,
        mapPosition: quest.mapPosition,
        customButtons: quest.customButtons,
        status: quest.status,
        creatorUuid: quest.creatorUuid,
        updatedAt: new Date(),
      },
    })
  }

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

  // デモ用進捗データ (questId は integer)
  await db.insert(playerProgress).values({
    playerUuid: DEMO_PLAYER_UUID,
    questId: QUEST_ID_1,
    progress: [{ conditionIndex: 0, currentCount: 1, completed: true }],
    completed: true,
    rewardClaimed: true,
    startedAt: new Date(Date.now() - 3600000),
    completedAt: new Date(Date.now() - 1800000),
  }).onConflictDoNothing()

  // Alex (player): 石器時代クエストを進行中 (完了済みかつ未受取 → 🎁バッジ表示テスト)
  await db.insert(playerProgress).values({
    playerUuid: PLAYER_UUID,
    questId: QUEST_ID_2,
    progress: [
      { conditionId: 'cond-2-adv', completed: true },
      { conditionId: 'cond-2-item', completed: false, current: 1, required: 3 },
    ],
    completed: false,
    rewardClaimed: false,
    startedAt: new Date(Date.now() - 7200000),
    completedAt: null,
  }).onConflictDoNothing()

  // Alex: スコアボードテストクエストを進行中 (D-2: stat/scoreboard 進捗バー表示テスト)
  await db.insert(playerProgress).values({
    playerUuid: PLAYER_UUID,
    questId: QUEST_ID_7,
    progress: [
      { conditionId: 'cond-7-sb', completed: false, current: 30, required: 100 },
    ],
    completed: false,
    rewardClaimed: false,
    startedAt: new Date(Date.now() - 3600000),
    completedAt: null,
  }).onConflictDoNothing()

  console.log(`Seeded ${questData.length} quests`)
  console.log(`[editor] token: ${EDITOR_TOKEN}`)
  console.log(`[player] token: ${PLAYER_TOKEN}`)
  console.log(`[legacy] token: ${DEMO_TOKEN}  code: ${DEMO_CODE}`)
}

seed().catch(console.error)
