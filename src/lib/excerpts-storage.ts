import type { Excerpt } from '../types/excerpt'

const STORAGE_KEY = 'all-about-book:excerpts'

const safeParse = (raw: string | null): Excerpt[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Excerpt[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const getExcerpts = (): Excerpt[] => {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

const saveExcerpts = (excerpts: Excerpt[]): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(excerpts))
}

export const getExcerptsByBookId = (bookId: string): Excerpt[] =>
  getExcerpts().filter((excerpt) => excerpt.bookId === bookId)

export const upsertExcerpt = (excerpt: Excerpt): void => {
  const excerpts = getExcerpts()
  const index = excerpts.findIndex((item) => item.id === excerpt.id)
  const next =
    index === -1
      ? [excerpt, ...excerpts]
      : excerpts.map((item) => (item.id === excerpt.id ? excerpt : item))
  saveExcerpts(next)
}

export const deleteExcerpt = (id: string): void => {
  const excerpts = getExcerpts().filter((excerpt) => excerpt.id !== id)
  saveExcerpts(excerpts)
}
