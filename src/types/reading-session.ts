export interface ReadingSession {
  id: string
  bookId: string
  date: string
  pagesRead?: number
  chaptersRead?: number
  comment?: string
  createdAt: string
}
