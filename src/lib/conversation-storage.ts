import type { Conversation } from '../types/discussion'

const STORAGE_KEY = 'all-about-book:conversations'

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const normalizeConversation = (
  conversation: Partial<Conversation>,
): Conversation => {
  const now = new Date().toISOString()
  const createdAt =
    typeof conversation.createdAt === 'string' && conversation.createdAt
      ? conversation.createdAt
      : now
  const updatedAt =
    typeof conversation.updatedAt === 'string' && conversation.updatedAt
      ? conversation.updatedAt
      : createdAt

  return {
    id: normalizeString(conversation.id) || crypto.randomUUID(),
    bookId: normalizeString(conversation.bookId),
    title: normalizeString(conversation.title) || '默认对话',
    createdAt,
    updatedAt,
  }
}

const safeParse = (raw: string | null): Conversation[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<Conversation>[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((conversation) => normalizeConversation(conversation))
  } catch {
    return []
  }
}

export const getConversations = (): Conversation[] => {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export const saveConversations = (conversations: Conversation[]): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(conversations),
  )
}

export const getConversationsByBookId = (
  bookId: string,
): Conversation[] =>
  getConversations()
    .filter((conversation) => conversation.bookId === bookId)
    .sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime()
      const timeB = new Date(b.updatedAt).getTime()
      if (timeA !== timeB) return timeB - timeA
      return a.id.localeCompare(b.id)
    })

export const ensureDefaultConversation = (
  bookId: string,
): Conversation => {
  const conversations = getConversations()
  const existing = conversations.find(
    (conversation) =>
      conversation.bookId === bookId &&
      conversation.title === '默认对话',
  )
  if (existing) return existing
  const now = new Date().toISOString()
  const created: Conversation = {
    id: crypto.randomUUID(),
    bookId,
    title: '默认对话',
    createdAt: now,
    updatedAt: now,
  }
  saveConversations([...conversations, created])
  return created
}

export const createConversation = (
  bookId: string,
  title: string,
): Conversation => {
  const now = new Date().toISOString()
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    bookId,
    title: title.trim() || '未命名对话',
    createdAt: now,
    updatedAt: now,
  }
  const conversations = getConversations()
  saveConversations([...conversations, conversation])
  return conversation
}

export const updateConversationTitle = (
  conversationId: string,
  title: string,
): Conversation | null => {
  const conversations = getConversations()
  const index = conversations.findIndex(
    (conversation) => conversation.id === conversationId,
  )
  if (index === -1) return null
  const current = conversations[index]
  const next = normalizeConversation({
    ...current,
    title: title.trim() || current.title,
    updatedAt: new Date().toISOString(),
  })
  const nextList = conversations.map((conversation) =>
    conversation.id === conversationId ? next : conversation,
  )
  saveConversations(nextList)
  return next
}

export const deleteConversation = (conversationId: string): void => {
  const conversations = getConversations().filter(
    (conversation) => conversation.id !== conversationId,
  )
  saveConversations(conversations)
}
