import type { FC } from 'react'
import type { RankingType, RankingEntry } from '@/types/ranking.js'

export type { RankingType, RankingEntry }

export interface RankingPanelProps {
  /** ランキング種別。first=クリア順 / count=クリア回数 */
  type: RankingType
  /** 上位エントリ (rank 昇順) */
  top: RankingEntry[]
  /**
   * 自分が top 圏外のときの周辺エントリ (rank 昇順)。
   * top 圏内、または未クリアなら空配列。
   */
  around?: RankingEntry[]
  /** ランキング対象の総プレイヤー数 */
  totalPlayers?: number
  /**
   * 繰り返しクエストか。true のとき「クリア順 / クリア回数」の
   * セグメント切り替えを表示する。
   */
  repeatable?: boolean
  /** セグメント切り替え時に呼ばれる */
  onTypeChange?: (type: RankingType) => void
  /** 「詳細を見る」ボタン。未指定なら非表示 */
  onShowAll?: () => void
}

// ---------------------------------------------------------------------------
// 表示ユーティリティ
// ---------------------------------------------------------------------------

const MEDALS = ['🥇', '🥈', '🥉']

function rankBadge(rank: number): string {
  return rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : `#${rank}`
}

function formatClearTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const mo = d.getMonth() + 1
  const day = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${mo}/${day} ${hh}:${mm}`
}

function avatarUrl(name: string, size = 24): string {
  return `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size}`
}

// ---------------------------------------------------------------------------
// 行
// ---------------------------------------------------------------------------

interface RowProps {
  entry: RankingEntry
  type: RankingType
}

const RankingRow: FC<RowProps> = ({ entry, type }) => {
  const top3 = entry.rank <= 3
  return (
    <div
      className={[
        'flex items-center gap-2 px-2 py-1.5 rounded-sm border transition-colors',
        entry.isMe
          ? 'bg-yellow-900/25 border-yellow-600/60'
          : top3
            ? 'bg-black/40 border-gray-700'
            : 'bg-black/20 border-transparent',
      ].join(' ')}
    >
      {/* 順位 */}
      <div
        className={`shrink-0 text-center font-bold ${top3 ? 'text-lg w-6' : 'text-sm w-6 text-gray-400'}`}
      >
        {rankBadge(entry.rank)}
      </div>

      {/* スキンアイコン */}
      <img
        src={avatarUrl(entry.playerName)}
        alt={entry.playerName}
        width={24}
        height={24}
        className="shrink-0 rounded-sm"
        style={{ imageRendering: 'pixelated' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
      />

      {/* 名前 + 日付 (2行) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className={`truncate text-sm font-semibold ${entry.isMe ? 'text-yellow-200' : 'text-gray-100'}`}>
          {entry.playerName}
          {entry.isMe && <span className="ml-1 text-[10px] text-yellow-400">(あなた)</span>}
        </div>
        <div className="text-[11px] text-gray-500 tabular-nums">
          {type === 'count'
            ? <><span className="font-bold text-blue-300 text-xs">{entry.clears}</span><span className="text-gray-400">回</span></>
            : formatClearTime(entry.completedAt)
          }
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// パネル本体
// ---------------------------------------------------------------------------

/**
 * クエストのランキング表示パネル。
 * API/Context に依存せず props だけで描画する純粋な表示コンポーネント。
 * クエスト詳細モーダル内の「ランキング」タブに埋め込む。
 */
export const RankingPanel: FC<RankingPanelProps> = ({
  type,
  top,
  around = [],
  totalPlayers,
  repeatable = false,
  onTypeChange,
  onShowAll,
}) => {
  const empty = top.length === 0

  return (
    <div className="flex flex-col gap-2 text-white h-full">
      {/* ヘッダー: 種別セグメント + 総数 */}
      <div className="flex items-center justify-between gap-2">
        {repeatable ? (
          <div className="inline-flex rounded-sm border border-gray-600 overflow-hidden">
            {([
              { id: 'first', label: 'クリア順' },
              { id: 'count', label: 'クリア回数' },
            ] as const).map((seg) => (
              <button
                key={seg.id}
                onClick={() => onTypeChange?.(seg.id)}
                className={`text-xs px-3 py-1 font-bold transition-colors ${
                  type === seg.id ? 'bg-blue-600 text-white' : 'bg-black/30 text-gray-300 hover:bg-white/5'
                }`}
              >
                {seg.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            🏆 クリア順ランキング
          </span>
        )}
        {totalPlayers != null && (
          <span className="text-[11px] text-gray-500">{totalPlayers}人がクリア</span>
        )}
      </div>

      {/* 本体 (full時はスクロール、デフォルトは固定) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {empty ? (
          <div className="text-center text-sm text-gray-500 py-8 border border-dashed border-gray-700 rounded-sm">
            まだ誰もクリアしていません
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {top.map((e) => (
              <RankingRow key={`top-${e.playerUuid}-${e.rank}`} entry={e} type={type} />
            ))}

            {/* 周辺順位 (自分が圏外のとき) */}
            {around.length > 0 && (
              <>
                <div className="text-center text-gray-600 text-sm leading-none py-0.5 select-none">⋯</div>
                {around.map((e) => (
                  <RankingRow key={`around-${e.playerUuid}-${e.rank}`} entry={e} type={type} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 全ランキングを見る: リストの外に固定配置なので around があっても隠れない */}
      {onShowAll && !empty && (
        <button
          onClick={onShowAll}
          className="shrink-0 self-center mt-1 text-xs px-4 py-1.5 border border-gray-600 rounded-sm text-gray-300 hover:bg-white/5 font-bold"
        >
          全ランキングを見る
        </button>
      )}
    </div>
  )
}
