import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppData } from '../lib/app-context'
import { SYZYGY_DEFAULTS } from '../lib/syzygyDefaults'
import { supabase } from '../lib/supabaseClient'

type ModelOption = {
  id: string
  label: string
}

type SyzygyDraft = {
  systemPrompt: string
  temperature: number
  model: string
}

const buildDraftFromDefaults = (): SyzygyDraft => ({
  systemPrompt: SYZYGY_DEFAULTS.systemPrompt,
  temperature: SYZYGY_DEFAULTS.temperature,
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
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
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

  const loadSettings = useCallback(async () => {
    if (!supabase || !session) return
    setSettingsError(null)
    try {
      const { data, error } = await supabase
        .from('syzygy_settings')
        .select('system_prompt,temperature,model')
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
    void Promise.all([loadModels(), loadSettings()])
  }, [isOpen, loadModels, loadSettings])

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

  const handleRefreshModels = async () => {
    if (modelsLoading) return
    await loadModels()
  }

  const handleRestoreDefaults = () => {
    setDraft(buildDraftFromDefaults())
    setSaveStatus('idle')
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
                  设置系统提示词、模型与温度。保存后应用到
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
                  disabled={modelsLoading}
                >
                  {modelsLoading ? '刷新中...' : '刷新模型列表'}
                </button>
              </div>
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
          </div>
        </div>
      ) : null}
    </>
  )
}

export default SyzygyConsole
