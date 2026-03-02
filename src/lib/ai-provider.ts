/**
 * Global AI Provider Router
 *
 * Routes calls to Gemini or Claude based on:
 * 1. Admin-configured global primary/fallback model
 * 2. Automatic 503 fallback (Gemini overloaded → switch all calls)
 * 3. Per-agent model configs (when global override is off)
 */

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { getConfig } from '@/lib/config/admin-config'

// ─── Types ────────────────────────────────────────────────────────

export type AIProvider = 'gemini' | 'claude'

export interface ModelDefinition {
  id: string
  provider: AIProvider
  label: string
  capabilities: {
    googleSearch: boolean
    responseSchema: boolean
    maxOutputTokens: number
  }
}

// ─── Model Registry ───────────────────────────────────────────────

export const MODEL_REGISTRY: ModelDefinition[] = [
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    label: 'Gemini 3.1 Pro (Preview)',
    capabilities: { googleSearch: true, responseSchema: true, maxOutputTokens: 65536 },
  },
  {
    id: 'gemini-3-flash-preview',
    provider: 'gemini',
    label: 'Gemini 3 Flash (Preview)',
    capabilities: { googleSearch: true, responseSchema: true, maxOutputTokens: 65536 },
  },
  {
    id: 'claude-opus-4-6',
    provider: 'claude',
    label: 'Claude Opus 4.6',
    capabilities: { googleSearch: false, responseSchema: false, maxOutputTokens: 128000 },
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'claude',
    label: 'Claude Sonnet 4.6',
    capabilities: { googleSearch: false, responseSchema: false, maxOutputTokens: 128000 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'claude',
    label: 'Claude Haiku 4.5',
    capabilities: { googleSearch: false, responseSchema: false, maxOutputTokens: 128000 },
  },
]

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.id === modelId)
}

export function getProviderForModel(modelId: string): AIProvider {
  return getModelDefinition(modelId)?.provider || (modelId.startsWith('claude') ? 'claude' : 'gemini')
}

// ─── Singleton state ──────────────────────────────────────────────

let _useFallback = false
let _switchedAt: number | null = null

const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})

let _anthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    })
  }
  return _anthropicClient
}

// ─── Public API ───────────────────────────────────────────────────

export function isUsingFallback(): boolean {
  return _useFallback
}

/** @deprecated Use isUsingFallback() */
export const isUsingClaude = isUsingFallback

export function getProviderStatus(): { provider: 'gemini' | 'claude' | 'fallback'; switchedAt: number | null } {
  return { provider: _useFallback ? 'fallback' : 'gemini', switchedAt: _switchedAt }
}

/** Force switch to fallback (called when primary 503s) */
export function switchToFallback(reason: string): void {
  if (_useFallback) return
  _useFallback = true
  _switchedAt = Date.now()
  console.warn(`🔄 [AI-PROVIDER] Switching ALL calls to fallback model. Reason: ${reason}`)
}

/** @deprecated Use switchToFallback() */
export const switchToClaude = switchToFallback

/** Reset back to primary (e.g., for new pipeline run) */
export function resetProvider(): void {
  _useFallback = false
  _switchedAt = null
  console.log('🔄 [AI-PROVIDER] Reset to configured primary provider')
}

/** @deprecated Use resetProvider() */
export const resetToGemini = resetProvider

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    msg.includes('503') ||
    msg.includes('504') ||
    lower.includes('overloaded') ||
    lower.includes('high demand') ||
    lower.includes('service unavailable') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('deadline expired') ||
    msg === 'SERVICE_OVERLOADED'
  )
}

// ─── Thinking level mapping ───────────────────────────────────────

function mapThinkingToEffort(thinkingLevel?: string): 'low' | 'medium' | 'high' {
  switch (thinkingLevel?.toUpperCase()) {
    case 'HIGH': return 'high'
    case 'MEDIUM': return 'medium'
    case 'LOW': return 'low'
    default: return 'high'
  }
}

// ─── Model resolution ─────────────────────────────────────────────

/**
 * Resolve the effective models for an agent, respecting global override.
 * Returns [primaryModel, fallbackModel] — either may be Gemini or Claude.
 */
export async function resolveModels(
  agentPrimaryKey: string,
  agentFallbackKey: string,
  agentPrimaryDefault: string = 'gemini-3.1-pro-preview',
  agentFallbackDefault: string = 'gemini-3-flash-preview',
): Promise<[string, string]> {
  const globalOverride = await getConfig('ai_models', 'global.override_agents', true)

  if (globalOverride) {
    const primary = await getConfig('ai_models', 'global.primary_model', 'gemini-3.1-pro-preview')
    const fallback = await getConfig('ai_models', 'global.fallback_model', 'claude-opus-4-6')
    return [primary, fallback]
  }

  const primary = await getConfig('ai_models', agentPrimaryKey, agentPrimaryDefault)
  const fallback = await getConfig('ai_models', agentFallbackKey, agentFallbackDefault)
  return [primary, fallback]
}

// ─── Call options & result ─────────────────────────────────────────

export interface AICallOptions {
  /** Model ID (Gemini or Claude) */
  model: string
  /** The prompt / contents */
  prompt: string
  /** System instruction */
  systemPrompt?: string
  /** Gemini-specific config (thinking level, max tokens, timeout, etc.) */
  geminiConfig?: GenerateContentConfig
  /** Thinking level as string for Claude effort mapping */
  thinkingLevel?: string
  /** Max output tokens */
  maxOutputTokens?: number
  /** Request timeout in ms */
  timeout?: number
  /** Caller ID for logging */
  callerId?: string
  /** If true, uses Google Search grounding (Gemini only — skipped on Claude) */
  useGoogleSearch?: boolean
  /** JSON schema for structured output */
  responseSchema?: Record<string, unknown>
}

export interface AICallResult {
  text: string
  provider: 'gemini' | 'claude'
  model: string
  switched?: boolean
}

// ─── Main unified call function ───────────────────────────────────

/**
 * Unified AI call — routes to the correct provider based on model ID.
 * Handles fallback on errors (503 for Gemini, any error for Claude).
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const { model, callerId = 'unknown' } = options

  // If global fallback is active (e.g., previous 503), use fallback model
  if (_useFallback) {
    const fallbackModel = await getConfig('ai_models', 'global.fallback_model', 'claude-opus-4-6')
    const fallbackProvider = getProviderForModel(fallbackModel)
    console.log(`[${callerId}] 🔄 Using fallback ${fallbackModel} (global fallback active)`)
    if (fallbackProvider === 'claude') {
      return callClaudeModel(options, fallbackModel)
    }
    return callGeminiDirect({ ...options, model: fallbackModel })
  }

  // Route based on model provider
  const provider = getProviderForModel(model)

  if (provider === 'claude') {
    return callClaudePrimary(options)
  }
  return callGeminiPrimary(options)
}

// ─── Gemini call with fallback ────────────────────────────────────

async function callGeminiPrimary(options: AICallOptions): Promise<AICallResult> {
  const { model, callerId = 'unknown' } = options

  try {
    return await callGeminiDirect(options)
  } catch (err) {
    if (!isRetryableError(err)) throw err

    // 503 — try fallback
    const fallbackModel = await getConfig('ai_models', 'global.fallback_model', 'claude-opus-4-6')
    const fallbackProvider = getProviderForModel(fallbackModel)

    if (fallbackProvider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
      console.error(`[${callerId}] ⚠️ Gemini 503/504 but ANTHROPIC_API_KEY not set`)
      throw err
    }

    console.warn(`[${callerId}] ⚠️ Gemini error (503/504)! Switching to fallback: ${fallbackModel}`)
    switchToFallback(`503 from ${model} in ${callerId}`)

    if (fallbackProvider === 'claude') {
      const result = await callClaudeModel(options, fallbackModel)
      return { ...result, switched: true }
    }
    // Fallback is also Gemini (different model)
    const result = await callGeminiDirect({ ...options, model: fallbackModel })
    return { ...result, switched: true }
  }
}

// ─── Claude call with fallback ────────────────────────────────────

async function callClaudePrimary(options: AICallOptions): Promise<AICallResult> {
  const { model, callerId = 'unknown' } = options

  try {
    return await callClaudeModel(options, model)
  } catch (err) {
    // Try fallback
    const fallbackModel = await getConfig('ai_models', 'global.fallback_model', 'claude-opus-4-6')
    const fallbackProvider = getProviderForModel(fallbackModel)

    // Don't fallback to the same model
    if (fallbackModel === model) throw err

    console.warn(`[${callerId}] ⚠️ Claude ${model} failed! Trying fallback: ${fallbackModel}`)

    if (fallbackProvider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) throw err
      const result = await callGeminiDirect({ ...options, model: fallbackModel })
      return { ...result, switched: true }
    }
    // Fallback is also Claude (different model)
    const result = await callClaudeModel(options, fallbackModel)
    return { ...result, switched: true }
  }
}

// ─── Direct provider calls ────────────────────────────────────────

async function callGeminiDirect(options: AICallOptions): Promise<AICallResult> {
  const {
    model,
    prompt,
    geminiConfig,
    maxOutputTokens = 16000,
    timeout = 120_000,
    callerId = 'unknown',
    useGoogleSearch = false,
    responseSchema,
  } = options

  console.log(`[${callerId}] 🟢 Calling Gemini ${model}`)

  const response = await geminiClient.models.generateContent({
    model,
    contents: prompt,
    config: {
      ...geminiConfig,
      maxOutputTokens: geminiConfig?.maxOutputTokens || maxOutputTokens,
      httpOptions: { timeout: geminiConfig?.httpOptions?.timeout || timeout },
      ...(responseSchema ? { responseSchema, responseMimeType: 'application/json' } : {}),
      ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
    },
  })

  return {
    text: response.text || '',
    provider: 'gemini',
    model,
  }
}

async function callClaudeModel(options: AICallOptions, claudeModel: string): Promise<AICallResult> {
  const {
    prompt,
    systemPrompt,
    thinkingLevel,
    maxOutputTokens = 16000,
    callerId = 'unknown',
    responseSchema,
    useGoogleSearch,
  } = options

  if (useGoogleSearch) {
    console.warn(`[${callerId}] ⚠️ Google Search requested but Claude doesn't support it — skipping`)
  }

  const client = getAnthropicClient()
  const effort = mapThinkingToEffort(thinkingLevel)

  console.log(`[${callerId}] 🔵 Calling Claude ${claudeModel} (effort: ${effort})`)

  // Build system prompt
  let system = systemPrompt || ''
  if (responseSchema) {
    system += `\n\nIMPORTANT: You MUST return your response as valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY the JSON, no extra text or markdown.`
  }

  const modelDef = getModelDefinition(claudeModel)
  const maxTokens = Math.min(maxOutputTokens, modelDef?.capabilities.maxOutputTokens || 128000)

  try {
    const stream = client.messages.stream({
      model: claudeModel,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort },
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    })

    const finalMessage = await stream.finalMessage()

    let text = ''
    for (const block of finalMessage.content) {
      if (block.type === 'text') {
        text += block.text
      }
    }

    console.log(`[${callerId}] 🔵 Claude response: ${text.length} chars`)
    return {
      text,
      provider: 'claude',
      model: claudeModel,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${callerId}] ❌ Claude ${claudeModel} failed: ${errMsg}`)
    throw err
  }
}
