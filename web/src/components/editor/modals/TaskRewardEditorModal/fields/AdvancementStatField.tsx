import { useState } from 'react'
import type { EditorTask, EditorReward } from '../../../types.js'
import { getItemName, getCustomStatName } from '@/hooks/useMcData.js'
import { AdvancementSelectorModal } from '../../AdvancementSelectorModal.js'
import { StatSelectorModal } from '../../StatSelectorModal.js'
import type { StatSelection } from '../../StatSelectorModal.js'
import { NamespacedId } from '@/util/NamespacedId.js'

const STAT_CATEGORY_LABELS: Record<string, string> = {
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

interface AdvancementFieldProps {
  item: EditorTask | EditorReward
  advancements?: { id: NamespacedId; name: string }[]
  handleChange: (changes: Partial<EditorTask> | Partial<EditorReward>) => void
}

export function AdvancementField({ item, advancements, handleChange }: AdvancementFieldProps) {
  const [showAdvSelector, setShowAdvSelector] = useState(false)
  const currentAdvId = (item as EditorTask).advancementId
  const currentAdvName = (currentAdvId && advancements?.find((a) => a.id.equals(currentAdvId))?.name) ?? currentAdvId?.toString() ?? ''

  const handleAdvancementSelect = (advId: NamespacedId) => {
    handleChange({ advancementId: advId })
    setShowAdvSelector(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">進捗 (Advancement)</label>
      <div
        className="flex items-center gap-3 bg-black/20 p-3 border border-gray-700 cursor-pointer hover:border-blue-500"
        onClick={() => setShowAdvSelector(true)}
      >
        <span className="text-2xl shrink-0">🏆</span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {currentAdvId ? (
            <>
              <span className="text-sm font-bold text-white truncate">{currentAdvName}</span>
              <span className="text-xs text-gray-400 truncate">{currentAdvId.toString()}</span>
            </>
          ) : (
            <span className="text-sm text-gray-400">クリックして選択...</span>
          )}
        </div>
        <span className="text-xs text-blue-400 shrink-0">変更</span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">カスタムID (直接入力)</label>
        <input
          type="text"
          defaultValue={currentAdvId?.toString() ?? ''}
          onBlur={(e) => {
            // ユーザー入力境界: 省略形は minecraft: を補完して NamespacedId 化
            const v = e.target.value.trim()
            handleChange({ advancementId: v ? NamespacedId.parseUserInput(v) : undefined })
          }}
          placeholder="minecraft:story/mine_wood"
          className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
        />
      </div>
      {showAdvSelector && (
        <AdvancementSelectorModal
          close={() => setShowAdvSelector(false)}
          onSelect={handleAdvancementSelect}
        />
      )}
    </div>
  )
}

interface StatFieldProps {
  item: EditorTask | EditorReward
  lang?: { ja: Record<string, string>; en: Record<string, string> }
  handleChange: (changes: Partial<EditorTask> | Partial<EditorReward>) => void
}

export function StatField({ item, lang, handleChange }: StatFieldProps) {
  const [showStatSelector, setShowStatSelector] = useState(false)
  const currentStatType = (item as EditorTask).statType ?? ''
  const currentStatId = (item as EditorTask).statId
  const statCategoryLabel = STAT_CATEGORY_LABELS[currentStatType] ?? currentStatType
  const statIdLabel = (() => {
    if (!currentStatId) return ''
    if (currentStatType === 'minecraft:custom') {
      return getCustomStatName(lang ? { ja: lang.ja, en: lang.en } : undefined, currentStatId)
    }
    return getItemName(lang, currentStatId)
  })()

  const handleStatSelect = (sel: StatSelection) => {
    handleChange({ statType: sel.statType, statId: sel.statId })
    setShowStatSelector(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">統計</label>
      <div
        className="flex items-center gap-3 bg-black/20 p-3 border border-gray-700 cursor-pointer hover:border-blue-500"
        onClick={() => setShowStatSelector(true)}
      >
        <span className="text-2xl shrink-0">📊</span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {currentStatType ? (
            <>
              <span className="text-sm font-bold text-white truncate">
                {statCategoryLabel}: {statIdLabel || (currentStatId?.toString() ?? '')}
              </span>
              <span className="text-xs text-gray-400 truncate">
                {currentStatType} / {currentStatId?.toString() ?? ''}
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-400">クリックして選択...</span>
          )}
        </div>
        <span className="text-xs text-blue-400 shrink-0">変更</span>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">目標値 (この値以上で達成)</label>
        <input
          type="number"
          min={1}
          value={(item as EditorTask).count ?? 1}
          onChange={(e) => handleChange({ count: Number(e.target.value) })}
          className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
        />
      </div>
      {showStatSelector && (
        <StatSelectorModal
          close={() => setShowStatSelector(false)}
          onSelect={handleStatSelect}
        />
      )}
    </div>
  )
}
