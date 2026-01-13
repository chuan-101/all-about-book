import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0'

type SettingsPayload = {
  systemPrompt?: string
  temperature?: number
  model?: string
  maxTokens?: number
}

type RequestPayload = {
  userMessage?: string
  settings?: SettingsPayload
}

type RateLimitEntry = {
  count: number
  windowStart: number
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_MODELS = new Set([
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
])

const DEFAULT_MODEL = 'openai/gpt-4o-mini'
const DEFAULT_SYSTEM_PROMPT =
  'You are Syzygy, a thoughtful reading companion. Offer concise, friendly insights and questions to deepen understanding.'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 500

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

const getUserId = async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment is not configured.')
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const { data, error } = await supabaseClient.auth.getUser()
  if (error || !data?.user) return null
  return data.user.id
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
    return new Response('ok', { headers: corsHeaders })
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

    const userId = await getUserId(req)
    if (!userId) {
      return jsonResponse({ error: 'Unauthorized.' }, 401)
    }

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

    const settings = payload.settings ?? {}
    const systemPrompt = settings.systemPrompt?.trim()
      ? settings.systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT

    let temperature = DEFAULT_TEMPERATURE
    if (typeof settings.temperature === 'number') {
      temperature = clamp(settings.temperature, 0, 1)
    }

    let model = DEFAULT_MODEL
    if (settings.model) {
      if (!ALLOWED_MODELS.has(settings.model)) {
        return jsonResponse({ error: 'Model is not supported.' }, 400)
      }
      model = settings.model
    }

    let maxTokens = DEFAULT_MAX_TOKENS
    if (typeof settings.maxTokens === 'number') {
      maxTokens = clamp(
        Math.floor(settings.maxTokens),
        MIN_MAX_TOKENS,
        MAX_MAX_TOKENS,
      )
    }

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
            { role: 'system', content: systemPrompt },
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
      model: data.model ?? model,
      requestId: data.id ?? response.headers.get('x-request-id'),
    })
  } catch (error) {
    console.error('openrouter-chat error', error)
    return jsonResponse({ error: 'Unexpected server error.' }, 500)
  }
})
