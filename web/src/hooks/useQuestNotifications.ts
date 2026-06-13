import { useEffect, useRef } from 'react'

export interface QuestCompleteEvent {
  questId: number
  questTitle: string
  playerUuid: string
  playerName: string
}

/**
 * SSE でクエスト完了通知を購読する。
 * @param onQuestComplete 通知受信時のコールバック
 * @param authKey ログイン状態が変わると再接続するためのキー (例: playerUuid)。
 *                これが変わると EventSource を張り直す。
 */
export function useQuestNotifications(
  onQuestComplete: (event: QuestCompleteEvent) => void,
  authKey?: string | null,
) {
  const onQuestCompleteRef = useRef(onQuestComplete)
  onQuestCompleteRef.current = onQuestComplete

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    es.addEventListener('quest_complete', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as QuestCompleteEvent
        onQuestCompleteRef.current(data)
      } catch {
        // ignore parse errors
      }
    })

    es.onerror = () => {
      // EventSource reconnects automatically
    }

    return () => {
      es.close()
    }
    // authKey が変わる (= ログイン/ログアウト) と接続を張り直す
  }, [authKey])
}
