export type BookStatus = 'reading' | 'finished' | 'paused'

export type ProgressKind = 'page' | 'percent' | 'chapter'

export interface BookProgress {
  kind: ProgressKind
  value: number
}

export interface Book {
  id: string
  title: string
  author: string
  translator: string
  genre: string
  status: BookStatus
  cover: string
  createdAt: string
  updatedAt: string
  progress?: BookProgress
}
