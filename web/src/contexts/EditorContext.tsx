import { createContext, useContext } from 'react'

interface EditorContextValue {
  /** プレイヤーが提案モード中か */
  proposalMode: boolean
  setProposalMode: (v: boolean) => void
  /** ドラフトノード数 */
  proposalCount: number
  /** 提案を送信する */
  submitProposals: () => void
  submitting: boolean
}

export const EditorContext = createContext<EditorContextValue>({
  proposalMode: false,
  setProposalMode: () => {},
  proposalCount: 0,
  submitProposals: () => {},
  submitting: false,
})

export function useEditor() {
  return useContext(EditorContext)
}
