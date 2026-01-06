import type { Book } from '../types/book'

const STORAGE_KEY = 'all-about-book:books'

const safeParse = (raw: string | null): Book[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Book[]
    return Array.isArray(parsed) ? parsed : []
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
