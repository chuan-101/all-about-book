import { useEffect, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../lib/app-context'
import { useBooks } from '../lib/books-context'
import {
  applyBackupPayload,
  buildHtmlArchive,
  buildMarkdownArchive,
  createBackupPayload,
  parseBackupPayload,
} from '../lib/backup'
import { fetchCloudBackupPayload } from '../lib/cloudExport'
import { supabase } from '../lib/supabaseClient'
import ThemeToggle from './ThemeToggle'

type SettingsModalProps = {
  isOpen: boolean
  onClose: () => void
}

const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const navigate = useNavigate()
  const { refresh } = useBooks()
  const {
    dataSource,
    setDataSource,
    canUseCloud,
    isCloudMode,
    session,
    refreshCloud,
  } = useAppData()
  const [backupStatus, setBackupStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [backupLoading, setBackupLoading] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)
  const [migrationLoading, setMigrationLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSelectSource = (source: 'local' | 'cloud') => {
    if (source === 'cloud' && !session) {
      setDataSource('cloud')
      onClose()
      navigate('/login')
      return
    }
    setDataSource(source)
    onClose()
  }

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

  const exportCloudData = async () => {
    if (!session?.user) {
      setBackupStatus({
        type: 'error',
        message: '尚未登录，无法导出云端数据。',
      })
      return null
    }
    setBackupLoading(true)
    setBackupStatus(null)
    try {
      return await fetchCloudBackupPayload(session.user)
    } catch (error) {
      console.error(error)
      setBackupStatus({
        type: 'error',
        message: '云端数据导出失败，请稍后重试。',
      })
      return null
    } finally {
      setBackupLoading(false)
    }
  }

  const handleExportBackup = async () => {
    const payload = isCloudMode
      ? await exportCloudData()
      : createBackupPayload()
    if (!payload) return
    const filename = `all-about-book-backup-${formatDate(new Date())}.json`
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

  const handleExportMarkdown = async () => {
    const payload = isCloudMode
      ? await exportCloudData()
      : createBackupPayload()
    if (!payload) return
    const { books: dataBooks, checkIns: dataCheckIns, excerpts, discussions } =
      payload
    const archiveOptions = isCloudMode
      ? { summarizeCheckIns: true }
      : undefined
    const content = buildMarkdownArchive(
      dataBooks,
      excerpts,
      dataCheckIns,
      discussions,
      archiveOptions,
    )
    const filename = `all-about-book-archive-${formatDate(new Date())}.md`
    downloadFile(content, filename, 'text/markdown')
    setBackupStatus({
      type: 'success',
      message: 'Markdown 归档已生成。',
    })
  }

  const handleExportHtml = async () => {
    const payload = isCloudMode
      ? await exportCloudData()
      : createBackupPayload()
    if (!payload) return
    const { books: dataBooks, checkIns: dataCheckIns, excerpts, discussions } =
      payload
    const archiveOptions = isCloudMode
      ? { summarizeCheckIns: true }
      : undefined
    const content = buildHtmlArchive(
      dataBooks,
      excerpts,
      dataCheckIns,
      discussions,
      archiveOptions,
    )
    const filename = `all-about-book-archive-${formatDate(new Date())}.html`
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
          bookIdMap.get(sessionItem.bookId) ?? ensureUuid(sessionItem.bookId)
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
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <h3 id="settings-modal-title">设置</h3>
          <button type="button" className="button ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="settings-modal-body">
          <div className="settings-section">
            <div>
              <h4>数据源</h4>
              <p className="muted">切换当前数据的读取来源。</p>
            </div>
            <div className="data-source">
              <span className="muted">当前来源：</span>
              <button
                type="button"
                className={`chip${dataSource === 'local' ? '' : ' ghost'}`}
                onClick={() => handleSelectSource('local')}
              >
                本地
              </button>
              <button
                type="button"
                className={`chip${dataSource === 'cloud' ? '' : ' ghost'}`}
                onClick={() => handleSelectSource('cloud')}
                disabled={!canUseCloud}
              >
                云端
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div>
              <h4>主题外观</h4>
              <p className="muted">在这里切换应用主题。</p>
            </div>
            <div className="actions">
              <ThemeToggle />
            </div>
          </div>

          <div className="settings-section">
            <div>
              <h4>数据管理</h4>
              <p className="muted">
                导出 JSON 备份以便完整恢复，同时支持 Markdown/HTML
                归档便于查看与打印。
              </p>
            </div>
            <div className="actions">
              <button
                className="button primary"
                onClick={handleExportBackup}
                disabled={backupLoading}
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
                  disabled={isCloudMode || backupLoading}
                />
              </label>
              <button
                className="button"
                onClick={handleExportMarkdown}
                disabled={backupLoading}
              >
                导出归档 (Markdown)
              </button>
              <button
                className="button"
                onClick={handleExportHtml}
                disabled={backupLoading}
              >
                导出归档 (HTML)
              </button>
            </div>
            {backupLoading ? (
              <p className="notice info">正在导出云端数据，请稍候...</p>
            ) : null}
            {backupStatus ? (
              <p className={`notice ${backupStatus.type}`}>
                {backupStatus.message}
              </p>
            ) : null}
            {isCloudMode ? (
              <p className="notice info">云端模式下暂不支持导入备份。</p>
            ) : null}
            {session ? (
              <div className="settings-subsection">
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
            ) : (
              <p className="muted">登录后可使用云端迁移功能。</p>
            )}
          </div>

          <div className="settings-section">
            <div>
              <h4>App 信息</h4>
              <p className="muted">Designed by Syzygy & You.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
