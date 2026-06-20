import { useCallback, useEffect, useState } from 'react'

/** view-as 対象。null = 自分視点。 */
export interface ViewAsTarget {
  playerUuid: string
  playerName: string
}

const PARAM = 'viewAs'
const NAME_PARAM = 'viewAsName'

function readFromUrl(): ViewAsTarget | null {
  const params = new URLSearchParams(window.location.search)
  const uuid = params.get(PARAM)
  if (!uuid) return null
  return { playerUuid: uuid, playerName: params.get(NAME_PARAM) ?? uuid }
}

function writeToUrl(target: ViewAsTarget | null) {
  const params = new URLSearchParams(window.location.search)
  if (target) {
    params.set(PARAM, target.playerUuid)
    params.set(NAME_PARAM, target.playerName)
  } else {
    params.delete(PARAM)
    params.delete(NAME_PARAM)
  }
  const search = params.toString()
  const base = window.location.pathname + (search ? `?${search}` : '')
  window.history.replaceState(null, '', base + window.location.hash)
}

/**
 * 「いま誰の視点でマップを見ているか」を URL (?viewAs=<uuid>) と同期して保持する。
 * リロード・共有でも視点が復元できる。
 */
export function useViewAs() {
  const [viewAs, setViewAsState] = useState<ViewAsTarget | null>(() => readFromUrl())

  const setViewAs = useCallback((target: ViewAsTarget | null) => {
    setViewAsState(target)
    writeToUrl(target)
  }, [])

  // 戻る/進む (popstate) で URL が変わったら state を追従
  useEffect(() => {
    const onPop = () => setViewAsState(readFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return { viewAs, setViewAs }
}
