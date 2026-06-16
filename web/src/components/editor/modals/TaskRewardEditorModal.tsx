import { useState } from 'react'
import { X } from 'lucide-react'
import type { EditorNode, EditorTask, EditorReward, ItemSelectorConfig } from '../types.js'
import { TASK_TYPES, REWARD_TYPES } from '../constants.js'
import { ItemIcon } from '../ItemIcon.js'
import { useIsMobile } from '@/hooks/useIsMobile.js'
import { useMcItems, getItemName, useMcAdvancements, getCustomStatName } from '@/hooks/useMcData.js'
import { playerApi, type PlayerLocation } from '@/api/player.js'
import { AdvancementSelectorModal } from './AdvancementSelectorModal.js'
import { StatSelectorModal } from './StatSelectorModal.js'
import type { StatSelection } from './StatSelectorModal.js'

/** 統計カテゴリのラベル */
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

interface TaskRewardEditorModalProps {
  node: EditorNode
  category: 'task' | 'reward'
  itemId: string
  close: () => void
  updateNode: (node: EditorNode) => void
  openItemSelector: (config: ItemSelectorConfig) => void
}

export function TaskRewardEditorModal({
  node,
  category,
  itemId,
  close,
  updateNode,
  openItemSelector,
}: TaskRewardEditorModalProps) {
  const isMobile = useIsMobile()
  const items = category === 'task' ? node.tasks : node.rewards
  const item = items.find((i) => i.id === itemId)
  const { lang } = useMcItems()
  const { advancements } = useMcAdvancements()
  const [fetchingHeld, setFetchingHeld] = useState(false)
  const [heldError, setHeldError] = useState<string | null>(null)
  const [fetchingLoc, setFetchingLoc] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  // サブモーダル表示フラグ
  const [showAdvSelector, setShowAdvSelector] = useState(false)
  const [showStatSelector, setShowStatSelector] = useState(false)

  if (!item) return null

  const types = category === 'task' ? TASK_TYPES : REWARD_TYPES
  const typeDef = types.find((t) => t.id === item.type)

  const handleChange = (changes: Partial<EditorTask> | Partial<EditorReward>) => {
    const newItems = items.map((i) => (i.id === itemId ? { ...i, ...changes } : i))
    const iconUpdate = category === 'task' && 'itemType' in changes && changes.itemType
      ? { icon: changes.itemType as string }
      : {}
    updateNode({
      ...node,
      ...iconUpdate,
      [category === 'task' ? 'tasks' : 'rewards']: newItems,
    })
  }

  const handleFetchHeldItem = async () => {
    setFetchingHeld(true)
    setHeldError(null)
    try {
      const held = await playerApi.getHeldItem()
      // itemId は "minecraft:diamond_sword" 形式 → itemType に使う
      const changes: Partial<EditorTask & EditorReward> = {
        itemType: held.itemId,
        count: held.count,
        nbt: held.nbt ?? undefined,
        displayName: held.displayName ?? undefined,
      }
      // タスクならアイコンも同期
      const iconUpdate = category === 'task' ? { icon: held.itemId } : {}
      const newItems = items.map((i) => (i.id === itemId ? { ...i, ...changes } : i))
      updateNode({ ...node, ...iconUpdate, [category === 'task' ? 'tasks' : 'rewards']: newItems })
    } catch {
      setHeldError('手持ちアイテムを取得できませんでした。ゲームにログインしているか確認してください。')
    } finally {
      setFetchingHeld(false)
    }
  }

  const handleOpenItemSelector = () => {
    if (category === 'task') {
      openItemSelector({ type: 'task_item', nodeId: node.id, taskId: item.id })
    } else {
      openItemSelector({ type: 'reward_item', nodeId: node.id, rewardId: item.id })
    }
  }

  const handleAdvancementSelect = (advId: string) => {
    handleChange({ advancementId: advId } as any)
    setShowAdvSelector(false)
  }

  const handleStatSelect = (sel: StatSelection) => {
    handleChange({ statType: sel.statType, statId: sel.statId } as any)
    setShowStatSelector(false)
  }

  const currentItemId = (item as EditorTask).itemType ?? 'stone'
  const currentItemName = getItemName(lang, currentItemId)

  // アドバンスメント表示名の解決 (langがロード済みなら日本語名、なければID)
  const currentAdvId = (item as EditorTask).advancementId ?? ''
  const currentAdvName = advancements?.find((a) => a.id === currentAdvId)?.name ?? currentAdvId

  // 統計表示名の解決
  const currentStatType = (item as EditorTask).statType ?? ''
  const currentStatId = (item as EditorTask).statId ?? ''
  const statCategoryLabel = STAT_CATEGORY_LABELS[currentStatType] ?? currentStatType
  const statIdLabel = (() => {
    if (!currentStatId) return ''
    if (currentStatType === 'minecraft:custom') {
      return getCustomStatName(lang ? { ja: lang.ja, en: lang.en } : undefined, currentStatId)
    }
    // アイテムベース: minecraft:diamond → diamond のアイテム名を解決
    const idPart = currentStatId.includes(':') ? currentStatId.split(':')[1] : currentStatId
    return getItemName(lang, idPart)
  })()

  const taskSpecificField = (() => {
    // ----- アイテム -----
    if (item.type === 'item') {
      const itemWithExtra = item as EditorTask & EditorReward
      const hasNbt = !!itemWithExtra.nbt
      const hasDisplayName = !!itemWithExtra.displayName
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">アイテム</label>
          <div className="flex items-center gap-3 bg-black/20 p-3 border border-gray-700">
            <div
              className="cursor-pointer bg-[#1e1f29] p-2 active:opacity-70 ring-1 ring-gray-500 shrink-0"
              onClick={handleOpenItemSelector}
              title="アイテムを変更"
            >
              <ItemIcon type={currentItemId} size={36} />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              {hasDisplayName && (
                <span className="text-sm text-yellow-300 font-bold truncate">{itemWithExtra.displayName}</span>
              )}
              <span className="text-sm text-white font-bold truncate">{currentItemName}</span>
              <span className="text-xs text-gray-400 truncate">{currentItemId}</span>
              {hasNbt && (
                <span className="text-xs text-purple-400 truncate" title={itemWithExtra.nbt}>
                  NBT付き ✦
                </span>
              )}
              <div className="flex gap-3 mt-1">
                <button
                  onClick={handleOpenItemSelector}
                  className="text-xs text-blue-400 hover:text-blue-300 text-left"
                >
                  ＋ 選択する
                </button>
                <button
                  onClick={handleFetchHeldItem}
                  disabled={fetchingHeld}
                  className="text-xs text-green-400 hover:text-green-300 text-left disabled:opacity-50"
                  title="ゲームで手に持っているアイテムをそのまま登録（エンチャント・NBT含む）"
                >
                  {fetchingHeld ? '取得中...' : '🎮 手持ちを登録'}
                </button>
              </div>
              {heldError && (
                <span className="text-xs text-red-400 mt-1">{heldError}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">数量</label>
              <input
                type="number"
                min={1}
                value={itemWithExtra.count ?? 1}
                onChange={(e) => handleChange({ count: Number(e.target.value) } as any)}
                className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-24 outline-none focus:border-blue-500"
              />
            </div>
            {hasNbt && (
              <button
                onClick={() => handleChange({ nbt: undefined, displayName: undefined } as any)}
                className="text-xs text-red-400 hover:text-red-300 mt-4"
                title="NBTと表示名をクリアしてノーマルアイテムに戻す"
              >
                ✕ NBTをクリア
              </button>
            )}
          </div>
        </div>
      )
    }

    // ----- 進捗 (Advancement) -----
    if (item.type === 'advancement') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">進捗 (Advancement)</label>

          {/* 選択中の進捗を表示 */}
          <div
            className="flex items-center gap-3 bg-black/20 p-3 border border-gray-700 cursor-pointer hover:border-blue-500"
            onClick={() => setShowAdvSelector(true)}
          >
            <span className="text-2xl shrink-0">🏆</span>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              {currentAdvId ? (
                <>
                  <span className="text-sm font-bold text-white truncate">{currentAdvName}</span>
                  <span className="text-xs text-gray-400 truncate">{currentAdvId}</span>
                </>
              ) : (
                <span className="text-sm text-gray-400">クリックして選択...</span>
              )}
            </div>
            <span className="text-xs text-blue-400 shrink-0">変更</span>
          </div>

          {/* カスタムID直接入力 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">カスタムID (直接入力)</label>
            <input
              type="text"
              value={currentAdvId}
              onChange={(e) => handleChange({ advancementId: e.target.value } as any)}
              placeholder="minecraft:story/mine_wood"
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )
    }

    // ----- 統計 -----
    if (item.type === 'stat') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">統計</label>

          {/* 選択中の統計を表示 */}
          <div
            className="flex items-center gap-3 bg-black/20 p-3 border border-gray-700 cursor-pointer hover:border-blue-500"
            onClick={() => setShowStatSelector(true)}
          >
            <span className="text-2xl shrink-0">📊</span>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              {currentStatType ? (
                <>
                  <span className="text-sm font-bold text-white truncate">
                    {statCategoryLabel}: {statIdLabel || currentStatId}
                  </span>
                  <span className="text-xs text-gray-400 truncate">
                    {currentStatType} / {currentStatId}
                  </span>
                </>
              ) : (
                <span className="text-sm text-gray-400">クリックして選択...</span>
              )}
            </div>
            <span className="text-xs text-blue-400 shrink-0">変更</span>
          </div>

          {/* 目標値 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">目標値 (この値以上で達成)</label>
            <input
              type="number"
              min={1}
              value={(item as EditorTask).count ?? 1}
              onChange={(e) => handleChange({ count: Number(e.target.value) } as any)}
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )
    }

    // ----- 座標 -----
    if (item.type === 'location') {
      const t = item as EditorTask
      const DIMENSIONS = [
        { id: 'overworld', label: '地上 (Overworld)' },
        { id: 'nether',    label: 'ネザー (Nether)' },
        { id: 'end',       label: 'エンド (The End)' },
      ]
      const handleFetchLocation = async () => {
        setFetchingLoc(true)
        setLocError(null)
        try {
          const loc: PlayerLocation = await playerApi.getLocation()
          handleChange({ locX: loc.x, locY: loc.y, locZ: loc.z, dimension: loc.dimension } as any)
        } catch {
          setLocError('座標を取得できませんでした。ゲームにログインしているか確認してください。')
        } finally {
          setFetchingLoc(false)
        }
      }
      return (
        <div className="flex flex-col gap-3">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">座標</label>

          {/* 現在地ボタン */}
          <button
            onClick={handleFetchLocation}
            disabled={fetchingLoc}
            className="self-start text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
            title="ゲームでの現在座標を自動入力"
          >
            {fetchingLoc ? '取得中...' : '🎮 現在の位置を入力'}
          </button>
          {locError && <span className="text-xs text-red-400">{locError}</span>}

          {/* XYZ */}
          <div className="flex gap-2">
            {(['X', 'Y', 'Z'] as const).map((axis) => {
              const key = `loc${axis}` as 'locX' | 'locY' | 'locZ'
              return (
                <div key={axis} className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-gray-400">{axis}</label>
                  <input
                    type="number"
                    value={t[key] ?? 0}
                    onChange={(e) => handleChange({ [key]: Number(e.target.value) } as any)}
                    className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-full outline-none focus:border-blue-500"
                  />
                </div>
              )
            })}
          </div>

          {/* ディメンション */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">ディメンション</label>
            <select
              value={t.dimension ?? 'overworld'}
              onChange={(e) => handleChange({ dimension: e.target.value } as any)}
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* 半径 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">半径 (ブロック)</label>
            <input
              type="number"
              min={1}
              value={t.radius ?? 10}
              onChange={(e) => handleChange({ radius: Number(e.target.value) } as any)}
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )
    }

    // ----- チェックマーク -----
    if (item.type === 'checkmark') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">確認メッセージ</label>
          <textarea
            value={item.value}
            onChange={(e) => handleChange({ value: e.target.value })}
            rows={3}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500 resize-none"
            placeholder="プレイヤーに確認してもらう内容..."
          />
        </div>
      )
    }

    if (item.type === 'command') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">コマンド</label>
          <input
            type="text"
            value={item.value}
            onChange={(e) => handleChange({ value: e.target.value })}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white font-mono outline-none focus:border-blue-500"
            placeholder="/say タスク完了!"
          />
          <div className="text-xs text-gray-500">%player% でプレイヤー名に置換されます</div>
        </div>
      )
    }

    if (item.type === 'xp') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">経験値量</label>
          <input
            type="number"
            min={1}
            value={(item as EditorReward & { amount?: number }).amount ?? 0}
            onChange={(e) => handleChange({ amount: Number(e.target.value) } as any)}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
            placeholder="100"
          />
        </div>
      )
    }

    if (item.type === 'point') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">ポイント数</label>
          <input
            type="number"
            min={1}
            value={(item as EditorReward & { amount?: number }).amount ?? 0}
            onChange={(e) => handleChange({ amount: Number(e.target.value) } as any)}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
            placeholder="100"
          />
          <div className="text-xs text-gray-500">
            付与コマンドは config.yml の <code className="text-gray-300">point-command</code> で設定できます
          </div>
        </div>
      )
    }

    if (item.type === 'loot') {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">ルートテーブルID</label>
          <input
            type="text"
            value={item.value}
            onChange={(e) => handleChange({ value: e.target.value })}
            className="bg-black/40 border border-gray-600 p-2 text-sm text-white font-mono outline-none focus:border-blue-500"
            placeholder="minecraft:chests/simple_dungeon"
          />
        </div>
      )
    }

    // デフォルト: valueフィールド
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">値</label>
        <input
          type="text"
          value={item.value}
          onChange={(e) => handleChange({ value: e.target.value })}
          className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
          placeholder="値を入力..."
        />
      </div>
    )
  })()

  // 表示名フィールドが不要なタイプ
  const noDisplayName = item.type === 'point' || item.type === 'advancement' || item.type === 'stat' || item.type === 'checkmark' || item.type === 'location'

  const inner = (
    <>
      <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{typeDef?.icon}</span>
          <h2 className="font-bold text-lg">
            {category === 'task' ? 'タスク編集' : '報酬編集'} — {typeDef?.label}
          </h2>
        </div>
        <button onClick={close} className="text-gray-400 hover:text-red-400 p-1">
          <X size={24} />
        </button>
      </div>

      <div className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0">
        {taskSpecificField}

        {!noDisplayName && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider">表示名 (省略可)</label>
            <input
              type="text"
              value={item.value}
              onChange={(e) => handleChange({ value: e.target.value })}
              className="bg-black/40 border border-gray-600 p-2 text-sm text-white outline-none focus:border-blue-500"
              placeholder="表示テキスト..."
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end shrink-0 pt-3 border-t border-gray-700">
        <button
          onClick={close}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 border border-blue-700 px-6 py-2 text-sm font-bold shadow-md transition-colors"
        >
          完了
        </button>
      </div>

      {/* サブモーダル: 進捗選択 */}
      {showAdvSelector && (
        <AdvancementSelectorModal
          close={() => setShowAdvSelector(false)}
          onSelect={handleAdvancementSelect}
        />
      )}

      {/* サブモーダル: 統計選択 */}
      {showStatSelector && (
        <StatSelectorModal
          close={() => setShowStatSelector(false)}
          onSelect={handleStatSelect}
        />
      )}
    </>
  )

  if (isMobile) {
    return (
      <div className="absolute inset-0 z-[55] flex flex-col bg-[#2d2f3b] text-white p-5">
        {inner}
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-[55] flex items-center justify-center bg-black/70"
      onClick={close}
    >
      <div
        className="bg-[#2d2f3b] border-2 border-[#1e1f29] w-[480px] max-h-[600px] flex flex-col p-5 shadow-2xl text-white relative"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  )
}
