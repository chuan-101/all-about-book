import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <section className="stack">
      <h2>Page not found</h2>
      <p className="muted">The page you requested does not exist.</p>
      <Link className="button primary" to="/">
        Go home
      </Link>
    </section>
  )
}

export default NotFoundPage
