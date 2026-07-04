import type { EditorTask, EditorReward } from '../../../types.js'

type ChangeHandler = (changes: Partial<EditorTask> | Partial<EditorReward>) => void

interface SimpleFieldProps {
  item: EditorTask | EditorReward
  handleChange: ChangeHandler
}

export function CheckmarkField({ item, handleChange }: SimpleFieldProps) {
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

export function CommandField({ item, handleChange }: SimpleFieldProps) {
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

export function XpField({ item, handleChange }: SimpleFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">経験値量</label>
      <input
        type="number"
        min={1}
        value={(item as EditorReward & { amount?: number }).amount ?? 0}
        onChange={(e) => handleChange({ amount: Number(e.target.value) })}
        className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
        placeholder="100"
      />
    </div>
  )
}

export function PointField({ item, handleChange }: SimpleFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">ポイント数</label>
      <input
        type="number"
        min={1}
        value={(item as EditorReward & { amount?: number }).amount ?? 0}
        onChange={(e) => handleChange({ amount: Number(e.target.value) })}
        className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
        placeholder="100"
      />
      <div className="text-xs text-gray-500">
        付与コマンドは config.yml の <code className="text-gray-300">point-command</code> で設定できます
      </div>
    </div>
  )
}

export function LootField({ item, handleChange }: SimpleFieldProps) {
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

export function DefaultValueField({ item, handleChange }: SimpleFieldProps) {
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
}
