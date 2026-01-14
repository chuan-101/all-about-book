import type { DiscussionMessage } from '../types/discussion'

const STORAGE_KEY = 'all-about-book:discussions'

const normalizeString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined

const normalizeOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && !Number.isNaN(value) ? value : undefined

const normalizeMetadata = (
  value: unknown,
): DiscussionMessage['metadata'] => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const model = normalizeOptionalString(record.model)
  const temperature = normalizeOptionalNumber(record.temperature)
  const rest = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== 'model' && key !== 'temperature',
    ),
  )
  if (
    !model &&
    typeof temperature !== 'number' &&
    Object.keys(rest).length === 0
  ) {
    return undefined
  }
  return {
    ...(Object.keys(rest).length ? rest : {}),
    model,
    temperature,
  }
}

const normalizeMessage = (
  message: Partial<DiscussionMessage>,
): DiscussionMessage => {
  const now = new Date().toISOString()
  const createdAt =
    typeof message.createdAt === 'string' && message.createdAt
      ? message.createdAt
      : now
  const legacyModel = normalizeOptionalString(
    (message as Record<string, unknown>).usedModel,
  )
  const legacyTemperature = normalizeOptionalNumber(
    (message as Record<string, unknown>).usedTemperature,
  )
  const metadata =
    normalizeMetadata(message.metadata) ??
    (legacyModel || typeof legacyTemperature === 'number'
      ? {
          model: legacyModel,
          temperature: legacyTemperature,
        }
      : undefined)

  return {
    id: normalizeString(message.id) || crypto.randomUUID(),
    bookId: normalizeString(message.bookId),
    role:
      message.role === 'me' || message.role === 'syzygy'
        ? message.role
        : 'me',
    content: normalizeString(message.content),
    createdAt,
    metadata,
  }
}

const safeParse = (raw: string | null): DiscussionMessage[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<DiscussionMessage>[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((message) => normalizeMessage(message))
  } catch {
    return []
  }
}

export const getDiscussions = (): DiscussionMessage[] => {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export const saveDiscussions = (messages: DiscussionMessage[]): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
}

export const getMessagesByBookId = (
  bookId: string,
): DiscussionMessage[] =>
  getDiscussions()
    .filter((message) => message.bookId === bookId)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() -
        new Date(b.createdAt).getTime(),
    )

export const addMessage = (message: DiscussionMessage): void => {
  const messages = getDiscussions()
  const normalized = normalizeMessage(message)
  saveDiscussions([...messages, normalized])
}

export const deleteMessage = (id: string): void => {
  const messages = getDiscussions().filter((message) => message.id !== id)
  saveDiscussions(messages)
}

export const updateMessage = (
  id: string,
  content: string,
): void => {
  const messages = getDiscussions()
  const index = messages.findIndex((message) => message.id === id)
  if (index === -1) return
  const current = messages[index]
  const nextMessage = normalizeMessage({
    ...current,
    content,
    id: current.id,
    bookId: current.bookId,
    role: current.role,
    createdAt: current.createdAt,
  })
  const next = messages.map((message) =>
    message.id === id ? nextMessage : message,
  )
  saveDiscussions(next)
}
