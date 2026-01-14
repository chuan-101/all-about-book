import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0'

type RequestPayload = {
  userMessage?: string
  bookId?: string
  attachContext?: boolean
}

type RateLimitEntry = {
  count: number
  windowStart: number
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://chuan-101.github.io',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini'
const DEFAULT_SYSTEM_PROMPT =
  'You are Syzygy, a thoughtful reading companion. Offer concise, friendly insights and questions to deepen understanding.'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 500

const DISCUSSION_LIMIT = 40
const EXCERPT_LIMIT = 30
// TODO: Allow configuring discussion/excerpt limits (50-100) via settings.
const MAX_CONTEXT_CHARS = 60_000
const MAX_EXCERPT_CHARS = 500
const MAX_DISCUSSION_CHARS = 400

const MAX_BODY_CHARS = 8000
const MAX_USER_MESSAGE_CHARS = 4000
const MAX_MAX_TOKENS = 1200
const MIN_MAX_TOKENS = 32

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 6
const rateLimit = new Map<string, RateLimitEntry>()

const jsonResponse = (
  payload: Record<string, unknown>,
  status = 200,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const trimContent = (value: string | null | undefined, maxChars: number) => {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`
}

type SyzygySettingsRow = {
  system_prompt?: string | null
  temperature?: number | null
  model?: string | null
}

const createAuthedClient = (
  supabaseUrl: string,
  supabaseAnonKey: string,
  token: string,
) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

const fetchSyzygySettings = async (
  client: ReturnType<typeof createAuthedClient>,
  userId: string,
): Promise<SyzygySettingsRow | null> => {
  const { data, error } = await client
    .from('syzygy_settings')
    .select('system_prompt,temperature,model')
    .eq('user_id', userId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  return data ?? null
}

const fetchEnabledModels = async (
  client: ReturnType<typeof createAuthedClient>,
  modelIds: string[],
): Promise<Set<string>> => {
  if (modelIds.length === 0) return new Set()
  const { data, error } = await client
    .from('openrouter_models')
    .select('id')
    .in('id', modelIds)
    .eq('enabled', true)

  if (error) {
    throw error
  }

  return new Set((data ?? []).map((row) => row.id))
}

type DiscussionRow = {
  role: string | null
  content: string | null
  created_at: string | null
  metadata?: Record<string, unknown> | null
}

type ExcerptRow = {
  content: string | null
  page: number | null
  chapter: string | null
  created_at: string | null
}

type BookRow = {
  title: string | null
  author: string | null
}

const fetchBookInfo = async (
  client: ReturnType<typeof createAuthedClient>,
  userId: string,
  bookId: string,
): Promise<BookRow | null> => {
  const { data, error } = await client
    .from('books')
    .select('title,author')
    .eq('user_id', userId)
    .eq('id', bookId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  return data ?? null
}

const fetchDiscussions = async (
  client: ReturnType<typeof createAuthedClient>,
  userId: string,
  bookId: string,
): Promise<DiscussionRow[]> => {
  const { data, error } = await client
    .from('discussions')
    .select('role,content,created_at,metadata')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .order('created_at', { ascending: true })
    .limit(DISCUSSION_LIMIT)

  if (error) {
    throw error
  }

  return data ?? []
}

const fetchExcerpts = async (
  client: ReturnType<typeof createAuthedClient>,
  userId: string,
  bookId: string,
): Promise<ExcerptRow[]> => {
  const { data, error } = await client
    .from('excerpts')
    .select('content,page,chapter,created_at')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .order('created_at', { ascending: false })
    .limit(EXCERPT_LIMIT)

  if (error) {
    throw error
  }

  return data ?? []
}

const buildContextPack = ({
  book,
  excerpts,
  discussions,
}: {
  book: BookRow | null
  excerpts: ExcerptRow[]
  discussions: DiscussionRow[]
}) => {
  const title = book?.title?.trim() || 'Unknown title'
  const author = book?.author?.trim() || 'Unknown author'
  const lines: string[] = [`Book: ${title} / ${author}`]

  lines.push('Recent excerpts:')
  if (excerpts.length === 0) {
    lines.push('- No excerpts yet.')
  } else {
    excerpts.forEach((excerpt) => {
      const content = trimContent(excerpt.content, MAX_EXCERPT_CHARS)
      if (!content) return
      const metaParts = []
      if (excerpt.page) metaParts.push(`page ${excerpt.page}`)
      if (excerpt.chapter) metaParts.push(`chapter ${excerpt.chapter}`)
      const meta =
        metaParts.length > 0 ? ` (${metaParts.join(', ')})` : ''
      lines.push(`- ${content}${meta}`)
    })
  }

  lines.push('Recent discussion transcript:')
  if (discussions.length === 0) {
    lines.push('- No prior discussion yet.')
  } else {
    discussions.forEach((message) => {
      const content = trimContent(message.content, MAX_DISCUSSION_CHARS)
      if (!content) return
      const role = message.role?.trim() || 'unknown'
      lines.push(`- ${role}: ${content}`)
    })
  }

  let contextPack = lines.join('\n')
  if (contextPack.length > MAX_CONTEXT_CHARS) {
    contextPack = contextPack.slice(0, MAX_CONTEXT_CHARS)
  }
  return contextPack
}

type AuthResult =
  | {
      userId: string
      token: string
      supabaseUrl: string
      supabaseAnonKey: string
    }
  | { error: { code: string; message: string }; status: number }

const getAuthContext = async (req: Request): Promise<AuthResult> => {
  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader) {
    return {
      error: { code: 'missing_auth', message: 'Missing Authorization header.' },
      status: 401,
    }
  }

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return {
      error: { code: 'invalid_auth', message: 'Invalid Authorization header.' },
      status: 401,
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: {
        code: 'auth_config_missing',
        message: 'Supabase environment is not configured.',
      },
      status: 500,
    }
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

  const { data, error } = await supabaseClient.auth.getUser(token)
  if (error || !data?.user) {
    return {
      error: { code: 'invalid_auth', message: 'Invalid or expired token.' },
      status: 401,
    }
  }
  return {
    userId: data.user.id,
    token,
    supabaseUrl,
    supabaseAnonKey,
  }
}

const enforceRateLimit = (userId: string) => {
  const now = Date.now()
  const entry = rateLimit.get(userId)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimit.set(userId, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }
  entry.count += 1
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_CHARS) {
      return jsonResponse({ error: 'Request payload is too large.' }, 413)
    }

    let payload: RequestPayload
    try {
      payload = JSON.parse(rawBody) as RequestPayload
    } catch (error) {
      return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
    }

    const userMessage = payload.userMessage?.trim()
    if (!userMessage) {
      return jsonResponse({ error: 'userMessage is required.' }, 400)
    }
    if (userMessage.length > MAX_USER_MESSAGE_CHARS) {
      return jsonResponse({ error: 'Message is too long.' }, 413)
    }

    const authResult = await getAuthContext(req)
    if ('error' in authResult) {
      return jsonResponse(
        { ok: false, code: authResult.error.code },
        authResult.status,
      )
    }
    const { userId, token, supabaseUrl, supabaseAnonKey } = authResult

    if (!enforceRateLimit(userId)) {
      return jsonResponse(
        { error: 'Too many requests, please try again later.' },
        429,
      )
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'Missing API configuration.' }, 500)
    }

    const supabaseClient = createAuthedClient(
      supabaseUrl,
      supabaseAnonKey,
      token,
    )

    let settings: SyzygySettingsRow | null = null
    try {
      settings = await fetchSyzygySettings(supabaseClient, userId)
    } catch (error) {
      console.error('Failed to fetch syzygy settings', error)
      return jsonResponse({ error: 'Failed to load settings.' }, 500)
    }

    const systemPrompt = settings?.system_prompt?.trim()
      ? settings.system_prompt.trim()
      : DEFAULT_SYSTEM_PROMPT

    let temperature = DEFAULT_TEMPERATURE
    if (typeof settings?.temperature === 'number') {
      temperature = clamp(settings.temperature, 0, 2)
    }

    const desiredModel =
      settings?.model && settings.model.trim()
        ? settings.model.trim()
        : DEFAULT_MODEL
    let model = DEFAULT_MODEL
    try {
      const enabledModels = await fetchEnabledModels(supabaseClient, [
        desiredModel,
        DEFAULT_MODEL,
      ])
      if (!enabledModels.has(DEFAULT_MODEL)) {
        return jsonResponse(
          {
            error:
              'Default model is not enabled. Please enable it in openrouter_models.',
          },
          400,
        )
      }
      if (enabledModels.has(desiredModel)) {
        model = desiredModel
      }
    } catch (error) {
      console.error('Failed to validate models', error)
      return jsonResponse({ error: 'Failed to validate model.' }, 500)
    }

    const maxTokens = clamp(
      DEFAULT_MAX_TOKENS,
      MIN_MAX_TOKENS,
      MAX_MAX_TOKENS,
    )

    const attachContext = payload.attachContext !== false
    const bookId = payload.bookId?.trim()
    let contextPack: string | null = null

    if (attachContext && bookId) {
      try {
        const [bookInfo, excerpts, discussions] = await Promise.all([
          fetchBookInfo(supabaseClient, userId, bookId),
          fetchExcerpts(supabaseClient, userId, bookId),
          fetchDiscussions(supabaseClient, userId, bookId),
        ])
        contextPack = buildContextPack({
          book: bookInfo,
          excerpts,
          discussions,
        })
      } catch (error) {
        console.error('Failed to build context pack', error)
        return jsonResponse({ error: 'Failed to load context.' }, 500)
      }
    }

    const systemPromptWithContext = contextPack
      ? `${systemPrompt}\n\nContext Pack:\n${contextPack}`
      : systemPrompt

    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://all-about-book.local',
          'X-Title': 'All About Book',
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPromptWithContext },
            { role: 'user', content: userMessage },
          ],
        }),
      },
    )

    if (!response.ok) {
      const status = response.status
      if (status === 401 || status === 403) {
        return jsonResponse({ error: 'Upstream authentication failed.' }, 502)
      }
      if (status === 429) {
        return jsonResponse({ error: 'Upstream rate limit reached.' }, 502)
      }
      return jsonResponse({ error: 'Upstream service error.' }, 502)
    }

    const data = (await response.json()) as {
      id?: string
      model?: string
      choices?: Array<{ message?: { content?: string } }>
    }

    const assistantReply = data.choices?.[0]?.message?.content?.trim()
    if (!assistantReply) {
      return jsonResponse({ error: 'No assistant reply returned.' }, 502)
    }

    return jsonResponse({
      assistantReply,
      usedModel: data.model ?? model,
      usedTemperature: temperature,
      requestId: data.id ?? response.headers.get('x-request-id'),
    })
  } catch (error) {
    console.error('openrouter-chat error', error)
    return jsonResponse({ error: 'Unexpected server error.' }, 500)
  }
})
