export interface ExcerptResonance {
  id: string
  excerptId: string
  bookId: string
  speaker: string
  content: string
  createdAt: string
  updatedAt?: string
}

// Speakers that can be picked when manually adding a resonance from the UI.
export const RESONANCE_SPEAKER_OPTIONS = [
  'chuanchuan',
  'syzygy',
  'codex_cli',
  'claude_code_cli',
  'gpt',
  'claude',
] as const

export type ResonanceSpeaker = (typeof RESONANCE_SPEAKER_OPTIONS)[number]

const SPEAKER_LABELS: Record<string, string> = {
  chuanchuan: '串串',
  syzygy: 'Syzygy',
  codex_cli: 'Codex CLI',
  claude_code_cli: 'Claude Code CLI',
  gpt: 'GPT',
  claude: 'Claude',
}

// Map a raw speaker source to a friendly label, falling back to the raw
// value so future CLI sources still display clearly.
export const getResonanceSpeakerLabel = (speaker: string): string => {
  const trimmed = speaker.trim()
  if (!trimmed) return '未知来源'
  return SPEAKER_LABELS[trimmed] ?? trimmed
}
