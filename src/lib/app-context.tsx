import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Book } from '../types/book'
import type { DiscussionMessage } from '../types/discussion'
import type { Excerpt } from '../types/excerpt'
import type { ReadingSession } from '../types/reading-session'
import {
  fetchBooks,
  fetchCheckIns,
  fetchDiscussions,
  fetchExcerpts,
} from './cloudRead'
import { isSupabaseConfigured, supabase } from './supabaseClient'

type DataSource = 'local' | 'cloud'

type AppContextValue = {
  dataSource: DataSource
  setDataSource: (source: DataSource) => void
  canUseCloud: boolean
  isCloudMode: boolean
  authLoading: boolean
  session: Session | null
  user: User | null
  authWarning: string | null
  cloudLoading: boolean
  cloudError: string | null
  cloudBooks: Book[]
  cloudCheckIns: ReadingSession[]
  cloudExcerpts: Excerpt[]
  cloudDiscussions: DiscussionMessage[]
  refreshCloud: () => Promise<void>
  signOut: () => Promise<void>
}

const DATA_SOURCE_KEY = 'all-about-book:data-source'

const AppContext = createContext<AppContextValue | undefined>(undefined)

const getStoredDataSource = (): DataSource | null => {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(DATA_SOURCE_KEY)
  return stored === 'cloud' || stored === 'local' ? stored : null
}

export function AppProvider({ children }: { children: ReactNode }) {
  const storedDataSource = getStoredDataSource()
  const [dataSource, setDataSourceState] = useState<DataSource>(
    storedDataSource ?? 'local',
  )
  const [hasPreference, setHasPreference] = useState(
    storedDataSource !== null,
  )
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authWarning, setAuthWarning] = useState<string | null>(null)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [cloudBooks, setCloudBooks] = useState<Book[]>([])
  const [cloudCheckIns, setCloudCheckIns] = useState<ReadingSession[]>([])
  const [cloudExcerpts, setCloudExcerpts] = useState<Excerpt[]>([])
  const [cloudDiscussions, setCloudDiscussions] = useState<
    DiscussionMessage[]
  >([])

  const canUseCloud = isSupabaseConfigured

  const setDataSource = useCallback((source: DataSource) => {
    setDataSourceState(source)
    setHasPreference(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DATA_SOURCE_KEY, source)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthWarning(
        '未配置 Supabase 环境变量，云端模式不可用，将继续使用本地数据。',
      )
      setAuthLoading(false)
      return
    }

    let ignore = false
    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (ignore) return
        if (error) {
          setAuthWarning('无法读取登录信息，将继续使用本地数据。')
          setSession(null)
          setUser(null)
        } else {
          setSession(data.session)
          setUser(data.session?.user ?? null)
        }
      } finally {
        if (!ignore) setAuthLoading(false)
      }
    }

    loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (ignore) return
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
      },
    )

    return () => {
      ignore = true
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (hasPreference || !session) return
    setDataSource('cloud')
  }, [hasPreference, session, setDataSource])

  useEffect(() => {
    if (!isSupabaseConfigured && dataSource !== 'local') {
      setDataSourceState('local')
    }
  }, [dataSource, isSupabaseConfigured])

  const refreshCloud = useCallback(async () => {
    if (!session?.user || !isSupabaseConfigured || !supabase) return
    setCloudLoading(true)
    setCloudError(null)
    try {
      const [books, checkIns, excerpts, discussions] = await Promise.all([
        fetchBooks(session.user),
        fetchCheckIns(session.user),
        fetchExcerpts(session.user),
        fetchDiscussions(session.user),
      ])
      setCloudBooks(books)
      setCloudCheckIns(checkIns)
      setCloudExcerpts(excerpts)
      setCloudDiscussions(discussions)
    } catch {
      setCloudError('读取云端数据失败，请稍后重试。')
    } finally {
      setCloudLoading(false)
    }
  }, [session, isSupabaseConfigured])

  useEffect(() => {
    if (!session) {
      setCloudBooks([])
      setCloudCheckIns([])
      setCloudExcerpts([])
      setCloudDiscussions([])
      setCloudLoading(false)
      setCloudError(null)
      return
    }

    if (dataSource !== 'cloud') {
      setCloudLoading(false)
      setCloudError(null)
      return
    }

    refreshCloud()
  }, [dataSource, refreshCloud, session])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({
      dataSource,
      setDataSource,
      canUseCloud,
      isCloudMode: dataSource === 'cloud' && Boolean(session),
      authLoading,
      session,
      user,
      authWarning,
      cloudLoading,
      cloudError,
      cloudBooks,
      cloudCheckIns,
      cloudExcerpts,
      cloudDiscussions,
      refreshCloud,
      signOut,
    }),
    [
      authLoading,
      authWarning,
      canUseCloud,
      cloudBooks,
      cloudCheckIns,
      cloudDiscussions,
      cloudError,
      cloudExcerpts,
      cloudLoading,
      dataSource,
      refreshCloud,
      session,
      setDataSource,
      signOut,
      user,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useAppData = (): AppContextValue => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppData must be used within AppProvider')
  }
  return context
}
