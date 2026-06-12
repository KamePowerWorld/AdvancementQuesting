import { db } from './client.js'
import { quests, authCodes, playerSessions, playerProgress } from './schema.js'
import { randomUUID } from 'crypto'

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

async function seed() {
  console.log('Seeding database...')

  // クエストデータ
  const questData = [
    {
      id: randomUUID(),
      title: '最初の一歩',
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
      id: randomUUID(),
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
      id: randomUUID(),
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
      id: randomUUID(),
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
  questData[1].prerequisites = [questData[0].id]
  questData[2].prerequisites = [questData[1].id]
  questData[3].prerequisites = [questData[2].id]

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
  ]).onConflictDoNothing()

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
    questId: questData[0].id,
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
