import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { rankingApi } from '@/api/ranking.js'
import type { RankingType } from '@/types/ranking.js'
import { useViewAsContext } from '@/contexts/ViewAsContext.js'
import { RankingPanel } from './RankingPanel.js'

interface Props {
  /** 数値クエストID (保存済みノードのみ)。 */
  questId: number
  /** 繰り返しクエストなら種別セグメントを表示する。 */
  repeatable: boolean
  /** プレイヤー選択 (view-as) 時に呼ばれる。モーダルを閉じる等に使う。 */
  onSelectPlayer?: () => void
}

/**
 * クエストのランキングを取得して RankingPanel に流し込むコンテナ。
 * モーダル内の「ランキング」タブで使う。
 */
export function QuestRankingSection({ questId, repeatable, onSelectPlayer }: Props) {
  const [type, setType] = useState<RankingType>('first')
  const [full, setFull] = useState(false)
  const { setViewAs } = useViewAsContext()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ranking', questId, type, full],
    queryFn: () => rankingApi.get(questId, { type, limit: full ? undefined : 5, full: full || undefined }),
  })

  const handleShowAll = () => setFull(true)

  const handleTypeChange = (t: RankingType) => {
    setType(t)
    setFull(false)
  }

  if (isLoading) {
    return <div className="text-center text-sm text-gray-500 py-8">ランキングを読み込み中...</div>
  }
  if (isError || !data) {
    return <div className="text-center text-sm text-gray-500 py-8">ランキングを取得できませんでした</div>
  }

  return (
    <RankingPanel
      type={data.type}
      top={data.top}
      around={data.around}
      totalPlayers={data.totalPlayers}
      repeatable={repeatable}
      onTypeChange={handleTypeChange}
      onShowAll={full ? undefined : handleShowAll}
      onSelectPlayer={(playerUuid, playerName) => {
        setViewAs({ playerUuid, playerName })
        onSelectPlayer?.()
      }}
    />
  )
}
