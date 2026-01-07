import { NavLink, Outlet } from 'react-router-dom'

function Layout() {
  return (
    <div className="app">
      <header className="header">
        <div className="container header-content">
          <div>
            <p className="eyebrow">阅读记录</p>
            <h1 className="title">我的读书追踪器</h1>
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              首页
            </NavLink>
            <NavLink to="/books">书架</NavLink>
          </nav>
        </div>
      </header>
      <main className="container main">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
