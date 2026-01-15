import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useAppData } from '../lib/app-context'
import SyzygyConsole from './SyzygyConsole'
import ThemeToggle from './ThemeToggle'
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
            <div className="header-masthead-right">
              <button
                type="button"
                className="icon-btn header-settings"
                aria-label="Settings"
                onClick={onOpenSettings}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M4.8 12a7.2 7.2 0 0 1 .12-1.2l-2.12-1.65 1.9-3.3 2.5 1a7.6 7.6 0 0 1 2.1-1.2l.4-2.7h3.8l.4 2.7a7.6 7.6 0 0 1 2.1 1.2l2.5-1 1.9 3.3-2.12 1.65c.08.4.12.8.12 1.2s-.04.8-.12 1.2l2.12 1.65-1.9 3.3-2.5-1a7.6 7.6 0 0 1-2.1 1.2l-.4 2.7h-3.8l-.4-2.7a7.6 7.6 0 0 1-2.1-1.2l-2.5 1-1.9-3.3 2.12-1.65c-.08-.4-.12-.8-.12-1.2z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <nav className="nav">
              <NavLink to="/" end>
                首页
              </NavLink>
              <NavLink to="/books">书架</NavLink>
            </nav>
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
