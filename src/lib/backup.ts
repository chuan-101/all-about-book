import type { Book, BookProgress } from '../types/book'
import type { DiscussionMessage } from '../types/discussion'
import type { Excerpt } from '../types/excerpt'
import type { ReadingSession } from '../types/reading-session'
import { getDiscussions, saveDiscussions } from './discussion-storage'
import { getExcerpts, saveExcerpts } from './excerpts-storage'
import { getReadingSessions, saveReadingSessions } from './reading-sessions-storage'
import { getBooks, saveBooks } from './storage'

const BACKUP_VERSION = '1.0'

type BackupMeta = {
  version: string
  exportedAt: string
}

export type BackupPayload = {
  meta: BackupMeta
  books: Book[]
  checkIns: ReadingSession[]
  excerpts: Excerpt[]
  discussions: DiscussionMessage[]
}

type ParseResult =
  | { ok: true; data: BackupPayload }
  | { ok: false; message: string }

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const normalizeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && !Number.isNaN(value) ? value : undefined

const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const normalizeProgress = (value: unknown): BookProgress | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const kind = record.kind
  const normalizedKind =
    kind === 'page' || kind === 'percent' || kind === 'chapter'
      ? kind
      : undefined
  const normalizedValue = normalizeNumber(record.value)
  if (!normalizedKind || normalizedValue === undefined) return undefined
  return {
    kind: normalizedKind,
    value: normalizedValue,
  }
}

const normalizeBook = (book: Partial<Book>): Book => {
  const now = new Date().toISOString()
  const status =
    book.status === 'reading' ||
    book.status === 'finished' ||
    book.status === 'paused' ||
    book.status === 'unread'
      ? book.status
      : 'unread'
  const rating = normalizeNumber(book.rating)

  return {
    id: normalizeString(book.id) || crypto.randomUUID(),
    title: normalizeString(book.title),
    author: normalizeString(book.author),
    translator: normalizeString(book.translator),
    genre: normalizeString(book.genre),
    status,
    cover: normalizeString(book.cover),
    createdAt:
      typeof book.createdAt === 'string' && book.createdAt
        ? book.createdAt
        : now,
    updatedAt:
      typeof book.updatedAt === 'string' && book.updatedAt
        ? book.updatedAt
        : now,
    progress: normalizeProgress(book.progress),
    startDate: normalizeString(book.startDate),
    endDate: normalizeString(book.endDate),
    rating,
    notes: normalizeString(book.notes),
  }
}

const normalizeExcerpt = (excerpt: Partial<Excerpt>): Excerpt => {
  const now = new Date().toISOString()
  const createdAt =
    typeof excerpt.createdAt === 'string' && excerpt.createdAt
      ? excerpt.createdAt
      : now
  const updatedAt =
    typeof excerpt.updatedAt === 'string' && excerpt.updatedAt
      ? excerpt.updatedAt
      : undefined

  return {
    id: normalizeString(excerpt.id) || crypto.randomUUID(),
    bookId: normalizeString(excerpt.bookId),
    content: normalizeString(excerpt.content),
    createdAt,
    updatedAt,
  }
}

const normalizeReadingSession = (
  session: Partial<ReadingSession>,
): ReadingSession => {
  const now = new Date().toISOString()
  const createdAt =
    typeof session.createdAt === 'string' && session.createdAt
      ? session.createdAt
      : now
  const date =
    typeof session.date === 'string' && session.date
      ? session.date
      : formatDate(new Date(createdAt))

  return {
    id: normalizeString(session.id) || crypto.randomUUID(),
    bookId: normalizeString(session.bookId),
    date,
    pagesRead: normalizeNumber(session.pagesRead),
    chaptersRead: normalizeNumber(session.chaptersRead),
    comment: normalizeString(session.comment),
    createdAt,
  }
}

const normalizeDiscussion = (
  message: Partial<DiscussionMessage>,
): DiscussionMessage => {
  const now = new Date().toISOString()
  const createdAt =
    typeof message.createdAt === 'string' && message.createdAt
      ? message.createdAt
      : now

  return {
    id: normalizeString(message.id) || crypto.randomUUID(),
    bookId: normalizeString(message.bookId),
    role:
      message.role === 'me' || message.role === 'syzygy'
        ? message.role
        : 'me',
    content: normalizeString(message.content),
    createdAt,
  }
}

const normalizeBooks = (value: unknown): Book[] =>
  Array.isArray(value) ? value.map((item) => normalizeBook(item)) : []

const normalizeExcerpts = (value: unknown): Excerpt[] =>
  Array.isArray(value) ? value.map((item) => normalizeExcerpt(item)) : []

const normalizeCheckIns = (value: unknown): ReadingSession[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeReadingSession(item))
    : []

const normalizeDiscussions = (value: unknown): DiscussionMessage[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeDiscussion(item))
    : []

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const createBackupPayload = (): BackupPayload => ({
  meta: {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
  },
  books: normalizeBooks(getBooks()),
  checkIns: normalizeCheckIns(getReadingSessions()),
  excerpts: normalizeExcerpts(getExcerpts()),
  discussions: normalizeDiscussions(getDiscussions()),
})

export const parseBackupPayload = (raw: string): ParseResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      message: '无法解析备份文件，请确认文件为 JSON 格式。',
    }
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      message: '备份文件格式不正确，请选择正确的备份文件。',
    }
  }

  const meta = isRecord(parsed.meta) ? parsed.meta : null
  if (
    meta &&
    typeof meta.version === 'string' &&
    meta.version !== BACKUP_VERSION
  ) {
    return {
      ok: false,
      message: `备份版本不兼容（${meta.version}），请使用当前版本导出的文件。`,
    }
  }

  const checkInsSource =
    parsed.checkIns ?? parsed.readingSessions ?? parsed['reading-sessions']

  if (
    !Array.isArray(parsed.books) &&
    !Array.isArray(checkInsSource) &&
    !Array.isArray(parsed.excerpts)
  ) {
    return {
      ok: false,
      message: '备份文件缺少数据内容，请确认文件是否完整。',
    }
  }

  return {
    ok: true,
    data: {
      meta: {
        version: BACKUP_VERSION,
        exportedAt:
          meta && typeof meta.exportedAt === 'string' && meta.exportedAt
            ? meta.exportedAt
            : new Date().toISOString(),
      },
      books: normalizeBooks(parsed.books),
      checkIns: normalizeCheckIns(checkInsSource),
      excerpts: normalizeExcerpts(parsed.excerpts),
      discussions: normalizeDiscussions(parsed.discussions),
    },
  }
}

export const applyBackupPayload = (payload: BackupPayload): void => {
  saveBooks(payload.books)
  saveReadingSessions(payload.checkIns)
  saveExcerpts(payload.excerpts)
  saveDiscussions(payload.discussions)
}

const statusLabels: Record<Book['status'], string> = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
}

const discussionRoleLabels: Record<DiscussionMessage['role'], string> = {
  me: '我',
  syzygy: 'Syzygy',
}

const formatExcerptDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hour}:${minute}`
}

const formatCheckInDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDate(date)
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const buildBookMeta = (book: Book): string[] => {
  const meta: string[] = [`状态：${statusLabels[book.status]}`]
  if (book.genre) meta.push(`类型：${book.genre}`)
  if (book.translator) meta.push(`译者：${book.translator}`)
  if (book.startDate) meta.push(`开始日期：${book.startDate}`)
  if (book.endDate) meta.push(`结束日期：${book.endDate}`)
  return meta
}

export const buildMarkdownArchive = (
  books: Book[],
  excerpts: Excerpt[],
  checkIns: ReadingSession[],
  discussions: DiscussionMessage[],
): string => {
  const lines: string[] = ['# All About Book · 书摘归档', '']

  books.forEach((book) => {
    lines.push(`## 《${book.title || '未命名'}》 - ${book.author || '作者未知'}`)
    lines.push(`- ${buildBookMeta(book).join(' ｜ ')}`)
    if (book.cover) {
      lines.push(`- 封面链接：${book.cover}`)
    }

    const bookExcerpts = excerpts
      .filter((excerpt) => excerpt.bookId === book.id)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime(),
      )

    lines.push('### 书摘')
    if (bookExcerpts.length === 0) {
      lines.push('- 无')
    } else {
      bookExcerpts.forEach((excerpt) => {
        const content = excerpt.content.replace(/\s+/g, ' ').trim()
        lines.push(
          `- [${formatExcerptDate(excerpt.createdAt)}] ${content}`,
        )
      })
    }

      const bookCheckIns = checkIns
        .filter((session) => session.bookId === book.id)
        .sort(
          (a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime(),
        )
      const bookDiscussions = discussions
        .filter((message) => message.bookId === book.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime(),
        )

    const bookDiscussions = discussions
      .filter((message) => message.bookId === book.id)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime(),
      )

    const bookDiscussions = discussions
      .filter((message) => message.bookId === book.id)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime(),
      )

    lines.push('### 打卡')
    if (bookCheckIns.length === 0) {
      lines.push('- 无')
    } else {
      bookCheckIns.forEach((session) => {
        lines.push(`- ${formatCheckInDate(session.date)}`)
      })
    }

    lines.push('### 讨论')
    if (bookDiscussions.length === 0) {
      lines.push('- 无')
    } else {
      bookDiscussions.forEach((message: DiscussionMessage) => {
        const content = message.content.replace(/\s+/g, ' ').trim()
        lines.push(
          `- [${formatExcerptDate(message.createdAt)}] ${
            discussionRoleLabels[message.role]
          }：${content}`,
        )
      })
    }

    lines.push('')
  })

  return lines.join('\n')
}

export const buildHtmlArchive = (
  books: Book[],
  excerpts: Excerpt[],
  checkIns: ReadingSession[],
  discussions: DiscussionMessage[],
): string => {
  const sections = books
    .map((book) => {
      const bookExcerpts = excerpts
        .filter((excerpt) => excerpt.bookId === book.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime(),
        )
      const bookCheckIns = checkIns
        .filter((session) => session.bookId === book.id)
        .sort(
          (a, b) =>
            new Date(a.date).getTime() -
            new Date(b.date).getTime(),
        )
      const bookDiscussions = discussions
        .filter((message) => message.bookId === book.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime(),
        )

      const metaItems = buildBookMeta(book)
        .map((item) => `<span>${escapeHtml(item)}</span>`)
        .join('')

      const excerptItems =
        bookExcerpts.length === 0
          ? '<li>无</li>'
          : bookExcerpts
              .map(
                (excerpt) =>
                  `<li><strong>${escapeHtml(
                    formatExcerptDate(excerpt.createdAt),
                  )}</strong> ${escapeHtml(excerpt.content)}</li>`,
              )
              .join('')

      const checkInItems =
        bookCheckIns.length === 0
          ? '<li>无</li>'
          : bookCheckIns
              .map(
                (session) =>
                  `<li>${escapeHtml(
                    formatCheckInDate(session.date),
                  )}</li>`,
              )
              .join('')

      const discussionItems =
        bookDiscussions.length === 0
          ? '<li>无</li>'
          : bookDiscussions
              .map(
                (message: DiscussionMessage) =>
                  `<li><strong>${escapeHtml(
                    formatExcerptDate(message.createdAt),
                  )}</strong> ${escapeHtml(
                    discussionRoleLabels[message.role],
                  )}：${escapeHtml(message.content)}</li>`,
              )
              .join('')

      return `<section class="book">
  <h2>《${escapeHtml(book.title || '未命名')}》 - ${escapeHtml(
        book.author || '作者未知',
      )}</h2>
  <div class="meta">${metaItems}</div>
  ${
    book.cover
      ? `<p class="cover-link">封面链接：${escapeHtml(book.cover)}</p>`
      : ''
  }
  <h3>书摘</h3>
  <ul>${excerptItems}</ul>
  <h3>打卡</h3>
  <ul>${checkInItems}</ul>
  <h3>讨论</h3>
  <ul>${discussionItems}</ul>
</section>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>All About Book · 书摘归档</title>
<style>
  body {
    font-family: "Noto Serif SC", "Songti SC", serif;
    font-size: 16px;
    line-height: 1.7;
    color: #1d232f;
    margin: 0;
    background: #f6f4ef;
  }
  .page {
    max-width: 860px;
    margin: 32px auto;
    padding: 40px 48px;
    background: #ffffff;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
  }
  h1 {
    font-size: 28px;
    margin-bottom: 24px;
  }
  h2 {
    font-size: 22px;
    margin-top: 32px;
  }
  h3 {
    font-size: 18px;
    margin-top: 20px;
  }
  ul {
    padding-left: 20px;
  }
  li {
    margin-bottom: 8px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    color: #475467;
    font-size: 14px;
  }
  .cover-link {
    font-size: 14px;
    color: #475467;
  }
  .book {
    padding-bottom: 24px;
    border-bottom: 1px solid #e4e7ec;
  }
  .book:last-child {
    border-bottom: none;
  }
</style>
</head>
<body>
  <div class="page">
    <h1>All About Book · 书摘归档</h1>
    ${sections || '<p>暂无数据</p>'}
  </div>
</body>
</html>`
}
