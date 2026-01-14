export interface DiscussionMessage {
  id: string
  bookId: string
  role: 'me' | 'syzygy'
  content: string
  createdAt: string
  metadata?: {
    model?: string
    temperature?: number
  }
}
