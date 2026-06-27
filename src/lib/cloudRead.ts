import type { User } from '@supabase/supabase-js'
import type { Book } from '../types/book'
import type { Conversation, DiscussionMessage } from '../types/discussion'
import type { Excerpt } from '../types/excerpt'
import type {
  AnsweredBy,
  BookAnswer,
  BookQuestion,
  QuestionStatus,
} from '../types/question'
import type { ReadingSession } from '../types/reading-session'
import type { ExcerptResonance } from '../types/resonance'
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

const normalizeResonance = (row: SupabaseRow): ExcerptResonance => {
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) ||
    new Date().toISOString()
  return {
    id: asString(row.id),
    excerptId: asString(row.excerpt_id ?? row.excerptId),
    bookId: asString(row.book_id ?? row.bookId),
    speaker: asString(row.speaker),
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
    conversationId: asString(row.conversation_id ?? row.conversationId),
    role: row.role === 'syzygy' ? 'syzygy' : 'me',
    content: asString(row.content),
    createdAt,
    metadata: asMetadata(row.metadata),
  }
}

const normalizeQuestion = (row: SupabaseRow): BookQuestion => {
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) ||
    new Date().toISOString()
  const status: QuestionStatus =
    row.status === 'answered' ? 'answered' : 'open'
  return {
    id: asString(row.id),
    bookId: asString(row.book_id ?? row.bookId),
    chapter: asOptionalString(row.chapter),
    question: asString(row.question),
    status,
    createdAt,
    updatedAt: asOptionalString(row.updated_at ?? row.updatedAt),
  }
}

const ANSWERED_BY_VALUES: AnsweredBy[] = [
  'chuanchuan',
  'syzygy-claude',
  'syzygy-gpt',
  'cli_reading_assist',
]

const normalizeAnswer = (row: SupabaseRow): BookAnswer => {
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) ||
    new Date().toISOString()
  const rawAnsweredBy = asString(row.answered_by ?? row.answeredBy)
  const answeredBy = ANSWERED_BY_VALUES.includes(rawAnsweredBy as AnsweredBy)
    ? (rawAnsweredBy as AnsweredBy)
    : 'chuanchuan'
  return {
    id: asString(row.id),
    questionId: asString(row.question_id ?? row.questionId),
    answer: asString(row.answer),
    answeredBy,
    createdAt,
  }
}

const normalizeConversation = (row: SupabaseRow): Conversation => {
  const createdAt =
    asString(row.created_at) || asString(row.createdAt) ||
    new Date().toISOString()
  const updatedAt =
    asString(row.updated_at) || asString(row.updatedAt) || createdAt
  return {
    id: asString(row.id),
    bookId: asString(row.book_id ?? row.bookId),
    title: asString(row.title),
    createdAt,
    updatedAt,
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

export const fetchResonancesByBookId = async (
  user: User,
  bookId: string,
): Promise<ExcerptResonance[]> => {
  const client = ensureClient()
  if (!bookId) return []
  const { data, error } = await client
    .from('excerpt_resonances')
    .select('*')
    .eq('user_id', user.id)
    .eq('book_id', bookId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeResonance(row as SupabaseRow))
}

export const fetchDiscussions = async (
  user: User,
): Promise<DiscussionMessage[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('discussions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeDiscussion(row as SupabaseRow))
}

export const fetchConversations = async (
  user: User,
): Promise<Conversation[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) =>
    normalizeConversation(row as SupabaseRow),
  )
}

export const fetchDiscussionsByBookId = async (
  user: User,
  bookId: string,
  conversationId?: string | null,
): Promise<DiscussionMessage[]> => {
  const client = ensureClient()
  let query = client
    .from('discussions')
    .select('*')
    .eq('user_id', user.id)
    .eq('book_id', bookId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (conversationId) {
    query = query.eq('conversation_id', conversationId)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeDiscussion(row as SupabaseRow))
}

export const fetchConversationsByBookId = async (
  user: User,
  bookId: string,
): Promise<Conversation[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .eq('book_id', bookId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) =>
    normalizeConversation(row as SupabaseRow),
  )
}

export const fetchQuestionsByBookId = async (
  user: User,
  bookId: string,
): Promise<BookQuestion[]> => {
  const client = ensureClient()
  const { data, error } = await client
    .from('book_questions')
    .select('*')
    .eq('user_id', user.id)
    .eq('book_id', bookId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeQuestion(row as SupabaseRow))
}

export const fetchAnswersByQuestionIds = async (
  questionIds: string[],
): Promise<BookAnswer[]> => {
  if (questionIds.length === 0) return []
  const client = ensureClient()
  const { data, error } = await client
    .from('book_answers')
    .select('*')
    .in('question_id', questionIds)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => normalizeAnswer(row as SupabaseRow))
}
