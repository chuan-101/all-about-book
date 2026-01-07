import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  deleteExcerpt,
  getExcerptsByBookId,
  updateExcerpt,
  upsertExcerpt,
} from '../lib/excerpts-storage'
import type { Excerpt } from '../types/excerpt'
import type { ReadingSession } from '../types/reading-session'
import { useBooks } from '../lib/books-context'
import {
  getCheckInsByBook,
  toggleCheckIn,
} from '../lib/reading-sessions-storage'

const statusLabels = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
} as const

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function BookDetailPage() {
  const { bookId } = useParams()
  const { getById } = useBooks()
  const book = bookId ? getById(bookId) : undefined
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [excerpts, setExcerpts] = useState<Excerpt[]>([])
  const [newExcerptContent, setNewExcerptContent] = useState('')
  const [editingExcerptId, setEditingExcerptId] = useState<string | null>(
    null,
  )
  const [editingContent, setEditingContent] = useState('')

  useEffect(() => {
    if (!book) return
    setSessions(getCheckInsByBook(book.id))
  }, [book])

  useEffect(() => {
    if (!book) return
    setExcerpts(getExcerptsByBookId(book.id))
  }, [book])

  const monthStart = useMemo(
    () =>
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        1,
      ),
    [currentMonth],
  )

  const monthLabel = useMemo(
    () =>
      monthStart.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
      }),
    [monthStart],
  )

  const calendarDays = useMemo(() => {
    const year = monthStart.getFullYear()
    const month = monthStart.getMonth()
    const firstDay = monthStart.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const totalCells = Math.ceil(
      (firstDay + daysInMonth) / 7,
    ) * 7

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - firstDay + 1
      if (dayNumber < 1 || dayNumber > daysInMonth) return null
      return new Date(year, month, dayNumber)
    })
  }, [monthStart])

  const checkInDates = useMemo(
    () => new Set(sessions.map((session) => session.date)),
    [sessions],
  )

  const handleToggleCheckIn = (date: Date) => {
    if (!book) return
    const dateString = formatDate(date)
    toggleCheckIn(book.id, dateString)
    setSessions(getCheckInsByBook(book.id))
  }

  const todayString = formatDate(new Date())

  const refreshExcerpts = () => {
    if (!book) return
    setExcerpts(getExcerptsByBookId(book.id))
  }

  const handleCreateExcerpt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!book) return
    const content = newExcerptContent.trim()
    if (!content) return
    const now = new Date().toISOString()
    const nextExcerpt: Excerpt = {
      id: crypto.randomUUID(),
      bookId: book.id,
      content,
      createdAt: now,
    }
    upsertExcerpt(nextExcerpt)
    setNewExcerptContent('')
    refreshExcerpts()
  }

  const handleStartEdit = (excerpt: Excerpt) => {
    setEditingExcerptId(excerpt.id)
    setEditingContent(excerpt.content)
  }

  const handleCancelEdit = () => {
    setEditingExcerptId(null)
    setEditingContent('')
  }

  const handleSaveEdit = (id: string) => {
    const content = editingContent.trim()
    if (!content) return
    updateExcerpt(id, { content })
    refreshExcerpts()
    handleCancelEdit()
  }

  const handleDeleteExcerpt = (id: string) => {
    if (!window.confirm('确定要删除这条书摘吗？')) return
    deleteExcerpt(id)
    refreshExcerpts()
  }

  const formatExcerptDate = (value: string) =>
    new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const sortedCheckIns = useMemo(
    () =>
      Array.from(new Set(sessions.map((session) => session.date))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [sessions],
  )

  if (!book) {
    return (
      <section className="stack">
        <h2>未找到此书</h2>
        <p className="muted">
          无法找到这本书，请返回书架选择其他标题。
        </p>
        <Link className="button primary" to="/books">
          返回书架
        </Link>
      </section>
    )
  }

  return (
    <>
      <section className="stack screen-only">
        <div className="page-header">
          <div>
            <p className="eyebrow">书籍详情</p>
            <h2>{book.title}</h2>
            <p className="muted">{book.author || '作者未知'}</p>
          </div>
          <div className="page-header-actions">
            <button
              className="button"
              type="button"
              onClick={() => window.print()}
            >
              打印
            </button>
            <Link className="button ghost" to="/books">
              返回书架
            </Link>
          </div>
        </div>

        <div className="detail-grid">
          <div className="card detail-cover">
            {book.cover ? (
              <img src={book.cover} alt={`${book.title} cover`} />
            ) : (
              <div className="cover placeholder large">暂无封面</div>
            )}
          </div>
          <div className="card detail-info">
            <div className="info-row">
              <span>状态</span>
              <strong>{statusLabels[book.status]}</strong>
            </div>
            <div className="info-row">
              <span>类型</span>
              <strong>{book.genre || '未设置'}</strong>
            </div>
            <div className="info-row">
              <span>译者</span>
              <strong>{book.translator || '未设置'}</strong>
            </div>
            {book.startDate ? (
              <div className="info-row">
                <span>开始日期</span>
                <strong>{book.startDate}</strong>
              </div>
            ) : null}
            {book.endDate ? (
              <div className="info-row">
                <span>结束日期</span>
                <strong>{book.endDate}</strong>
              </div>
            ) : null}
            {book.rating ? (
              <div className="info-row">
                <span>评分</span>
                <strong>{book.rating}</strong>
              </div>
            ) : null}
            <div className="info-row">
              <span>创建时间</span>
              <strong>{new Date(book.createdAt).toLocaleString()}</strong>
            </div>
            <div className="info-row">
              <span>更新时间</span>
              <strong>{new Date(book.updatedAt).toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {book.notes ? (
          <div className="card stack">
            <h3>笔记</h3>
            <p>{book.notes}</p>
          </div>
        ) : null}

        <div className="card stack">
          <div className="card-header">
            <h3>阅读打卡</h3>
            <span className="muted">{sessions.length} 次</span>
          </div>
          <div className="calendar-header">
            <strong className="calendar-title">{monthLabel}</strong>
            <div className="calendar-nav">
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  setCurrentMonth(
                    new Date(
                      monthStart.getFullYear(),
                      monthStart.getMonth() - 1,
                      1,
                    ),
                  )
                }
              >
                上个月
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  setCurrentMonth(
                    new Date(
                      monthStart.getFullYear(),
                      monthStart.getMonth() + 1,
                      1,
                    ),
                  )
                }
              >
                下个月
              </button>
              <button
                className="button"
                type="button"
                onClick={() => setCurrentMonth(new Date())}
              >
                今天
              </button>
            </div>
          </div>
          <div className="calendar-weekdays">
            {weekDays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((date, index) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="calendar-day empty"
                  />
                )
              }

              const dateString = formatDate(date)
              const isChecked = checkInDates.has(dateString)
              const isToday = dateString === todayString

              return (
                <button
                  key={dateString}
                  type="button"
                  className={`calendar-day${isChecked ? ' checked' : ''}${
                    isToday ? ' today' : ''
                  }`}
                  onClick={() => handleToggleCheckIn(date)}
                >
                  <span className="calendar-date">{date.getDate()}</span>
                  {isChecked ? (
                    <span className="calendar-dot" />
                  ) : null}
                </button>
              )
            })}
          </div>
          <p className="muted">
            点击日期即可切换打卡状态，已有打卡会显示标记。
          </p>
        </div>
        <div className="card stack">
          <div className="card-header">
            <h3>书摘</h3>
            <span className="muted">{excerpts.length} 条</span>
          </div>
          <form className="form" onSubmit={handleCreateExcerpt}>
            <label className="field">
              <span>新增书摘</span>
              <textarea
                rows={3}
                value={newExcerptContent}
                onChange={(event) =>
                  setNewExcerptContent(event.target.value)
                }
                placeholder="记录喜欢的句子或段落"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="button primary">
                保存书摘
              </button>
            </div>
          </form>
          {excerpts.length === 0 ? (
            <p className="muted">暂无书摘，先记录第一条吧。</p>
          ) : (
            <ul className="list">
              {excerpts.map((excerpt) => {
                const isEditing = editingExcerptId === excerpt.id
                return (
                  <li key={excerpt.id} className="list-item">
                    <div className="list-item-main">
                      {isEditing ? (
                        <label className="field">
                          <span>编辑书摘</span>
                          <textarea
                            rows={3}
                            value={editingContent}
                            onChange={(event) =>
                              setEditingContent(event.target.value)
                            }
                          />
                        </label>
                      ) : (
                        <div>
                          <p className="muted">
                            {formatExcerptDate(excerpt.createdAt)}
                          </p>
                          <p>{excerpt.content}</p>
                        </div>
                      )}
                    </div>
                    <div className="actions">
                      {isEditing ? (
                        <>
                          <button
                            className="button primary"
                            type="button"
                            onClick={() => handleSaveEdit(excerpt.id)}
                          >
                            保存
                          </button>
                          <button
                            className="button ghost"
                            type="button"
                            onClick={handleCancelEdit}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="button ghost"
                            type="button"
                            onClick={() => handleStartEdit(excerpt)}
                          >
                            编辑
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            onClick={() =>
                              handleDeleteExcerpt(excerpt.id)
                            }
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="card stack">
          <h3>读后感</h3>
          <p className="muted">即将上线：总结和评分。</p>
        </div>
      </section>
      <section className="print-view">
        <header className="print-header">
          <p className="print-eyebrow">书籍详情</p>
          <h1>{book.title}</h1>
          <p className="print-author">{book.author || '作者未知'}</p>
          <ul className="print-meta">
            <li>状态：{statusLabels[book.status]}</li>
            {book.genre ? <li>类型：{book.genre}</li> : null}
            {book.translator ? <li>译者：{book.translator}</li> : null}
            {book.startDate ? <li>开始日期：{book.startDate}</li> : null}
            {book.endDate ? <li>结束日期：{book.endDate}</li> : null}
          </ul>
        </header>
        <section className="print-section">
          <h2>书摘</h2>
          {excerpts.length === 0 ? (
            <p className="print-muted">暂无书摘。</p>
          ) : (
            <ul className="print-list">
              {excerpts.map((excerpt) => (
                <li key={excerpt.id} className="print-excerpt">
                  <div className="print-excerpt-date">
                    {formatExcerptDate(excerpt.createdAt)}
                  </div>
                  <p>{excerpt.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="print-section">
          <h2>打卡日期</h2>
          {sortedCheckIns.length === 0 ? (
            <p className="print-muted">暂无打卡记录。</p>
          ) : (
            <ul className="print-list print-checkins">
              {sortedCheckIns.map((date) => (
                <li key={date}>{date}</li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </>
  )
}

export default BookDetailPage
