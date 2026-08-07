// 导读 & 总结：书籍的陪读内容。
// guide   = 导读，开书时写入的阅读辅助
// summary = 总结，读完后写下的感想
export type CompanionKind = 'guide' | 'summary'

export interface CompanionEntry {
  id: string
  bookId: string
  writtenBy: string
  content: string
  createdAt: string
  updatedAt?: string
}

// 与书籍问答共用的一套写入端枚举；written_by 落库是自由文本，
// 所以下拉之外还允许写入端自报家门（自定义输入）。
export const COMPANION_WRITER_OPTIONS = [
  'chuanchuan',
  'syzygy-claude',
  'syzygy-gpt',
  'cli_reading_assist',
] as const

export type CompanionWriter = (typeof COMPANION_WRITER_OPTIONS)[number]

const COMPANION_WRITER_LABELS: Record<string, string> = {
  chuanchuan: '串串',
  'syzygy-claude': 'Syzygy(Claude)',
  'syzygy-gpt': 'Syzygy(GPT)',
  cli_reading_assist: 'CLI 阅读助手',
}

// 未知写入端回退展示原始值，未来新的 CLI 来源也能直接看清。
export const getCompanionWriterLabel = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return '未知写入端'
  return COMPANION_WRITER_LABELS[trimmed] ?? trimmed
}

export const COMPANION_KIND_META: Record<
  CompanionKind,
  { label: string; table: 'book_guides' | 'book_summaries' }
> = {
  guide: { label: '导读', table: 'book_guides' },
  summary: { label: '总结', table: 'book_summaries' },
}
