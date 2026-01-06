import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { Book } from '../types/book'
import { deleteBook as deleteStoredBook, getBooks, upsertBook } from './storage'

type BooksContextValue = {
  books: Book[]
  upsert: (book: Book) => void
  remove: (id: string) => void
  getById: (id: string) => Book | undefined
}

const BooksContext = createContext<BooksContextValue | undefined>(undefined)

export function BooksProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<Book[]>(() => getBooks())

  const handleUpsert = useCallback((book: Book) => {
    upsertBook(book)
    setBooks(getBooks())
  }, [])

  const handleRemove = useCallback((id: string) => {
    deleteStoredBook(id)
    setBooks(getBooks())
  }, [])

  const getById = useCallback(
    (id: string) => books.find((book) => book.id === id),
    [books],
  )

  const value = useMemo(
    () => ({
      books,
      upsert: handleUpsert,
      remove: handleRemove,
      getById,
    }),
    [books, getById, handleRemove, handleUpsert],
  )

  return <BooksContext.Provider value={value}>{children}</BooksContext.Provider>
}

export const useBooks = (): BooksContextValue => {
  const context = useContext(BooksContext)
  if (!context) {
    throw new Error('useBooks must be used within a BooksProvider')
  }
  return context
}
