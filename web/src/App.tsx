import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.js'
import { AuthContext } from '@/contexts/AuthContext.js'
import type { ViewMode } from '@/contexts/AuthContext.js'
import { EditorContext } from '@/contexts/EditorContext.js'
import type { QuestCompleteNotice } from '@/contexts/EditorContext.js'
import EditorPage from '@/pages/Editor.js'
import { useQuestNotifications } from '@/hooks/useQuestNotifications.js'
import type { QuestCompleteEvent } from '@/hooks/useQuestNotifications.js'
import { QuestCompleteOverlay } from '@/components/QuestCompleteOverlay.js'

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
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}

function Nav({ proposalMode, setProposalMode, proposalCount, submitProposals, submitting, saveQuests, saving, viewMode, setViewMode }: NavProps) {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    retry: false,
    enabled: !!localStorage.getItem('token'),
  })

  const role = me?.role ?? 'player'
  const isEditor = role === 'editor'
  // editor が play モードの場合は編集機能を無効化
  const effectiveIsEditor = isEditor && viewMode === 'edit'

  return (
    <AuthContext.Provider value={{ me, role, isEditor, viewMode, setViewMode }}>
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

        {/* editor: モード切り替えトグル (アイコンのみ、スマホ対応) */}
        {me && isEditor && !proposalMode && (
          <div className="flex items-center ml-1 border-2 shrink-0" style={{ borderTopColor: '#3B3B3B', borderLeftColor: '#3B3B3B', borderBottomColor: '#C6C6C6', borderRightColor: '#C6C6C6' }}>
            <button
              onClick={() => setViewMode('edit')}
              title="編集モード"
              className="flex items-center gap-1 px-1.5 py-0.5 font-bold text-xs"
              style={{
                color: viewMode === 'edit' ? '#0a1f0a' : '#2a2a2a',
                backgroundColor: viewMode === 'edit' ? '#7BC67B' : '#C6C6C6',
              }}
            >
              <span>✏️</span>
              <span className="hidden sm:inline">編集</span>
            </button>
            <button
              onClick={() => setViewMode('play')}
              title="プレイモード"
              className="flex items-center gap-1 px-1.5 py-0.5 font-bold text-xs"
              style={{
                color: viewMode === 'play' ? '#0a0a1f' : '#2a2a2a',
                backgroundColor: viewMode === 'play' ? '#7B9BC6' : '#C6C6C6',
              }}
            >
              <span>🎮</span>
              <span className="hidden sm:inline">プレイ</span>
            </button>
          </div>
        )}

        {/* player または editor(編集モード限定): 提案モードバー */}
        {me && (!isEditor || viewMode === 'edit') && (
          <div className="flex-1 flex items-center justify-end gap-2 px-2 min-w-0">
            {proposalMode ? (
              <>
                {/* sm以上のみ説明テキスト表示 */}
                <span className="text-xs truncate mr-auto hidden sm:block" style={{ color: '#EDE09B' }}>
                  {proposalCount > 0 ? '提案モード — クエストを追加してください' : '提案モード — 提案済みクエストを確認中'}
                </span>
                <button
                  onClick={() => setProposalMode(false)}
                  className="text-xs px-2 py-0.5 border-2 font-bold shrink-0"
                  style={{ color: '#2a1f0e', backgroundColor: '#C6C6C6', borderTopColor: 'white', borderLeftColor: 'white', borderBottomColor: '#555', borderRightColor: '#555' }}
                >
                  ✕ <span className="hidden sm:inline">終了</span>
                </button>
                {proposalCount > 0 && (
                  <button
                    onClick={submitProposals}
                    disabled={submitting}
                    className="text-xs px-2 py-0.5 border-2 font-bold disabled:opacity-50 shrink-0"
                    style={{ color: '#0a1f0a', backgroundColor: '#7BC67B', borderTopColor: '#9BE09B', borderLeftColor: '#9BE09B', borderBottomColor: '#3B7B3B', borderRightColor: '#3B7B3B' }}
                  >
                    <span>📤</span>
                    <span className="hidden sm:inline ml-1">{submitting ? '送信中...' : '提案を送信する'}</span>
                    <span className="ml-1">({proposalCount})</span>
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setProposalMode(true)}
                className="ml-auto text-xs px-2 py-0.5 border-2 font-bold"
                style={{ color: '#1a1a0a', backgroundColor: '#D4C67B', borderTopColor: '#EDE09B', borderLeftColor: '#EDE09B', borderBottomColor: '#7B6B3B', borderRightColor: '#7B6B3B' }}
              >
                <span>✨</span>
                <span className="hidden sm:inline ml-1">クエスト追加を提案する</span>
              </button>
            )}
          </div>
        )}

        {/* editor 編集モード: 保存ボタン */}
        {effectiveIsEditor && (
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

function AppInner() {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>('play')
  // 完了オーバーレイ用イベント (nonce 付きで「新しい通知か」を判定する)
  const [questCompleteEvent, setQuestCompleteEvent] = useState<(QuestCompleteEvent & { nonce: number }) | null>(null)
  // マップ演出トリガー: 完了したクエストID + 毎回変わる nonce
  const [lastQuestComplete, setLastQuestComplete] = useState<QuestCompleteNotice | null>(null)

  const handleQuestComplete = useCallback((event: QuestCompleteEvent) => {
    const nonce = Date.now()
    setQuestCompleteEvent({ ...event, nonce })
    setLastQuestComplete({ questId: event.questId, nonce })
    // 進捗データを再取得してノードの達成済み表示を更新
    queryClient.invalidateQueries({ queryKey: ['progress'] })
  }, [queryClient])

  const dismissOverlay = useCallback(() => setQuestCompleteEvent(null), [])

  // 進捗変化通知（管理コマンドでの達成/未達成切替など）— 演出なしで表示だけ更新
  const handleProgressUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['progress'] })
  }, [queryClient])

  // ログイン状態を監視 (ログイン後に SSE を張り直すため / 編集者ログイン時の viewMode 自動切替)
  const { data: meForSse } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    retry: false,
    enabled: !!localStorage.getItem('token'),
  })
  // 編集者としてログインしたら自動で編集モード、ログアウトしたらプレイモードに戻す
  useEffect(() => {
    if (meForSse?.role === 'editor') setViewMode('edit')
    else if (!meForSse) setViewMode('play')
  }, [meForSse?.role])
  useQuestNotifications(
    { onQuestComplete: handleQuestComplete, onProgressUpdate: handleProgressUpdate },
    meForSse?.playerUuid ?? null,
  )

  // URLに ?code=XXXXXX が含まれる場合は自動ログイン
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code && /^\d{6}$/.test(code)) {
      const url = new URL(window.location.href)
      url.searchParams.delete('code')
      window.history.replaceState({}, '', url.toString())

      authApi.loginWithCode({ code }).then((res) => {
        localStorage.setItem('token', res.token)
        queryClient.setQueryData(['me'], { playerUuid: res.playerUuid, playerName: res.playerName, role: res.role })
        // /login でアクセスした場合はトップページに戻す
        if (window.location.pathname === '/login') {
          window.history.replaceState({}, '', '/')
        }
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    lastQuestComplete,
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
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </div>
      <QuestCompleteOverlay
        event={questCompleteEvent}
        onDismiss={dismissOverlay}
      />
    </EditorContext.Provider>
  )
}

export default function App() {
  return <AppInner />
}
