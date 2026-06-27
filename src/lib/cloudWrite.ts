import type { Book } from '../types/book'
import type { Excerpt } from '../types/excerpt'
import type { AnsweredBy, QuestionStatus } from '../types/question'
import { supabase } from './supabaseClient'

const ensureClient = () => {
  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }
  return supabase
}

const sanitizeDate = (value?: string | null) => {
  if (!value || value.trim() === '') return null
  return value.length >= 10 ? value.slice(0, 10) : value
}

const sanitizeTimestamp = (value?: string | null) => {
  if (!value || value.trim() === '') return null
  return value
}

const normalizeRating = (value?: number) =>
  typeof value === 'number' && !Number.isNaN(value) ? value : null

export const upsertCloudBook = async (
  userId: string,
  book: Book,
): Promise<void> => {
  const client = ensureClient()
  const now = new Date().toISOString()
  const payload = {
    id: book.id,
    user_id: userId,
    title: book.title,
    author: book.author,
    translator: book.translator,
    genre: book.genre,
    status: book.status,
    cover_url: book.cover || null,
    created_at: sanitizeTimestamp(book.createdAt) ?? now,
    updated_at: sanitizeTimestamp(book.updatedAt) ?? now,
    start_date: sanitizeDate(book.startDate),
    end_date: sanitizeDate(book.endDate),
    rating: normalizeRating(book.rating),
    notes: book.notes || null,
  }

  const { error } = await client
    .from('books')
    .upsert(payload, { onConflict: 'id' })

  if (error) {
    throw error
  }
}

export const deleteCloudBook = async (
  userId: string,
  bookId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('books')
    .delete()
    .eq('user_id', userId)
    .eq('id', bookId)

  if (error) {
    throw error
  }
}

export const toggleCloudCheckIn = async (
  userId: string,
  bookId: string,
  date: string,
  hasExisting: boolean,
): Promise<void> => {
  const client = ensureClient()
  if (hasExisting) {
    const { error } = await client
      .from('check_ins')
      .delete()
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .eq('date', date)
    if (error) {
      throw error
    }
    return
  }

  const { error } = await client.from('check_ins').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    book_id: bookId,
    date: sanitizeDate(date),
    created_at: new Date().toISOString(),
  })

  if (error) {
    throw error
  }
}

export const createCloudExcerpt = async (
  userId: string,
  bookId: string,
  content: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client.from('excerpts').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    book_id: bookId,
    content,
    created_at: new Date().toISOString(),
  })

  if (error) {
    throw error
  }
}

export const updateCloudExcerpt = async (
  userId: string,
  excerpt: Excerpt,
  content: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('excerpts')
    .update({
      content,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', excerpt.id)

  if (error) {
    throw error
  }
}

export const deleteCloudExcerpt = async (
  userId: string,
  excerptId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('excerpts')
    .delete()
    .eq('user_id', userId)
    .eq('id', excerptId)

  if (error) {
    throw error
  }
}

export const createCloudResonance = async (
  userId: string,
  excerptId: string,
  bookId: string,
  speaker: string,
  content: string,
): Promise<void> => {
  const client = ensureClient()
  if (!excerptId) {
    throw new Error('Missing excerptId for resonance insert.')
  }
  const { error } = await client.from('excerpt_resonances').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    excerpt_id: excerptId,
    book_id: bookId || null,
    speaker,
    content,
  })

  if (error) {
    throw error
  }
}

export const createCloudDiscussion = async (
  userId: string,
  bookId: string,
  conversationId: string,
  content: string,
): Promise<void> => {
  const client = ensureClient()
  if (!bookId) {
    throw new Error('Missing bookId for discussion insert.')
  }
  const { error } = await client.from('discussions').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    book_id: bookId,
    conversation_id: conversationId,
    role: 'me',
    content,
  })

  if (error) {
    throw error
  }
}

export const createCloudDiscussionMessages = async (
  userId: string,
  bookId: string,
  conversationId: string,
  messages: Array<{
    role: 'me' | 'syzygy'
    content: string
    metadata?: {
      model?: string
      temperature?: number
    }
  }>,
): Promise<void> => {
  const client = ensureClient()
  if (!bookId) {
    throw new Error('Missing bookId for discussion insert.')
  }
  const now = Date.now()
  const payload = messages.map((message, index) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    book_id: bookId,
    conversation_id: conversationId,
    role: message.role,
    content: message.content,
    metadata: message.role === 'syzygy' ? message.metadata ?? null : null,
    created_at: new Date(now + index).toISOString(),
  }))

  const { error } = await client.from('discussions').insert(payload)

  if (error) {
    throw error
  }
}

export const deleteCloudDiscussion = async (
  userId: string,
  bookId: string,
  messageId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('discussions')
    .delete()
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .eq('id', messageId)

  if (error) {
    throw error
  }
}

export const deleteCloudDiscussionsByBook = async (
  userId: string,
  bookId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('discussions')
    .delete()
    .eq('user_id', userId)
    .eq('book_id', bookId)

  if (error) {
    throw error
  }
}

export const deleteCloudDiscussionsByConversation = async (
  userId: string,
  conversationId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('discussions')
    .delete()
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)

  if (error) {
    throw error
  }
}

export const createCloudQuestion = async (
  userId: string,
  bookId: string,
  question: string,
  chapter?: string,
): Promise<string> => {
  const client = ensureClient()
  if (!bookId) {
    throw new Error('Missing bookId for question insert.')
  }
  const id = crypto.randomUUID()
  const trimmedChapter = chapter?.trim()
  const { error } = await client.from('book_questions').insert({
    id,
    user_id: userId,
    book_id: bookId,
    question,
    chapter: trimmedChapter ? trimmedChapter : null,
    status: 'open',
  })

  if (error) {
    throw error
  }

  return id
}

export const updateCloudQuestion = async (
  userId: string,
  questionId: string,
  fields: { question: string; chapter?: string },
): Promise<void> => {
  const client = ensureClient()
  const trimmedChapter = fields.chapter?.trim()
  const { error } = await client
    .from('book_questions')
    .update({
      question: fields.question,
      chapter: trimmedChapter ? trimmedChapter : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', questionId)

  if (error) {
    throw error
  }
}

export const updateCloudQuestionStatus = async (
  userId: string,
  questionId: string,
  status: QuestionStatus,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('book_questions')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', questionId)

  if (error) {
    throw error
  }
}

export const deleteCloudQuestion = async (
  userId: string,
  questionId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('book_questions')
    .delete()
    .eq('user_id', userId)
    .eq('id', questionId)

  if (error) {
    throw error
  }
}

export const createCloudAnswer = async (
  questionId: string,
  answer: string,
  answeredBy: AnsweredBy,
): Promise<string> => {
  const client = ensureClient()
  if (!questionId) {
    throw new Error('Missing questionId for answer insert.')
  }
  const id = crypto.randomUUID()
  const { error } = await client.from('book_answers').insert({
    id,
    question_id: questionId,
    answer,
    answered_by: answeredBy,
  })

  if (error) {
    throw error
  }

  return id
}

export const updateCloudAnswer = async (
  answerId: string,
  answer: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('book_answers')
    .update({ answer })
    .eq('id', answerId)

  if (error) {
    throw error
  }
}

export const deleteCloudAnswer = async (
  answerId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('book_answers')
    .delete()
    .eq('id', answerId)

  if (error) {
    throw error
  }
}

export const createConversation = async (
  userId: string,
  bookId: string,
  title: string,
): Promise<string> => {
  const client = ensureClient()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const { error } = await client.from('conversations').insert({
    id,
    user_id: userId,
    book_id: bookId,
    title,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    throw error
  }

  return id
}

export const updateConversationTitle = async (
  userId: string,
  conversationId: string,
  title: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', conversationId)

  if (error) {
    throw error
  }
}

export const deleteConversation = async (
  userId: string,
  conversationId: string,
): Promise<void> => {
  const client = ensureClient()
  const { error } = await client
    .from('conversations')
    .delete()
    .eq('user_id', userId)
    .eq('id', conversationId)

  if (error) {
    throw error
  }
}
