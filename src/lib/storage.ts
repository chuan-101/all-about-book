import type { Book } from '../types/book'

const STORAGE_KEY = 'all-about-book:books'

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const normalizeBook = (book: Partial<Book>): Book => {
  const now = new Date().toISOString()
  const status =
    book.status === 'reading' ||
    book.status === 'finished' ||
    book.status === 'paused' ||
    book.status === 'unread'
      ? book.status
      : 'unread'

  const rating =
    typeof book.rating === 'number' && !Number.isNaN(book.rating)
      ? book.rating
      : undefined

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
    progress: book.progress,
    startDate: normalizeString(book.startDate),
    endDate: normalizeString(book.endDate),
    rating,
    notes: normalizeString(book.notes),
  }
}

const safeParse = (raw: string | null): Book[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<Book>[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((book) => normalizeBook(book))
  } catch {
    return []
  }
}

export const getBooks = (): Book[] => {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export const saveBooks = (books: Book[]): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
}

export const upsertBook = (book: Book): void => {
  const books = getBooks()
  const index = books.findIndex((item) => item.id === book.id)
  const next =
    index === -1
      ? [book, ...books]
      : books.map((item) => (item.id === book.id ? book : item))
  saveBooks(next)
}

export const deleteBook = (id: string): void => {
  const books = getBooks().filter((book) => book.id !== id)
  saveBooks(books)
}
