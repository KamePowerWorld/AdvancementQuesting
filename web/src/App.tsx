import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.js'
import { AuthContext } from '@/contexts/AuthContext.js'
import { EditorContext } from '@/contexts/EditorContext.js'
import EditorPage from '@/pages/Editor.js'
import type { Role } from '@/types/auth.js'

// ---------------------------------------------------------------------------
// ナビバー
// ---------------------------------------------------------------------------

interface NavProps {
  proposalMode: boolean
  setProposalMode: (v: boolean) => void
  proposalCount: number
  submitProposals: () => void
  submitting: boolean
  saveQuests: () => void
  saving: boolean
}

function Nav({ proposalMode, setProposalMode, proposalCount, submitProposals, submitting, saveQuests, saving }: NavProps) {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    retry: false,
    enabled: !!localStorage.getItem('token'),
  })

  const role: Role = me?.role ?? 'player'
  const isEditor = role === 'editor' || role === 'admin'

  return (
    <AuthContext.Provider value={{ me, role, isEditor }}>
      <nav
        className="shrink-0 flex items-center px-2 gap-1 border-b-4 border-black z-30 select-none"
        style={{
          height: '40px',
          backgroundColor: '#8B8B8B',
          fontFamily: '"Courier New", Courier, monospace',
          boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)',
        }}
      >
        <span
          className="font-bold text-sm px-2 tracking-tight shrink-0"
          style={{ color: '#2a1f0e', textShadow: '1px 1px 0 rgba(255,255,255,0.3)' }}
        >
          AdvancementQuesting
        </span>

        {/* ロールバッジ */}
        {me && (
          <span
            className="text-xs px-2 py-0.5 border-2 ml-1 shrink-0"
            style={{
              color: isEditor ? '#1a3a1a' : '#1a1a3a',
              backgroundColor: isEditor ? '#7BC67B' : '#7B9BC6',
              borderTopColor: isEditor ? '#9BE09B' : '#9BB3E0',
              borderLeftColor: isEditor ? '#9BE09B' : '#9BB3E0',
              borderBottomColor: isEditor ? '#3B7B3B' : '#3B5B9B',
              borderRightColor: isEditor ? '#3B7B3B' : '#3B5B9B',
            }}
          >
            {role === 'admin' ? '管理者' : isEditor ? '編集者' : 'プレイヤー'}
          </span>
        )}

        {/* 提案モードバー (プレイヤーのみ) */}
        {me && !isEditor && (
          <div className="flex-1 flex items-center justify-end gap-2 px-2 min-w-0">
            {proposalMode ? (
              <>
                <span className="text-xs truncate mr-auto" style={{ color: '#EDE09B' }}>
                  {proposalCount > 0 ? '提案モード — クエストを追加してください' : '提案モード — 提案済みクエストを確認中'}
                </span>
                <button
                  onClick={() => setProposalMode(false)}
                  className="text-xs px-2 py-0.5 border-2 font-bold shrink-0"
                  style={{ color: '#2a1f0e', backgroundColor: '#C6C6C6', borderTopColor: 'white', borderLeftColor: 'white', borderBottomColor: '#555', borderRightColor: '#555' }}
                >
                  ✕ 終了
                </button>
                {proposalCount > 0 && (
                  <button
                    onClick={submitProposals}
                    disabled={submitting}
                    className="text-xs px-3 py-0.5 border-2 font-bold disabled:opacity-50 shrink-0"
                    style={{ color: '#0a1f0a', backgroundColor: '#7BC67B', borderTopColor: '#9BE09B', borderLeftColor: '#9BE09B', borderBottomColor: '#3B7B3B', borderRightColor: '#3B7B3B' }}
                  >
                    {submitting ? '送信中...' : `📤 提案を送信する (${proposalCount})`}
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setProposalMode(true)}
                className="ml-auto text-xs px-3 py-0.5 border-2 font-bold"
                style={{ color: '#1a1a0a', backgroundColor: '#D4C67B', borderTopColor: '#EDE09B', borderLeftColor: '#EDE09B', borderBottomColor: '#7B6B3B', borderRightColor: '#7B6B3B' }}
              >
                ✨ クエスト追加を提案する
              </button>
            )}
          </div>
        )}

        {/* 編集者: 保存ボタン */}
        {isEditor && (
          <div className="ml-auto pr-2">
            <button
              id="nav-save-btn"
              onClick={saveQuests}
              disabled={saving}
              className="text-xs px-3 py-0.5 border-2 font-bold flex items-center gap-1 disabled:opacity-50"
              style={{
                color: '#2a1f0e',
                backgroundColor: '#C6C6C6',
                borderTopColor: 'white',
                borderLeftColor: 'white',
                borderBottomColor: '#555555',
                borderRightColor: '#555555',
              }}
              onMouseDown={(e) => {
                if (saving) return
                const t = e.currentTarget
                t.style.backgroundColor = '#9B9B9B'
                t.style.borderTopColor = '#3B3B3B'
                t.style.borderLeftColor = '#3B3B3B'
                t.style.borderBottomColor = '#C6C6C6'
                t.style.borderRightColor = '#C6C6C6'
              }}
              onMouseUp={(e) => {
                const t = e.currentTarget
                t.style.backgroundColor = '#C6C6C6'
                t.style.borderTopColor = 'white'
                t.style.borderLeftColor = 'white'
                t.style.borderBottomColor = '#555555'
                t.style.borderRightColor = '#555555'
              }}
            >
              {saving ? '保存中...' : '💾 保存'}
            </button>
          </div>
        )}
      </nav>

      <EditorPage />
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// App ルート: 提案状態をここで管理して Nav と EditorPage 両方に渡す
// ---------------------------------------------------------------------------

export default function App() {
  const queryClient = useQueryClient()

  const [proposalMode, setProposalMode] = useState(false)
  const [proposalCount, setProposalCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  // 実体は EditorPage が差し込む
  const [submitProposals, setSubmitProposals] = useState<() => void>(() => () => {})
  const [saveQuests, setSaveQuests] = useState<() => void>(() => () => {})

  const editorContextValue = {
    proposalMode,
    setProposalMode,
    proposalCount,
    setProposalCount,
    submitProposals,
    setSubmitProposals,
    submitting,
    setSubmitting,
    saveQuests,
    setSaveQuests,
    saving,
    setSaving,
    queryClient,
  }

  return (
    <EditorContext.Provider value={editorContextValue}>
      <div className="h-screen flex flex-col overflow-hidden">
        <Nav
          proposalMode={proposalMode}
          setProposalMode={setProposalMode}
          proposalCount={proposalCount}
          submitProposals={submitProposals}
          submitting={submitting}
          saveQuests={saveQuests}
          saving={saving}
        />
      </div>
    </EditorContext.Provider>
  )
}
