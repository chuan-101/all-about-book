import type { ReadingSession } from '../types/reading-session'

const STORAGE_KEY = 'all-about-book:reading-sessions'

const safeParse = (raw: string | null): ReadingSession[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ReadingSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const getReadingSessions = (): ReadingSession[] => {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

const saveReadingSessions = (sessions: ReadingSession[]): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export const getSessionsByBookId = (bookId: string): ReadingSession[] =>
  getReadingSessions().filter((session) => session.bookId === bookId)

export const getSessionsByDate = (date: string): ReadingSession[] =>
  getReadingSessions().filter((session) => session.date === date)

export const upsertReadingSession = (session: ReadingSession): void => {
  const sessions = getReadingSessions()
  const index = sessions.findIndex((item) => item.id === session.id)
  const next =
    index === -1
      ? [session, ...sessions]
      : sessions.map((item) => (item.id === session.id ? session : item))
  saveReadingSessions(next)
}

export const deleteReadingSession = (id: string): void => {
  const sessions = getReadingSessions().filter((session) => session.id !== id)
  saveReadingSessions(sessions)
}
