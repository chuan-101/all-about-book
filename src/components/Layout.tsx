import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.bottom-nav')
    if (!nav) {
      const fallbackValue = getComputedStyle(
        document.documentElement,
      ).getPropertyValue('--bottom-nav-h')
      if (fallbackValue) {
        document.documentElement.style.setProperty(
          '--bottom-nav-h',
          fallbackValue.trim(),
        )
      }
      return
    }

    const updateBottomNavHeight = () => {
      const height = nav.offsetHeight ?? 0
      document.documentElement.style.setProperty(
        '--bottom-nav-h',
        `${height}px`,
      )
    }

    updateBottomNavHeight()

    const handleResize = () => updateBottomNavHeight()
    window.addEventListener('resize', handleResize)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateBottomNavHeight())
      resizeObserver.observe(nav)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
    }
  }, [])

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
        <div className="layout-spacer" />
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
