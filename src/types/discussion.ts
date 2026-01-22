export interface DiscussionMessage {
  id: string
  bookId: string
  conversationId: string
  role: 'me' | 'syzygy'
  content: string
  createdAt: string
  metadata?: {
    model?: string
    temperature?: number
    [key: string]: unknown
  }
}

export interface Conversation {
  id: string
  bookId: string
  title: string
  createdAt: string
  updatedAt: string
}
