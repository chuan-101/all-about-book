import { NavLink, Outlet } from 'react-router-dom'

function Layout() {
  return (
    <div className="app">
      <header className="header">
        <div className="container header-content">
          <div>
            <p className="eyebrow">All About Book</p>
            <h1 className="title">Personal Reading Tracker</h1>
          </div>
          <nav className="nav">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/books">Books</NavLink>
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
