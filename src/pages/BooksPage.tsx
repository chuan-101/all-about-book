import { useState } from 'react'
import { Link } from 'react-router-dom'
import BookForm, { type BookFormValues } from '../components/BookForm'
import { useBooks } from '../lib/books-context'
import type { Book } from '../types/book'

function BooksPage() {
  const { books, remove, upsert } = useBooks()
  const [editingBook, setEditingBook] = useState<Book | null>(null)

  const handleSubmit = (values: BookFormValues) => {
    const now = new Date().toISOString()
    const nextBook: Book = editingBook
      ? {
          ...editingBook,
          ...values,
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...values,
        }

    upsert(nextBook)
    setEditingBook(null)
  }

  return (
    <section className="stack">
      <div>
        <h2>Books</h2>
        <p className="muted">
          Add and manage your reading list. All changes persist locally.
        </p>
      </div>

      <div>
        <h3 className="section-title">
          {editingBook ? 'Edit book' : 'Add a new book'}
        </h3>
        <BookForm
          initialValues={editingBook ?? undefined}
          onSubmit={handleSubmit}
          onCancel={
            editingBook ? () => setEditingBook(null) : undefined
          }
          submitLabel={editingBook ? 'Update book' : 'Add book'}
        />
      </div>

      <div className="card stack">
        <div className="card-header">
          <h3>Library</h3>
          <span className="muted">{books.length} books</span>
        </div>
        {books.length === 0 ? (
          <p className="muted">No books yet. Add your first title above.</p>
        ) : (
          <ul className="list">
            {books.map((book) => (
              <li key={book.id} className="list-item">
                <div className="list-item-main">
                  {book.cover ? (
                    <img
                      src={book.cover}
                      alt={`${book.title} cover`}
                      className="cover"
                    />
                  ) : (
                    <div className="cover placeholder">No cover</div>
                  )}
                  <div>
                    <strong>{book.title}</strong>
                    <p className="muted">
                      {book.author || 'Unknown author'}
                    </p>
                    <div className="metadata">
                      <span className="chip">{book.status}</span>
                      {book.genre ? (
                        <span className="chip ghost">{book.genre}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="actions">
                  <Link className="button ghost" to={`/books/${book.id}`}>
                    View details
                  </Link>
                  <button
                    className="button ghost"
                    onClick={() => setEditingBook(book)}
                  >
                    Edit
                  </button>
                  <button
                    className="button danger"
                    onClick={() => remove(book.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default BooksPage
