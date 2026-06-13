import type { EditorTask, EditorReward } from './types.js'
import { TASK_TYPES, REWARD_TYPES } from './constants.js'
import { getItemName } from '@/hooks/useMcData.js'

export function getDisplayText(
  item: EditorTask | EditorReward,
  category: 'task' | 'reward',
  lang?: { ja: Record<string, string>; en: Record<string, string> },
): string {
  const types = category === 'task' ? TASK_TYPES : REWARD_TYPES
  const def = types.find((t) => t.id === item.type)
  const prefix = def?.label ?? ''

  let detail: string
  if (item.type === 'item') {
    const itemId = item.itemType ?? 'stone'
    const count = (item as any).count ?? 1
    const name = item.value || getItemName(lang, itemId)
    detail = count > 1 ? `${name} ×${count}` : name
  } else if (item.type === 'advancement') {
    detail = item.value || ((item as EditorTask & { advancementId?: string }).advancementId ?? '未設定')
  } else if (item.value) {
    detail = item.value
  } else {
    detail = item.type === 'checkmark' ? '確認する' : '未設定'
  }

  if (item.type === 'checkmark') return detail
  return `${prefix}: ${detail}`
}
