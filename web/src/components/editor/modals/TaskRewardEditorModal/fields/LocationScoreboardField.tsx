import { useState } from 'react'
import type { EditorTask, EditorReward } from '../../../types.js'
import { playerApi, type PlayerLocation } from '@/api/player.js'

interface LocationFieldProps {
  item: EditorTask | EditorReward
  handleChange: (changes: Partial<EditorTask> | Partial<EditorReward>) => void
}

export function LocationField({ item, handleChange }: LocationFieldProps) {
  const [fetchingLoc, setFetchingLoc] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
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
      <button
        onClick={handleFetchLocation}
        disabled={fetchingLoc}
        className="self-start text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
        title="ゲームでの現在座標を自動入力"
      >
        {fetchingLoc ? '取得中...' : '🎮 現在の位置を入力'}
      </button>
      {locError && <span className="text-xs text-red-400">{locError}</span>}
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

interface ScoreboardFieldProps {
  item: EditorTask | EditorReward
  handleChange: (changes: Partial<EditorTask> | Partial<EditorReward>) => void
}

export function ScoreboardField({ item, handleChange }: ScoreboardFieldProps) {
  const t = item as EditorTask
  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs text-blue-300 font-bold uppercase tracking-wider">スコアボード</label>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">スコアボード名 (Objective)</label>
        <input
          type="text"
          value={t.objective ?? ''}
          onChange={(e) => handleChange({ objective: e.target.value } as any)}
          placeholder="point"
          className="bg-black/40 border border-gray-600 p-2 text-sm text-white font-mono outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">目標スコア (この値以上で達成)</label>
        <input
          type="number"
          min={1}
          value={t.score ?? 1}
          onChange={(e) => handleChange({ score: Number(e.target.value) } as any)}
          className="bg-black/40 border border-gray-600 p-2 text-sm text-white w-32 outline-none focus:border-blue-500"
        />
      </div>
    </div>
  )
}
