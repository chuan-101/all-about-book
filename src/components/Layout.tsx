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
          <div>
            <h1 className="title">我的读书追踪器</h1>
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
