import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../lib/app-context'
import { useBooks } from '../lib/books-context'
import {
  applyBackupPayload,
  buildHtmlArchive,
  buildMarkdownArchive,
  createBackupPayload,
  parseBackupPayload,
} from '../lib/backup'
import { supabase } from '../lib/supabaseClient'
import { getReadingSessions } from '../lib/reading-sessions-storage'
import type { ReadingSession } from '../types/reading-session'

const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function HomePage() {
  const { books: localBooks, refresh } = useBooks()
  const {
    isCloudMode,
    cloudBooks,
    cloudCheckIns,
    cloudLoading,
    session,
    refreshCloud,
  } = useAppData()
  const books = isCloudMode ? cloudBooks : localBooks
  const totalBooks = books.length
  const readingBooks = books.filter((book) => book.status === 'reading')
  const finishedBooks = books.filter((book) => book.status === 'finished')
  const [checkIns, setCheckIns] = useState<ReadingSession[]>([])
  const [backupStatus, setBackupStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [migrationStatus, setMigrationStatus] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)
  const [migrationLoading, setMigrationLoading] = useState(false)
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
    if (isCloudMode) {
      setBackupStatus({
        type: 'error',
        message: '云端模式下暂不支持备份导出。',
      })
      return
    }

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
    if (isCloudMode) {
      setBackupStatus({
        type: 'error',
        message: '云端模式下暂不支持归档导出。',
      })
      return
    }

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
    if (isCloudMode) {
      setBackupStatus({
        type: 'error',
        message: '云端模式下暂不支持归档导出。',
      })
      return
    }

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
    if (isCloudMode) {
      setBackupStatus({
        type: 'error',
        message: '云端模式下暂不支持导入备份。',
      })
      event.target.value = ''
      return
    }

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

  const handleMigrateToCloud = async () => {
    if (!supabase || !session?.user) {
      setMigrationStatus({
        type: 'error',
        message: '尚未登录或云端服务不可用，无法执行迁移。',
      })
      return
    }

    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    const ensureUuid = (value?: string) =>
      value && isUuid(value) ? value : crypto.randomUUID()
    const sanitizeDate = (value?: string | null) => {
      if (!value || value.trim() === '') return null
      return value.length >= 10 ? value.slice(0, 10) : value
    }
    const sanitizeTimestamp = (value?: string | null) => {
      if (!value || value.trim() === '') return null
      return value
    }
    const payload = createBackupPayload()
    const confirmMessage = `即将迁移本地数据到云端（书籍 ${payload.books.length} 本、书摘 ${payload.excerpts.length} 条、打卡 ${payload.checkIns.length} 条、讨论 ${payload.discussions.length} 条），确定继续吗？`
    if (!window.confirm(confirmMessage)) return

    setMigrationLoading(true)
    setMigrationStatus({ type: 'info', message: '正在迁移，请稍候...' })

    try {
      const userId = session.user.id
      const bookIdMap = new Map<string, string>()
      const booksPayload = payload.books.map((book) => {
        const normalizedBookId = ensureUuid(book.id)
        if (normalizedBookId !== book.id) {
          bookIdMap.set(book.id, normalizedBookId)
        }
        return {
          id: normalizedBookId,
          user_id: userId,
          title: book.title,
          author: book.author,
          translator: book.translator,
          genre: book.genre,
          status: book.status,
          cover_url: book.cover ?? null,
          created_at: sanitizeTimestamp(book.createdAt),
          updated_at: sanitizeTimestamp(book.updatedAt),
          start_date: sanitizeDate(book.startDate),
          end_date: sanitizeDate(book.endDate),
          rating: book.rating ?? null,
          notes: book.notes ?? null,
        }
      })
      const checkInsPayload = payload.checkIns.map((sessionItem) => {
        const normalizedBookId =
          bookIdMap.get(sessionItem.bookId) ??
          ensureUuid(sessionItem.bookId)
        return {
          id: ensureUuid(sessionItem.id),
          user_id: userId,
          book_id: normalizedBookId,
          date: sanitizeDate(sessionItem.date),
          created_at: sanitizeTimestamp(sessionItem.createdAt),
        }
      })
      const excerptsPayload = payload.excerpts.map((excerpt) => {
        const normalizedBookId =
          bookIdMap.get(excerpt.bookId) ?? ensureUuid(excerpt.bookId)
        return {
          id: ensureUuid(excerpt.id),
          user_id: userId,
          book_id: normalizedBookId,
          content: excerpt.content,
          created_at: sanitizeTimestamp(excerpt.createdAt),
          updated_at: sanitizeTimestamp(excerpt.updatedAt),
        }
      })
      const discussionsPayload = payload.discussions.map((message) => {
        const normalizedBookId =
          bookIdMap.get(message.bookId) ?? ensureUuid(message.bookId)
        return {
          id: ensureUuid(message.id),
          user_id: userId,
          book_id: normalizedBookId,
          role: message.role,
          content: message.content,
          created_at: sanitizeTimestamp(message.createdAt),
        }
      })

      const reportMigrationError = (table: string, error: unknown) => {
        console.error(error)
        const supabaseError = error as {
          code?: string
          message?: string
          details?: string
        }
        const code = supabaseError?.code ?? 'unknown'
        const message = supabaseError?.message ?? 'unknown error'
        const details = supabaseError?.details ?? 'no details'
        setMigrationStatus({
          type: 'error',
          message: `迁移失败（${table}）：${code} ${message} ${details}`,
        })
      }

      if (booksPayload.length > 0) {
        try {
          const { error } = await supabase
            .from('books')
            .upsert(booksPayload, { onConflict: 'id' })
          if (error) throw error
        } catch (error) {
          reportMigrationError('books', error)
          return
        }
      }

      if (checkInsPayload.length > 0) {
        try {
          const { error } = await supabase
            .from('check_ins')
            .upsert(checkInsPayload, {
              onConflict: 'user_id,book_id,date',
            })
          if (error) throw error
        } catch (error) {
          reportMigrationError('check_ins', error)
          return
        }
      }

      if (excerptsPayload.length > 0) {
        try {
          const { error } = await supabase
            .from('excerpts')
            .upsert(excerptsPayload, { onConflict: 'id' })
          if (error) throw error
        } catch (error) {
          reportMigrationError('excerpts', error)
          return
        }
      }

      if (discussionsPayload.length > 0) {
        try {
          const { error } = await supabase
            .from('discussions')
            .upsert(discussionsPayload, { onConflict: 'id' })
          if (error) throw error
        } catch (error) {
          reportMigrationError('discussions', error)
          return
        }
      }

      await refresh()
      await refreshCloud()
      setMigrationStatus({ type: 'success', message: '迁移完成。' })
    } catch {
      setMigrationStatus({
        type: 'error',
        message: '迁移失败，请稍后重试。',
      })
    } finally {
      setMigrationLoading(false)
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
          <p className="muted">
            当前数据来源：{isCloudMode ? '云端' : '本地'}。
          </p>
          {isCloudMode && cloudLoading ? (
            <p className="notice info">云端数据加载中...</p>
          ) : null}
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

      <div className="card stack">
        <div className="card-header">
          <h3>数据备份与归档</h3>
        </div>
        <p className="muted">
          导出 JSON 备份以便完整恢复，同时支持 Markdown/HTML
          归档便于查看与打印。
        </p>
        <div className="actions">
          <button
            className="button primary"
            onClick={handleExportBackup}
            disabled={isCloudMode}
          >
            导出备份 (JSON)
          </button>
          <label className="button ghost">
            导入备份 (JSON)
            <input
              type="file"
              accept="application/json"
              onChange={handleImportBackup}
              hidden
              disabled={isCloudMode}
            />
          </label>
          <button
            className="button"
            onClick={handleExportMarkdown}
            disabled={isCloudMode}
          >
            导出归档 (Markdown)
          </button>
          <button
            className="button"
            onClick={handleExportHtml}
            disabled={isCloudMode}
          >
            导出归档 (HTML)
          </button>
        </div>
        {backupStatus ? (
          <p className={`notice ${backupStatus.type}`}>
            {backupStatus.message}
          </p>
        ) : null}
        {isCloudMode ? (
          <p className="notice info">云端模式下暂不支持备份与导入。</p>
        ) : null}
      </div>

      {session ? (
        <div className="card stack">
          <div className="card-header">
            <h3>云端迁移</h3>
          </div>
          <p className="muted">
            将本地数据同步到云端一次性保存，避免重复导入。
          </p>
          <button
            className="button primary"
            type="button"
            onClick={handleMigrateToCloud}
            disabled={migrationLoading}
          >
            {migrationLoading
              ? '正在迁移...'
              : '一键迁移本地数据到云端'}
          </button>
          {migrationStatus ? (
            <p className={`notice ${migrationStatus.type}`}>
              {migrationStatus.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default HomePage
