import { createContext, useContext } from 'react'
import type { ViewAsTarget } from '@/hooks/useViewAs.js'

export type { ViewAsTarget }

interface ViewAsContextValue {
  /** null = 自分視点。値があれば「その人として閲覧中」 */
  viewAs: ViewAsTarget | null
  setViewAs: (target: ViewAsTarget | null) => void
}

export const ViewAsContext = createContext<ViewAsContextValue>({
  viewAs: null,
  setViewAs: () => {},
})

export function useViewAsContext() {
  return useContext(ViewAsContext)
}
