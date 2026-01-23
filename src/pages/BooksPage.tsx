import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActionButton, ActionButtonLink } from '../components/ActionButton'
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

const PINNED_READING_LIMIT = 5

type StatusGroup = 'reading' | 'want' | 'finished'

const statusGroupLabels: Record<StatusGroup, string> = {
  reading: '在读',
  want: '想读',
  finished: '已读',
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
  const [isFormExpanded, setIsFormExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSections, setExpandedSections] = useState({
    reading: true,
    want: true,
    finished: false,
  })
  const readingSectionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isCloudMode) {
      setEditingBook(null)
    }
  }, [isCloudMode])

  useEffect(() => {
    if (editingBook) {
      setIsFormExpanded(true)
    }
  }, [editingBook])

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

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const hasSearch = normalizedQuery.length > 0

  const getSortTimestamp = (book: Book) => {
    const timestamp = Date.parse(book.updatedAt || book.createdAt || '')
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  const sortedBooks = [...books].sort(
    (a, b) => getSortTimestamp(b) - getSortTimestamp(a),
  )

  const matchesSearch = (book: Book) => {
    if (!hasSearch) return true
    const fields = [
      book.title,
      book.author,
      book.notes ?? '',
      book.genre ?? '',
      book.translator ?? '',
    ]
      .filter(Boolean)
      .map((field) => field.toLowerCase())
    return fields.some((field) => field.includes(normalizedQuery))
  }

  const filteredBooks = hasSearch
    ? sortedBooks.filter(matchesSearch)
    : sortedBooks

  const getStatusGroup = (status: Book['status']): StatusGroup => {
    if (status === 'reading') return 'reading'
    if (status === 'finished') return 'finished'
    return 'want'
  }

  const groupedBooks = filteredBooks.reduce(
    (acc, book) => {
      const group = getStatusGroup(book.status)
      acc[group].push(book)
      return acc
    },
    { reading: [], want: [], finished: [] } as Record<StatusGroup, Book[]>,
  )

  const sectionExpandedState = hasSearch
    ? {
        reading: groupedBooks.reading.length > 0,
        want: groupedBooks.want.length > 0,
        finished: groupedBooks.finished.length > 0,
      }
    : expandedSections

  const handleToggleSection = (section: StatusGroup) => {
    if (hasSearch) return
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const handleViewAllReading = () => {
    setExpandedSections((prev) => ({ ...prev, reading: true }))
    requestAnimationFrame(() => {
      readingSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  const readingPinned = groupedBooks.reading.slice(0, PINNED_READING_LIMIT)
  const totalLabel = hasSearch
    ? `${filteredBooks.length} / ${books.length} 本`
    : `${books.length} 本`
  const hasMatches = filteredBooks.length > 0

  return (
    <section className="stack">
      <div className="page-header dashboard-header">
        <div className="dashboard-header-text">
          <div className="dashboard-heading">
            <span className="dashboard-date">Bookshelf</span>
          </div>
        </div>
      </div>
      <div className="dashboard-divider" role="presentation" />

      {cloudLoading ? (
        <div className="notice info">云端数据加载中...</div>
      ) : null}
      {cloudError ? (
        <div className="notice error">{cloudError}</div>
      ) : null}
      <div className="collapsible-section">
        <button
          className="collapsible-header"
          type="button"
          aria-expanded={isFormExpanded}
          onClick={() => setIsFormExpanded((prev) => !prev)}
        >
          <span>
            {editingBook ? '编辑书籍' : '添加新书'}
          </span>
          <span className="collapsible-icon" aria-hidden="true">
            {isFormExpanded ? '−' : '+'}
          </span>
        </button>
        <div
          className={`collapsible-panel${isFormExpanded ? ' is-expanded' : ''}`}
          aria-hidden={!isFormExpanded}
        >
          <div className="collapsible-content">
            <BookForm
              initialValues={editingBook ?? undefined}
              onSubmit={handleSubmit}
              onCancel={
                editingBook ? () => setEditingBook(null) : undefined
              }
              submitLabel={editingBook ? '更新' : '添加'}
            />
          </div>
        </div>
      </div>

      <div className="card stack bookshelf-summary">
        <div className="card-header">
          <h3>我的书架</h3>
          <span className="muted">{totalLabel}</span>
        </div>
        <div className="bookshelf-search">
          <input
            type="search"
            placeholder="搜索书名/作者/标签/备注"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="搜索书名/作者/标签/备注"
          />
        </div>
        {books.length === 0 ? (
          <p className="muted">
            {isCloudMode && cloudLoading
              ? '正在加载云端书籍...'
              : '还没有书，在上方添加你的第一本吧。'}
          </p>
        ) : (
          <div className="bookshelf-pinned">
            <div className="bookshelf-pinned-header">
              <div>
                <h4>在读</h4>
                <p className="muted">书架顶部固定显示</p>
              </div>
              <span className="muted">
                {groupedBooks.reading.length} 本
              </span>
            </div>
            {groupedBooks.reading.length === 0 ? (
              <p className="muted">暂无在读书籍</p>
            ) : (
              <ul className="pinned-reading-list">
                {readingPinned.map((book) => (
                  <li key={book.id} className="pinned-reading-item">
                    <Link
                      className="pinned-reading-title"
                      to={`/books/${book.id}`}
                    >
                      {book.title}
                    </Link>
                    <span className="muted">
                      {book.author || '作者未知'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {groupedBooks.reading.length > PINNED_READING_LIMIT &&
            !hasSearch ? (
              <button
                className="button ghost"
                type="button"
                onClick={handleViewAllReading}
              >
                查看全部在读
              </button>
            ) : null}
          </div>
        )}
        {books.length > 0 && !hasMatches ? (
          <div className="bookshelf-empty-state">
            <p className="muted">没有找到匹配的书籍。</p>
            <p className="muted">试试调整关键词或清空搜索。</p>
          </div>
        ) : null}
      </div>

      {books.length > 0 && hasMatches ? (
        <div className="stack">
          {(Object.keys(statusGroupLabels) as StatusGroup[]).map((group) => {
            const sectionBooks = groupedBooks[group]
            const isExpanded = sectionExpandedState[group]
            const panelId = `bookshelf-section-${group}`
            const headerId = `bookshelf-section-header-${group}`

            return (
              <div
                key={group}
                className="card bookshelf-section"
                ref={group === 'reading' ? readingSectionRef : undefined}
              >
                <button
                  id={headerId}
                  className="bookshelf-section-header"
                  type="button"
                  aria-controls={panelId}
                  aria-expanded={isExpanded}
                  disabled={hasSearch}
                  onClick={() => handleToggleSection(group)}
                >
                  <div>
                    <h4>{statusGroupLabels[group]}</h4>
                    <p className="muted">
                      {hasSearch ? '搜索匹配结果已展开' : '点击收起/展开'}
                    </p>
                  </div>
                  <div className="bookshelf-section-meta">
                    <span className="muted">{sectionBooks.length} 本</span>
                    <span className="bookshelf-section-icon" aria-hidden="true">
                      {isExpanded ? '−' : '+'}
                    </span>
                  </div>
                </button>
                <div
                  id={panelId}
                  className={`collapsible-panel${
                    isExpanded ? ' is-expanded' : ''
                  }`}
                  aria-hidden={!isExpanded}
                  aria-labelledby={headerId}
                >
                  <div className="collapsible-content">
                    {sectionBooks.length === 0 ? (
                      <p className="muted">暂无书籍</p>
                    ) : (
                      <ul className="list">
                        {sectionBooks.map((book) => (
                          <li key={book.id} className="list-item">
                            <div className="list-item-main">
                              {book.cover ? (
                                <img
                                  src={book.cover}
                                  alt={`${book.title} cover`}
                                  className="cover"
                                />
                              ) : (
                                <div className="cover placeholder">
                                  暂无封面
                                </div>
                              )}
                              <div>
                                <strong>{book.title}</strong>
                                <p className="muted">
                                  {book.author || '作者未知'}
                                </p>
                                <div className="metadata">
                                  <span
                                    className={`chip${
                                      book.status === 'reading'
                                        ? ' status-badge-reading'
                                        : ''
                                    }`}
                                  >
                                    {statusLabels[book.status]}
                                  </span>
                                  {book.genre ? (
                                    <span className="chip ghost">
                                      {book.genre}
                                    </span>
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
                              <ActionButtonLink to={`/books/${book.id}`}>
                                查看详情
                              </ActionButtonLink>
                              <div className="menu">
                                <ActionButton
                                  type="button"
                                  aria-haspopup="menu"
                                  aria-expanded={
                                    openBookMenuId === book.id
                                  }
                                  onClick={() =>
                                    setOpenBookMenuId(
                                      openBookMenuId === book.id
                                        ? null
                                        : book.id,
                                    )
                                  }
                                >
                                  ⋯ 更多
                                </ActionButton>
                                {openBookMenuId === book.id ? (
                                  <div className="menu-panel dropup" role="menu">
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
                                      onClick={() =>
                                        handleRequestDelete(book)
                                      }
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
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
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
