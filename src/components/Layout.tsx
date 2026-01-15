import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useAppData } from '../lib/app-context'
import SyzygyConsole from './SyzygyConsole'
import UpdatePrompt from './UpdatePrompt'

type LayoutProps = {
  onOpenSettings: () => void
}

function Layout({ onOpenSettings }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [isConsoleOpen, setIsConsoleOpen] = useState(false)
  const {
    isCloudMode,
    session,
    authWarning,
    cloudError,
    cloudLoading,
    signOut,
  } = useAppData()

  const activeTab = useMemo(() => {
    if (location.pathname.startsWith('/books')) return 'bookshelf'
    return 'home'
  }, [location.pathname])

  const headerDate = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    [],
  )

  const handleTabChange = (tab: string) => {
    if (tab === 'home') {
      navigate('/')
      return
    }
    if (tab === 'bookshelf') {
      navigate('/books')
      return
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="container header-content">
          <div className="header-masthead">
            <div className="header-masthead-left">
              <span className="header-date">{headerDate}</span>
            </div>
            <div className="header-masthead-center">
              <h1 className="title">All About Book</h1>
            </div>
          </div>
          <div className="header-actions">
            <div className="header-actions-spacer" />
            <nav className="nav">
              <NavLink to="/" end>
                首页
              </NavLink>
              <NavLink to="/books">书架</NavLink>
            </nav>
            <div className="header-actions-right">
              {session ? (
                <button
                  type="button"
                  className="button ghost top-nav-button"
                  onClick={() => signOut()}
                >
                  退出登录
                </button>
              ) : (
                <NavLink className="button ghost top-nav-button" to="/login">
                  登录
                </NavLink>
              )}
            </div>
          </div>
        </div>
      </header>
      <SyzygyConsole
        isOpen={isConsoleOpen}
        onOpenChange={setIsConsoleOpen}
      />
      <main className="container main">
        <UpdatePrompt />
        {authWarning ? (
          <p className="notice warning">{authWarning}</p>
        ) : null}
        {isCloudMode && cloudError ? (
          <p className="notice error">{cloudError}</p>
        ) : null}
        {isCloudMode && cloudLoading ? (
          <p className="notice info">云端数据加载中...</p>
        ) : null}
        <Outlet />
      </main>
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenConsole={() => setIsConsoleOpen(true)}
        onOpenSettings={onOpenSettings}
      />
    </div>
  )
}

export default Layout
