import { Link, useParams } from 'react-router-dom'
import { useBooks } from '../lib/books-context'

function BookDetailPage() {
  const { bookId } = useParams()
  const { getById } = useBooks()
  const book = bookId ? getById(bookId) : undefined

  if (!book) {
    return (
      <section className="stack">
        <h2>Book not found</h2>
        <p className="muted">
          We could not locate that book. Head back to the library to choose a
          different title.
        </p>
        <Link className="button primary" to="/books">
          Back to books
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Book detail</p>
          <h2>{book.title}</h2>
          <p className="muted">{book.author || 'Unknown author'}</p>
        </div>
        <Link className="button ghost" to="/books">
          Back to books
        </Link>
      </div>

      <div className="detail-grid">
        <div className="card detail-cover">
          {book.cover ? (
            <img src={book.cover} alt={`${book.title} cover`} />
          ) : (
            <div className="cover placeholder large">No cover</div>
          )}
        </div>
        <div className="card detail-info">
          <div className="info-row">
            <span>Status</span>
            <strong>{book.status}</strong>
          </div>
          <div className="info-row">
            <span>Genre/Type</span>
            <strong>{book.genre || 'Not set'}</strong>
          </div>
          <div className="info-row">
            <span>Translator</span>
            <strong>{book.translator || 'Not set'}</strong>
          </div>
          <div className="info-row">
            <span>Created</span>
            <strong>{new Date(book.createdAt).toLocaleString()}</strong>
          </div>
          <div className="info-row">
            <span>Updated</span>
            <strong>{new Date(book.updatedAt).toLocaleString()}</strong>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h3>Reading check-ins</h3>
        <p className="muted">Coming next: log progress updates and notes.</p>
      </div>
      <div className="card stack">
        <h3>Quotes & highlights</h3>
        <p className="muted">Coming next: save memorable passages.</p>
      </div>
      <div className="card stack">
        <h3>Review & recap</h3>
        <p className="muted">Coming next: summarize and rate the book.</p>
      </div>
    </section>
  )
}

export default BookDetailPage
