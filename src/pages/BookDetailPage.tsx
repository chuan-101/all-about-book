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
  deleteMessagesByBookId,
  getMessagesByBookId,
} from '../lib/discussion-storage'
import { SYZYGY_DEFAULTS } from '../lib/syzygyDefaults'
import type { Excerpt } from '../types/excerpt'
import type { DiscussionMessage } from '../types/discussion'
import type { ReadingSession } from '../types/reading-session'
import { useAppData } from '../lib/app-context'
import { useBooks } from '../lib/books-context'
import { ActionButton } from '../components/ActionButton'
import { Button } from '../components/Button'
import {
  createCloudDiscussion,
  createCloudDiscussionMessages,
  createCloudExcerpt,
  deleteCloudDiscussion,
  deleteCloudDiscussionsByBook,
  deleteCloudExcerpt,
  toggleCloudCheckIn,
  updateCloudExcerpt,
} from '../lib/cloudWrite'
import {
  getCheckInsByBook,
  toggleCheckIn,
} from '../lib/reading-sessions-storage'
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
  role: 'me' | 'syzygy'
  content: string
  metadata?: DiscussionMessage['metadata']
  createdAt?: string
  id?: string
  isPending?: boolean
}

type DiscussionEntry = DiscussionMessage | OptimisticDiscussionMessage

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

function BookDetailPage() {
  const { bookId } = useParams()
  const { books: localBooks } = useBooks()
  const {
    isCloudMode,
    cloudBooks,
    cloudCheckIns,
    cloudExcerpts,
    cloudDiscussions,
    cloudLoading,
    session,
    refreshCloud,
  } = useAppData()
  const books = isCloudMode ? cloudBooks : localBooks
  const book = bookId ? books.find((item) => item.id === bookId) : undefined
  const [sessions, setSessions] = useState<ReadingSession[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [excerpts, setExcerpts] = useState<Excerpt[]>([])
  const [newExcerptContent, setNewExcerptContent] = useState('')
  const [isExcerptEditorOpen, setIsExcerptEditorOpen] = useState(false)
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement | null>(
    null,
  )
  const [openExcerptMenuId, setOpenExcerptMenuId] = useState<
    string | null
  >(null)
  const [openDiscussionMenuId, setOpenDiscussionMenuId] =
    useState<string | null>(null)
  const [discussionMessages, setDiscussionMessages] = useState<
    DiscussionMessage[]
  >([])
  const [infoDiscussion, setInfoDiscussion] =
    useState<DiscussionMessage | null>(null)
  const [newMessageContent, setNewMessageContent] = useState('')
  const [editingExcerptId, setEditingExcerptId] = useState<string | null>(
    null,
  )
  const [editingContent, setEditingContent] = useState('')
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [isAskingSyzygy, setIsAskingSyzygy] = useState(false)
  const [attachContext, setAttachContext] = useState(true)
  const [confirmingDiscussion, setConfirmingDiscussion] =
    useState<DiscussionMessage | null>(null)
  const [isConfirmingClearDiscussions, setIsConfirmingClearDiscussions] =
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
  }, [book, isCloudMode])

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

  const displayDiscussions = useMemo(() => {
    if (!book) return []
    const baseMessages = isCloudMode
      ? cloudDiscussions.filter((message) => message.bookId === book.id)
      : discussionMessages
    const pendingMessages = isCloudMode
      ? optimisticMessages.filter((message) => message.bookId === book.id)
      : []
    return sortDiscussionEntries([
      ...baseMessages,
      ...pendingMessages,
    ])
  }, [
    book,
    cloudDiscussions,
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
      setCloudError(null)
      try {
        await createCloudExcerpt(session.user.id, book.id, content)
        await refreshCloud()
        setNewExcerptContent('')
        setIsExcerptEditorOpen(false)
      } catch (error) {
        console.error(error)
        setCloudError('云端书摘保存失败，请稍后重试。')
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
    if (!book) return
    const content = newMessageContent.trim()
    if (!content) return
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端讨论。')
        return
      }
      setCloudError(null)
      try {
        await createCloudDiscussion(session.user.id, book.id, content)
        await refreshCloud()
        setNewMessageContent('')
      } catch (error) {
        console.error(error)
        setCloudError('云端讨论发送失败，请稍后重试。')
      }
      return
    }

    const now = new Date().toISOString()
    const message: DiscussionMessage = {
      id: crypto.randomUUID(),
      bookId: book.id,
      role: 'me',
      content,
      createdAt: now,
    }
    addMessage(message)
    setNewMessageContent('')
    refreshDiscussions()
  }

  const addOptimisticDiscussionPair = (content: string) => {
    if (!book) return null
    const userClientId = crypto.randomUUID()
    const assistantClientId = crypto.randomUUID()
    setOptimisticMessages((messages) => [
      ...messages,
      {
        clientId: userClientId,
        bookId: book.id,
        role: 'me',
        content,
        isPending: true,
      },
      {
        clientId: assistantClientId,
        bookId: book.id,
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
    if (!book) return
    const content = newMessageContent.trim()
    if (!content) return
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
    if (isAskingSyzygy || isStreamingReply) return
    setCloudError(null)
    setIsAskingSyzygy(true)
    let optimisticIds: {
      userClientId: string
      assistantClientId: string
    } | null = null
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

        await createCloudDiscussionMessages(session.user.id, book.id, [
          { role: 'me', content },
          {
            role: 'syzygy',
            content: finalReply,
            metadata: {
              model: finalModel,
              temperature: finalTemperature,
            },
          },
        ])
        await refreshCloud()
        clearOptimisticPair(optimisticIds)
        return
      }

      const { data, error } = await supabase.functions.invoke(
        'openrouter-chat',
        {
          body: {
            userMessage: content,
            bookId: book.id,
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
      await createCloudDiscussionMessages(session.user.id, book.id, [
        { role: 'me', content },
        {
          role: 'syzygy',
          content: data.assistantReply,
          metadata: {
            model: data.usedModel,
            temperature: data.usedTemperature,
          },
        },
      ])
      await refreshCloud()
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
        await refreshCloud()
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
    setIsConfirmingClearDiscussions(true)
  }

  const handleConfirmClearDiscussions = async () => {
    if (!book) return
    setIsConfirmingClearDiscussions(false)
    if (isCloudMode) {
      if (!session?.user) {
        setCloudError('请先登录后再同步云端讨论。')
        return
      }
      setCloudError(null)
      try {
        await deleteCloudDiscussionsByBook(session.user.id, book.id)
        await refreshCloud()
      } catch (error) {
        console.error(error)
        setCloudError('云端讨论清空失败，请稍后重试。')
      }
      return
    }

    deleteMessagesByBookId(book.id)
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

        <div className="detail-grid">
          <div className="card detail-cover">
            {book.cover ? (
              <img src={book.cover} alt={`${book.title} cover`} />
            ) : (
              <div className="cover placeholder large">暂无封面</div>
            )}
          </div>
          <div className="card detail-info">
            <div className="info-row">
              <span>状态</span>
              <strong>{statusLabels[book.status]}</strong>
            </div>
            <div className="info-row">
              <span>类型</span>
              <strong>{book.genre || '未设置'}</strong>
            </div>
            <div className="info-row">
              <span>译者</span>
              <strong>{book.translator || '未设置'}</strong>
            </div>
            {book.startDate ? (
              <div className="info-row">
                <span>开始日期</span>
                <strong>{book.startDate}</strong>
              </div>
            ) : null}
            {book.endDate ? (
              <div className="info-row">
                <span>结束日期</span>
                <strong>{book.endDate}</strong>
              </div>
            ) : null}
            {book.rating ? (
              <div className="info-row">
                <span>评分</span>
                <strong>{book.rating}</strong>
              </div>
            ) : null}
            <div className="info-row">
              <span>创建时间</span>
              <strong>{new Date(book.createdAt).toLocaleString()}</strong>
            </div>
            <div className="info-row">
              <span>更新时间</span>
              <strong>{new Date(book.updatedAt).toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {book.notes ? (
          <div className="card stack">
            <h3>笔记</h3>
            <p>{book.notes}</p>
          </div>
        ) : null}

        <div className="card stack">
          <div className="card-header">
            <h3>阅读打卡</h3>
            <span className="muted">{displaySessions.length} 次</span>
          </div>
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
                  className={`calendar-day${isChecked ? ' checked' : ''}${
                    isToday ? ' today' : ''
                  }`}
                  onClick={() => handleToggleCheckIn(date)}
                >
                  <span className="calendar-date">{date.getDate()}</span>
                  {isChecked ? <span className="calendar-dot" /> : null}
                </button>
              )
            })}
          </div>
          <p className="muted">
            点击日期即可切换打卡状态，已有打卡会显示标记。
          </p>
        </div>
        <div className="card stack">
          <div className="card-header">
            <h3>书摘</h3>
            <span className="muted">{displayExcerpts.length} 条</span>
          </div>
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
              <button type="submit" className="button primary">
                保存书摘
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
                  <div className="form-actions">
                    <button type="submit" className="button primary">
                      保存书摘
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
          {displayExcerpts.length === 0 ? (
            <p className="muted">暂无书摘，先记录第一条吧。</p>
          ) : (
            <ul className="list excerpt-list">
              {displayExcerpts.map((excerpt) => {
                const isEditing = editingExcerptId === excerpt.id
                const isMenuOpen = openExcerptMenuId === excerpt.id
                return (
                  <li key={excerpt.id} className="list-item excerpt-card">
                    <div className="list-item-main">
                      {isEditing ? (
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
                      ) : (
                        <div className="excerpt-body">
                          <div className="excerpt-meta">
                            <span className="excerpt-book-title">
                              {book?.title ?? '未命名书籍'}
                            </span>
                            <span className="excerpt-date">
                              {formatExcerptDate(excerpt.createdAt)}
                            </span>
                          </div>
                          <p className="excerpt-content">
                            {excerpt.content}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="excerpt-actions">
                      {isEditing ? (
                        <>
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
                        </>
                      ) : (
                        <>
                          <ActionButton
                            type="button"
                            onClick={() => handleStartEdit(excerpt)}
                          >
                            编辑
                          </ActionButton>
                          <div className="menu">
                            <ActionButton
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              onClick={() =>
                                setOpenExcerptMenuId(
                                  isMenuOpen ? null : excerpt.id,
                                )
                              }
                            >
                              ⋯ 更多
                            </ActionButton>
                            {isMenuOpen ? (
                              <div className="menu-panel" role="menu">
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
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="card stack">
          <div className="card-header discussion-header">
            <div className="discussion-header-main">
              <div className="discussion-title-group">
                <h3>与 Syzygy 讨论</h3>
                <span className="muted">
                  {displayDiscussions.length} 条
                </span>
              </div>
            </div>
            <button
              type="button"
              className="button ghost"
              onClick={handleRequestClearDiscussions}
              disabled={displayDiscussions.length === 0}
            >
              清空本书讨论
            </button>
          </div>
          {modelError ? <p className="notice error">{modelError}</p> : null}
          <p className="muted">
            后续接入 API 后，这里会根据书摘与阅读记录生成讨论与总结。
          </p>
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
                <button type="submit" className="button primary">
                  发送
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={handleAskSyzygy}
                  disabled={
                    !session?.user ||
                    !isCloudMode ||
                    isAskingSyzygy ||
                    isStreamingReply
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
      {isConfirmingClearDiscussions ? (
        <div
          className="confirm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认清空本书讨论"
          onClick={() => setIsConfirmingClearDiscussions(false)}
        >
          <div
            className="confirm-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="confirm-modal-header">
              <h4>清空本书讨论？</h4>
            </header>
            <div className="stack">
              <p>
                将删除《{book.title}》的全部讨论消息。
              </p>
              <p className="muted">此操作无法撤销。</p>
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
