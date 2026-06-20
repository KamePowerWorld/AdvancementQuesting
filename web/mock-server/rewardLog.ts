import { db } from './db/client.js'
import { rewardClaims } from './db/schema.js'

/** クエストの rewards 配列を reward_claims に展開挿入する (本番 RewardClaimDao.insertQuestRewards と同じ解釈)。 */
export async function insertQuestRewards(
  playerUuid: string,
  playerName: string,
  questId: number,
  questTitle: string,
  rewards: Array<Record<string, unknown>>,
  claimedAt: string,
  source: 'claim' | 'migrated',
) {
  for (const reward of rewards ?? []) {
    const type = reward['type'] as string | undefined
    if (!type) continue
    const label = typeof reward['label'] === 'string' ? (reward['label'] as string) : null
    let itemType: string | null = null
    let amount = 1
    if (type === 'item') {
      const it = reward['itemType'] ?? reward['itemId']
      itemType = typeof it === 'string' ? it : null
      amount = Number(reward['count'] ?? 1)
    } else if (type === 'experience' || type === 'point') {
      amount = Number(reward['amount'] ?? 0)
    } else {
      amount = 1
    }
    await db.insert(rewardClaims).values({
      playerUuid, playerName, questId, questTitle,
      rewardType: type, rewardLabel: label, itemType, amount, claimedAt, source,
    })
  }
}
