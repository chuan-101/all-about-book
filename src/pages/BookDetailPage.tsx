import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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

  useEffect(() => {
    if (!book) return
    setSessions(getCheckInsByBook(book.id))
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
