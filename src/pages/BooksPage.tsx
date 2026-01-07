import { useState } from 'react'
import { Link } from 'react-router-dom'
import BookForm, { type BookFormValues } from '../components/BookForm'
import { useBooks } from '../lib/books-context'
import type { Book } from '../types/book'

const statusLabels: Record<Book['status'], string> = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
}

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
        <h2>书架</h2>
        <p className="muted">
          添加和管理你的书单，所有数据保存在本地。
        </p>
      </div>

      <div>
        <h3 className="section-title">
          {editingBook ? '编辑书籍' : '添加新书'}
        </h3>
        <BookForm
          initialValues={editingBook ?? undefined}
          onSubmit={handleSubmit}
          onCancel={
            editingBook ? () => setEditingBook(null) : undefined
          }
          submitLabel={editingBook ? '更新' : '添加'}
        />
      </div>

      <div className="card stack">
        <div className="card-header">
          <h3>我的书架</h3>
          <span className="muted">{books.length} 本</span>
        </div>
        {books.length === 0 ? (
          <p className="muted">还没有书，在上方添加你的第一本吧。</p>
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
                    <div className="cover placeholder">暂无封面</div>
                  )}
                  <div>
                    <strong>{book.title}</strong>
                    <p className="muted">
                      {book.author || '作者未知'}
                    </p>
                    <div className="metadata">
                      <span className="chip">
                        {statusLabels[book.status]}
                      </span>
                      {book.genre ? (
                        <span className="chip ghost">{book.genre}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="actions">
                  <Link className="button ghost" to={`/books/${book.id}`}>
                    查看详情
                  </Link>
                  <button
                    className="button ghost"
                    onClick={() => setEditingBook(book)}
                  >
                    编辑
                  </button>
                  <button
                    className="button danger"
                    onClick={() => remove(book.id)}
                  >
                    删除
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
