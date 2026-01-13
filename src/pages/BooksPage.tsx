import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BookForm, { type BookFormValues } from '../components/BookForm'
import { useAppData } from '../lib/app-context'
import { useBooks } from '../lib/books-context'
import { deleteCloudBook, upsertCloudBook } from '../lib/cloudWrite'
import type { Book } from '../types/book'

const statusLabels: Record<Book['status'], string> = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
}

function BooksPage() {
  const { books: localBooks, remove, upsert } = useBooks()
  const { isCloudMode, cloudBooks, cloudLoading, session, refreshCloud } =
    useAppData()
  const books = isCloudMode ? cloudBooks : localBooks
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [openBookMenuId, setOpenBookMenuId] = useState<string | null>(null)
  const [confirmingBook, setConfirmingBook] = useState<Book | null>(null)

  useEffect(() => {
    if (isCloudMode) {
      setEditingBook(null)
    }
  }, [isCloudMode])

  const handleSubmit = async (values: BookFormValues) => {
    const now = new Date().toISOString()
    const ratingValue =
      values.rating.trim() === '' ? undefined : Number(values.rating)
    const nextBook: Book = editingBook
      ? {
          ...editingBook,
          ...values,
          rating: ratingValue,
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...values,
          rating: ratingValue,
        }

    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书籍。')
        return
      }
      setCloudError(null)
      try {
        await upsertCloudBook(session.user.id, nextBook)
        await refreshCloud()
        setEditingBook(null)
      } catch (error) {
        console.error(error)
        setCloudError('云端书籍保存失败，请稍后重试。')
      }
      return
    }

    upsert(nextBook)
    setEditingBook(null)
  }

  const handleDelete = async (book: Book) => {
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书籍。')
        return
      }
      setCloudError(null)
      try {
        await deleteCloudBook(session.user.id, book.id)
        await refreshCloud()
      } catch (error) {
        console.error(error)
        setCloudError('云端书籍删除失败，请稍后重试。')
      }
      return
    }

    remove(book.id)
  }

  const handleRequestDelete = (book: Book) => {
    setOpenBookMenuId(null)
    setConfirmingBook(book)
  }

  const handleConfirmDelete = async () => {
    if (!confirmingBook) return
    await handleDelete(confirmingBook)
    setConfirmingBook(null)
  }

  return (
    <section className="stack">
      <div>
        <h2>书架</h2>
        <p className="muted">
          添加和管理你的书单，当前数据来源：
          {isCloudMode ? '云端' : '本地'}。
        </p>
      </div>

      {cloudLoading ? (
        <div className="notice info">云端数据加载中...</div>
      ) : null}
      {cloudError ? (
        <div className="notice error">{cloudError}</div>
      ) : null}
      <div>
        <h3 className="section-title">
          {editingBook ? '编辑书籍' : '添加新书'}
        </h3>
        <BookForm
          initialValues={editingBook ?? undefined}
          onSubmit={handleSubmit}
          onCancel={editingBook ? () => setEditingBook(null) : undefined}
          submitLabel={editingBook ? '更新' : '添加'}
        />
      </div>

      <div className="card stack">
        <div className="card-header">
          <h3>我的书架</h3>
          <span className="muted">{books.length} 本</span>
        </div>
        {books.length === 0 ? (
          <p className="muted">
            {isCloudMode && cloudLoading
              ? '正在加载云端书籍...'
              : '还没有书，在上方添加你的第一本吧。'}
          </p>
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
                      {book.rating ? (
                        <span className="chip ghost">
                          评分 {book.rating}
                        </span>
                      ) : null}
                      {book.startDate ? (
                        <span className="chip ghost">
                          开始 {book.startDate}
                        </span>
                      ) : null}
                      {book.endDate ? (
                        <span className="chip ghost">
                          结束 {book.endDate}
                        </span>
                      ) : null}
                    </div>
                    {book.notes ? (
                      <p className="muted">{book.notes}</p>
                    ) : null}
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
                  <div className="menu">
                    <button
                      className="button ghost"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openBookMenuId === book.id}
                      onClick={() =>
                        setOpenBookMenuId(
                          openBookMenuId === book.id ? null : book.id,
                        )
                      }
                    >
                      ⋯ 更多
                    </button>
                    {openBookMenuId === book.id ? (
                      <div className="menu-panel" role="menu">
                        <Link
                          className="menu-item"
                          role="menuitem"
                          to={`/books/${book.id}`}
                          onClick={() => setOpenBookMenuId(null)}
                        >
                          查看详情
                        </Link>
                        <button
                          className="menu-item"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenBookMenuId(null)
                            setEditingBook(book)
                          }}
                        >
                          编辑
                        </button>
                        <button
                          className="menu-item danger"
                          type="button"
                          role="menuitem"
                          onClick={() => handleRequestDelete(book)}
                        >
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmingBook ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除书籍"
          onClick={() => setConfirmingBook(null)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>确认删除</h4>
            </header>
            <div className="stack">
              <p>
                将删除《{confirmingBook.title}》，此操作无法撤销。
              </p>
              <p className="muted">
                确认后书籍将从{isCloudMode ? '云端' : '本地'}移除。
              </p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                autoFocus
                onClick={() => setConfirmingBook(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleConfirmDelete}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default BooksPage
