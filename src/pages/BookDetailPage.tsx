import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import AutoResizeTextarea from '../components/AutoResizeTextarea'
import {
  deleteExcerpt,
  getExcerptsByBookId,
  updateExcerpt,
  upsertExcerpt,
} from '../lib/excerpts-storage'
import {
  addMessage,
  deleteMessage,
  deleteMessagesByConversationId,
  getMessagesByBookId,
} from '../lib/discussion-storage'
import {
  createConversation as createLocalConversation,
  deleteConversation as deleteLocalConversation,
  ensureDefaultConversation,
  getConversationsByBookId,
  updateConversationTitle as updateLocalConversationTitle,
} from '../lib/conversation-storage'
import { SYZYGY_DEFAULTS } from '../lib/syzygyDefaults'
import { chapterize, looksChapterized } from '../lib/chapterize'
import type { Chapter } from '../types/chapter'
import type { Excerpt } from '../types/excerpt'
import type { ExcerptResonance } from '../types/resonance'
import {
  RESONANCE_SPEAKER_OPTIONS,
  getResonanceSpeakerLabel,
} from '../types/resonance'
import type { Conversation, DiscussionMessage } from '../types/discussion'
import type { ReadingSession } from '../types/reading-session'
import { useAppData } from '../lib/app-context'
import { useBooks } from '../lib/books-context'
import { ActionButton } from '../components/ActionButton'
import { Button } from '../components/Button'
import {
  createConversation,
  createCloudAnswer,
  createCloudChapter,
  createCloudCompanionEntry,
  createCloudDiscussion,
  createCloudDiscussionMessages,
  createCloudExcerpt,
  createCloudExcerptsBatch,
  createCloudQuestion,
  createCloudResonance,
  deleteConversation,
  deleteCloudAnswer,
  deleteCloudChapter,
  deleteCloudCompanionEntry,
  deleteCloudDiscussion,
  deleteCloudDiscussionsByConversation,
  deleteCloudExcerpt,
  deleteCloudQuestion,
  moveCloudExcerpt,
  renameCloudChapter,
  toggleCloudCheckIn,
  updateConversationTitle,
  updateCloudAnswer,
  updateCloudCompanionEntry,
  updateCloudExcerpt,
  updateCloudQuestion,
  updateCloudQuestionStatus,
} from '../lib/cloudWrite'
import {
  getCheckInsByBook,
  toggleCheckIn,
} from '../lib/reading-sessions-storage'
import {
  fetchAnswersByQuestionIds,
  fetchChaptersByBookId,
  fetchCompanionEntriesByBookId,
  fetchConversationsByBookId,
  fetchDiscussionsByBookId,
  fetchQuestionsByBookId,
  fetchResonancesByBookId,
} from '../lib/cloudRead'
import type { BookAnswer, BookQuestion } from '../types/question'
import { getAnsweredByLabel } from '../types/question'
import type { CompanionEntry, CompanionKind } from '../types/companion'
import {
  COMPANION_KIND_META,
  COMPANION_WRITER_OPTIONS,
  getCompanionWriterLabel,
} from '../types/companion'
import {
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from '../lib/supabaseClient'

const statusLabels = {
  unread: '未读',
  reading: '在读',
  finished: '已读完',
  paused: '暂停',
} as const

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

type ModelOption = {
  id: string
  label: string
}

type OptimisticDiscussionMessage = {
  clientId: string
  bookId: string
  conversationId: string
  role: 'me' | 'syzygy'
  content: string
  metadata?: DiscussionMessage['metadata']
  createdAt?: string
  id?: string
  isPending?: boolean
}

type DiscussionEntry = DiscussionMessage | OptimisticDiscussionMessage

// 导读/总结表单里「自定义写入端」在下拉框中的哨兵值
const CUSTOM_WRITER_VALUE = '__custom__'

type CompanionDraft = {
  writer: string
  customWriter: string
  content: string
}

const emptyCompanionDraft = (): CompanionDraft => ({
  writer: 'chuanchuan',
  customWriter: '',
  content: '',
})

// 折叠态的导读/总结卡片只露一行预览：取正文第一行非空文本，
// 剥掉 Markdown 记号，长文标题（如「Fable端导读：……」）直接当卡片题签用。
const getCompanionPreview = (content: string): string => {
  for (const rawLine of content.split('\n')) {
    const line = rawLine
      .replace(/^[#>\s]+/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (line) return line
  }
  return ''
}

const sortDiscussionEntries = (
  entries: DiscussionEntry[],
): DiscussionEntry[] =>
  entries
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const createdA = a.message.createdAt
      const createdB = b.message.createdAt
      if (createdA && createdB) {
        const timeDiff =
          new Date(createdA).getTime() - new Date(createdB).getTime()
        if (timeDiff !== 0) return timeDiff
        if (a.message.id && b.message.id) {
          const idDiff = a.message.id.localeCompare(b.message.id)
          if (idDiff !== 0) return idDiff
        }
      }
      return a.index - b.index
    })
    .map((item) => item.message)

const getDiscussionKey = (message: DiscussionEntry) =>
  'clientId' in message ? message.clientId : message.id

const isServerDiscussionMessage = (
  message: DiscussionEntry,
): message is DiscussionMessage =>
  Boolean(message.id && message.createdAt)

const MISSING_TABLE_MESSAGE =
  'Table missing: openrouter_models/syzygy_settings. Run SQL schema in Supabase.'

const isMissingTableError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const status =
    'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined
  return status === 404 || code === '42P01'
}

const formatDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatRangeDate = (value: string) =>
  value.startsWith(`${new Date().getFullYear()}-`) ? value.slice(5) : value

function BookDetailPage() {
  const { bookId } = useParams()
  const { books: localBooks } = useBooks()
  const {
    isCloudMode,
    cloudBooks,
    cloudCheckIns,
    cloudExcerpts,
    cloudLoading,
    session,
    refreshCloud,
  } = useAppData()
  const books = isCloudMode ? cloudBooks : localBooks
  const book = bookId ? books.find((item) => item.id === bookId) : undefined
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isNotesExpanded, setIsNotesExpanded] = useState(false)
  const [isExcerptFormOpen, setIsExcerptFormOpen] = useState(false)
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false)
  const [excerpts, setExcerpts] = useState<Excerpt[]>([])
  const [newExcerptContent, setNewExcerptContent] = useState('')
  const [isExcerptEditorOpen, setIsExcerptEditorOpen] = useState(false)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [newExcerptChapterId, setNewExcerptChapterId] = useState('')
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [isAutoSplitEnabled, setIsAutoSplitEnabled] = useState(true)
  const [isSavingExcerpt, setIsSavingExcerpt] = useState(false)
  const [openChapterMenuId, setOpenChapterMenuId] = useState<string | null>(
    null,
  )
  const [renamingChapterId, setRenamingChapterId] = useState<string | null>(
    null,
  )
  const [renameChapterDraft, setRenameChapterDraft] = useState('')
  const [movingExcerpt, setMovingExcerpt] = useState<Excerpt | null>(null)
  const [moveTargetChapterId, setMoveTargetChapterId] = useState('')
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement | null>(
    null,
  )
  const [openExcerptMenuId, setOpenExcerptMenuId] = useState<
    string | null
  >(null)
  const [resonancesByExcerpt, setResonancesByExcerpt] = useState<
    Record<string, ExcerptResonance[]>
  >({})
  const [resonanceEditorExcerptId, setResonanceEditorExcerptId] =
    useState<string | null>(null)
  const [resonanceDraft, setResonanceDraft] = useState('')
  const [resonanceSpeaker, setResonanceSpeaker] = useState<string>(
    RESONANCE_SPEAKER_OPTIONS[0],
  )
  const [isSavingResonance, setIsSavingResonance] = useState(false)
  const [openDiscussionMenuId, setOpenDiscussionMenuId] =
    useState<string | null>(null)
  const [isConversationMenuOpen, setIsConversationMenuOpen] =
    useState(false)
  const [discussionMessages, setDiscussionMessages] = useState<
    DiscussionMessage[]
  >([])
  const [cloudDiscussionMessages, setCloudDiscussionMessages] = useState<
    DiscussionMessage[]
  >([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [conversationTitleDraft, setConversationTitleDraft] =
    useState('')
  const [isSavingConversationTitle, setIsSavingConversationTitle] =
    useState(false)
  const [isRenamingConversation, setIsRenamingConversation] =
    useState(false)
  const [infoDiscussion, setInfoDiscussion] =
    useState<DiscussionMessage | null>(null)
  const [newMessageContent, setNewMessageContent] = useState('')
  const [editingExcerptId, setEditingExcerptId] = useState<string | null>(
    null,
  )
  const [editingContent, setEditingContent] = useState('')
  const [activeNoteTab, setActiveNoteTab] = useState<
    'excerpts' | 'thinking' | 'guide' | 'summary'
  >('excerpts')
  const [companionEntries, setCompanionEntries] = useState<
    Record<CompanionKind, CompanionEntry[]>
  >({ guide: [], summary: [] })
  const [companionLoading, setCompanionLoading] = useState(false)
  const [companionFormOpen, setCompanionFormOpen] = useState<
    Record<CompanionKind, boolean>
  >({ guide: false, summary: false })
  const [companionDrafts, setCompanionDrafts] = useState<
    Record<CompanionKind, CompanionDraft>
  >({ guide: emptyCompanionDraft(), summary: emptyCompanionDraft() })
  const [isSavingCompanion, setIsSavingCompanion] = useState(false)
  const [editingCompanion, setEditingCompanion] = useState<{
    kind: CompanionKind
    id: string
  } | null>(null)
  const [editingCompanionText, setEditingCompanionText] = useState('')
  const [openCompanionMenuId, setOpenCompanionMenuId] = useState<
    string | null
  >(null)
  const [expandedCompanionIds, setExpandedCompanionIds] = useState<
    Set<string>
  >(() => new Set())
  const [confirmingDeleteCompanion, setConfirmingDeleteCompanion] =
    useState<{ kind: CompanionKind; entry: CompanionEntry } | null>(null)
  const [questions, setQuestions] = useState<BookQuestion[]>([])
  const [answersByQuestion, setAnswersByQuestion] = useState<
    Record<string, BookAnswer[]>
  >({})
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newQuestionChapter, setNewQuestionChapter] = useState('')
  const [isSavingQuestion, setIsSavingQuestion] = useState(false)
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<
    Set<string>
  >(() => new Set())
  const [openQuestionMenuId, setOpenQuestionMenuId] = useState<
    string | null
  >(null)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  )
  const [editingQuestionText, setEditingQuestionText] = useState('')
  const [editingQuestionChapter, setEditingQuestionChapter] = useState('')
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>(
    {},
  )
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(
    null,
  )
  const [editingAnswerText, setEditingAnswerText] = useState('')
  const [confirmingDeleteQuestion, setConfirmingDeleteQuestion] =
    useState<BookQuestion | null>(null)
  const [confirmingDeleteAnswer, setConfirmingDeleteAnswer] =
    useState<BookAnswer | null>(null)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [isAskingSyzygy, setIsAskingSyzygy] = useState(false)
  const [isSendingDiscussion, setIsSendingDiscussion] = useState(false)
  const [attachContext, setAttachContext] = useState(true)
  const [confirmingDiscussion, setConfirmingDiscussion] =
    useState<DiscussionMessage | null>(null)
  const [isConfirmingDeleteConversation, setIsConfirmingDeleteConversation] =
    useState(false)
  const [isConfirmingClearDiscussions, setIsConfirmingClearDiscussions] =
    useState(false)
  const [deleteConversationText, setDeleteConversationText] =
    useState('')
  const [clearConversationText, setClearConversationText] = useState('')
  const [isConversationListOpen, setIsConversationListOpen] =
    useState(false)
  const [isStreamEnabled, setIsStreamEnabled] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticDiscussionMessage[]
  >([])
  const [isStreamingReply, setIsStreamingReply] = useState(false)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(
    SYZYGY_DEFAULTS.model,
  )
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [modelStatus, setModelStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [modelStatusMessage, setModelStatusMessage] = useState<
    string | null
  >(null)
  const isModelSaving = modelStatus === 'saving'
  const activeDiscussionKeyRef = useRef<string | null>(null)
  const deleteConfirmPhrase = '删除'
  const clearConfirmPhrase = '清空'

  const getMetadataNumber = (value: unknown) =>
    typeof value === 'number' ? value : undefined

  const getTokenCount = (
    metadata: DiscussionMessage['metadata'] | undefined,
  ) => {
    if (!metadata) return undefined
    const meta = metadata as Record<string, unknown>
    return (
      getMetadataNumber(meta.tokens) ??
      getMetadataNumber(meta.tokenCount) ??
      getMetadataNumber(meta.totalTokens) ??
      getMetadataNumber(meta.total_tokens)
    )
  }

  useEffect(() => {
    if (!book || isCloudMode) return
    setSessions(getCheckInsByBook(book.id))
  }, [book, isCloudMode])

  useEffect(() => {
    if (!book || isCloudMode) return
    setExcerpts(getExcerptsByBookId(book.id))
  }, [book, isCloudMode])

  useEffect(() => {
    if (!book || isCloudMode) return
    setDiscussionMessages(getMessagesByBookId(book.id))
    const existing = getConversationsByBookId(book.id)
    const nextConversations =
      existing.length > 0
        ? existing
        : [ensureDefaultConversation(book.id)]
    setConversations(nextConversations)
    setActiveConversationId((current) => {
      if (
        current &&
        nextConversations.some((conversation) => conversation.id === current)
      ) {
        return current
      }
      return nextConversations[0]?.id ?? null
    })
  }, [book, isCloudMode])

  const loadCloudDiscussions = useCallback(
    async (targetBookId: string, targetConversationId?: string | null) => {
      if (!session?.user) return
      if (!targetBookId) {
        setCloudError('缺少书籍 ID，无法加载讨论。')
        setCloudDiscussionMessages([])
        return
      }
      const discussionKey = `${targetBookId}:${targetConversationId ?? ''}`
      activeDiscussionKeyRef.current = discussionKey
      try {
        const discussions = await fetchDiscussionsByBookId(
          session.user,
          targetBookId,
          targetConversationId ?? undefined,
        )
        if (activeDiscussionKeyRef.current !== discussionKey) return
        setCloudDiscussionMessages(discussions)
      } catch (error) {
        if (activeDiscussionKeyRef.current !== discussionKey) return
        console.error('Failed to load cloud discussions', error)
        setCloudError('云端讨论加载失败，请稍后重试。')
      }
    },
    [session],
  )

  const loadCloudConversations = useCallback(
    async (targetBookId: string) => {
      if (!session?.user) return
      if (!targetBookId) {
        setConversations([])
        setActiveConversationId(null)
        return
      }
      try {
        const list = await fetchConversationsByBookId(
          session.user,
          targetBookId,
        )
        setConversations(list)
        setActiveConversationId((current) => {
          if (current && list.some((item) => item.id === current)) {
            return current
          }
          return list[0]?.id ?? null
        })
      } catch (error) {
        console.error('Failed to load cloud conversations', error)
        setCloudError('云端对话加载失败，请稍后重试。')
      }
    },
    [session],
  )

  const loadThinking = useCallback(
    async (targetBookId: string) => {
      if (!session?.user || !targetBookId) return
      setQuestionsLoading(true)
      try {
        const loadedQuestions = await fetchQuestionsByBookId(
          session.user,
          targetBookId,
        )
        const loadedAnswers = await fetchAnswersByQuestionIds(
          loadedQuestions.map((item) => item.id),
        )
        const grouped: Record<string, BookAnswer[]> = {}
        for (const answer of loadedAnswers) {
          const list = grouped[answer.questionId] ?? []
          list.push(answer)
          grouped[answer.questionId] = list
        }
        setQuestions(loadedQuestions)
        setAnswersByQuestion(grouped)
      } catch (error) {
        console.error('Failed to load thinking notes', error)
        setCloudError('云端思考记录加载失败，请稍后重试。')
      } finally {
        setQuestionsLoading(false)
      }
    },
    [session],
  )

  const loadCompanions = useCallback(
    async (targetBookId: string) => {
      if (!session?.user || !targetBookId) return
      setCompanionLoading(true)
      try {
        const [guides, summaries] = await Promise.all([
          fetchCompanionEntriesByBookId(session.user, targetBookId, 'guide'),
          fetchCompanionEntriesByBookId(
            session.user,
            targetBookId,
            'summary',
          ),
        ])
        setCompanionEntries({ guide: guides, summary: summaries })
      } catch (error) {
        console.error('Failed to load companion entries', error)
        setCloudError('导读/总结加载失败，请稍后重试。')
      } finally {
        setCompanionLoading(false)
      }
    },
    [session],
  )

  const loadChapters = useCallback(
    async (targetBookId: string) => {
      if (!session?.user || !targetBookId) return
      try {
        const list = await fetchChaptersByBookId(session.user, targetBookId)
        setChapters(list)
      } catch (error) {
        console.error('Failed to load chapters', error)
        setCloudError('章节列表加载失败，请稍后重试。')
      }
    },
    [session],
  )

  const loadResonances = useCallback(
    async (targetBookId: string) => {
      if (!session?.user || !targetBookId) return
      try {
        const resonances = await fetchResonancesByBookId(
          session.user,
          targetBookId,
        )
        const grouped: Record<string, ExcerptResonance[]> = {}
        for (const resonance of resonances) {
          const list = grouped[resonance.excerptId] ?? []
          list.push(resonance)
          grouped[resonance.excerptId] = list
        }
        setResonancesByExcerpt(grouped)
      } catch (error) {
        console.error('Failed to load excerpt resonances', error)
        setCloudError('Syzygy 留言加载失败，请稍后重试。')
      }
    },
    [session],
  )

  useEffect(() => {
    setResonancesByExcerpt({})
    setResonanceEditorExcerptId(null)
    setResonanceDraft('')
    if (!isCloudMode || !book?.id || !session?.user) return
    void loadResonances(book.id)
  }, [book?.id, isCloudMode, loadResonances, session?.user])

  useEffect(() => {
    setChapters([])
    setExpandedChapterIds(new Set())
    setNewExcerptChapterId('')
    setNewChapterTitle('')
    setOpenChapterMenuId(null)
    setRenamingChapterId(null)
    setMovingExcerpt(null)
    if (!isCloudMode || !book?.id || !session?.user) return
    void loadChapters(book.id)
  }, [book?.id, isCloudMode, loadChapters, session?.user])

  useEffect(() => {
    if (!isCloudMode) {
      activeDiscussionKeyRef.current = null
      setCloudDiscussionMessages([])
      setConversations([])
      setActiveConversationId(null)
      return
    }
    if (!book?.id) {
      activeDiscussionKeyRef.current = null
      setCloudDiscussionMessages([])
      setConversations([])
      setActiveConversationId(null)
      setCloudError('缺少书籍 ID，无法加载讨论。')
      return
    }
    if (!session?.user) {
      setCloudDiscussionMessages([])
      setConversations([])
      setActiveConversationId(null)
      return
    }
    setCloudError(null)
    setCloudDiscussionMessages([])
    void loadCloudConversations(book.id)
  }, [book?.id, isCloudMode, loadCloudConversations, session?.user])

  useEffect(() => {
    setQuestions([])
    setAnswersByQuestion({})
    setExpandedQuestionIds(new Set())
    setEditingQuestionId(null)
    setEditingAnswerId(null)
    if (!isCloudMode || !book?.id || !session?.user) return
    void loadThinking(book.id)
  }, [book?.id, isCloudMode, loadThinking, session?.user])

  useEffect(() => {
    setCompanionEntries({ guide: [], summary: [] })
    setCompanionFormOpen({ guide: false, summary: false })
    setCompanionDrafts({
      guide: emptyCompanionDraft(),
      summary: emptyCompanionDraft(),
    })
    setEditingCompanion(null)
    setEditingCompanionText('')
    setOpenCompanionMenuId(null)
    setExpandedCompanionIds(new Set())
    setConfirmingDeleteCompanion(null)
    if (!isCloudMode || !book?.id || !session?.user) return
    void loadCompanions(book.id)
  }, [book?.id, isCloudMode, loadCompanions, session?.user])

  useEffect(() => {
    if (!isCloudMode) return
    if (!book?.id || !session?.user) return
    if (!activeConversationId) {
      setCloudDiscussionMessages([])
      return
    }
    setCloudError(null)
    setCloudDiscussionMessages([])
    void loadCloudDiscussions(book.id, activeConversationId)
  }, [
    activeConversationId,
    book?.id,
    isCloudMode,
    loadCloudDiscussions,
    session?.user,
  ])

  useEffect(() => {
    const stored = window.localStorage.getItem(
      'syzygyStreamEnabled',
    )
    if (stored === null) return
    setIsStreamEnabled(stored === 'true')
  }, [])

  useEffect(() => {
    window.localStorage.setItem(
      'syzygyStreamEnabled',
      String(isStreamEnabled),
    )
  }, [isStreamEnabled])

  useEffect(() => {
    if (!isCloudMode) return
    setEditingExcerptId(null)
    setEditingContent('')
  }, [isCloudMode])

  useEffect(() => {
    if (!isCloudMode) {
      setOptimisticMessages([])
      return
    }
    if (!book) return
    setOptimisticMessages((messages) =>
      messages.filter((message) => message.bookId === book.id),
    )
  }, [book, isCloudMode])

  const handleCopyDiscussionMessage = useCallback(
    async (message: DiscussionMessage) => {
      setOpenDiscussionMenuId(null)
      try {
        await navigator.clipboard.writeText(message.content)
      } catch (error) {
        console.error('Failed to copy discussion message', error)
        const textarea = document.createElement('textarea')
        textarea.value = message.content
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        try {
          document.execCommand('copy')
        } finally {
          document.body.removeChild(textarea)
        }
      }
    },
    [],
  )

  const canSwitchModel = isCloudMode && Boolean(session)

  const loadModelOptions = useCallback(async () => {
    if (!supabase || !session) return
    setModelLoading(true)
    setModelError(null)
    try {
      const { data, error } = await supabase
        .from('openrouter_models')
        .select('id,label,enabled,sort_order')
        .eq('enabled', true)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true })

      if (error) {
        throw error
      }

      const nextModels =
        data?.map((row) => ({
          id: row.id,
          label: row.label,
        })) ?? []
      setModelOptions(nextModels)
      if (nextModels.length === 0) {
        setModelError('No enabled models. Add rows in openrouter_models.')
      }
    } catch (error) {
      console.error('Failed to load openrouter models', error)
      if (isMissingTableError(error)) {
        setModelError(MISSING_TABLE_MESSAGE)
      } else {
        setModelError('无法加载模型列表，请稍后重试。')
      }
    } finally {
      setModelLoading(false)
    }
  }, [session])

  const loadSelectedModel = useCallback(async () => {
    if (!supabase || !session) return
    try {
      const { data, error } = await supabase
        .from('syzygy_settings')
        .select('model')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      setSelectedModel(data?.model ?? SYZYGY_DEFAULTS.model)
    } catch (error) {
      console.error('Failed to load syzygy model', error)
      if (isMissingTableError(error)) {
        setModelError(MISSING_TABLE_MESSAGE)
      }
      setSelectedModel(SYZYGY_DEFAULTS.model)
    }
  }, [session])

  useEffect(() => {
    if (!canSwitchModel) return
    void Promise.all([loadModelOptions(), loadSelectedModel()])
  }, [canSwitchModel, loadModelOptions, loadSelectedModel])

  useEffect(() => {
    if (!modelOptions.length) return
    const isValid = modelOptions.some(
      (model) => model.id === selectedModel,
    )
    if (isValid) return
    const fallback =
      modelOptions.find((model) => model.id === SYZYGY_DEFAULTS.model)
        ?.id ?? modelOptions[0]?.id
    if (fallback) {
      setSelectedModel(fallback)
    }
  }, [modelOptions, selectedModel])

  useEffect(() => {
    if (!isModelMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isModelMenuOpen])

  useEffect(() => {
    if (modelStatus === 'idle') return
    const timer = window.setTimeout(() => {
      setModelStatus('idle')
      setModelStatusMessage(null)
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [modelStatus])

  useEffect(() => {
    if (!isExcerptEditorOpen) return
    fullscreenTextareaRef.current?.focus()
  }, [isExcerptEditorOpen])

  const displaySessions = useMemo(() => {
    if (!book) return []
    return isCloudMode
      ? cloudCheckIns.filter((session) => session.bookId === book.id)
      : sessions
  }, [book, cloudCheckIns, isCloudMode, sessions])

  const displayExcerpts = useMemo(() => {
    if (!book) return []
    return isCloudMode
      ? cloudExcerpts.filter((excerpt) => excerpt.bookId === book.id)
      : excerpts
  }, [book, cloudExcerpts, excerpts, isCloudMode])

  const chapterById = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter])),
    [chapters],
  )

  const excerptsByChapter = useMemo(() => {
    const grouped = new Map<string, Excerpt[]>()
    for (const excerpt of displayExcerpts) {
      const key = excerpt.chapterId ?? ''
      const list = grouped.get(key) ?? []
      list.push(excerpt)
      grouped.set(key, list)
    }
    for (const list of grouped.values()) {
      list.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    }
    return grouped
  }, [displayExcerpts])

  const unchapteredExcerpts = useMemo(
    () =>
      [...(excerptsByChapter.get('') ?? [])].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [excerptsByChapter],
  )

  const trimmedNewExcerpt = newExcerptContent.trim()

  const contentLooksChapterized = useMemo(
    () =>
      isCloudMode && trimmedNewExcerpt
        ? looksChapterized(trimmedNewExcerpt)
        : false,
    [isCloudMode, trimmedNewExcerpt],
  )

  const splitPreview = useMemo(() => {
    if (!contentLooksChapterized || !isAutoSplitEnabled) return null
    const pieces = chapterize(trimmedNewExcerpt)
    const titles = Array.from(
      new Set(
        pieces
          .map((piece) => piece.chapterTitle)
          .filter((title): title is string => Boolean(title)),
      ),
    )
    return { count: pieces.length, titles }
  }, [contentLooksChapterized, isAutoSplitEnabled, trimmedNewExcerpt])

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === activeConversationId,
      ) ?? null,
    [activeConversationId, conversations],
  )

  useEffect(() => {
    setConversationTitleDraft(activeConversation?.title ?? '')
  }, [activeConversation?.title, activeConversationId])

  const displayDiscussions = useMemo(() => {
    if (!book) return []
    if (!activeConversationId) return []
    const baseMessages = isCloudMode
      ? cloudDiscussionMessages
      : discussionMessages
    const pendingMessages = isCloudMode
      ? optimisticMessages.filter((message) => message.bookId === book.id)
      : []
    const filteredBase = activeConversationId
      ? baseMessages.filter(
          (message) => message.conversationId === activeConversationId,
        )
      : baseMessages
    const filteredPending = activeConversationId
      ? pendingMessages.filter(
          (message) => message.conversationId === activeConversationId,
        )
      : pendingMessages
    return sortDiscussionEntries([
      ...filteredBase,
      ...filteredPending,
    ])
  }, [
    activeConversationId,
    book,
    cloudDiscussionMessages,
    discussionMessages,
    isCloudMode,
    optimisticMessages,
  ])

  const selectedModelLabel = useMemo(() => {
    const current = modelOptions.find(
      (model) => model.id === selectedModel,
    )
    return current?.label ?? selectedModel
  }, [modelOptions, selectedModel])

  const isDeleteConfirmationValid =
    deleteConversationText.trim() === deleteConfirmPhrase
  const isClearConfirmationValid =
    clearConversationText.trim() === clearConfirmPhrase

  const monthStart = useMemo(
    () =>
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        1,
      ),
    [currentMonth],
  )

  const monthLabel = useMemo(
    () =>
      monthStart.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
      }),
    [monthStart],
  )

  const calendarDays = useMemo(() => {
    const year = monthStart.getFullYear()
    const month = monthStart.getMonth()
    const firstDay = monthStart.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const totalCells = Math.ceil(
      (firstDay + daysInMonth) / 7,
    ) * 7

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - firstDay + 1
      if (dayNumber < 1 || dayNumber > daysInMonth) return null
      return new Date(year, month, dayNumber)
    })
  }, [monthStart])

  const checkInDates = useMemo(
    () => new Set(displaySessions.map((session) => session.date)),
    [displaySessions],
  )

  const checkInStreak = useMemo(() => {
    let streak = 0
    const cursor = new Date()
    if (!checkInDates.has(formatDate(cursor))) {
      cursor.setDate(cursor.getDate() - 1)
    }
    while (checkInDates.has(formatDate(cursor))) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }, [checkInDates])

  const recentDays = useMemo(() => {
    const today = new Date()
    return Array.from(
      { length: 21 },
      (_, index) =>
        new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - (20 - index),
        ),
    )
  }, [])

  const handleToggleCheckIn = async (date: Date) => {
    if (!book) return
    const dateString = formatDate(date)
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端打卡。')
        return
      }
      const hasExisting = checkInDates.has(dateString)
      setCloudError(null)
      try {
        await toggleCloudCheckIn(
          session.user.id,
          book.id,
          dateString,
          hasExisting,
        )
        await refreshCloud()
      } catch (error) {
        console.error(error)
        setCloudError('云端打卡同步失败，请稍后重试。')
      }
      return
    }

    toggleCheckIn(book.id, dateString)
    setSessions(getCheckInsByBook(book.id))
  }

  const todayString = formatDate(new Date())

  const refreshExcerpts = () => {
    if (!book || isCloudMode) return
    setExcerpts(getExcerptsByBookId(book.id))
  }

  const refreshDiscussions = () => {
    if (!book || isCloudMode) return
    setDiscussionMessages(getMessagesByBookId(book.id))
  }

  const ensureActiveConversation = useCallback(async () => {
    if (activeConversationId) return activeConversationId
    if (!book?.id) return null
    if (isCloudMode) {
      if (!session?.user) return null
      const createdId = await createConversation(
        session.user.id,
        book.id,
        '新对话',
      )
      setActiveConversationId(createdId)
      await loadCloudConversations(book.id)
      return createdId
    }

    const created = createLocalConversation(book.id, '新对话')
    setConversations(getConversationsByBookId(book.id))
    setActiveConversationId(created.id)
    return created.id
  }, [
    activeConversationId,
    book?.id,
    isCloudMode,
    loadCloudConversations,
    session?.user,
  ])

  const handleCreateConversation = async () => {
    if (!book) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再创建云端对话。')
        return
      }
      setCloudError(null)
      try {
        const newId = await createConversation(
          session.user.id,
          book.id,
          '新对话',
        )
        setActiveConversationId(newId)
        await loadCloudConversations(book.id)
      } catch (error) {
        console.error(error)
        setCloudError('云端对话创建失败，请稍后重试。')
      }
      return
    }

    const created = createLocalConversation(book.id, '新对话')
    setConversations(getConversationsByBookId(book.id))
    setActiveConversationId(created.id)
  }

  const handleRequestDeleteConversation = () => {
    setIsConversationMenuOpen(false)
    setDeleteConversationText('')
    setIsConfirmingDeleteConversation(true)
  }

  const handleConfirmDeleteConversation = async () => {
    if (!book || !activeConversationId || !isDeleteConfirmationValid) return
    setIsConfirmingDeleteConversation(false)
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再删除云端对话。')
        return
      }
      setCloudError(null)
      try {
        await deleteConversation(session.user.id, activeConversationId)
        await loadCloudConversations(book.id)
      } catch (error) {
        console.error(error)
        setCloudError('云端对话删除失败，请稍后重试。')
      }
      return
    }

    deleteLocalConversation(activeConversationId)
    deleteMessagesByConversationId(activeConversationId)
    const nextConversations = getConversationsByBookId(book.id)
    const nextList =
      nextConversations.length > 0
        ? nextConversations
        : [ensureDefaultConversation(book.id)]
    setConversations(nextList)
    setActiveConversationId(nextList[0]?.id ?? null)
    refreshDiscussions()
  }

  const handleSaveConversationTitle = async () => {
    if (!activeConversation) return
    const trimmed = conversationTitleDraft.trim()
    if (!trimmed) {
      setConversationTitleDraft(activeConversation.title)
      return
    }
    if (trimmed === activeConversation.title) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再修改对话名称。')
        return
      }
      setCloudError(null)
      setIsSavingConversationTitle(true)
      try {
        await updateConversationTitle(
          session.user.id,
          activeConversation.id,
          trimmed,
        )
        await loadCloudConversations(activeConversation.bookId)
      } catch (error) {
        console.error(error)
        setCloudError('云端对话更新失败，请稍后重试。')
      } finally {
        setIsSavingConversationTitle(false)
      }
      return
    }

    updateLocalConversationTitle(activeConversation.id, trimmed)
    setConversations(getConversationsByBookId(activeConversation.bookId))
  }

  const nextChapterSortOrder = () =>
    chapters.reduce((max, chapter) => Math.max(max, chapter.sortOrder), 0) + 1

  const expandChapters = (chapterIds: string[]) => {
    if (chapterIds.length === 0) return
    setExpandedChapterIds((current) => {
      const next = new Set(current)
      chapterIds.forEach((id) => next.add(id))
      return next
    })
  }

  const handleCreateExcerpt = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!book) return
    const content = newExcerptContent.trim()
    if (!content) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书摘。')
        return
      }
      if (isSavingExcerpt) return
      if (newExcerptChapterId === '__new__' && !newChapterTitle.trim()) {
        setCloudError('请先填写新章节名称。')
        return
      }
      setCloudError(null)
      setIsSavingExcerpt(true)
      try {
        const userId = session.user.id
        let sortOrder = nextChapterSortOrder()
        const chapterIdsByTitle = new Map<string, string>()
        chapters.forEach((chapter) =>
          chapterIdsByTitle.set(chapter.title, chapter.id),
        )
        const ensureChapter = async (
          title: string,
        ): Promise<{ id: string; title: string }> => {
          const existing = chapterIdsByTitle.get(title)
          if (existing) return { id: existing, title }
          const id = await createCloudChapter(
            userId,
            book.id,
            title,
            sortOrder,
          )
          sortOrder += 1
          chapterIdsByTitle.set(title, id)
          return { id, title }
        }

        let selectedChapter: { id: string; title: string } | null = null
        if (newExcerptChapterId === '__new__') {
          selectedChapter = await ensureChapter(newChapterTitle.trim())
        } else if (newExcerptChapterId) {
          const chapter = chapterById.get(newExcerptChapterId)
          selectedChapter = chapter
            ? { id: chapter.id, title: chapter.title }
            : null
        }

        const pieces =
          isAutoSplitEnabled && looksChapterized(content)
            ? chapterize(content)
            : null
        const touchedChapterIds: string[] = []
        if (pieces && pieces.length > 0) {
          const items: Array<{
            content: string
            chapter?: { id: string; title: string } | null
          }> = []
          for (const piece of pieces) {
            const chapter = piece.chapterTitle
              ? await ensureChapter(piece.chapterTitle)
              : selectedChapter
            if (chapter) touchedChapterIds.push(chapter.id)
            items.push({ content: piece.body, chapter })
          }
          await createCloudExcerptsBatch(userId, book.id, items)
        } else {
          await createCloudExcerpt(userId, book.id, content, selectedChapter)
          if (selectedChapter) touchedChapterIds.push(selectedChapter.id)
        }

        await Promise.all([refreshCloud(), loadChapters(book.id)])
        expandChapters(touchedChapterIds)
        if (selectedChapter && newExcerptChapterId === '__new__') {
          setNewExcerptChapterId(selectedChapter.id)
          setNewChapterTitle('')
        }
        setNewExcerptContent('')
        setIsExcerptEditorOpen(false)
      } catch (error) {
        console.error(error)
        setCloudError('云端书摘保存失败，请稍后重试。')
      } finally {
        setIsSavingExcerpt(false)
      }
      return
    }

    const now = new Date().toISOString()
    const nextExcerpt: Excerpt = {
      id: crypto.randomUUID(),
      bookId: book.id,
      content,
      createdAt: now,
    }
    upsertExcerpt(nextExcerpt)
    setNewExcerptContent('')
    setIsExcerptEditorOpen(false)
    refreshExcerpts()
  }

  const handleCreateDiscussion = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (isSendingDiscussion || isAskingSyzygy || isStreamingReply) {
      setCloudError('请等待当前操作完成。')
      return
    }
    if (!book?.id) {
      setCloudError('无法发送讨论：缺少书籍 ID。')
      return
    }
    const content = newMessageContent.trim()
    if (!content) {
      setCloudError('请先输入内容再发送。')
      return
    }
    const conversationId = await ensureActiveConversation()
    if (!conversationId) {
      setCloudError('无法发送讨论：缺少对话信息。')
      return
    }
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端讨论。')
        return
      }
      setCloudError(null)
      setIsSendingDiscussion(true)
      try {
        await createCloudDiscussion(
          session.user.id,
          book.id,
          conversationId,
          content,
        )
        await loadCloudDiscussions(book.id, conversationId)
        setNewMessageContent('')
      } catch (error) {
        console.error(error)
        setCloudError('云端讨论发送失败，请稍后重试。')
      } finally {
        setIsSendingDiscussion(false)
      }
      return
    }

    const now = new Date().toISOString()
    const message: DiscussionMessage = {
      id: crypto.randomUUID(),
      bookId: book.id,
      conversationId,
      role: 'me',
      content,
      createdAt: now,
    }
    addMessage(message)
    setNewMessageContent('')
    refreshDiscussions()
  }

  const addOptimisticDiscussionPair = (content: string) => {
    if (!book || !activeConversationId) return null
    const userClientId = crypto.randomUUID()
    const assistantClientId = crypto.randomUUID()
    setOptimisticMessages((messages) => [
      ...messages,
      {
        clientId: userClientId,
        bookId: book.id,
        conversationId: activeConversationId,
        role: 'me',
        content,
        isPending: true,
      },
      {
        clientId: assistantClientId,
        bookId: book.id,
        conversationId: activeConversationId,
        role: 'syzygy',
        content: '',
        isPending: true,
      },
    ])
    return { userClientId, assistantClientId }
  }

  const updateOptimisticAssistant = (
    clientId: string,
    content: string,
  ) => {
    setOptimisticMessages((messages) =>
      messages.map((message) =>
        message.clientId === clientId
          ? { ...message, content }
          : message,
      ),
    )
  }

  const clearOptimisticPair = (clientIds: {
    userClientId: string
    assistantClientId: string
  }) => {
    setOptimisticMessages((messages) =>
      messages.filter(
        (message) =>
          message.clientId !== clientIds.userClientId &&
          message.clientId !== clientIds.assistantClientId,
      ),
    )
  }

  const handleAskSyzygy = async () => {
    if (isSendingDiscussion || isAskingSyzygy || isStreamingReply) {
      setCloudError('请等待当前操作完成。')
      return
    }
    if (!book?.id) {
      setCloudError('无法发送讨论：缺少书籍 ID。')
      return
    }
    const content = newMessageContent.trim()
    if (!content) {
      setCloudError('请先输入内容再让 Syzygy 回复。')
      return
    }
    if (!isCloudMode) {
      setCloudError('请先切换到云端模式后再使用 Syzygy。')
      return
    }
    if (!session?.user || !supabase) {
      setCloudError('请先登录后再让 Syzygy 回复。')
      return
    }
    if (!supabaseAnonKey) {
      setCloudError('Supabase 配置缺失，请稍后再试。')
      return
    }
    setCloudError(null)
    setIsAskingSyzygy(true)
    let optimisticIds: {
      userClientId: string
      assistantClientId: string
    } | null = null
    const conversationId = await ensureActiveConversation()
    if (!conversationId) {
      setCloudError('无法发送讨论：缺少对话信息。')
      setIsAskingSyzygy(false)
      return
    }
    try {
      const accessToken = session.access_token
      if (!accessToken) {
        setCloudError('请先登录后再让 Syzygy 回复。')
        setIsAskingSyzygy(false)
        return
      }
      if (import.meta.env.DEV) {
        const prefix = supabaseAnonKey.slice(0, 6)
        const suffix = supabaseAnonKey.slice(-4)
        console.debug(`Supabase anon key: ${prefix}...${suffix}`)
      }
      optimisticIds = addOptimisticDiscussionPair(content)
      if (!optimisticIds) {
        setIsAskingSyzygy(false)
        return
      }
      setNewMessageContent('')
      if (isStreamEnabled) {
        if (!supabaseUrl) {
          throw new Error('Supabase configuration is missing.')
        }
        const endpoint = `${supabaseUrl}/functions/v1/openrouter-chat`
        setIsStreamingReply(true)
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userMessage: content,
            bookId: book.id,
            conversationId,
            attachContext,
            stream: true,
          }),
        })

        if (!response.ok || !response.body) {
          throw new Error('Streaming response unavailable.')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finalReply = ''
        let finalModel: string | undefined
        let finalTemperature: number | undefined

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''
          for (const chunk of chunks) {
            const lines = chunk.split('\n')
            let eventType = 'message'
            const dataLines: string[] = []
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim()
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim())
              }
            }
            const data = dataLines.join('\n')
            if (!data) continue
            if (eventType === 'delta') {
              try {
                const parsed = JSON.parse(data) as { delta?: string }
                if (parsed.delta) {
                  finalReply += parsed.delta
                  updateOptimisticAssistant(
                    optimisticIds.assistantClientId,
                    finalReply,
                  )
                }
              } catch (error) {
                console.error('Failed to parse delta chunk', error)
              }
              continue
            }
            if (eventType === 'done') {
              try {
                const parsed = JSON.parse(data) as {
                  assistantReply?: string
                  usedModel?: string
                  usedTemperature?: number
                }
                finalReply = parsed.assistantReply ?? finalReply
                finalModel = parsed.usedModel
                finalTemperature = parsed.usedTemperature
              } catch (error) {
                console.error('Failed to parse final payload', error)
              }
            }
          }
        }

        if (!finalReply.trim()) {
          throw new Error('No assistant reply returned.')
        }
        updateOptimisticAssistant(
          optimisticIds.assistantClientId,
          finalReply,
        )

        await createCloudDiscussionMessages(
          session.user.id,
          book.id,
          conversationId,
          [
            { role: 'me', content },
            {
              role: 'syzygy',
              content: finalReply,
              metadata: {
                model: finalModel,
                temperature: finalTemperature,
              },
            },
          ],
        )
        await loadCloudDiscussions(book.id, conversationId)
        clearOptimisticPair(optimisticIds)
        return
      }

      const { data, error } = await supabase.functions.invoke(
        'openrouter-chat',
        {
          body: {
            userMessage: content,
            bookId: book.id,
            conversationId,
            attachContext,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseAnonKey,
          },
        },
      )

      if (error || !data?.assistantReply) {
        throw error ?? new Error('No assistant reply returned.')
      }

      updateOptimisticAssistant(
        optimisticIds.assistantClientId,
        data.assistantReply,
      )
      await createCloudDiscussionMessages(
        session.user.id,
        book.id,
        conversationId,
        [
          { role: 'me', content },
          {
            role: 'syzygy',
            content: data.assistantReply,
            metadata: {
              model: data.usedModel,
              temperature: data.usedTemperature,
            },
          },
        ],
      )
      await loadCloudDiscussions(book.id, conversationId)
      clearOptimisticPair(optimisticIds)
    } catch (error) {
      console.error(error)
      if (optimisticIds) {
        clearOptimisticPair(optimisticIds)
      }
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status?: unknown }).status === 'number'
          ? (error as { status?: number }).status
          : undefined
      if (status === 401 || status === 403) {
        setCloudError('请先登录后再让 Syzygy 回复。')
        return
      }
      setCloudError('Syzygy 回复失败，请稍后再试。')
    } finally {
      setIsAskingSyzygy(false)
      setIsStreamingReply(false)
    }
  }

  const handleGenerateReplyClick = () => {
    void handleAskSyzygy()
  }

  const isDiscussionActionLoading =
    isSendingDiscussion || isAskingSyzygy || isStreamingReply

  const handleStartEdit = (excerpt: Excerpt) => {
    setEditingExcerptId(excerpt.id)
    setEditingContent(excerpt.content)
    setOpenExcerptMenuId(null)
  }

  const handleCancelEdit = () => {
    setEditingExcerptId(null)
    setEditingContent('')
  }

  const handleSaveEdit = async (id: string) => {
    const content = editingContent.trim()
    if (!content) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书摘。')
        return
      }
      const target = displayExcerpts.find((excerpt) => excerpt.id === id)
      if (!target) return
      setCloudError(null)
      try {
        await updateCloudExcerpt(session.user.id, target, content)
        await refreshCloud()
        handleCancelEdit()
      } catch (error) {
        console.error(error)
        setCloudError('云端书摘更新失败，请稍后重试。')
      }
      return
    }

    updateExcerpt(id, { content })
    refreshExcerpts()
    handleCancelEdit()
  }

  const handleDeleteExcerpt = async (id: string) => {
    if (!window.confirm('确定要删除这条书摘吗？')) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端书摘。')
        return
      }
      setCloudError(null)
      try {
        await deleteCloudExcerpt(session.user.id, id)
        await refreshCloud()
      } catch (error) {
        console.error(error)
        setCloudError('云端书摘删除失败，请稍后重试。')
      }
      return
    }

    deleteExcerpt(id)
    refreshExcerpts()
  }

  const toggleChapterExpand = (chapterId: string) => {
    setExpandedChapterIds((current) => {
      const next = new Set(current)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }

  const handleStartRenameChapter = (chapter: Chapter) => {
    setOpenChapterMenuId(null)
    setRenamingChapterId(chapter.id)
    setRenameChapterDraft(chapter.title)
  }

  const handleSaveRenameChapter = async (chapter: Chapter) => {
    if (!book || !session?.user) return
    const title = renameChapterDraft.trim()
    if (!title || title === chapter.title) {
      setRenamingChapterId(null)
      return
    }
    if (chapters.some((item) => item.id !== chapter.id && item.title === title)) {
      setCloudError('已存在同名章节，请换一个名称。')
      return
    }
    setCloudError(null)
    try {
      await renameCloudChapter(session.user.id, chapter.id, title)
      setRenamingChapterId(null)
      await Promise.all([refreshCloud(), loadChapters(book.id)])
    } catch (error) {
      console.error(error)
      setCloudError('章节重命名失败，请稍后重试。')
    }
  }

  const handleDeleteChapter = async (chapter: Chapter) => {
    setOpenChapterMenuId(null)
    if (!book || !session?.user) return
    const count = (excerptsByChapter.get(chapter.id) ?? []).length
    const message =
      count > 0
        ? `删除章节「${chapter.title}」后，其中 ${count} 条书摘会移入未分章。确定删除吗？`
        : `确定删除空章节「${chapter.title}」吗？`
    if (!window.confirm(message)) return
    setCloudError(null)
    try {
      await deleteCloudChapter(session.user.id, chapter.id)
      await Promise.all([refreshCloud(), loadChapters(book.id)])
    } catch (error) {
      console.error(error)
      setCloudError('章节删除失败，请稍后重试。')
    }
  }

  const handleAddExcerptToChapter = (chapterId: string) => {
    setOpenChapterMenuId(null)
    setNewExcerptChapterId(chapterId)
    setNewChapterTitle('')
    setIsExcerptEditorOpen(true)
  }

  const handleRequestMoveExcerpt = (excerpt: Excerpt) => {
    setOpenExcerptMenuId(null)
    setMovingExcerpt(excerpt)
    setMoveTargetChapterId(excerpt.chapterId ?? '')
  }

  const handleConfirmMoveExcerpt = async () => {
    if (!book || !session?.user || !movingExcerpt) return
    const target = moveTargetChapterId
      ? chapterById.get(moveTargetChapterId)
      : null
    if ((movingExcerpt.chapterId ?? '') === (target?.id ?? '')) {
      setMovingExcerpt(null)
      return
    }
    setCloudError(null)
    try {
      await moveCloudExcerpt(
        session.user.id,
        movingExcerpt.id,
        target ? { id: target.id, title: target.title } : null,
      )
      setMovingExcerpt(null)
      await refreshCloud()
      if (target) expandChapters([target.id])
    } catch (error) {
      console.error(error)
      setCloudError('书摘移动失败，请稍后重试。')
    }
  }

  const handleToggleResonanceEditor = (excerptId: string) => {
    setResonanceEditorExcerptId((current) =>
      current === excerptId ? null : excerptId,
    )
    setResonanceDraft('')
    setResonanceSpeaker(RESONANCE_SPEAKER_OPTIONS[0])
  }

  const handleCreateResonance = async (
    event: FormEvent<HTMLFormElement>,
    excerpt: Excerpt,
  ) => {
    event.preventDefault()
    const content = resonanceDraft.trim()
    if (!content) return
    if (!session?.user) {
      setCloudError('请先登录后再新增 Syzygy 留言。')
      return
    }
    setCloudError(null)
    setIsSavingResonance(true)
    try {
      await createCloudResonance(
        session.user.id,
        excerpt.id,
        excerpt.bookId,
        resonanceSpeaker,
        content,
      )
      setResonanceDraft('')
      setResonanceEditorExcerptId(null)
      if (book) {
        await loadResonances(book.id)
      }
    } catch (error) {
      console.error(error)
      setCloudError('Syzygy 留言保存失败，请稍后重试。')
    } finally {
      setIsSavingResonance(false)
    }
  }

  const requireCloudUser = (): string | null => {
    if (!isCloudMode) {
      setCloudError('该内容需登录后在云端使用，请先切换到云端模式。')
      return null
    }
    if (!session?.user) {
      setCloudError('请先登录后再使用云端笔记。')
      return null
    }
    return session.user.id
  }

  const toggleQuestionExpand = (id: string) => {
    setExpandedQuestionIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleCreateQuestion = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    if (!book) return
    const question = newQuestion.trim()
    if (!question) {
      setCloudError('请先填写困惑内容。')
      return
    }
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    setIsSavingQuestion(true)
    try {
      await createCloudQuestion(
        userId,
        book.id,
        question,
        newQuestionChapter,
      )
      setNewQuestion('')
      setNewQuestionChapter('')
      await loadThinking(book.id)
    } catch (error) {
      console.error(error)
      setCloudError('困惑保存失败，请稍后重试。')
    } finally {
      setIsSavingQuestion(false)
    }
  }

  const handleStartEditQuestion = (question: BookQuestion) => {
    setEditingQuestionId(question.id)
    setEditingQuestionText(question.question)
    setEditingQuestionChapter(question.chapter ?? '')
    setOpenQuestionMenuId(null)
  }

  const handleCancelEditQuestion = () => {
    setEditingQuestionId(null)
    setEditingQuestionText('')
    setEditingQuestionChapter('')
  }

  const handleSaveEditQuestion = async (id: string) => {
    if (!book) return
    const question = editingQuestionText.trim()
    if (!question) return
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    try {
      await updateCloudQuestion(userId, id, {
        question,
        chapter: editingQuestionChapter,
      })
      handleCancelEditQuestion()
      await loadThinking(book.id)
    } catch (error) {
      console.error(error)
      setCloudError('困惑更新失败，请稍后重试。')
    }
  }

  const handleRequestDeleteQuestion = (question: BookQuestion) => {
    setOpenQuestionMenuId(null)
    setConfirmingDeleteQuestion(question)
  }

  const handleConfirmDeleteQuestion = async () => {
    if (!book || !confirmingDeleteQuestion) return
    const target = confirmingDeleteQuestion
    setConfirmingDeleteQuestion(null)
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    try {
      await deleteCloudQuestion(userId, target.id)
      await loadThinking(book.id)
    } catch (error) {
      console.error(error)
      setCloudError('困惑删除失败，请稍后重试。')
    }
  }

  const reconcileQuestionStatus = async (
    userId: string,
    question: BookQuestion,
    answerCount: number,
  ) => {
    const desired = answerCount > 0 ? 'answered' : 'open'
    if (question.status === desired) return
    try {
      await updateCloudQuestionStatus(userId, question.id, desired)
    } catch (error) {
      console.error('Failed to sync question status', error)
    }
  }

  const handleCreateAnswer = async (question: BookQuestion) => {
    if (!book) return
    const answer = (answerDrafts[question.id] ?? '').trim()
    if (!answer) {
      setCloudError('请先填写回答内容。')
      return
    }
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    const previousCount = (answersByQuestion[question.id] ?? []).length
    try {
      await createCloudAnswer(question.id, answer, 'chuanchuan')
      setAnswerDrafts((current) => ({ ...current, [question.id]: '' }))
      if (previousCount === 0) {
        await reconcileQuestionStatus(userId, question, 1)
      }
      await loadThinking(book.id)
    } catch (error) {
      console.error(error)
      setCloudError('回答保存失败，请稍后重试。')
    }
  }

  const handleStartEditAnswer = (answer: BookAnswer) => {
    setEditingAnswerId(answer.id)
    setEditingAnswerText(answer.answer)
  }

  const handleCancelEditAnswer = () => {
    setEditingAnswerId(null)
    setEditingAnswerText('')
  }

  const handleSaveEditAnswer = async (answer: BookAnswer) => {
    if (!book) return
    const content = editingAnswerText.trim()
    if (!content) return
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    try {
      await updateCloudAnswer(answer.id, content)
      handleCancelEditAnswer()
      await loadThinking(book.id)
    } catch (error) {
      console.error(error)
      setCloudError('回答更新失败，请稍后重试。')
    }
  }

  const handleConfirmDeleteAnswer = async () => {
    if (!book || !confirmingDeleteAnswer) return
    const target = confirmingDeleteAnswer
    setConfirmingDeleteAnswer(null)
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    const question = questions.find(
      (item) => item.id === target.questionId,
    )
    const remaining = (answersByQuestion[target.questionId] ?? []).filter(
      (item) => item.id !== target.id,
    ).length
    try {
      await deleteCloudAnswer(target.id)
      if (question && remaining === 0) {
        await reconcileQuestionStatus(userId, question, 0)
      }
      await loadThinking(book.id)
    } catch (error) {
      console.error(error)
      setCloudError('回答删除失败，请稍后重试。')
    }
  }

  const updateCompanionDraft = (
    kind: CompanionKind,
    patch: Partial<CompanionDraft>,
  ) => {
    setCompanionDrafts((current) => ({
      ...current,
      [kind]: { ...current[kind], ...patch },
    }))
  }

  const resolveCompanionWriter = (draft: CompanionDraft): string => {
    const writer =
      draft.writer === CUSTOM_WRITER_VALUE
        ? draft.customWriter
        : draft.writer
    return writer.trim()
  }

  const handleCreateCompanion = async (kind: CompanionKind) => {
    if (!book) return
    const label = COMPANION_KIND_META[kind].label
    const draft = companionDrafts[kind]
    const content = draft.content.trim()
    const writer = resolveCompanionWriter(draft)
    if (!content) {
      setCloudError(`请先填写${label}内容。`)
      return
    }
    if (!writer) {
      setCloudError('请填写自定义写入端名称。')
      return
    }
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    setIsSavingCompanion(true)
    try {
      await createCloudCompanionEntry(userId, book.id, kind, writer, content)
      updateCompanionDraft(kind, { content: '' })
      setCompanionFormOpen((current) => ({ ...current, [kind]: false }))
      await loadCompanions(book.id)
    } catch (error) {
      console.error(error)
      setCloudError(`${label}保存失败，请稍后重试。`)
    } finally {
      setIsSavingCompanion(false)
    }
  }

  const toggleCompanionExpand = (id: string) => {
    setExpandedCompanionIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleStartEditCompanion = (
    kind: CompanionKind,
    entry: CompanionEntry,
  ) => {
    setOpenCompanionMenuId(null)
    setEditingCompanion({ kind, id: entry.id })
    setEditingCompanionText(entry.content)
    // 编辑态强制展开，保存后也维持展开，方便核对刚改完的内容
    setExpandedCompanionIds((current) => {
      if (current.has(entry.id)) return current
      const next = new Set(current)
      next.add(entry.id)
      return next
    })
  }

  const handleCancelEditCompanion = () => {
    setEditingCompanion(null)
    setEditingCompanionText('')
  }

  const handleSaveEditCompanion = async () => {
    if (!book || !editingCompanion) return
    const label = COMPANION_KIND_META[editingCompanion.kind].label
    const content = editingCompanionText.trim()
    if (!content) return
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    try {
      await updateCloudCompanionEntry(
        userId,
        editingCompanion.kind,
        editingCompanion.id,
        content,
      )
      handleCancelEditCompanion()
      await loadCompanions(book.id)
    } catch (error) {
      console.error(error)
      setCloudError(`${label}更新失败，请稍后重试。`)
    }
  }

  const handleRequestDeleteCompanion = (
    kind: CompanionKind,
    entry: CompanionEntry,
  ) => {
    setOpenCompanionMenuId(null)
    setConfirmingDeleteCompanion({ kind, entry })
  }

  const handleConfirmDeleteCompanion = async () => {
    if (!book || !confirmingDeleteCompanion) return
    const target = confirmingDeleteCompanion
    const label = COMPANION_KIND_META[target.kind].label
    setConfirmingDeleteCompanion(null)
    const userId = requireCloudUser()
    if (!userId) return
    setCloudError(null)
    try {
      await deleteCloudCompanionEntry(userId, target.kind, target.entry.id)
      await loadCompanions(book.id)
    } catch (error) {
      console.error(error)
      setCloudError(`${label}删除失败，请稍后重试。`)
    }
  }

  const handleRequestDeleteDiscussion = (
    message: DiscussionMessage,
  ) => {
    setConfirmingDiscussion(message)
    setOpenDiscussionMenuId(null)
  }

  const handleConfirmDeleteDiscussion = async () => {
    if (!confirmingDiscussion) return
    const message = confirmingDiscussion
    setConfirmingDiscussion(null)
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端讨论。')
        return
      }
      setCloudError(null)
      try {
        await deleteCloudDiscussion(
          session.user.id,
          message.bookId,
          message.id,
        )
        await loadCloudDiscussions(
          message.bookId,
          message.conversationId,
        )
      } catch (error) {
        console.error(error)
        setCloudError('云端讨论删除失败，请稍后重试。')
      }
      return
    }

    deleteMessage(message.id)
    refreshDiscussions()
  }

  const handleRequestClearDiscussions = () => {
    setIsConversationMenuOpen(false)
    setClearConversationText('')
    setIsConfirmingClearDiscussions(true)
  }

  const handleConfirmClearDiscussions = async () => {
    if (!book || !activeConversationId || !isClearConfirmationValid) return
    setIsConfirmingClearDiscussions(false)
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端讨论。')
        return
      }
      setCloudError(null)
      try {
        await deleteCloudDiscussionsByConversation(
          session.user.id,
          activeConversationId,
        )
        await loadCloudDiscussions(book.id, activeConversationId)
      } catch (error) {
        console.error(error)
        setCloudError('云端讨论清空失败，请稍后重试。')
      }
      return
    }

    deleteMessagesByConversationId(activeConversationId)
    refreshDiscussions()
  }

  const handleModelSelect = async (modelId: string) => {
    if (!session || !supabase) return
    if (isModelSaving) return
    if (modelId === selectedModel) {
      setIsModelMenuOpen(false)
      return
    }
    const previousModel = selectedModel
    setSelectedModel(modelId)
    setIsModelMenuOpen(false)
    setModelStatus('saving')
    setModelStatusMessage('更新中...')
    try {
      const { error } = await supabase
        .from('syzygy_settings')
        .upsert(
          {
            user_id: session.user.id,
            model: modelId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
      if (error) {
        throw error
      }
      setModelStatus('saved')
      setModelStatusMessage('Model updated')
    } catch (error) {
      console.error('Failed to update syzygy model', error)
      setSelectedModel(previousModel)
      setModelStatus('error')
      setModelStatusMessage('模型更新失败')
    }
  }

  const formatExcerptDate = (value: string) =>
    new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const renderResonances = (excerpt: Excerpt) => {
    const resonances = resonancesByExcerpt[excerpt.id] ?? []
    const isEditorOpen = resonanceEditorExcerptId === excerpt.id
    return (
      <div className="resonance-section">
        {resonances.length > 0 ? (
          <ul className="resonance-list">
            {resonances.map((resonance) => (
              <li key={resonance.id} className="resonance-item">
                <div className="resonance-head">
                  <span className="resonance-speaker">
                    {getResonanceSpeakerLabel(resonance.speaker)}
                  </span>
                  <span className="resonance-date">
                    {formatExcerptDate(resonance.createdAt)}
                  </span>
                </div>
                <p className="resonance-content">{resonance.content}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="resonance-footer">
          <button
            type="button"
            className="resonance-add-toggle"
            onClick={() => handleToggleResonanceEditor(excerpt.id)}
          >
            {isEditorOpen
              ? '取消'
              : resonances.length > 0
                ? '+ 添加旁批'
                : '+ 添加 Syzygy 留言'}
          </button>
        </div>
        {isEditorOpen ? (
          <form
            className="resonance-form"
            onSubmit={(event) => handleCreateResonance(event, excerpt)}
          >
            <div className="resonance-form-row">
              <label className="resonance-speaker-field">
                <span>来源</span>
                <select
                  value={resonanceSpeaker}
                  onChange={(event) =>
                    setResonanceSpeaker(event.target.value)
                  }
                >
                  {RESONANCE_SPEAKER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getResonanceSpeakerLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <AutoResizeTextarea
              className="excerpt-textarea"
              rows={2}
              value={resonanceDraft}
              onChange={(event) => setResonanceDraft(event.target.value)}
              placeholder="写下共读旁批、感想或追问"
            />
            <div className="form-actions">
              <button
                type="submit"
                className="button primary"
                disabled={isSavingResonance || !resonanceDraft.trim()}
              >
                {isSavingResonance ? '保存中...' : '保存留言'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    )
  }

  const renderExcerptItem = (excerpt: Excerpt) => {
    const isEditing = editingExcerptId === excerpt.id
    const isMenuOpen = openExcerptMenuId === excerpt.id
    return (
      <li key={excerpt.id} className="excerpt-entry">
        {isEditing ? (
          <div className="excerpt-edit">
            <label className="field">
              <span>编辑书摘</span>
              <AutoResizeTextarea
                className="excerpt-textarea"
                rows={3}
                value={editingContent}
                onChange={(event) =>
                  setEditingContent(event.target.value)
                }
              />
            </label>
            <div className="form-actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => handleSaveEdit(excerpt.id)}
              >
                保存
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={handleCancelEdit}
              >
                取消
              </Button>
            </div>
          </div>
        ) : (
          <article className="excerpt-body">
            <header className="excerpt-entry-head">
              <span className="excerpt-date">
                {formatExcerptDate(excerpt.createdAt)}
              </span>
              <div className="menu">
                <button
                  type="button"
                  className="kebab-button"
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  aria-label="书摘操作"
                  onClick={() =>
                    setOpenExcerptMenuId(
                      isMenuOpen ? null : excerpt.id,
                    )
                  }
                >
                  ⋯
                </button>
                {isMenuOpen ? (
                  <div className="menu-panel" role="menu">
                    <button
                      className="menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => handleStartEdit(excerpt)}
                    >
                      编辑
                    </button>
                    {isCloudMode ? (
                      <button
                        className="menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() => handleRequestMoveExcerpt(excerpt)}
                      >
                        移动到章节
                      </button>
                    ) : null}
                    <button
                      className="menu-item danger"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenExcerptMenuId(null)
                        handleDeleteExcerpt(excerpt.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </div>
            </header>
            <p className="excerpt-content">{excerpt.content}</p>
            {isCloudMode ? renderResonances(excerpt) : null}
          </article>
        )}
      </li>
    )
  }

  const renderChapterGroup = (chapter: Chapter | null) => {
    const key = chapter?.id ?? '__none__'
    const chapterExcerpts = chapter
      ? excerptsByChapter.get(chapter.id) ?? []
      : unchapteredExcerpts
    const isExpanded = expandedChapterIds.has(key)
    const isMenuOpen = chapter ? openChapterMenuId === chapter.id : false
    const isRenaming = chapter ? renamingChapterId === chapter.id : false
    return (
      <div key={key} className="chapter-group">
        <div className="chapter-head">
          {isRenaming && chapter ? (
            <div className="chapter-rename">
              <input
                type="text"
                className="chapter-input"
                value={renameChapterDraft}
                onChange={(event) =>
                  setRenameChapterDraft(event.target.value)
                }
              />
              <Button
                variant="outline"
                type="button"
                onClick={() => handleSaveRenameChapter(chapter)}
              >
                保存
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => setRenamingChapterId(null)}
              >
                取消
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="chapter-toggle"
                aria-expanded={isExpanded}
                onClick={() => toggleChapterExpand(key)}
              >
                <span
                  className={`question-chevron${isExpanded ? ' open' : ''}`}
                  aria-hidden="true"
                >
                  ▸
                </span>
                <span className="chapter-title">
                  {chapter ? chapter.title : '未分章'}
                </span>
                <span className="chapter-count">
                  {chapterExcerpts.length} 则
                </span>
              </button>
              {chapter ? (
                <div className="menu">
                  <button
                    type="button"
                    className="kebab-button"
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    aria-label="章节操作"
                    onClick={() =>
                      setOpenChapterMenuId(
                        isMenuOpen ? null : chapter.id,
                      )
                    }
                  >
                    ⋯
                  </button>
                  {isMenuOpen ? (
                    <div className="menu-panel" role="menu">
                      <button
                        className="menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          handleAddExcerptToChapter(chapter.id)
                        }
                      >
                        添加书摘
                      </button>
                      <button
                        className="menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() => handleStartRenameChapter(chapter)}
                      >
                        重命名
                      </button>
                      <button
                        className="menu-item danger"
                        type="button"
                        role="menuitem"
                        onClick={() => void handleDeleteChapter(chapter)}
                      >
                        删除章节
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        {isExpanded ? (
          chapterExcerpts.length === 0 ? (
            <p className="muted">本章还没有书摘。</p>
          ) : (
            <ul className="list excerpt-list chapter-excerpt-list">
              {chapterExcerpts.map(renderExcerptItem)}
            </ul>
          )
        ) : null}
      </div>
    )
  }

  const renderExcerptFormControls = () =>
    isCloudMode ? (
      <>
        <div className="excerpt-chapter-row">
          <label className="resonance-speaker-field excerpt-chapter-field">
            <span>章节</span>
            <select
              value={newExcerptChapterId}
              onChange={(event) =>
                setNewExcerptChapterId(event.target.value)
              }
            >
              <option value="">未分章</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
              <option value="__new__">＋ 新建章节…</option>
            </select>
          </label>
          {newExcerptChapterId === '__new__' ? (
            <label className="resonance-speaker-field excerpt-chapter-field">
              <span>新章节名称</span>
              <input
                type="text"
                className="chapter-input"
                value={newChapterTitle}
                onChange={(event) =>
                  setNewChapterTitle(event.target.value)
                }
                placeholder="如：愚人船 / 7月13日"
              />
            </label>
          ) : null}
        </div>
        {contentLooksChapterized ? (
          <label className="excerpt-split-toggle">
            <input
              type="checkbox"
              checked={isAutoSplitEnabled}
              onChange={(event) =>
                setIsAutoSplitEnabled(event.target.checked)
              }
            />
            <span>
              {splitPreview
                ? `自动拆分：将拆出 ${splitPreview.count} 条书摘${
                    splitPreview.titles.length > 0
                      ? `（章节：${splitPreview.titles.join('、')}）`
                      : ''
                  }`
                : '自动拆分（检测到《章节》/# 格式）'}
            </span>
          </label>
        ) : null}
      </>
    ) : null

  const renderCompanionEntry = (
    kind: CompanionKind,
    entry: CompanionEntry,
  ) => {
    const isEditing =
      editingCompanion?.kind === kind && editingCompanion.id === entry.id
    const isMenuOpen = openCompanionMenuId === entry.id
    const isExpanded = isEditing || expandedCompanionIds.has(entry.id)
    const preview = getCompanionPreview(entry.content)
    return (
      <article key={entry.id} className="companion-entry">
        <header className="companion-entry-head">
          <button
            type="button"
            className="companion-toggle"
            aria-expanded={isExpanded}
            onClick={() => toggleCompanionExpand(entry.id)}
          >
            <span
              className={`companion-chevron${isExpanded ? ' open' : ''}`}
              aria-hidden="true"
            >
              ▸
            </span>
            <span className="companion-toggle-main">
              <span className="companion-entry-byline">
                <span className="companion-writer">
                  {getCompanionWriterLabel(entry.writtenBy)}
                </span>
                <span className="companion-date">
                  {formatExcerptDate(entry.createdAt)}
                </span>
              </span>
              {!isExpanded && preview ? (
                <span className="companion-preview">{preview}</span>
              ) : null}
            </span>
          </button>
          <div className="menu">
            <button
              type="button"
              className="kebab-button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label={`${COMPANION_KIND_META[kind].label}操作`}
              onClick={() =>
                setOpenCompanionMenuId(isMenuOpen ? null : entry.id)
              }
            >
              ⋯
            </button>
            {isMenuOpen ? (
              <div className="menu-panel" role="menu">
                <button
                  className="menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => handleStartEditCompanion(kind, entry)}
                >
                  编辑
                </button>
                <button
                  className="menu-item danger"
                  type="button"
                  role="menuitem"
                  onClick={() => handleRequestDeleteCompanion(kind, entry)}
                >
                  删除
                </button>
              </div>
            ) : null}
          </div>
        </header>
        {isExpanded ? (
          isEditing ? (
            <div className="stack companion-edit">
              <AutoResizeTextarea
                className="excerpt-textarea"
                rows={4}
                value={editingCompanionText}
                onChange={(event) =>
                  setEditingCompanionText(event.target.value)
                }
              />
              <div className="form-actions">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void handleSaveEditCompanion()}
                >
                  保存
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleCancelEditCompanion}
                >
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="companion-entry-body">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                {entry.content}
              </ReactMarkdown>
            </div>
          )
        ) : null}
      </article>
    )
  }

  const renderCompanionPanel = (kind: CompanionKind) => {
    const label = COMPANION_KIND_META[kind].label
    if (!isCloudMode) {
      return (
        <p className="muted thinking-empty">
          {label}保存在云端，请登录后切换到云端模式使用。
        </p>
      )
    }
    const entries = companionEntries[kind]
    const draft = companionDrafts[kind]
    const isFormOpen = companionFormOpen[kind]
    const emptyHint =
      kind === 'guide'
        ? '还没有导读。开新书前，先请写入端们留下一份阅读辅助吧。'
        : '还没有总结。合上书之后，写下你们的感想吧。'
    return (
      <div className="companion-panel">
        {isFormOpen ? (
          <form
            className="form companion-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreateCompanion(kind)
            }}
          >
            <div className="resonance-form-row">
              <label className="resonance-speaker-field">
                <span>写入端</span>
                <select
                  value={draft.writer}
                  onChange={(event) =>
                    updateCompanionDraft(kind, {
                      writer: event.target.value,
                    })
                  }
                >
                  {COMPANION_WRITER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {getCompanionWriterLabel(option)}
                    </option>
                  ))}
                  <option value={CUSTOM_WRITER_VALUE}>自定义…</option>
                </select>
              </label>
              {draft.writer === CUSTOM_WRITER_VALUE ? (
                <label className="resonance-speaker-field">
                  <span>自定义写入端</span>
                  <input
                    type="text"
                    value={draft.customWriter}
                    onChange={(event) =>
                      updateCompanionDraft(kind, {
                        customWriter: event.target.value,
                      })
                    }
                    placeholder="如 syzygy-gemini"
                  />
                </label>
              ) : null}
            </div>
            <label className="field">
              <span>{`新写一篇${label}（支持 Markdown）`}</span>
              <AutoResizeTextarea
                className="excerpt-textarea"
                rows={4}
                value={draft.content}
                onChange={(event) =>
                  updateCompanionDraft(kind, {
                    content: event.target.value,
                  })
                }
                placeholder={
                  kind === 'guide'
                    ? '开书之前的阅读辅助：背景、人物表、阅读路线……'
                    : '合上书之后：印象最深的段落、感想、想说的话……'
                }
              />
            </label>
            <div className="form-actions">
              <button
                type="submit"
                className="button primary"
                disabled={isSavingCompanion}
              >
                {isSavingCompanion ? '保存中...' : `保存${label}`}
              </button>
            </div>
          </form>
        ) : null}
        {companionLoading && entries.length === 0 ? (
          <p className="muted">加载中...</p>
        ) : entries.length === 0 ? (
          <p className="muted">{emptyHint}</p>
        ) : (
          <div className="companion-list">
            {entries.map((entry) => renderCompanionEntry(kind, entry))}
          </div>
        )}
      </div>
    )
  }

  if (!book && isCloudMode && cloudLoading) {
    return (
      <section className="stack">
        <h2>加载中...</h2>
        <p className="muted">正在加载云端书籍详情。</p>
      </section>
    )
  }

  if (!book) {
    return (
      <section className="stack">
        <h2>未找到此书</h2>
        <p className="muted">
          无法找到这本书，请返回书架选择其他标题。
        </p>
        <Link className="button primary" to="/books">
          返回书架
        </Link>
      </section>
    )
  }

  return (
    <>
      <section className="stack screen-only">
        <div className="page-header">
          <div>
            <p className="eyebrow">书籍详情</p>
            <h2>{book.title}</h2>
            <p className="muted">{book.author || '作者未知'}</p>
            {cloudError ? (
              <p className="notice error">{cloudError}</p>
            ) : null}
          </div>
          <div className="page-header-actions">
            <button
              className="button"
              type="button"
              onClick={() => window.print()}
            >
              打印
            </button>
            <Link className="button ghost" to="/books">
              返回书架
            </Link>
          </div>
        </div>

        <div className="card detail-hero">
          <div className="detail-hero-cover">
            {book.cover ? (
              <img src={book.cover} alt={`${book.title} cover`} />
            ) : (
              <div className="detail-spine" aria-hidden="true">
                {Array.from(book.title).slice(0, 6).map((char, index) => (
                  <span key={index}>{char}</span>
                ))}
                {Array.from(book.title).length > 6 ? <span>…</span> : null}
              </div>
            )}
          </div>
          <div className="detail-hero-meta">
            <div className="hero-field">
              <span className="hero-label">状态</span>
              <strong className="hero-value hero-accent">
                {statusLabels[book.status]}
              </strong>
            </div>
            <div className="hero-field">
              <span className="hero-label">评分</span>
              {book.rating ? (
                <strong
                  className="hero-value hero-stars"
                  aria-label={`评分 ${book.rating} / 5`}
                >
                  {'★'.repeat(
                    Math.min(5, Math.max(1, Math.round(book.rating))),
                  )}
                </strong>
              ) : (
                <strong className="hero-value hero-value-empty">
                  未评分
                </strong>
              )}
            </div>
            <div className="hero-field">
              <span className="hero-label">译者</span>
              <strong className="hero-value">
                {book.translator || '—'}
              </strong>
            </div>
            <div className="hero-field">
              <span className="hero-label">类型</span>
              <strong className="hero-value">{book.genre || '—'}</strong>
            </div>
            <div className="hero-field">
              <span className="hero-label">起止</span>
              <strong className="hero-value">
                {book.startDate || book.endDate
                  ? `${
                      book.startDate
                        ? formatRangeDate(book.startDate)
                        : '…'
                    } → ${
                      book.endDate
                        ? formatRangeDate(book.endDate)
                        : '至今'
                    }`
                  : '—'}
              </strong>
            </div>
            {book.notes ? (
              <div className="hero-field hero-notes">
                <span className="hero-label">笔记</span>
                <button
                  type="button"
                  className={`hero-notes-text${
                    isNotesExpanded ? ' expanded' : ''
                  }`}
                  aria-expanded={isNotesExpanded}
                  title={isNotesExpanded ? '收起' : '展开全文'}
                  onClick={() => setIsNotesExpanded((value) => !value)}
                >
                  {book.notes}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card stack checkin-card">
          <div className="card-header">
            <h3>阅读打卡</h3>
            <span className="checkin-summary">
              <strong>{displaySessions.length}</strong> 次
              {checkInStreak > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  连续 <strong>{checkInStreak}</strong> 天
                </>
              ) : null}
            </span>
          </div>
          <div className="checkin-strip" role="group" aria-label="最近打卡记录">
            {recentDays.map((date) => {
              const dateString = formatDate(date)
              const isChecked = checkInDates.has(dateString)
              const isToday = dateString === todayString
              return (
                <button
                  key={dateString}
                  type="button"
                  className={`checkin-cell${isChecked ? ' checked' : ''}${
                    isToday ? ' today' : ''
                  }`}
                  title={`${dateString} ${isChecked ? '已打卡' : '未打卡'}`}
                  aria-pressed={isChecked}
                  onClick={() => handleToggleCheckIn(date)}
                />
              )
            })}
          </div>
          <div className="checkin-footer">
            <span className="muted checkin-hint">
              深色 = 已打卡 · 点击方块打卡或补卡
            </span>
            <button
              type="button"
              className="checkin-calendar-toggle"
              aria-expanded={isCalendarOpen}
              onClick={() => setIsCalendarOpen((value) => !value)}
            >
              {isCalendarOpen ? '收起日历 ▴' : '完整日历 ▾'}
            </button>
          </div>
          {isCalendarOpen ? (
            <div className="stack checkin-calendar">
              <div className="calendar-header">
                <strong className="calendar-title">{monthLabel}</strong>
                <div className="calendar-nav">
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(
                          monthStart.getFullYear(),
                          monthStart.getMonth() - 1,
                          1,
                        ),
                      )
                    }
                  >
                    上个月
                  </button>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(
                          monthStart.getFullYear(),
                          monthStart.getMonth() + 1,
                          1,
                        ),
                      )
                    }
                  >
                    下个月
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => setCurrentMonth(new Date())}
                  >
                    今天
                  </button>
                </div>
              </div>
              <div className="calendar-weekdays">
                {weekDays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarDays.map((date, index) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className="calendar-day empty"
                      />
                    )
                  }

                  const dateString = formatDate(date)
                  const isChecked = checkInDates.has(dateString)
                  const isToday = dateString === todayString

                  return (
                    <button
                      key={dateString}
                      type="button"
                      className={`calendar-day${
                        isChecked ? ' checked' : ''
                      }${isToday ? ' today' : ''}`}
                      onClick={() => handleToggleCheckIn(date)}
                    >
                      <span className="calendar-date">
                        {date.getDate()}
                      </span>
                      {isChecked ? (
                        <span className="calendar-dot" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        <div className="card stack note-card">
          <div className="note-card-top">
            <div
              className="note-tabs"
              role="tablist"
              aria-label="书摘与思考"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeNoteTab === 'excerpts'}
                className={`note-tab${
                  activeNoteTab === 'excerpts' ? ' active' : ''
                }`}
                onClick={() => setActiveNoteTab('excerpts')}
              >
                书摘
                <span className="note-tab-count">
                  {displayExcerpts.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeNoteTab === 'thinking'}
                className={`note-tab${
                  activeNoteTab === 'thinking' ? ' active' : ''
                }`}
                onClick={() => setActiveNoteTab('thinking')}
              >
                思考
                <span className="note-tab-count">{questions.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeNoteTab === 'guide'}
                className={`note-tab${
                  activeNoteTab === 'guide' ? ' active' : ''
                }`}
                onClick={() => setActiveNoteTab('guide')}
              >
                导读
                <span className="note-tab-count">
                  {companionEntries.guide.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeNoteTab === 'summary'}
                className={`note-tab${
                  activeNoteTab === 'summary' ? ' active' : ''
                }`}
                onClick={() => setActiveNoteTab('summary')}
              >
                总结
                <span className="note-tab-count">
                  {companionEntries.summary.length}
                </span>
              </button>
            </div>
            {activeNoteTab === 'excerpts' ? (
              <button
                type="button"
                className="button ghost note-add-toggle"
                aria-expanded={isExcerptFormOpen}
                onClick={() => setIsExcerptFormOpen((value) => !value)}
              >
                {isExcerptFormOpen ? '收起' : '＋ 新增'}
              </button>
            ) : activeNoteTab === 'guide' || activeNoteTab === 'summary' ? (
              isCloudMode ? (
                <button
                  type="button"
                  className="button ghost note-add-toggle"
                  aria-expanded={companionFormOpen[activeNoteTab]}
                  onClick={() =>
                    setCompanionFormOpen((current) => ({
                      ...current,
                      [activeNoteTab]: !current[activeNoteTab],
                    }))
                  }
                >
                  {companionFormOpen[activeNoteTab] ? '收起' : '＋ 新增'}
                </button>
              ) : null
            ) : null}
          </div>
          {activeNoteTab === 'excerpts' ? (
          <>
          {isExcerptFormOpen || isExcerptEditorOpen ? (
          <form className="form" onSubmit={handleCreateExcerpt}>
            <label className="field">
              <span>新增书摘</span>
              <AutoResizeTextarea
                className="excerpt-textarea"
                rows={3}
                value={newExcerptContent}
                onChange={(event) =>
                  setNewExcerptContent(event.target.value)
                }
                placeholder="记录喜欢的句子或段落"
              />
            </label>
            {renderExcerptFormControls()}
            <div className="excerpt-editor-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setIsExcerptEditorOpen(true)}
              >
                全屏编辑
              </button>
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="button primary"
                disabled={isSavingExcerpt}
              >
                {isSavingExcerpt ? '保存中...' : '保存书摘'}
              </button>
            </div>
            {isExcerptEditorOpen ? (
              <div
                className="excerpt-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label="全屏编辑书摘"
                onClick={() => setIsExcerptEditorOpen(false)}
              >
                <div
                  className="excerpt-modal"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="excerpt-modal-header">
                    <h4>全屏编辑</h4>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setIsExcerptEditorOpen(false)}
                    >
                      关闭
                    </button>
                  </div>
                  <div className="excerpt-modal-body excerpt-editor-body">
                    <AutoResizeTextarea
                      ref={fullscreenTextareaRef}
                      className="excerpt-textarea excerpt-textarea-full"
                      value={newExcerptContent}
                      maxHeight="60vh"
                      onChange={(event) =>
                        setNewExcerptContent(event.target.value)
                      }
                      placeholder="记录喜欢的句子或段落"
                    />
                    {renderExcerptFormControls()}
                  </div>
                  <div className="form-actions">
                    <button
                      type="submit"
                      className="button primary"
                      disabled={isSavingExcerpt}
                    >
                      {isSavingExcerpt ? '保存中...' : '保存书摘'}
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => setIsExcerptEditorOpen(false)}
                    >
                      完成
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </form>
          ) : null}
          {isCloudMode ? (
            chapters.length === 0 && displayExcerpts.length === 0 ? (
              <p className="muted">暂无书摘，先记录第一条吧。</p>
            ) : (
              <div className="stack chapter-groups">
                {chapters.map((chapter) => renderChapterGroup(chapter))}
                {unchapteredExcerpts.length > 0
                  ? renderChapterGroup(null)
                  : null}
              </div>
            )
          ) : displayExcerpts.length === 0 ? (
            <p className="muted">暂无书摘，先记录第一条吧。</p>
          ) : (
            <ul className="list excerpt-list">
              {displayExcerpts.map(renderExcerptItem)}
            </ul>
          )}
          </>
          ) : activeNoteTab === 'guide' || activeNoteTab === 'summary' ? (
            renderCompanionPanel(activeNoteTab)
          ) : !isCloudMode ? (
            <p className="muted thinking-empty">
              思考记录保存在云端，请登录后切换到云端模式使用。
            </p>
          ) : (
            <div className="thinking-panel">
              <form className="form" onSubmit={handleCreateQuestion}>
                <label className="field">
                  <span>新建困惑</span>
                  <AutoResizeTextarea
                    className="excerpt-textarea"
                    rows={3}
                    value={newQuestion}
                    onChange={(event) =>
                      setNewQuestion(event.target.value)
                    }
                    placeholder="写下你对这本书的困惑或问题"
                  />
                </label>
                <label className="field">
                  <span>章节（选填）</span>
                  <input
                    type="text"
                    className="chapter-input"
                    value={newQuestionChapter}
                    onChange={(event) =>
                      setNewQuestionChapter(event.target.value)
                    }
                    placeholder="如：第三章 / P42"
                  />
                </label>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="button primary"
                    disabled={isSavingQuestion || !newQuestion.trim()}
                  >
                    {isSavingQuestion ? '保存中...' : '保存'}
                  </button>
                </div>
              </form>
              {questionsLoading && questions.length === 0 ? (
                <p className="muted">加载中...</p>
              ) : questions.length === 0 ? (
                <p className="muted">暂无困惑，记录下第一个疑问吧。</p>
              ) : (
                <ul className="list question-list">
                  {questions.map((question) => {
                    const answers = answersByQuestion[question.id] ?? []
                    const isExpanded = expandedQuestionIds.has(
                      question.id,
                    )
                    const isEditing = editingQuestionId === question.id
                    const isMenuOpen =
                      openQuestionMenuId === question.id
                    return (
                      <li key={question.id} className="question-card">
                        {isEditing ? (
                          <div className="stack question-edit">
                            <label className="field">
                              <span>编辑困惑</span>
                              <AutoResizeTextarea
                                className="excerpt-textarea"
                                rows={3}
                                value={editingQuestionText}
                                onChange={(event) =>
                                  setEditingQuestionText(
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label className="field">
                              <span>章节（选填）</span>
                              <input
                                type="text"
                                className="chapter-input"
                                value={editingQuestionChapter}
                                onChange={(event) =>
                                  setEditingQuestionChapter(
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <div className="form-actions">
                              <Button
                                variant="outline"
                                type="button"
                                onClick={() =>
                                  handleSaveEditQuestion(question.id)
                                }
                              >
                                保存
                              </Button>
                              <Button
                                variant="outline"
                                type="button"
                                onClick={handleCancelEditQuestion}
                              >
                                取消
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="question-head">
                              <button
                                type="button"
                                className="question-toggle"
                                aria-expanded={isExpanded}
                                onClick={() =>
                                  toggleQuestionExpand(question.id)
                                }
                              >
                                <span
                                  className={`question-chevron${
                                    isExpanded ? ' open' : ''
                                  }`}
                                  aria-hidden="true"
                                >
                                  ▸
                                </span>
                                <span className="question-text">
                                  {question.question}
                                </span>
                              </button>
                              <div className="menu">
                                <ActionButton
                                  type="button"
                                  aria-haspopup="menu"
                                  aria-expanded={isMenuOpen}
                                  onClick={() =>
                                    setOpenQuestionMenuId(
                                      isMenuOpen ? null : question.id,
                                    )
                                  }
                                >
                                  ⋯ 更多
                                </ActionButton>
                                {isMenuOpen ? (
                                  <div
                                    className="menu-panel"
                                    role="menu"
                                  >
                                    <button
                                      className="menu-item"
                                      type="button"
                                      role="menuitem"
                                      onClick={() =>
                                        handleStartEditQuestion(
                                          question,
                                        )
                                      }
                                    >
                                      编辑
                                    </button>
                                    <button
                                      className="menu-item danger"
                                      type="button"
                                      role="menuitem"
                                      onClick={() =>
                                        handleRequestDeleteQuestion(
                                          question,
                                        )
                                      }
                                    >
                                      删除
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="question-meta">
                              <span
                                className={`status-badge status-${question.status}`}
                              >
                                {question.status === 'answered'
                                  ? '已解答'
                                  : '待解答'}
                              </span>
                              {question.chapter ? (
                                <span className="chip ghost">
                                  {question.chapter}
                                </span>
                              ) : null}
                              <span className="muted question-count">
                                {answers.length} 条回答
                              </span>
                              <span className="excerpt-date">
                                {formatExcerptDate(question.createdAt)}
                              </span>
                            </div>
                            {isExpanded ? (
                              <div className="answer-section">
                                {answers.length === 0 ? (
                                  <p className="muted">
                                    还没有回答。
                                  </p>
                                ) : (
                                  <ul className="answer-list">
                                    {answers.map((answer) => {
                                      const isAnswerEditing =
                                        editingAnswerId === answer.id
                                      return (
                                        <li
                                          key={answer.id}
                                          className="answer-item"
                                        >
                                          {isAnswerEditing ? (
                                            <div className="stack">
                                              <AutoResizeTextarea
                                                className="excerpt-textarea"
                                                rows={2}
                                                value={
                                                  editingAnswerText
                                                }
                                                onChange={(event) =>
                                                  setEditingAnswerText(
                                                    event.target
                                                      .value,
                                                  )
                                                }
                                              />
                                              <div className="form-actions">
                                                <Button
                                                  variant="outline"
                                                  type="button"
                                                  onClick={() =>
                                                    handleSaveEditAnswer(
                                                      answer,
                                                    )
                                                  }
                                                >
                                                  保存
                                                </Button>
                                                <Button
                                                  variant="outline"
                                                  type="button"
                                                  onClick={
                                                    handleCancelEditAnswer
                                                  }
                                                >
                                                  取消
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <>
                                              <div className="answer-head">
                                                <span className="answer-author">
                                                  {getAnsweredByLabel(
                                                    answer.answeredBy,
                                                  )}
                                                </span>
                                                <span className="excerpt-date">
                                                  {formatExcerptDate(
                                                    answer.createdAt,
                                                  )}
                                                </span>
                                              </div>
                                              <div className="answer-body">
                                                <ReactMarkdown
                                                  remarkPlugins={[
                                                    remarkGfm,
                                                    remarkBreaks,
                                                  ]}
                                                >
                                                  {answer.answer}
                                                </ReactMarkdown>
                                              </div>
                                              <div className="answer-actions">
                                                <button
                                                  type="button"
                                                  className="answer-action"
                                                  onClick={() =>
                                                    handleStartEditAnswer(
                                                      answer,
                                                    )
                                                  }
                                                >
                                                  编辑
                                                </button>
                                                <button
                                                  type="button"
                                                  className="answer-action danger"
                                                  onClick={() =>
                                                    setConfirmingDeleteAnswer(
                                                      answer,
                                                    )
                                                  }
                                                >
                                                  删除
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                                <form
                                  className="answer-form"
                                  onSubmit={(event) => {
                                    event.preventDefault()
                                    void handleCreateAnswer(question)
                                  }}
                                >
                                  <AutoResizeTextarea
                                    className="excerpt-textarea"
                                    rows={2}
                                    value={
                                      answerDrafts[question.id] ?? ''
                                    }
                                    onChange={(event) =>
                                      setAnswerDrafts((current) => ({
                                        ...current,
                                        [question.id]:
                                          event.target.value,
                                      }))
                                    }
                                    placeholder="补充一条回答（以串串身份）"
                                  />
                                  <div className="form-actions">
                                    <button
                                      type="submit"
                                      className="button primary"
                                      disabled={
                                        !(
                                          answerDrafts[question.id] ??
                                          ''
                                        ).trim()
                                      }
                                    >
                                      添加回答
                                    </button>
                                  </div>
                                </form>
                              </div>
                            ) : null}
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="collapsible-section discussion-section">
          <button
            className="collapsible-header discussion-collapse-header"
            type="button"
            aria-expanded={isDiscussionOpen}
            onClick={() => setIsDiscussionOpen((value) => !value)}
          >
            <span className="discussion-collapse-title">
              With Syzygy
              <span className="discussion-collapse-count">
                {displayDiscussions.length} 条
              </span>
            </span>
            <span className="collapsible-icon" aria-hidden="true">
              {isDiscussionOpen ? '−' : '+'}
            </span>
          </button>
          <div
            className={`collapsible-panel${
              isDiscussionOpen ? ' is-expanded' : ''
            }`}
            aria-hidden={!isDiscussionOpen}
          >
            <div className="collapsible-content">
        <div className="card stack discussion-card">
          <div className="card-header discussion-header">
            <div className="discussion-header-main">
              <div className="discussion-thread-summary">
                <span className="muted">当前对话</span>
                <span className="discussion-thread-name">
                  {activeConversation?.title || '未命名对话'}
                </span>
              </div>
            </div>
            <div className="discussion-header-actions">
              <button
                type="button"
                className="button ghost discussion-stamp"
                onClick={handleCreateConversation}
              >
                新建对话
              </button>
              <div className="menu">
                <button
                  type="button"
                  className="button ghost icon-button"
                  aria-haspopup="menu"
                  aria-expanded={isConversationMenuOpen}
                  aria-label="更多对话操作"
                  onClick={() =>
                    setIsConversationMenuOpen((value) => !value)
                  }
                >
                  ⋯
                </button>
                {isConversationMenuOpen ? (
                  <div className="menu-panel" role="menu">
                    <button
                      className="menu-item"
                      type="button"
                      role="menuitem"
                      disabled={!activeConversationId}
                      onClick={() => {
                        setIsConversationMenuOpen(false)
                        setConversationTitleDraft(
                          activeConversation?.title ?? '',
                        )
                        setIsRenamingConversation(true)
                      }}
                    >
                      重命名对话
                    </button>
                    <button
                      className="menu-item danger"
                      type="button"
                      role="menuitem"
                      disabled={
                        !activeConversationId ||
                        displayDiscussions.length === 0
                      }
                      onClick={handleRequestClearDiscussions}
                    >
                      清空当前对话
                    </button>
                    <button
                      className="menu-item danger"
                      type="button"
                      role="menuitem"
                      disabled={!activeConversationId}
                      onClick={handleRequestDeleteConversation}
                    >
                      删除当前对话
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {modelError ? <p className="notice error">{modelError}</p> : null}
          <div
            className={`discussion-conversations${
              isConversationListOpen ? ' is-open' : ''
            }`}
          >
            <button
              type="button"
              className="discussion-conversations-toggle"
              aria-expanded={isConversationListOpen}
              onClick={() =>
                setIsConversationListOpen((value) => !value)
              }
            >
              <div className="discussion-conversations-title">
                <h4>对话列表</h4>
                <span className="muted">
                  {conversations.length} 个
                </span>
              </div>
              <span
                className="discussion-conversations-chevron"
                aria-hidden="true"
              >
                ▾
              </span>
            </button>
            {isConversationListOpen ? (
              <div className="discussion-conversations-body">
                {conversations.length === 0 ? (
                  <p className="muted">
                    暂无对话，点击「新建对话」开始聊天。
                  </p>
                ) : (
                  <div className="discussion-conversation-list">
                    {conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        className={`conversation-chip${
                          conversation.id === activeConversationId
                            ? ' active'
                            : ''
                        }`}
                        onClick={() => {
                          setActiveConversationId(conversation.id)
                          setIsConversationListOpen(false)
                        }}
                      >
                        <span className="conversation-chip-title">
                          {conversation.title || '未命名对话'}
                        </span>
                        <span className="muted conversation-chip-date">
                          {formatExcerptDate(conversation.updatedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="chat-window">
            {displayDiscussions.length === 0 ? (
              <p className="muted chat-empty">
                暂无讨论，先写下你的想法吧。
              </p>
            ) : (
              <ul className="chat-list">
                {displayDiscussions.map((message) => {
                  const isMine = message.role === 'me'
                  const serverMessage = isServerDiscussionMessage(message)
                    ? message
                    : null
                  const isMenuOpen = serverMessage
                    ? openDiscussionMenuId === serverMessage.id
                    : false
                  const isPending =
                    'isPending' in message && message.isPending
                  const bubbleContent =
                    message.role === 'syzygy' &&
                    isPending &&
                    !message.content
                      ? '生成中...'
                      : message.content

                  return (
                    <li
                      key={getDiscussionKey(message)}
                      className={`chat-item ${isMine ? 'mine' : 'theirs'}`}
                    >
                      <div className="chat-message">
                        {!isMine ? (
                          <span className="chat-avatar" aria-hidden="true">
                            S
                          </span>
                        ) : null}
                        <div className="chat-body">
                          <div className="chat-bubble">
                            <div className="chat-bubble-content">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkBreaks]}
                              >
                                {bubbleContent}
                              </ReactMarkdown>
                            </div>
                          </div>
                          <div className="chat-meta">
                            <span className="chat-timestamp">
                              {message.createdAt
                                ? formatExcerptDate(message.createdAt)
                                : '发送中...'}
                            </span>
                            {serverMessage ? (
                              <div className="menu">
                                <button
                                  className="button ghost"
                                  type="button"
                                  aria-haspopup="menu"
                                  aria-expanded={isMenuOpen}
                                  onClick={() =>
                                    setOpenDiscussionMenuId(
                                      isMenuOpen ? null : serverMessage.id,
                                    )
                                  }
                                >
                                  ⋯ 更多
                                </button>
                                {isMenuOpen ? (
                                  <div className="menu-panel" role="menu">
                                    <button
                                      className="menu-item"
                                      type="button"
                                      role="menuitem"
                                      onClick={() =>
                                        handleCopyDiscussionMessage(
                                          serverMessage,
                                        )
                                      }
                                    >
                                      📋 Copy Text
                                    </button>
                                    <button
                                      className="menu-item"
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenDiscussionMenuId(null)
                                        setInfoDiscussion(serverMessage)
                                      }}
                                    >
                                      ℹ️ View Info
                                    </button>
                                    <button
                                      className="menu-item danger"
                                      type="button"
                                      role="menuitem"
                                      onClick={() =>
                                        handleRequestDeleteDiscussion(
                                          serverMessage,
                                        )
                                      }
                                    >
                                      删除
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <form className="form" onSubmit={handleCreateDiscussion}>
            <label className="field">
              <span>我的想法</span>
              <textarea
                rows={3}
                value={newMessageContent}
                onChange={(event) =>
                  setNewMessageContent(event.target.value)
                }
                placeholder="写下你的想法或问题"
              />
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={attachContext}
                onChange={(event) =>
                  setAttachContext(event.target.checked)
                }
              />
              <span>附带阅读上下文</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={isStreamEnabled}
                onChange={(event) =>
                  setIsStreamEnabled(event.target.checked)
                }
              />
              <span>流式输出</span>
            </label>
            <div className="discussion-form-footer">
              {canSwitchModel ? (
                <div className="discussion-model">
                  <span className="muted">Model</span>
                  <div className="menu">
                    <button
                      type="button"
                      className="button ghost model-toggle"
                      aria-haspopup="listbox"
                      aria-expanded={isModelMenuOpen}
                      onClick={() =>
                        setIsModelMenuOpen((value) =>
                          isModelSaving ? false : !value,
                        )
                      }
                      disabled={
                        modelLoading ||
                        modelOptions.length === 0 ||
                        isModelSaving
                      }
                    >
                      <span className="model-toggle-label">
                        {modelLoading
                          ? '加载中...'
                          : selectedModelLabel}
                      </span>
                      <span aria-hidden="true">▾</span>
                    </button>
                    {isModelMenuOpen ? (
                      <div
                        className="menu-panel model-menu"
                        role="listbox"
                      >
                        {modelOptions.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            className="menu-item"
                            role="option"
                            aria-selected={model.id === selectedModel}
                            disabled={isModelSaving}
                            onClick={() => handleModelSelect(model.id)}
                          >
                            <span>{model.label}</span>
                            <span className="muted model-option-id">
                              {model.id}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {modelStatusMessage ? (
                    <span
                      className={`model-status ${
                        modelStatus === 'error' ? 'error' : 'success'
                      }`}
                    >
                      {modelStatusMessage}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="form-actions">
                <button
                  type="submit"
                  className="button primary"
                  disabled={isDiscussionActionLoading}
                >
                  {isSendingDiscussion ? '发送中...' : '发送'}
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => handleGenerateReplyClick()}
                  disabled={
                    isDiscussionActionLoading ||
                    !session?.user ||
                    !isCloudMode
                  }
                >
                  {isAskingSyzygy || isStreamingReply
                    ? 'Syzygy 思考中...'
                    : '让 Syzygy 回复'}
                </button>
              </div>
            </div>
          </form>
        </div>
            </div>
          </div>
        </div>
      </section>
      {infoDiscussion ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="讨论消息详情"
          onClick={() => setInfoDiscussion(null)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>消息详情</h4>
            </header>
            <div className="stack">
              <div className="info-row">
                <span>Model</span>
                <strong>
                  {infoDiscussion.metadata?.model ?? '未知'}
                </strong>
              </div>
              <div className="info-row">
                <span>Temperature</span>
                <strong>
                  {typeof infoDiscussion.metadata?.temperature ===
                  'number'
                    ? infoDiscussion.metadata.temperature.toFixed(2)
                    : '未知'}
                </strong>
              </div>
              <div className="info-row">
                <span>Tokens</span>
                <strong>
                  {getTokenCount(infoDiscussion.metadata) ?? '未知'}
                </strong>
              </div>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => setInfoDiscussion(null)}
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmingDiscussion ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除讨论消息"
          onClick={() => setConfirmingDiscussion(null)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>删除这条消息？</h4>
            </header>
            <div className="stack">
              <p>删除后将无法恢复。</p>
              <p className="muted">
                消息会从{isCloudMode ? '云端' : '本地'}删除。
              </p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                autoFocus
                onClick={() => setConfirmingDiscussion(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleConfirmDeleteDiscussion}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {movingExcerpt ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="移动书摘到章节"
          onClick={() => setMovingExcerpt(null)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>移动书摘到章节</h4>
            </header>
            <div className="stack">
              <p className="muted excerpt-move-preview">
                {movingExcerpt.content.length > 60
                  ? `${movingExcerpt.content.slice(0, 60)}…`
                  : movingExcerpt.content}
              </p>
              <label className="resonance-speaker-field">
                <span>目标章节</span>
                <select
                  value={moveTargetChapterId}
                  onChange={(event) =>
                    setMoveTargetChapterId(event.target.value)
                  }
                >
                  <option value="">未分章</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setMovingExcerpt(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => void handleConfirmMoveExcerpt()}
              >
                移动
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmingDeleteQuestion ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除困惑"
          onClick={() => setConfirmingDeleteQuestion(null)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>删除这条困惑？</h4>
            </header>
            <div className="stack">
              <p>删除后将无法恢复。</p>
              <p className="muted">
                该困惑下的所有回答也会一并删除。
              </p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                autoFocus
                onClick={() => setConfirmingDeleteQuestion(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleConfirmDeleteQuestion}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmingDeleteAnswer ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除回答"
          onClick={() => setConfirmingDeleteAnswer(null)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>删除这条回答？</h4>
            </header>
            <div className="stack">
              <p>删除后将无法恢复。</p>
              <p className="muted">
                若删除后该困惑没有任何回答，状态会回退为待解答。
              </p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                autoFocus
                onClick={() => setConfirmingDeleteAnswer(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleConfirmDeleteAnswer}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmingDeleteCompanion ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`确认删除${
            COMPANION_KIND_META[confirmingDeleteCompanion.kind].label
          }`}
          onClick={() => setConfirmingDeleteCompanion(null)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>
                {`删除这篇${
                  COMPANION_KIND_META[confirmingDeleteCompanion.kind]
                    .label
                }？`}
              </h4>
            </header>
            <div className="stack">
              <p>删除后将无法恢复。</p>
              <p className="muted companion-delete-preview">
                {`${getCompanionWriterLabel(
                  confirmingDeleteCompanion.entry.writtenBy,
                )} · ${
                  confirmingDeleteCompanion.entry.content.length > 40
                    ? `${confirmingDeleteCompanion.entry.content.slice(
                        0,
                        40,
                      )}…`
                    : confirmingDeleteCompanion.entry.content
                }`}
              </p>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                autoFocus
                onClick={() => setConfirmingDeleteCompanion(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                onClick={handleConfirmDeleteCompanion}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isRenamingConversation ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="重命名对话"
          onClick={() => setIsRenamingConversation(false)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>重命名对话</h4>
            </header>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSaveConversationTitle()
                setIsRenamingConversation(false)
              }}
            >
              <label className="field">
                <span>对话名称</span>
                <input
                  type="text"
                  value={conversationTitleDraft}
                  onChange={(event) =>
                    setConversationTitleDraft(event.target.value)
                  }
                  placeholder="输入对话名称"
                  autoFocus
                  disabled={!activeConversation || isSavingConversationTitle}
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setIsRenamingConversation(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={
                    !activeConversation ||
                    isSavingConversationTitle ||
                    !conversationTitleDraft.trim()
                  }
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {isConfirmingDeleteConversation ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除当前对话"
          onClick={() => setIsConfirmingDeleteConversation(false)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>删除当前对话？</h4>
            </header>
            <div className="stack">
              <p>删除后将无法恢复。</p>
              <p className="muted">
                请输入“{deleteConfirmPhrase}”确认删除。
              </p>
              <label className="field">
                <span>确认文字</span>
                <input
                  type="text"
                  value={deleteConversationText}
                  onChange={(event) =>
                    setDeleteConversationText(event.target.value)
                  }
                  placeholder={`输入“${deleteConfirmPhrase}”`}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setIsConfirmingDeleteConversation(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                disabled={!isDeleteConfirmationValid}
                onClick={handleConfirmDeleteConversation}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isConfirmingClearDiscussions ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认清空当前对话"
          onClick={() => setIsConfirmingClearDiscussions(false)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>清空当前对话？</h4>
            </header>
            <div className="stack">
              <p>将删除当前对话的全部讨论消息。</p>
              <p className="muted">
                请输入“{clearConfirmPhrase}”确认清空。
              </p>
              <label className="field">
                <span>确认文字</span>
                <input
                  type="text"
                  value={clearConversationText}
                  onChange={(event) =>
                    setClearConversationText(event.target.value)
                  }
                  placeholder={`输入“${clearConfirmPhrase}”`}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                autoFocus
                onClick={() => setIsConfirmingClearDiscussions(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                disabled={!isClearConfirmationValid}
                onClick={handleConfirmClearDiscussions}
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="print-view">
        <header className="print-header">
          <p className="print-eyebrow">书籍详情</p>
          <h1>{book.title}</h1>
          <p className="print-author">{book.author || '作者未知'}</p>
          <ul className="print-meta">
            <li>状态：{statusLabels[book.status]}</li>
            {book.genre ? <li>类型：{book.genre}</li> : null}
            {book.translator ? <li>译者：{book.translator}</li> : null}
            {book.startDate ? <li>开始日期：{book.startDate}</li> : null}
            {book.endDate ? <li>结束日期：{book.endDate}</li> : null}
          </ul>
        </header>
        <section className="print-section">
          <h2>书摘</h2>
          {displayExcerpts.length === 0 ? (
            <p className="print-muted">暂无书摘。</p>
          ) : isCloudMode && chapters.length > 0 ? (
            <>
              {chapters.map((chapter) => {
                const chapterExcerpts =
                  excerptsByChapter.get(chapter.id) ?? []
                if (chapterExcerpts.length === 0) return null
                return (
                  <div key={chapter.id} className="print-chapter">
                    <h3>{chapter.title}</h3>
                    <ul className="print-list">
                      {chapterExcerpts.map((excerpt) => (
                        <li key={excerpt.id} className="print-excerpt">
                          <div className="print-excerpt-date">
                            {formatExcerptDate(excerpt.createdAt)}
                          </div>
                          <p>{excerpt.content}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              {unchapteredExcerpts.length > 0 ? (
                <div className="print-chapter">
                  <h3>未分章</h3>
                  <ul className="print-list">
                    {unchapteredExcerpts.map((excerpt) => (
                      <li key={excerpt.id} className="print-excerpt">
                        <div className="print-excerpt-date">
                          {formatExcerptDate(excerpt.createdAt)}
                        </div>
                        <p>{excerpt.content}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <ul className="print-list">
              {displayExcerpts.map((excerpt) => (
                <li key={excerpt.id} className="print-excerpt">
                  <div className="print-excerpt-date">
                    {formatExcerptDate(excerpt.createdAt)}
                  </div>
                  <p>{excerpt.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </>
  )
}

export default BookDetailPage
