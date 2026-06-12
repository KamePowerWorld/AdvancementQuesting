import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { authApi } from '@/api/auth.js'
import EditorPage from '@/pages/Editor.js'
import LoginPage from '@/pages/Login.js'

/**
 * グローバルナビゲーションバー
 * ログイン状態に応じてユーザー名 / ログインリンクを出し分ける
 */
function Nav() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    retry: false,
    enabled: !!localStorage.getItem('token'),
  })

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (_) {
      // セッション切れの場合もローカルのトークンを削除して続行
    }
    localStorage.removeItem('token')
    queryClient.clear()
    navigate('/')
  }

  return (
    // エディタの左ツールバーと同じ Minecraft 風グレーパネルを踏襲
    <nav
      className="shrink-0 flex items-center px-2 gap-1 border-b-4 border-black z-30 select-none"
      style={{
        height: '40px',
        backgroundColor: '#8B8B8B',
        fontFamily: '"Courier New", Courier, monospace',
        boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)',
      }}
    >
      {/* タイトル: 右サイドバーの色味に合わせたベージュ文字 */}
      <span
        className="font-bold text-sm px-2 tracking-tight"
        style={{ color: '#2a1f0e', textShadow: '1px 1px 0 rgba(255,255,255,0.3)' }}
      >
        AdvancementQuesting
      </span>

      <div className="ml-auto flex items-center gap-2 pr-2">
        {/* 保存ボタン: ログイン/ログアウトの左に配置 */}
        <button
          className="text-xs px-3 py-0.5 border-2 font-bold flex items-center gap-1"
          style={{
            color: '#2a1f0e',
            backgroundColor: '#C6C6C6',
            borderTopColor: 'white',
            borderLeftColor: 'white',
            borderBottomColor: '#555555',
            borderRightColor: '#555555',
          }}
          onMouseDown={(e) => {
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
          <Save size={12} /> 保存
        </button>
        {me ? (
          <>
            {/* プレイヤー名: 凹んだラベル風 */}
            <span
              className="text-xs px-2 py-0.5 border-2"
              style={{
                color: '#2a1f0e',
                backgroundColor: '#7B7B7B',
                borderTopColor: '#3B3B3B',
                borderLeftColor: '#3B3B3B',
                borderBottomColor: '#C6C6C6',
                borderRightColor: '#C6C6C6',
              }}
            >
              {me.playerName}
            </span>
            {/* Minecraft 風ベベルボタン */}
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-0.5 border-2 font-bold"
              style={{
                color: '#2a1f0e',
                backgroundColor: '#C6C6C6',
                borderTopColor: 'white',
                borderLeftColor: 'white',
                borderBottomColor: '#555555',
                borderRightColor: '#555555',
              }}
              onMouseDown={(e) => {
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
              ログアウト
            </button>
          </>
        ) : (
          <NavLink to="/login">
            {({ isActive }) => (
              <span
                className="text-xs px-3 py-0.5 border-2 font-bold cursor-pointer"
                style={{
                  color: '#2a1f0e',
                  backgroundColor: isActive ? '#9B9B9B' : '#C6C6C6',
                  borderTopColor: isActive ? '#3B3B3B' : 'white',
                  borderLeftColor: isActive ? '#3B3B3B' : 'white',
                  borderBottomColor: isActive ? '#C6C6C6' : '#555555',
                  borderRightColor: isActive ? '#C6C6C6' : '#555555',
                }}
              >
                ログイン
              </span>
            )}
          </NavLink>
        )}
      </div>
    </nav>
  )
}

/**
 * アプリルート
 * 画面全体を h-screen の flex-col に区切り、
 * Nav (固定高) + エディタ (残り全部) の2層構造にする
 */
export default function App() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Nav />
      <Routes>
        {/* エディタが flex-1 で残り高さを全部埋める */}
        <Route path="/" element={<EditorPage />} />

        {/* ログインページ: エディタ背景色に合わせてラップ */}
        <Route
          path="/login"
          element={
            <div className="flex-1 overflow-auto bg-stone-900 text-gray-100 flex items-start justify-center pt-16">
              <LoginPage />
            </div>
          }
        />
      </Routes>
    </div>
  )
}
