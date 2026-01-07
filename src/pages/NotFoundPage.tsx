import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <section className="stack">
      <h2>页面不存在</h2>
      <p className="muted">你访问的页面不存在。</p>
      <Link className="button primary" to="/">
        返回首页
      </Link>
    </section>
  )
}

export default NotFoundPage
