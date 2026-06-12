import { createContext, useContext } from 'react'
import type { QueryClient } from '@tanstack/react-query'

interface EditorContextValue {
  proposalMode: boolean
  setProposalMode: (v: boolean) => void
  proposalCount: number
  setProposalCount: (n: number) => void
  submitProposals: () => void
  /** EditorPage が起動時に実際の送信関数を登録する */
  setSubmitProposals: (fn: () => void) => void
  submitting: boolean
  setSubmitting: (v: boolean) => void
  /** EditorPage が起動時に実際の保存関数を登録する */
  saveQuests: () => void
  setSaveQuests: (fn: () => void) => void
  saving: boolean
  setSaving: (v: boolean) => void
  queryClient: QueryClient | null
}

export const EditorContext = createContext<EditorContextValue>({
  proposalMode: false,
  setProposalMode: () => {},
  proposalCount: 0,
  setProposalCount: () => {},
  submitProposals: () => {},
  setSubmitProposals: () => {},
  submitting: false,
  setSubmitting: () => {},
  saveQuests: () => {},
  setSaveQuests: () => {},
  saving: false,
  setSaving: () => {},
  queryClient: null,
})

export function useEditor() {
  return useContext(EditorContext)
}
