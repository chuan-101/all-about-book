import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  deleteExcerpt,
  getExcerptsByBookId,
  updateExcerpt,
  upsertExcerpt,
} from '../lib/excerpts-storage'
import {
  addMessage,
  getMessagesByBookId,
} from '../lib/discussion-storage'
import type { Excerpt } from '../types/excerpt'
import type { DiscussionMessage } from '../types/discussion'
import type { ReadingSession } from '../types/reading-session'
import { useAppData } from '../lib/app-context'
import { useBooks } from '../lib/books-context'
import {
  createCloudDiscussion,
  createCloudExcerpt,
  deleteCloudExcerpt,
  toggleCloudCheckIn,
  updateCloudExcerpt,
} from '../lib/cloudWrite'
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
  const { books: localBooks } = useBooks()
  const {
    isCloudMode,
    cloudBooks,
    cloudCheckIns,
    cloudExcerpts,
    cloudDiscussions,
    cloudLoading,
    session,
    refreshCloud,
  } = useAppData()
  const books = isCloudMode ? cloudBooks : localBooks
  const book = bookId ? books.find((item) => item.id === bookId) : undefined
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [excerpts, setExcerpts] = useState<Excerpt[]>([])
  const [newExcerptContent, setNewExcerptContent] = useState('')
  const [isExcerptEditorOpen, setIsExcerptEditorOpen] = useState(false)
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement | null>(
    null,
  )
  const [discussionMessages, setDiscussionMessages] = useState<
    DiscussionMessage[]
  >([])
  const [newMessageContent, setNewMessageContent] = useState('')
  const [editingExcerptId, setEditingExcerptId] = useState<string | null>(
    null,
  )
  const [editingContent, setEditingContent] = useState('')
  const [cloudError, setCloudError] = useState<string | null>(null)

  useEffect(() => {
    if (!book || isCloudMode) return
    setSessions(getCheckInsByBook(book.id))
  }, [book, isCloudMode])

  useEffect(() => {
    if (!book || isCloudMode) return
    setExcerpts(getExcerptsByBookId(book.id))
  }, [book, isCloudMode])

  useEffect(() => {
    if (!book || isCloudMode) return
    setDiscussionMessages(getMessagesByBookId(book.id))
  }, [book, isCloudMode])

  useEffect(() => {
    if (!isCloudMode) return
    setEditingExcerptId(null)
    setEditingContent('')
  }, [isCloudMode])

  useEffect(() => {
    if (!isExcerptEditorOpen) return
    fullscreenTextareaRef.current?.focus()
  }, [isExcerptEditorOpen])

  const displaySessions = useMemo(() => {
    if (!book) return []
    return isCloudMode
      ? cloudCheckIns.filter((session) => session.bookId === book.id)
      : sessions
  }, [book, cloudCheckIns, isCloudMode, sessions])

  const displayExcerpts = useMemo(() => {
    if (!book) return []
    return isCloudMode
      ? cloudExcerpts.filter((excerpt) => excerpt.bookId === book.id)
      : excerpts
  }, [book, cloudExcerpts, excerpts, isCloudMode])

  const displayDiscussions = useMemo(() => {
    if (!book) return []
    return isCloudMode
      ? cloudDiscussions.filter((message) => message.bookId === book.id)
      : discussionMessages
  }, [book, cloudDiscussions, discussionMessages, isCloudMode])

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
    () => new Set(displaySessions.map((session) => session.date)),
    [displaySessions],
  )

  const handleToggleCheckIn = async (date: Date) => {
    if (!book) return
    const dateString = formatDate(date)
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端打卡。')
        return
      }
      const hasExisting = checkInDates.has(dateString)
      setCloudError(null)
      try {
        await toggleCloudCheckIn(
          session.user.id,
          book.id,
          dateString,
          hasExisting,
        )
        await refreshCloud()
      } catch (error) {
        console.error(error)
        setCloudError('云端打卡同步失败，请稍后重试。')
      }
      return
    }

    toggleCheckIn(book.id, dateString)
    setSessions(getCheckInsByBook(book.id))
  }

  const todayString = formatDate(new Date())

  const refreshExcerpts = () => {
    if (!book || isCloudMode) return
    setExcerpts(getExcerptsByBookId(book.id))
  }

  const refreshDiscussions = () => {
    if (!book || isCloudMode) return
    setDiscussionMessages(getMessagesByBookId(book.id))
  }

  const handleCreateExcerpt = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!book) return
    const content = newExcerptContent.trim()
    if (!content) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书摘。')
        return
      }
      setCloudError(null)
      try {
        await createCloudExcerpt(session.user.id, book.id, content)
        await refreshCloud()
        setNewExcerptContent('')
        setIsExcerptEditorOpen(false)
      } catch (error) {
        console.error(error)
        setCloudError('云端书摘保存失败，请稍后重试。')
      }
      return
    }

    const now = new Date().toISOString()
    const nextExcerpt: Excerpt = {
      id: crypto.randomUUID(),
      bookId: book.id,
      content,
      createdAt: now,
    }
    upsertExcerpt(nextExcerpt)
    setNewExcerptContent('')
    setIsExcerptEditorOpen(false)
    refreshExcerpts()
  }

  const handleCreateDiscussion = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!book) return
    const content = newMessageContent.trim()
    if (!content) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端讨论。')
        return
      }
      setCloudError(null)
      try {
        await createCloudDiscussion(session.user.id, book.id, content)
        await refreshCloud()
        setNewMessageContent('')
      } catch (error) {
        console.error(error)
        setCloudError('云端讨论发送失败，请稍后重试。')
      }
      return
    }

    const now = new Date().toISOString()
    const message: DiscussionMessage = {
      id: crypto.randomUUID(),
      bookId: book.id,
      role: 'me',
      content,
      createdAt: now,
    }
    addMessage(message)
    setNewMessageContent('')
    refreshDiscussions()
  }

  const handleStartEdit = (excerpt: Excerpt) => {
    setEditingExcerptId(excerpt.id)
    setEditingContent(excerpt.content)
  }

  const handleCancelEdit = () => {
    setEditingExcerptId(null)
    setEditingContent('')
  }

  const handleSaveEdit = async (id: string) => {
    const content = editingContent.trim()
    if (!content) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书摘。')
        return
      }
      const target = displayExcerpts.find((excerpt) => excerpt.id === id)
      if (!target) return
      setCloudError(null)
      try {
        await updateCloudExcerpt(session.user.id, target, content)
        await refreshCloud()
        handleCancelEdit()
      } catch (error) {
        console.error(error)
        setCloudError('云端书摘更新失败，请稍后重试。')
      }
      return
    }

    updateExcerpt(id, { content })
    refreshExcerpts()
    handleCancelEdit()
  }

  const handleDeleteExcerpt = async (id: string) => {
    if (!window.confirm('确定要删除这条书摘吗？')) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书摘。')
        return
      }
      setCloudError(null)
      try {
        await deleteCloudExcerpt(session.user.id, id)
        await refreshCloud()
      } catch (error) {
        console.error(error)
        setCloudError('云端书摘删除失败，请稍后重试。')
      }
      return
    }

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

  if (!book && isCloudMode && cloudLoading) {
    return (
      <section className="stack">
        <h2>加载中...</h2>
        <p className="muted">正在加载云端书籍详情。</p>
      </section>
    )
  }

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
            {cloudError ? (
              <p className="notice error">{cloudError}</p>
            ) : null}
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
            <span className="muted">{displaySessions.length} 次</span>
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
                  {isChecked ? <span className="calendar-dot" /> : null}
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
            <span className="muted">{displayExcerpts.length} 条</span>
          </div>
          <form className="form" onSubmit={handleCreateExcerpt}>
            <label className="field">
              <span>新增书摘</span>
              <textarea
                className="excerpt-textarea"
                rows={3}
                value={newExcerptContent}
                onChange={(event) =>
                  setNewExcerptContent(event.target.value)
                }
                placeholder="记录喜欢的句子或段落"
              />
            </label>
            <div className="excerpt-editor-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setIsExcerptEditorOpen(true)}
              >
                全屏编辑
              </button>
            </div>
            <div className="form-actions">
              <button type="submit" className="button primary">
                保存书摘
              </button>
            </div>
            {isExcerptEditorOpen ? (
              <div
                className="excerpt-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label="全屏编辑书摘"
                onClick={() => setIsExcerptEditorOpen(false)}
              >
                <div
                  className="excerpt-modal"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="excerpt-modal-header">
                    <h4>全屏编辑</h4>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setIsExcerptEditorOpen(false)}
                    >
                      关闭
                    </button>
                  </div>
                  <textarea
                    ref={fullscreenTextareaRef}
                    className="excerpt-textarea excerpt-textarea-full"
                    value={newExcerptContent}
                    onChange={(event) =>
                      setNewExcerptContent(event.target.value)
                    }
                    placeholder="记录喜欢的句子或段落"
                  />
                  <div className="form-actions">
                    <button type="submit" className="button primary">
                      保存书摘
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setIsExcerptEditorOpen(false)}
                    >
                      完成
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </form>
          {displayExcerpts.length === 0 ? (
            <p className="muted">暂无书摘，先记录第一条吧。</p>
          ) : (
            <ul className="list">
              {displayExcerpts.map((excerpt) => {
                const isEditing = editingExcerptId === excerpt.id
                return (
                  <li key={excerpt.id} className="list-item">
                    <div className="list-item-main">
                      {isEditing ? (
                        <label className="field">
                          <span>编辑书摘</span>
                          <textarea
                            className="excerpt-textarea"
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
                          <p className="excerpt-content">
                            {excerpt.content}
                          </p>
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
                            onClick={() => handleDeleteExcerpt(excerpt.id)}
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
          <div className="card-header">
            <h3>与 Syzygy 讨论</h3>
            <span className="muted">{displayDiscussions.length} 条</span>
          </div>
          <p className="muted">
            后续接入 API 后，这里会根据书摘与阅读记录生成讨论与总结。
          </p>
          {displayDiscussions.length === 0 ? (
            <p className="muted">暂无讨论，先写下你的想法吧。</p>
          ) : (
            <ul className="list">
              {displayDiscussions.map((message) => (
                <li key={message.id} className="list-item">
                  <div className="list-item-main">
                    <p className="muted">
                      {formatExcerptDate(message.createdAt)} ·{' '}
                      {message.role === 'me' ? '我' : 'Syzygy'}
                    </p>
                    <p>{message.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form className="form" onSubmit={handleCreateDiscussion}>
            <label className="field">
              <span>我的想法</span>
              <textarea
                rows={3}
                value={newMessageContent}
                onChange={(event) =>
                  setNewMessageContent(event.target.value)
                }
                placeholder="写下你的想法或问题"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="button primary">
                发送
              </button>
              <button type="button" className="button ghost" disabled>
                让 Syzygy 回复（即将上线）
              </button>
            </div>
          </form>
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
          {displayExcerpts.length === 0 ? (
            <p className="print-muted">暂无书摘。</p>
          ) : (
            <ul className="print-list">
              {displayExcerpts.map((excerpt) => (
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
      </section>
    </>
  )
}

export default BookDetailPage
