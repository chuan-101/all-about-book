import type { User } from '@supabase/supabase-js'
import type { Book } from '../types/book'
import type { DiscussionMessage } from '../types/discussion'
import type { Excerpt } from '../types/excerpt'
import type { ReadingSession } from '../types/reading-session'
import { supabase } from './supabaseClient'

type SupabaseRow = Record<string, unknown>

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && !Number.isNaN(value) ? value : undefined

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

const asMetadata = (
  value: unknown,
): { model?: string; temperature?: number } | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const model = asOptionalString(record.model)
  const temperature = asNumber(record.temperature)
  if (!model && typeof temperature !== 'number') {
    return undefined
  }
  return {
    model,
    temperature,
  }
}

const asProgress = (value: unknown): Book['progress'] => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const kind = record.kind
  const amount = record.value
  if (
    (kind !== 'page' && kind !== 'percent' && kind !== 'chapter') ||
    typeof amount !== 'number'
  ) {
    return undefined
  }
  return { kind, value: amount }
}

const normalizeBook = (row: SupabaseRow): Book => {
  const now = new Date().toISOString()
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) || now
  const updatedAt =
    asString(row.updated_at) || asString(row.updatedAt) || createdAt
  const status =
    row.status === 'reading' ||
    row.status === 'finished' ||
    row.status === 'paused' ||
    row.status === 'unread'
      ? row.status
      : 'unread'

  return {
    id: asString(row.id),
    title: asString(row.title),
    author: asString(row.author),
    translator: asString(row.translator),
    genre: asString(row.genre),
    status,
    cover: asString(row.cover_url ?? row.cover),
    createdAt,
    updatedAt,
    progress: asProgress(row.progress),
    startDate: asOptionalString(row.start_date ?? row.startDate),
    endDate: asOptionalString(row.end_date ?? row.endDate),
    rating: asNumber(row.rating),
    notes: asOptionalString(row.notes),
  }
}

const normalizeCheckIn = (row: SupabaseRow): ReadingSession => {
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) ||
    new Date().toISOString()
  return {
    id: asString(row.id),
    bookId: asString(row.book_id ?? row.bookId),
    date: asString(row.date),
    pagesRead: asNumber(row.pages_read ?? row.pagesRead),
    chaptersRead: asNumber(row.chapters_read ?? row.chaptersRead),
    comment: asOptionalString(row.comment),
    createdAt,
  }
}

const normalizeExcerpt = (row: SupabaseRow): Excerpt => {
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) ||
    new Date().toISOString()
  return {
    id: asString(row.id),
    bookId: asString(row.book_id ?? row.bookId),
    content: asString(row.content),
    createdAt,
    updatedAt: asOptionalString(row.updated_at ?? row.updatedAt),
  }
}

const normalizeDiscussion = (row: SupabaseRow): DiscussionMessage => {
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) ||
    new Date().toISOString()
  return {
    id: asString(row.id),
    bookId: asString(row.book_id ?? row.bookId),
    role: row.role === 'syzygy' ? 'syzygy' : 'me',
    content: asString(row.content),
    createdAt,
    metadata: asMetadata(row.metadata),
  }
}

const ensureClient = () => {
  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }
  return supabase
}

export const fetchBooks = async (_user: User): Promise<Book[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('books')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeBook(row as SupabaseRow))
}

export const fetchCheckIns = async (_user: User): Promise<ReadingSession[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('check_ins')
    .select('*')
    .order('date', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeCheckIn(row as SupabaseRow))
}

export const fetchExcerpts = async (_user: User): Promise<Excerpt[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('excerpts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeExcerpt(row as SupabaseRow))
}

export const fetchDiscussions = async (
  _user: User,
): Promise<DiscussionMessage[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('discussions')
    .select('*')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeDiscussion(row as SupabaseRow))
}
