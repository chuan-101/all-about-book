import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useBooks } from '../lib/books-context'
import {
  applyBackupPayload,
  buildHtmlArchive,
  buildMarkdownArchive,
  createBackupPayload,
  parseBackupPayload,
} from '../lib/backup'
import { getReadingSessions } from '../lib/reading-sessions-storage'
import type { ReadingSession } from '../types/reading-session'

const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function HomePage() {
  const { books, refresh } = useBooks()
  const totalBooks = books.length
  const readingBooks = books.filter((book) => book.status === 'reading')
  const finishedBooks = books.filter((book) => book.status === 'finished')
  const [checkIns, setCheckIns] = useState<ReadingSession[]>([])
  const [backupStatus, setBackupStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    setCheckIns(getReadingSessions())
  }, [])

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
        checkIns
          .filter((session) =>
            session.date.startsWith(`${currentYear}-`),
          )
          .map((session) => session.date),
      ),
    [checkIns, currentYear],
  )

  const downloadFile = (
    content: string,
    filename: string,
    type: string,
  ) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleExportBackup = () => {
    const payload = createBackupPayload()
    const filename = `all-about-book-backup-${formatDate(
      new Date(),
    )}.json`
    downloadFile(
      JSON.stringify(payload, null, 2),
      filename,
      'application/json',
    )
    setBackupStatus({
      type: 'success',
      message: '备份已导出为 JSON 文件。',
    })
  }

  const handleExportMarkdown = () => {
    const {
      books: dataBooks,
      checkIns: dataCheckIns,
      excerpts,
      discussions,
    } = createBackupPayload()
    const content = buildMarkdownArchive(
      dataBooks,
      excerpts,
      dataCheckIns,
      discussions,
    )
    const filename = `all-about-book-archive-${formatDate(
      new Date(),
    )}.md`
    downloadFile(content, filename, 'text/markdown')
    setBackupStatus({
      type: 'success',
      message: 'Markdown 归档已生成。',
    })
  }

  const handleExportHtml = () => {
    const {
      books: dataBooks,
      checkIns: dataCheckIns,
      excerpts,
      discussions,
    } = createBackupPayload()
    const content = buildHtmlArchive(
      dataBooks,
      excerpts,
      dataCheckIns,
      discussions,
    )
    const filename = `all-about-book-archive-${formatDate(
      new Date(),
    )}.html`
    downloadFile(content, filename, 'text/html')
    setBackupStatus({
      type: 'success',
      message: 'HTML 归档已生成。',
    })
  }

  const handleImportBackup = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBackupStatus(null)

    try {
      const content = await file.text()
      const result = parseBackupPayload(content)
      if (!result.ok) {
        setBackupStatus({ type: 'error', message: result.message })
        return
      }

      const confirmMessage = `导入将覆盖现有数据（书籍 ${result.data.books.length} 本、书摘 ${result.data.excerpts.length} 条、打卡 ${result.data.checkIns.length} 条、讨论 ${result.data.discussions.length} 条），确定继续吗？`
      if (!window.confirm(confirmMessage)) return

      applyBackupPayload(result.data)
      refresh()
      setCheckIns(getReadingSessions())
      setBackupStatus({
        type: 'success',
        message: '备份导入成功，数据已恢复。',
      })
    } catch {
      setBackupStatus({
        type: 'error',
        message: '导入失败，请稍后重试。',
      })
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h2>仪表盘</h2>
          <p className="muted">
            记录你的阅读进度，管理你的书架。
          </p>
        </div>
        <Link className="button primary" to="/books">
          管理书籍
        </Link>
      </div>

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
              gridTemplateColumns: `repeat(${heatmapLayout.weekColumns}, 12px)`,
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
                  className={`heatmap-cell${
                    isActive ? ' active' : ''
                  }`}
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

      <div className="card stack">
        <div className="card-header">
          <h3>数据备份与归档</h3>
        </div>
        <p className="muted">
          导出 JSON 备份以便完整恢复，同时支持 Markdown/HTML
          归档便于查看与打印。
        </p>
        <div className="actions">
          <button className="button primary" onClick={handleExportBackup}>
            导出备份 (JSON)
          </button>
          <label className="button ghost">
            导入备份 (JSON)
            <input
              type="file"
              accept="application/json"
              onChange={handleImportBackup}
              hidden
            />
          </label>
          <button className="button" onClick={handleExportMarkdown}>
            导出归档 (Markdown)
          </button>
          <button className="button" onClick={handleExportHtml}>
            导出归档 (HTML)
          </button>
        </div>
        {backupStatus ? (
          <p className={`notice ${backupStatus.type}`}>
            {backupStatus.message}
          </p>
        ) : null}
      </div>
    </section>
  )
}

export default HomePage
