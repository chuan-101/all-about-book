export type QuestionStatus = 'open' | 'answered'

export type AnsweredBy =
  | 'chuanchuan'
  | 'syzygy-claude'
  | 'syzygy-gpt'
  | 'cli_reading_assist'

export interface BookQuestion {
  id: string
  bookId: string
  chapter?: string
  question: string
  status: QuestionStatus
  createdAt: string
  updatedAt?: string
}

export interface BookAnswer {
  id: string
  questionId: string
  answer: string
  answeredBy: AnsweredBy
  createdAt: string
}

export const ANSWERED_BY_LABELS: Record<AnsweredBy, string> = {
  chuanchuan: '串串',
  'syzygy-claude': 'Syzygy(Claude)',
  'syzygy-gpt': 'Syzygy(GPT)',
  cli_reading_assist: 'CLI 阅读助手',
}

export const getAnsweredByLabel = (value: string): string =>
  (ANSWERED_BY_LABELS as Record<string, string>)[value] ?? value
