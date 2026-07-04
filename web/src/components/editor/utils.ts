import type { EditorTask, EditorReward } from './types.js'
import { TASK_TYPES, REWARD_TYPES, DEFAULT_ITEM_ID } from './constants.js'
import { getItemName, getAdvancementName, getCustomStatName } from '@/hooks/useMcData.js'

const STAT_CATEGORY_SHORT: Record<string, string> = {
  'minecraft:mined':     '採掘',
  'minecraft:crafted':   'クラフト',
  'minecraft:used':      '使用',
  'minecraft:broken':    '破壊',
  'minecraft:picked_up': '拾得',
  'minecraft:dropped':   '破棄',
  'minecraft:killed':    '討伐',
  'minecraft:killed_by': '被討伐',
  'minecraft:custom':    'カスタム',
}

export function getDisplayText(
  item: EditorTask | EditorReward,
  category: 'task' | 'reward',
  lang?: { ja: Record<string, string>; en: Record<string, string> },
): string {
  const types = category === 'task' ? TASK_TYPES : REWARD_TYPES
  const def = types.find((t) => t.id === item.type)
  const prefix = def?.label ?? ''

  let detail: string
  if (item.type === 'item' || item.type === 'delivery') {
    const itemId = item.itemType ?? DEFAULT_ITEM_ID
    const count = item.count ?? 1
    const name = item.value || getItemName(lang, itemId)
    detail = count > 1 ? `${name} ×${count}` : name
  } else if (item.type === 'advancement') {
    const advId = (item as EditorTask).advancementId
    detail = advId ? (getAdvancementName(lang, advId)) : '未設定'
  } else if (item.type === 'stat') {
    const statType = (item as EditorTask).statType ?? ''
    const statId = (item as EditorTask).statId
    const count = (item as EditorTask).count ?? 1
    const catLabel = STAT_CATEGORY_SHORT[statType] ?? statType
    const idLabel = !statId ? '' : statType === 'minecraft:custom'
      ? getCustomStatName(lang, statId)
      : getItemName(lang, statId)
    detail = statType ? `${catLabel}: ${idLabel || (statId?.toString() ?? '')} ×${count}` : '未設定'
  } else if (item.type === 'point') {
    const amount = (item as EditorReward).amount ?? 0
    detail = `${amount} pt`
  } else if (item.type === 'scoreboard') {
    const t = item as EditorTask
    const label = item.value || t.objective || '未設定'
    detail = t.objective ? `${label} ≥ ${t.score ?? 1}` : '未設定'
  } else if (item.type === 'location') {
    const t = item as EditorTask
    const dim = { overworld: '地上', nether: 'ネザー', end: 'エンド' }[t.dimension ?? 'overworld'] ?? t.dimension ?? '地上'
    if (t.locX != null) {
      detail = `${dim} (${t.locX}, ${t.locY}, ${t.locZ}) ±${t.radius ?? 10}`
    } else {
      detail = '未設定'
    }
  } else if (item.value) {
    detail = item.value
  } else {
    detail = item.type === 'checkmark' ? '確認する' : '未設定'
  }

  if (item.type === 'checkmark') return detail
  return `${prefix}: ${detail}`
}
