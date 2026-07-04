import { useCallback, useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { questsApi } from '@/api/quests.js'
import { authApi } from '@/api/auth.js'
import type { Quest } from '@/types/quest.js'
import { nodeToApiBody } from '../utils/conversions.js'
import type { EditorState } from './useEditorState.js'

interface UseSaveHandlerDeps {
  saving: boolean
  setSaving: (v: boolean) => void
  questsData: Quest[] | undefined
  existingProposals: any[] | undefined
  queryClient: QueryClient
  setSaveQuests: (fn: () => (() => Promise<void>)) => void
  setProposalMode: (v: boolean) => void
  showToast: (label: string) => void
}

export function useSaveHandler(s: EditorState, deps: UseSaveHandlerDeps) {
  const { saving, setSaving, questsData, existingProposals, queryClient, setSaveQuests, setProposalMode, showToast } = deps

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const existingIds = new Set((questsData ?? []).map((q) => String(q.id)))
      const currentNodeIds = new Set(s.nodes.map((n) => n.id))
      await Promise.all(
        (questsData ?? [])
          .filter((q) => q.status !== 'proposed' && !currentNodeIds.has(String(q.id)))
          .map((q) => questsApi.delete(q.id))
      )
      await Promise.all(s.nodes.map(async (node) => {
        const savedStatus: 'hidden' | 'public' = node.status === 'hidden' ? 'hidden' : 'public'
        const body = { ...nodeToApiBody(node, s.edges), status: savedStatus }
        if (existingIds.has(node.id)) {
          await questsApi.update(parseInt(node.id, 10), body)
        } else {
          await questsApi.create({ ...body, category: null, customButtons: [] })
        }
      }))
      for (const [proposalId, node] of s.myProposalEdits) {
        const p = existingProposals?.find((p: any) => p.id === proposalId) as any
        if (p) await questsApi.update(p.questId, nodeToApiBody(node, s.edges))
      }
      if (s.myProposalEdits.size > 0) {
        queryClient.invalidateQueries({ queryKey: ['proposals'] })
        s.setMyProposalEdits(new Map())
      }
      queryClient.invalidateQueries({ queryKey: ['quests'] })
      showToast('保存しました')
    } catch {
      showToast('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [saving, s.nodes, s.edges, questsData, s.myProposalEdits, existingProposals, queryClient, setSaving, s.setMyProposalEdits, showToast])

  useEffect(() => {
    setSaveQuests(() => handleSave)
  }, [handleSave, setSaveQuests])

  const handleLogout = async () => {
    try { await authApi.logout() } catch (_) {}
    localStorage.removeItem('token')
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
    setProposalMode(false)
  }

  return { handleSave, handleLogout }
}
