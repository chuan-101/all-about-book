import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../lib/app-context'
import { supabase } from '../lib/supabaseClient'

const REDIRECT_URL = 'https://chuan-101.github.io/all-about-book/'

function LoginPage() {
  const navigate = useNavigate()
  const { session, canUseCloud, authWarning, dataSource, setDataSource } =
    useAppData()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<
    | {
        type: 'success' | 'error'
        message: string
      }
    | null
  >(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)

  const canResend = resendSeconds === 0
  const trimmedEmail = useMemo(() => email.trim(), [email])
  const codeValue = code.trim()
  const canVerify =
    codeValue.length === 6 && /^\d{6}$/.test(codeValue)

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true })
    }
  }, [navigate, session])

  useEffect(() => {
    if (resendSeconds === 0) return
    const timer = window.setInterval(() => {
      setResendSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendSeconds])

  const formatAuthError = (message: string) => {
    const lower = message.toLowerCase()
    if (lower.includes('expired')) {
      return '验证码已过期，请重新获取。'
    }
    if (lower.includes('invalid')) {
      return '验证码无效，请检查后重试。'
    }
    if (lower.includes('too many') || lower.includes('rate')) {
      return '请求过于频繁，请稍后再试。'
    }
    return '操作失败，请稍后再试。'
  }

  const handleSendCode = async () => {
    if (!supabase || !canUseCloud) {
      setStatus({
        type: 'error',
        message: '尚未配置云端服务，请先补充环境变量。',
      })
      return
    }

    if (!trimmedEmail) {
      setStatus({ type: 'error', message: '请输入有效的邮箱地址。' })
      return
    }

    setSending(true)
    setStatus(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: { shouldCreateUser: true },
      })

      if (error) {
        setStatus({
          type: 'error',
          message: formatAuthError(error.message),
        })
        return
      }

      setStatus({
        type: 'success',
        message: '验证码已发送，请查收邮件。',
      })
      setCodeSent(true)
      setResendSeconds(30)
    } catch {
      setStatus({ type: 'error', message: '发送失败，请稍后重试。' })
    } finally {
      setSending(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!supabase || !canUseCloud) {
      setStatus({
        type: 'error',
        message: '尚未配置云端服务，请先补充环境变量。',
      })
      return
    }

    if (!trimmedEmail) {
      setStatus({ type: 'error', message: '请输入有效的邮箱地址。' })
      return
    }

    if (!canVerify) {
      setStatus({ type: 'error', message: '请输入 6 位数字验证码。' })
      return
    }

    setVerifying(true)
    setStatus(null)

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: codeValue,
        type: 'email',
      })

      if (error) {
        setStatus({
          type: 'error',
          message: formatAuthError(error.message),
        })
        return
      }

      setStatus({
        type: 'success',
        message: '登录成功，正在跳转...',
      })
      navigate('/', { replace: true })
    } catch {
      setStatus({ type: 'error', message: '验证失败，请稍后重试。' })
    } finally {
      setVerifying(false)
    }
  }

  const handleSendMagicLink = async () => {
    if (!supabase || !canUseCloud) {
      setStatus({
        type: 'error',
        message: '尚未配置云端服务，请先补充环境变量。',
      })
      return
    }

    if (!trimmedEmail) {
      setStatus({ type: 'error', message: '请输入有效的邮箱地址。' })
      return
    }

    setSending(true)
    setStatus(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: REDIRECT_URL,
        },
      })

      if (error) {
        setStatus({
          type: 'error',
          message: formatAuthError(error.message),
        })
        return
      }

      setStatus({
        type: 'success',
        message: '魔法链接已发送，请检查邮箱完成登录。',
      })
    } catch {
      setStatus({ type: 'error', message: '发送失败，请稍后重试。' })
    } finally {
      setSending(false)
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
          我们将向邮箱发送验证码，无需跳转浏览器。
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
          onClick={handleSendCode}
          disabled={sending || !canUseCloud || !canResend}
        >
          {sending
            ? '发送中...'
            : canResend
              ? '发送验证码'
              : `重新发送 (${resendSeconds}s)`}
        </button>
        {codeSent ? (
          <label className="field">
            <span>验证码</span>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="请输入 6 位验证码"
            />
          </label>
        ) : null}
        {codeSent ? (
          <button
            className="button"
            type="button"
            onClick={handleVerifyCode}
            disabled={verifying || !canUseCloud}
          >
            {verifying ? '验证中...' : '验证并登录'}
          </button>
        ) : null}
        <button
          className="button ghost"
          type="button"
          onClick={handleSendMagicLink}
          disabled={sending || !canUseCloud}
        >
          使用邮件链接登录（备用）
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
