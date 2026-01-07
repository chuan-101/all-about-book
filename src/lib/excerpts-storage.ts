import type { Excerpt } from '../types/excerpt'

const STORAGE_KEY = 'all-about-book:excerpts'

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

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

const safeParse = (raw: string | null): Excerpt[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<Excerpt>[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((excerpt) => normalizeExcerpt(excerpt))
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
  getExcerpts()
    .filter((excerpt) => excerpt.bookId === bookId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime(),
    )

export const upsertExcerpt = (excerpt: Excerpt): void => {
  const excerpts = getExcerpts()
  const normalized = normalizeExcerpt(excerpt)
  const index = excerpts.findIndex((item) => item.id === normalized.id)
  const next =
    index === -1
      ? [normalized, ...excerpts]
      : excerpts.map((item) =>
          item.id === normalized.id ? normalized : item,
        )
  saveExcerpts(next)
}

export const updateExcerpt = (
  id: string,
  partial: Partial<Excerpt>,
): void => {
  const excerpts = getExcerpts()
  const index = excerpts.findIndex((item) => item.id === id)
  if (index === -1) return
  const current = excerpts[index]
  const nextExcerpt = normalizeExcerpt({
    ...current,
    ...partial,
    id: current.id,
    bookId: current.bookId,
    updatedAt: new Date().toISOString(),
  })
  const next = excerpts.map((item) =>
    item.id === id ? nextExcerpt : item,
  )
  saveExcerpts(next)
}

export const deleteExcerpt = (id: string): void => {
  const excerpts = getExcerpts().filter((excerpt) => excerpt.id !== id)
  saveExcerpts(excerpts)
}
