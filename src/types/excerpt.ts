export interface Excerpt {
  id: string
  bookId: string
  content: string
  /** Cloud only: owning chapter; null/undefined = 未分章 */
  chapterId?: string | null
  /** Cloud only: denormalized chapter title snapshot (kept in sync on write) */
  chapter?: string
  createdAt: string
  updatedAt?: string
}
