import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppData } from '../lib/app-context'
import { SYZYGY_DEFAULTS } from '../lib/syzygyDefaults'
import { supabase } from '../lib/supabaseClient'

type ModelOption = {
  id: string
  label: string
}

type ModelCatalogEntry = {
  id: string
  label: string
  enabled: boolean
  sortOrder: number
}

type SyzygyDraft = {
  systemPrompt: string
  temperature: number
  topP: number
  maxTokens: number
  model: string
}

const buildDraftFromDefaults = (): SyzygyDraft => ({
  systemPrompt: SYZYGY_DEFAULTS.systemPrompt,
  temperature: SYZYGY_DEFAULTS.temperature,
  topP: SYZYGY_DEFAULTS.topP,
  maxTokens: SYZYGY_DEFAULTS.maxTokens,
  model: SYZYGY_DEFAULTS.model,
})

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && !Number.isNaN(value) ? value : undefined

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

function SyzygyConsole() {
  const { isCloudMode, session } = useAppData()
  const [isOpen, setIsOpen] = useState(false)
  const [models, setModels] = useState<ModelOption[]>([])
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'success' | 'error'
  >('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [draft, setDraft] = useState<SyzygyDraft>(() =>
    buildDraftFromDefaults(),
  )
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')

  const canOpen = isCloudMode && Boolean(session)

  const selectedModelLabel = useMemo(() => {
    const current = models.find((model) => model.id === draft.model)
    return current ? `${current.label} (${current.id})` : draft.model
  }, [draft.model, models])

  const filteredCatalog = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase()
    if (!query) return catalog
    return catalog.filter((model) => {
      const labelMatch = model.label.toLowerCase().includes(query)
      const idMatch = model.id.toLowerCase().includes(query)
      return labelMatch || idMatch
    })
  }, [catalog, catalogQuery])

  const loadModels = useCallback(async () => {
    if (!supabase || !session) return
    setModelsLoading(true)
    setModelsError(null)
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
      setModels(nextModels)
      if (nextModels.length === 0) {
        setModelsError('No enabled models. Add rows in openrouter_models.')
      }
    } catch (error) {
      console.error('Failed to load openrouter models', error)
      if (isMissingTableError(error)) {
        setModelsError(MISSING_TABLE_MESSAGE)
      } else {
        setModelsError('无法加载模型列表，请稍后重试。')
      }
    } finally {
      setModelsLoading(false)
    }
  }, [session])

  const loadCatalog = useCallback(async () => {
    if (!supabase || !session) return
    setCatalogLoading(true)
    try {
      const { data, error } = await supabase
        .from('openrouter_models')
        .select('id,label,enabled,sort_order')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true })

      if (error) {
        throw error
      }

      const nextCatalog =
        data?.map((row) => ({
          id: row.id,
          label: row.label,
          enabled: Boolean(row.enabled),
          sortOrder: row.sort_order ?? 0,
        })) ?? []
      setCatalog(nextCatalog)
    } catch (error) {
      console.error('Failed to load openrouter catalog', error)
      if (isMissingTableError(error)) {
        setModelsError(MISSING_TABLE_MESSAGE)
      } else {
        setModelsError('无法加载模型目录，请稍后重试。')
      }
    } finally {
      setCatalogLoading(false)
    }
  }, [session])

  const loadSettings = useCallback(async () => {
    if (!supabase || !session) return
    setSettingsError(null)
    try {
      const { data, error } = await supabase
        .from('syzygy_settings')
        .select('system_prompt,temperature,top_p,max_tokens,model')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      const defaults = buildDraftFromDefaults()
      setDraft({
        systemPrompt: data?.system_prompt ?? defaults.systemPrompt,
        temperature: clamp(
          asNumber(data?.temperature) ?? defaults.temperature,
          0,
          2,
        ),
        topP: clamp(asNumber(data?.top_p) ?? defaults.topP, 0, 1),
        maxTokens: clamp(
          asNumber(data?.max_tokens) ?? defaults.maxTokens,
          32,
          4000,
        ),
        model: data?.model ?? defaults.model,
      })
    } catch (error) {
      console.error('Failed to load syzygy settings', error)
      if (isMissingTableError(error)) {
        setSettingsError(MISSING_TABLE_MESSAGE)
      } else {
        setSettingsError('无法加载 Syzygy 设置，请稍后重试。')
      }
      setDraft(buildDraftFromDefaults())
    }
  }, [session])

  useEffect(() => {
    if (!isOpen) return
    void Promise.all([loadModels(), loadSettings(), loadCatalog()])
  }, [isOpen, loadModels, loadSettings, loadCatalog])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!models.length) return
    const isValid = models.some((model) => model.id === draft.model)
    if (isValid) return
    const fallback =
      models.find((model) => model.id === SYZYGY_DEFAULTS.model)?.id ??
      models[0]?.id
    if (fallback) {
      setDraft((current) => ({ ...current, model: fallback }))
    }
  }, [draft.model, models])

  useEffect(() => {
    if (saveStatus !== 'saved') return
    const timer = window.setTimeout(() => {
      setSaveStatus('idle')
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [saveStatus])

  useEffect(() => {
    if (syncStatus !== 'success') return
    const timer = window.setTimeout(() => {
      setSyncStatus('idle')
      setSyncMessage(null)
    }, 2800)
    return () => window.clearTimeout(timer)
  }, [syncStatus])

  const handleRestoreDefaults = () => {
    setDraft(buildDraftFromDefaults())
    setSaveStatus('idle')
  }

  const handleCatalogUpdate = (
    id: string,
    next: Partial<Pick<ModelCatalogEntry, 'enabled' | 'label' | 'sortOrder'>>,
  ) => {
    setCatalog((current) =>
      current.map((model) =>
        model.id === id ? { ...model, ...next } : model,
      ),
    )
  }

  const handleCatalogSave = async (entry: ModelCatalogEntry) => {
    if (!supabase) return
    try {
      const { error } = await supabase.from('openrouter_models').upsert(
        {
          id: entry.id,
          label: entry.label.trim() || entry.id,
          enabled: entry.enabled,
          sort_order: entry.sortOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (error) {
        throw error
      }
      await loadModels()
    } catch (error) {
      console.error('Failed to update model catalog entry', error)
      setModelsError('更新模型目录失败，请稍后重试。')
    }
  }

  const handleSave = async () => {
    if (!supabase || !session) return
    setSaveStatus('saving')
    try {
      const trimmedPrompt = draft.systemPrompt.trim()
      const payload = {
        user_id: session.user.id,
        system_prompt: trimmedPrompt ? trimmedPrompt : null,
        temperature: clamp(draft.temperature, 0, 2),
        top_p: clamp(draft.topP, 0, 1),
        max_tokens: clamp(draft.maxTokens, 32, 4000),
        model: draft.model || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('syzygy_settings')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) {
        throw error
      }

      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to save syzygy settings', error)
      setSaveStatus('error')
    }
  }

  const syncModels = async () => {
    if (!supabase || !session || syncStatus === 'syncing') return
    setSyncStatus('syncing')
    setSyncError(null)
    setSyncMessage(null)
    try {
      const { data, error } = await supabase.functions.invoke(
        'sync-openrouter-models',
        { body: {} },
      )
      if (error) {
        throw error
      }
      const total =
        typeof data?.total === 'number'
          ? data.total
          : typeof data?.count === 'number'
            ? data.count
            : 0
      const syncedAt = data?.syncedAt
        ? new Date(data.syncedAt).toLocaleString()
        : new Date().toLocaleString()
      setLastSyncedAt(syncedAt)
      setSyncMessage(`Synced ${total} models`)
      setSyncStatus('success')
      await Promise.all([loadCatalog(), loadModels()])
    } catch (error) {
      console.error('Failed to sync OpenRouter models', error)
      setSyncStatus('error')
      setSyncError('同步失败，请稍后再试。')
    }
  }

  const handleRefreshModels = async () => {
    if (modelsLoading || syncStatus === 'syncing') return
    await syncModels()
  }

  const handleSyncModels = async () => {
    await syncModels()
  }

  if (!canOpen) return null

  return (
    <>
      <button
        type="button"
        className="button ghost"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
      >
        ⚙ Syzygy Console
      </button>
      {isOpen ? (
        <div
          className="excerpt-modal-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div className="excerpt-modal">
            <div className="excerpt-modal-header">
              <div>
                <h4>Syzygy Console</h4>
                <p className="muted">
                  设置系统提示词、模型与采样参数。保存后应用到
                  “Ask Syzygy”。
                </p>
              </div>
              <button
                type="button"
                className="button ghost"
                onClick={() => setIsOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="excerpt-modal-body">
              {settingsError ? (
                <p className="notice error">{settingsError}</p>
              ) : null}
              {modelsError ? (
                <p className="notice error">{modelsError}</p>
              ) : null}
              <div className="form">
                <label className="field">
                  <span>模型</span>
                  <select
                    value={draft.model}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }
                    disabled={modelsLoading}
                  >
                    {models.length === 0 ? (
                      <option value={draft.model}>
                        {modelsLoading ? '加载中...' : selectedModelLabel}
                      </option>
                    ) : (
                      models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label} ({model.id})
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <div className="form-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={handleRefreshModels}
                    disabled={modelsLoading || syncStatus === 'syncing'}
                  >
                    {modelsLoading ? '刷新中...' : '刷新模型列表'}
                  </button>
                </div>
                {syncStatus === 'success' && syncMessage ? (
                  <p className="notice success">{syncMessage}</p>
                ) : null}
                <label className="field">
                  <span>
                    Temperature{' '}
                    <strong className="syzygy-temp-value">
                      {draft.temperature.toFixed(1)}
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={draft.temperature}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        temperature: clamp(
                          Number.parseFloat(event.target.value),
                          0,
                          2,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    Top P{' '}
                    <strong className="syzygy-temp-value">
                      {draft.topP.toFixed(2)}
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.01}
                    value={draft.topP}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        topP: clamp(
                          Number.parseFloat(event.target.value),
                          0,
                          1,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Max tokens</span>
                  <input
                    type="number"
                    min={32}
                    max={4000}
                    value={draft.maxTokens}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        maxTokens: clamp(
                          Number.parseInt(event.target.value, 10) ||
                            SYZYGY_DEFAULTS.maxTokens,
                          32,
                          4000,
                        ),
                      }))
                    }
                  />
                  <small className="muted">
                    建议范围 32–4000，避免响应过长。
                  </small>
                </label>
                <label className="field">
                  <span>系统提示词</span>
                  <textarea
                    className="syzygy-textarea"
                    rows={6}
                    value={draft.systemPrompt}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        systemPrompt: event.target.value,
                      }))
                    }
                    placeholder="输入 Syzygy 系统提示词（可留空使用默认值）"
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={handleSave}
                  disabled={saveStatus === 'saving'}
                >
                  {saveStatus === 'saving' ? '保存中...' : '保存'}
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={handleRestoreDefaults}
                >
                  恢复默认值
                </button>
                {saveStatus === 'saved' ? (
                  <span className="muted">已保存。</span>
                ) : null}
                {saveStatus === 'error' ? (
                  <span className="notice error">
                    保存失败，请稍后再试。
                  </span>
                ) : null}
              </div>
              <section className="syzygy-section">
                <div className="syzygy-section-header">
                  <div>
                    <h5>Model Catalog</h5>
                    <p className="muted">
                      同步 OpenRouter 模型，并管理可用模型列表。
                    </p>
                  </div>
                  <div className="syzygy-section-actions">
                    <button
                      type="button"
                      className="button ghost"
                      onClick={handleSyncModels}
                      disabled={syncStatus === 'syncing'}
                    >
                      {syncStatus === 'syncing'
                        ? '同步中...'
                        : 'Sync from OpenRouter'}
                    </button>
                    {lastSyncedAt ? (
                      <span className="muted">上次同步：{lastSyncedAt}</span>
                    ) : null}
                  </div>
                </div>
                {syncStatus === 'success' ? (
                  <p className="notice success">
                    {syncMessage ?? '同步完成。'}
                  </p>
                ) : null}
                {syncStatus === 'error' && syncError ? (
                  <p className="notice error">{syncError}</p>
                ) : null}
                <label className="field">
                  <span>搜索模型</span>
                  <input
                    type="search"
                    placeholder="输入模型名称或 ID"
                    value={catalogQuery}
                    onChange={(event) =>
                      setCatalogQuery(event.target.value)
                    }
                  />
                </label>
                <div className="syzygy-catalog">
                  {catalogLoading ? (
                    <p className="muted">加载模型目录中...</p>
                  ) : filteredCatalog.length === 0 ? (
                    <p className="muted">暂无模型记录。</p>
                  ) : (
                    filteredCatalog.map((entry) => (
                      <div key={entry.id} className="syzygy-catalog-row">
                        <div className="syzygy-catalog-meta">
                          <div className="syzygy-catalog-title">
                            <strong>{entry.label}</strong>
                            <span className="muted">{entry.id}</span>
                          </div>
                          <div className="syzygy-catalog-fields">
                            <label className="field checkbox-field">
                              <input
                                type="checkbox"
                                checked={entry.enabled}
                                onChange={(event) =>
                                  handleCatalogUpdate(entry.id, {
                                    enabled: event.target.checked,
                                  })
                                }
                              />
                              <span>启用</span>
                            </label>
                            <label className="field">
                              <span>显示名称</span>
                              <input
                                type="text"
                                value={entry.label}
                                onChange={(event) =>
                                  handleCatalogUpdate(entry.id, {
                                    label: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label className="field">
                              <span>排序</span>
                              <input
                                type="number"
                                value={entry.sortOrder}
                                onChange={(event) =>
                                  handleCatalogUpdate(entry.id, {
                                    sortOrder: Number.isNaN(
                                      Number.parseInt(
                                        event.target.value,
                                        10,
                                      ),
                                    )
                                      ? 0
                                      : Number.parseInt(
                                          event.target.value,
                                          10,
                                        ),
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div className="syzygy-catalog-actions">
                          <button
                            type="button"
                            className="button ghost"
                            onClick={() => handleCatalogSave(entry)}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default SyzygyConsole
