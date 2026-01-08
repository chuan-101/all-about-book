import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../lib/app-context'
import { supabase } from '../lib/supabaseClient'

const REDIRECT_URL = 'https://chuan-101.github.io/all-about-book/#/'

function LoginPage() {
  const navigate = useNavigate()
  const { session, canUseCloud, authWarning, dataSource, setDataSource } =
    useAppData()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<
    | {
        type: 'success' | 'error'
        message: string
      }
    | null
  >(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true })
    }
  }, [navigate, session])

  const handleSendMagicLink = async () => {
    if (!supabase || !canUseCloud) {
      setStatus({
        type: 'error',
        message: '尚未配置云端服务，请先补充环境变量。',
      })
      return
    }

    const trimmed = email.trim()
    if (!trimmed) {
      setStatus({ type: 'error', message: '请输入有效的邮箱地址。' })
      return
    }

    setLoading(true)
    setStatus(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: REDIRECT_URL,
        },
      })

      if (error) {
        setStatus({ type: 'error', message: '发送失败，请稍后重试。' })
        return
      }

      setStatus({
        type: 'success',
        message: '魔法链接已发送，请检查邮箱完成登录。',
      })
    } catch {
      setStatus({ type: 'error', message: '发送失败，请稍后重试。' })
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchToLocal = () => {
    setDataSource('local')
    navigate('/', { replace: true })
  }

  return (
    <section className="stack">
      <div>
        <h2>邮箱登录</h2>
        <p className="muted">
          通过邮箱魔法链接登录后即可读取云端数据。
        </p>
      </div>

      <div className="card stack">
        <label className="field">
          <span>邮箱地址</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <button
          className="button primary"
          type="button"
          onClick={handleSendMagicLink}
          disabled={loading || !canUseCloud}
        >
          {loading ? '发送中...' : '发送魔法链接'}
        </button>
        {status ? (
          <p className={`notice ${status.type}`}>{status.message}</p>
        ) : null}
        {authWarning ? (
          <p className="notice warning">{authWarning}</p>
        ) : null}
      </div>

      {dataSource === 'cloud' ? (
        <button
          className="button ghost"
          type="button"
          onClick={handleSwitchToLocal}
        >
          返回本地模式
        </button>
      ) : null}
    </section>
  )
}

export default LoginPage
