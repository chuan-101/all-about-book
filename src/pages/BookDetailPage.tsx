import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ReadingSession } from '../types/reading-session'
import { useBooks } from '../lib/books-context'
import {
  deleteReadingSession,
  getSessionsByBookId,
  upsertReadingSession,
} from '../lib/reading-sessions-storage'

type SessionFormValues = {
  date: string
  pagesRead: string
  chaptersRead: string
  comment: string
}

const statusLabels = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
} as const

function BookDetailPage() {
  const { bookId } = useParams()
  const { getById } = useBooks()
  const book = bookId ? getById(bookId) : undefined
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  const [sessionValues, setSessionValues] = useState<SessionFormValues>({
    date: '',
    pagesRead: '',
    chaptersRead: '',
    comment: '',
  })

  useEffect(() => {
    if (!book) return
    setSessions(getSessionsByBookId(book.id))
  }, [book])

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.date.localeCompare(a.date)),
    [sessions],
  )

  const handleSessionChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target
    setSessionValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSessionSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!book) return
    if (!sessionValues.date) return

    const pagesRead =
      sessionValues.pagesRead.trim() === ''
        ? undefined
        : Number(sessionValues.pagesRead)
    const chaptersRead =
      sessionValues.chaptersRead.trim() === ''
        ? undefined
        : Number(sessionValues.chaptersRead)

    const nextSession: ReadingSession = {
      id: crypto.randomUUID(),
      bookId: book.id,
      date: sessionValues.date,
      pagesRead,
      chaptersRead,
      comment: sessionValues.comment.trim() || undefined,
      createdAt: new Date().toISOString(),
    }

    upsertReadingSession(nextSession)
    setSessions(getSessionsByBookId(book.id))
    setSessionValues({
      date: '',
      pagesRead: '',
      chaptersRead: '',
      comment: '',
    })
  }

  const handleSessionDelete = (id: string) => {
    if (!book) return
    deleteReadingSession(id)
    setSessions(getSessionsByBookId(book.id))
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
    <section className="stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">书籍详情</p>
          <h2>{book.title}</h2>
          <p className="muted">{book.author || '作者未知'}</p>
        </div>
        <Link className="button ghost" to="/books">
          返回书架
        </Link>
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
          <span className="muted">{sessions.length} 条</span>
        </div>
        <form className="form" onSubmit={handleSessionSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>日期 *</span>
              <input
                type="date"
                name="date"
                value={sessionValues.date}
                onChange={handleSessionChange}
                required
              />
            </label>
            <label className="field">
              <span>页数</span>
              <input
                type="number"
                min="0"
                name="pagesRead"
                value={sessionValues.pagesRead}
                onChange={handleSessionChange}
                placeholder="可选"
              />
            </label>
            <label className="field">
              <span>章节数</span>
              <input
                type="number"
                min="0"
                name="chaptersRead"
                value={sessionValues.chaptersRead}
                onChange={handleSessionChange}
                placeholder="可选"
              />
            </label>
          </div>
          <label className="field">
            <span>备注</span>
            <textarea
              name="comment"
              rows={3}
              value={sessionValues.comment}
              onChange={handleSessionChange}
              placeholder="记录当日阅读感受"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="button primary">
              添加记录
            </button>
          </div>
        </form>
        {sortedSessions.length === 0 ? (
          <p className="muted">还没有阅读记录，先添加第一条吧。</p>
        ) : (
          <ul className="list">
            {sortedSessions.map((session) => (
              <li key={session.id} className="list-item">
                <div className="list-item-main">
                  <div>
                    <strong>{session.date}</strong>
                    <div className="metadata">
                      {session.pagesRead !== undefined ? (
                        <span className="chip ghost">
                          {session.pagesRead} 页
                        </span>
                      ) : null}
                      {session.chaptersRead !== undefined ? (
                        <span className="chip ghost">
                          {session.chaptersRead} 章
                        </span>
                      ) : null}
                    </div>
                    {session.comment ? (
                      <p className="muted">{session.comment}</p>
                    ) : null}
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="button danger"
                    onClick={() => handleSessionDelete(session.id)}
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card stack">
        <h3>书摘</h3>
        <p className="muted">即将上线：保存精彩段落。</p>
      </div>
      <div className="card stack">
        <h3>读后感</h3>
        <p className="muted">即将上线：总结和评分。</p>
      </div>
    </section>
  )
}

export default BookDetailPage
