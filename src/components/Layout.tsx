import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAppData } from '../lib/app-context'
import UpdatePrompt from './UpdatePrompt'

function Layout() {
  const navigate = useNavigate()
  const {
    dataSource,
    setDataSource,
    canUseCloud,
    isCloudMode,
    session,
    authWarning,
    cloudError,
    cloudLoading,
    signOut,
  } = useAppData()

  const handleSelectSource = (source: 'local' | 'cloud') => {
    if (source === 'cloud' && !session) {
      setDataSource('cloud')
      navigate('/login')
      return
    }
    setDataSource(source)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="container header-content">
          <div>
            <p className="eyebrow">阅读记录</p>
            <h1 className="title">我的读书追踪器</h1>
          </div>
          <div className="header-actions">
            <nav className="nav">
              <NavLink to="/" end>
                首页
              </NavLink>
              <NavLink to="/books">书架</NavLink>
            </nav>
            <div className="data-source">
              <span className="muted">数据来源：</span>
              <button
                type="button"
                className={`chip${dataSource === 'local' ? '' : ' ghost'}`}
                onClick={() => handleSelectSource('local')}
              >
                本地
              </button>
              <button
                type="button"
                className={`chip${dataSource === 'cloud' ? '' : ' ghost'}`}
                onClick={() => handleSelectSource('cloud')}
                disabled={!canUseCloud}
              >
                云端
              </button>
            </div>
            {session ? (
              <button
                type="button"
                className="button ghost"
                onClick={() => signOut()}
              >
                退出登录
              </button>
            ) : (
              <NavLink className="button ghost" to="/login">
                登录
              </NavLink>
            )}
          </div>
        </div>
      </header>
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
    </div>
  )
}

export default Layout
