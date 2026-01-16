import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../lib/app-context'
import { useBooks } from '../lib/books-context'
import { getReadingSessions } from '../lib/reading-sessions-storage'
import type { ReadingSession } from '../types/reading-session'

const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function HomePage() {
  const { books: localBooks } = useBooks()
  const { isCloudMode, cloudBooks, cloudCheckIns, cloudLoading } =
    useAppData()
  const books = isCloudMode ? cloudBooks : localBooks
  const totalBooks = books.length
  const readingBooks = books.filter((book) => book.status === 'reading')
  const finishedBooks = books.filter((book) => book.status === 'finished')
  const [checkIns, setCheckIns] = useState<ReadingSession[]>([])
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    if (isCloudMode) return
    setCheckIns(getReadingSessions())
  }, [isCloudMode])

  const displayCheckIns = isCloudMode ? cloudCheckIns : checkIns

  const heatmapLayout = useMemo(() => {
    const yearStart = new Date(currentYear, 0, 1)
    const yearEnd = new Date(currentYear, 11, 31)
    const dayMs = 24 * 60 * 60 * 1000
    const daysInYear =
      Math.round((yearEnd.getTime() - yearStart.getTime()) / dayMs) + 1
    const startOffset = yearStart.getDay()
    const totalCells = Math.ceil((startOffset + daysInYear) / 7) * 7
    const weekColumns = totalCells / 7

    const cells = Array.from({ length: totalCells }, (_, index) => {
      const dayIndex = index - startOffset
      if (dayIndex < 0 || dayIndex >= daysInYear) return null
      return new Date(currentYear, 0, 1 + dayIndex)
    })

    const monthLabels = Array.from({ length: 12 }, (_, index) => {
      const monthStart = new Date(currentYear, index, 1)
      const dayIndex = Math.round(
        (monthStart.getTime() - yearStart.getTime()) / dayMs,
      )
      const startColumn =
        Math.floor((startOffset + dayIndex) / 7) + 1
      const nextMonthStart =
        index === 11
          ? null
          : new Date(currentYear, index + 1, 1)
      const nextDayIndex = nextMonthStart
        ? Math.round(
            (nextMonthStart.getTime() - yearStart.getTime()) /
              dayMs,
          )
        : null
      const nextStartColumn = nextDayIndex === null
        ? weekColumns + 1
        : Math.floor((startOffset + nextDayIndex) / 7) + 1
      const endColumn = Math.max(startColumn + 1, nextStartColumn)

      return {
        label: `${index + 1}月`,
        startColumn,
        endColumn,
      }
    })

    return { cells, monthLabels, weekColumns }
  }, [currentYear])

  const checkInDates = useMemo(
    () =>
      new Set(
        displayCheckIns
          .filter((session) =>
            session.date.startsWith(`${currentYear}-`),
          )
          .map((session) => session.date),
      ),
    [displayCheckIns, currentYear],
  )

  return (
    <section className="stack">
      <div className="page-header dashboard-header">
        <div className="dashboard-header-text">                       
          <div className="dashboard-heading">
            <span className="dashboard-date">Reading Dashboard</span>
          </div>
          <p className="muted">
            记录阅读进度，管理书架。
          </p>
          {isCloudMode && cloudLoading ? (
            <p className="notice info">云端数据加载中...</p>
          ) : null}
        </div>
      </div>
      <div className="dashboard-divider" role="presentation" />

      <div className="stats-grid">
        <div className="card stat">
          <span className="stat-label">书籍总数</span>
          <span className="stat-value">{totalBooks}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">在读</span>
          <span className="stat-value">{readingBooks.length}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">已读完</span>
          <span className="stat-value">{finishedBooks.length}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>正在阅读</h3>
        </div>
        {readingBooks.length === 0 ? (
          <p className="muted">还没有在读的书，去添加一本吧。</p>
        ) : (
          <ul className="list">
            {readingBooks.map((book) => (
              <li key={book.id} className="list-item">
                <div>
                  <strong>{book.title}</strong>
                  <p className="muted">
                    {book.author || '作者未知'}
                  </p>
                </div>
                <span className="chip">
                  {book.progress
                    ? `${book.progress.value} ${book.progress.kind}`
                    : '进度：待记录'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>年度打卡</h3>
          <span className="muted">{currentYear}</span>
        </div>
        <div className="heatmap-container">
          <div
            className="heatmap-grid"
            style={{
              gridTemplateColumns: `repeat(${heatmapLayout.weekColumns}, var(--heatmap-cell-size))`,
            }}
          >
            {heatmapLayout.monthLabels.map((month) => (
              <span
                key={month.label}
                className="heatmap-month-label"
                style={{
                  gridColumn: `${month.startColumn} / ${month.endColumn}`,
                  gridRow: 1,
                }}
              >
                {month.label}
              </span>
            ))}
            {heatmapLayout.cells.map((date, index) => {
              const column = Math.floor(index / 7) + 1
              const row = (index % 7) + 2

              if (!date) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="heatmap-cell empty"
                    style={{ gridColumn: column, gridRow: row }}
                  />
                )
              }

              const dateString = formatDate(date)
              const isActive = checkInDates.has(dateString)

              return (
                <div
                  key={dateString}
                  className={`heatmap-cell${isActive ? ' active' : ''}`}
                  style={{ gridColumn: column, gridRow: row }}
                  title={
                    isActive
                      ? `${dateString} 有打卡`
                      : `${dateString} 无打卡`
                  }
                />
              )
            })}
          </div>
        </div>
        <p className="muted">
          年度概览显示所有书籍的打卡日期，后续可扩展查看详情。
        </p>
      </div>
    </section>
  )
}

export default HomePage
