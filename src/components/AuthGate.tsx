import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAppData } from '../lib/app-context'

function AuthGate({ children }: { children: ReactNode }) {
  const { dataSource, canUseCloud, session, authLoading } = useAppData()
  const location = useLocation()

  if (authLoading) {
    return (
      <main className="container main">
        <p className="muted">正在检查登录状态...</p>
      </main>
    )
  }

  if (canUseCloud && dataSource === 'cloud' && !session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return <>{children}</>
}

export default AuthGate
