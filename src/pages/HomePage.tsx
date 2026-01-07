import { Link } from 'react-router-dom'
import { useBooks } from '../lib/books-context'

function HomePage() {
  const { books } = useBooks()
  const totalBooks = books.length
  const readingBooks = books.filter((book) => book.status === 'reading')
  const finishedBooks = books.filter((book) => book.status === 'finished')

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h2>仪表盘</h2>
          <p className="muted">
            记录你的阅读进度，管理你的书架。
          </p>
        </div>
        <Link className="button primary" to="/books">
          管理书籍
        </Link>
      </div>

      <div className="stats-grid">
        <div className="card stat">
          <span className="stat-label">书籍总数</span>
          <span className="stat-value">{totalBooks}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">在读</span>
          <span className="stat-value">{readingBooks.length}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">已读完</span>
          <span className="stat-value">{finishedBooks.length}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>正在阅读</h3>
        </div>
        {readingBooks.length === 0 ? (
          <p className="muted">还没有在读的书，去添加一本吧。</p>
        ) : (
          <ul className="list">
            {readingBooks.map((book) => (
              <li key={book.id} className="list-item">
                <div>
                  <strong>{book.title}</strong>
                  <p className="muted">
                    {book.author || '作者未知'}
                  </p>
                </div>
                <span className="chip">
                  {book.progress
                    ? `${book.progress.value} ${book.progress.kind}`
                    : '进度：待记录'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default HomePage
