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
          <h2>Dashboard</h2>
          <p className="muted">
            Track what you are reading and keep your library organized.
          </p>
        </div>
        <Link className="button primary" to="/books">
          Manage books
        </Link>
      </div>

      <div className="stats-grid">
        <div className="card stat">
          <span className="stat-label">Total books</span>
          <span className="stat-value">{totalBooks}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Currently reading</span>
          <span className="stat-value">{readingBooks.length}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Finished</span>
          <span className="stat-value">{finishedBooks.length}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Currently Reading</h3>
        </div>
        {readingBooks.length === 0 ? (
          <p className="muted">No active reads yet. Add a book to get going.</p>
        ) : (
          <ul className="list">
            {readingBooks.map((book) => (
              <li key={book.id} className="list-item">
                <div>
                  <strong>{book.title}</strong>
                  <p className="muted">
                    {book.author || 'Unknown author'}
                  </p>
                </div>
                <span className="chip">
                  {book.progress
                    ? `${book.progress.value} ${book.progress.kind}`
                    : 'Progress: TBD'}
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
