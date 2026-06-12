import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth.js'
import { ApiError } from '@/api/client.js'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState(searchParams.get('code') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const doLogin = async (loginCode: string) => {
    setError(null)
    setLoading(true)
    try {
      const res = await authApi.loginWithCode({ code: loginCode })
      localStorage.setItem('token', res.token)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // URLに ?code= がある場合は自動ログイン
  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (urlCode && /^\d{6}$/.test(urlCode)) {
      doLogin(urlCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await doLogin(code)
  }

  const quickLogin = (token: string) => {
    localStorage.setItem('token', token)
    queryClient.invalidateQueries({ queryKey: ['me'] })
    navigate('/')
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6">ログイン</h1>
      <p className="text-gray-400 text-sm mb-6">
        Minecraft で <code className="bg-gray-800 px-1 rounded">/quest code</code> を実行して
        表示された6桁のコードを入力してください。
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          maxLength={6}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-center text-2xl tracking-widest font-mono focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={code.length !== 6 || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg py-3 font-medium transition-colors"
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>

      {/* 開発用クイックログイン */}
      <div className="mt-8 border-t border-gray-700 pt-6">
        <p className="text-gray-500 text-xs mb-3 text-center">テスト用クイックログイン</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => quickLogin('demo-editor-token')}
            className="bg-yellow-700 hover:bg-yellow-600 rounded-lg py-2.5 text-sm font-medium transition-colors text-yellow-100"
          >
            ✏️ 編集者としてログイン
          </button>
          <button
            onClick={() => quickLogin('demo-player-token')}
            className="bg-green-800 hover:bg-green-700 rounded-lg py-2.5 text-sm font-medium transition-colors text-green-100"
          >
            🎮 プレイヤーとしてログイン
          </button>
        </div>
      </div>
    </div>
  )
}
