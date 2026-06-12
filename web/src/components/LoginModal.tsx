import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.js'
import { ApiError } from '@/api/client.js'
import { X } from 'lucide-react'

interface LoginModalProps {
  close: () => void
}

export function LoginModal({ close }: LoginModalProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  const doLogin = async (token?: string) => {
    setError(null)
    if (token) {
      localStorage.setItem('token', token)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      close()
      return
    }
    setLoading(true)
    try {
      const res = await authApi.loginWithCode({ code })
      localStorage.setItem('token', res.token)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      close()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={close}
      style={{ fontFamily: '"Courier New", Courier, monospace' }}
    >
      <div
        className="w-80 flex flex-col gap-4 border-4 p-5"
        style={{
          backgroundColor: '#2d2f3b',
          borderTopColor: '#555',
          borderLeftColor: '#555',
          borderBottomColor: '#111',
          borderRightColor: '#111',
          color: '#d8cbb0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-base">ログイン</span>
          <button onClick={close} className="text-gray-400 hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        {/* コード入力 */}
        <p className="text-xs text-gray-400">
          Minecraft で <code className="bg-black/40 px-1">/quest code</code> を実行して
          表示された 6 桁のコードを入力してください。
        </p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          maxLength={6}
          className="bg-black/40 border-2 px-4 py-2 text-center text-2xl tracking-widest font-mono outline-none"
          style={{ borderColor: '#555', color: '#d8cbb0' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7B9BC6')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#555')}
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          onClick={() => doLogin()}
          disabled={code.length !== 6 || loading}
          className="py-2 font-bold text-sm border-2 disabled:opacity-40"
          style={{
            color: '#0a1f0a',
            backgroundColor: '#7BC67B',
            borderTopColor: '#9BE09B',
            borderLeftColor: '#9BE09B',
            borderBottomColor: '#3B7B3B',
            borderRightColor: '#3B7B3B',
          }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>

        {/* 開発用クイックログイン */}
        <div className="border-t border-gray-700 pt-3 flex flex-col gap-2">
          <p className="text-xs text-gray-500 text-center">テスト用クイックログイン</p>
          <button
            onClick={() => doLogin('demo-editor-token')}
            className="py-2 text-sm font-bold border-2"
            style={{
              color: '#1a3a1a',
              backgroundColor: '#4a7B4a',
              borderTopColor: '#7BC67B',
              borderLeftColor: '#7BC67B',
              borderBottomColor: '#2B4B2B',
              borderRightColor: '#2B4B2B',
            }}
          >
            ✏️ 編集者としてログイン
          </button>
          <button
            onClick={() => doLogin('demo-player-token')}
            className="py-2 text-sm font-bold border-2"
            style={{
              color: '#1a1a3a',
              backgroundColor: '#4a5B8B',
              borderTopColor: '#7B9BC6',
              borderLeftColor: '#7B9BC6',
              borderBottomColor: '#2B3B5B',
              borderRightColor: '#2B3B5B',
            }}
          >
            🎮 プレイヤーとしてログイン
          </button>
        </div>
      </div>
    </div>
  )
}
