import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0'

type OpenRouterModel = {
  id: string
  name?: string | null
  display_name?: string | null
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

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3
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

const getAuthContext = async (req: Request) => {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
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
        { error: 'Too many sync requests, please try again later.' },
        429,
      )
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      return jsonResponse({ error: 'Missing API configuration.' }, 500)
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://all-about-book.local',
        'X-Title': 'All About Book',
      },
    })

    if (!response.ok) {
      return jsonResponse({ error: 'Failed to fetch OpenRouter models.' }, 502)
    }

    const payload = (await response.json()) as {
      data?: OpenRouterModel[]
    }
    const models = payload.data ?? []
    if (models.length === 0) {
      return jsonResponse({ error: 'No models returned from OpenRouter.' }, 502)
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    const modelIds = models.map((model) => model.id)
    const { data: existingRows, error: existingError } = await supabaseClient
      .from('openrouter_models')
      .select('id,label,enabled,sort_order')
      .in('id', modelIds)

    if (existingError) {
      throw existingError
    }

    const existingMap = new Map(
      (existingRows ?? []).map((row) => [
        row.id,
        {
          label: row.label,
          enabled: row.enabled,
          sortOrder: row.sort_order,
        },
      ]),
    )

    const now = new Date().toISOString()
    const fetchedLabelFor = (model: OpenRouterModel) =>
      model.display_name || model.name || model.id
    let inserted = 0
    let updated = 0

    const upserts = models.map((model) => {
      const existing = existingMap.get(model.id)
      if (existing) {
        updated += 1
      } else {
        inserted += 1
      }

      const existingLabel = existing?.label?.trim()
      return {
        id: model.id,
        label: existingLabel ? existingLabel : fetchedLabelFor(model),
        enabled: existing?.enabled ?? false,
        sort_order: existing?.sortOrder ?? 0,
        updated_at: now,
      }
    })

    const { error: upsertError } = await supabaseClient
      .from('openrouter_models')
      .upsert(upserts, { onConflict: 'id' })

    if (upsertError) {
      throw upsertError
    }

    return jsonResponse({
      ok: true,
      inserted,
      updated,
      total: upserts.length,
      syncedAt: now,
    })
  } catch (error) {
    console.error('sync-openrouter-models error', error)
    return jsonResponse({ error: 'Unexpected server error.' }, 500)
  }
})
