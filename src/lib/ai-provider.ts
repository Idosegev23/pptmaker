/**
 * Global AI Provider Router
 *
 * Routes calls to Gemini, Claude, or OpenAI based on:
 * 1. Admin-configured global primary/fallback model
 * 2. Automatic retryable-error fallback (503/504/429)
 * 3. Per-agent model configs (when global override is off)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { getConfig } from '@/lib/config/admin-config'

// ─── Types ────────────────────────────────────────────────────────

export type AIProvider = 'gemini' | 'claude' | 'openai'

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
  // Gemini
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
    id: 'gemini-2.5-pro-preview-05-06',
    provider: 'gemini',
    label: 'Gemini 2.5 Pro',
    capabilities: { googleSearch: true, responseSchema: true, maxOutputTokens: 65536 },
  },
  {
    id: 'gemini-2.5-flash-preview-04-17',
    provider: 'gemini',
    label: 'Gemini 2.5 Flash',
    capabilities: { googleSearch: true, responseSchema: true, maxOutputTokens: 65536 },
  },
  // OpenAI
  {
    id: 'gpt-5.2-pro-2025-12-11',
    provider: 'openai',
    label: 'GPT-5.2 Pro',
    capabilities: { googleSearch: false, responseSchema: true, maxOutputTokens: 100000 },
  },
  {
    id: 'gpt-5.2-2025-12-11',
    provider: 'openai',
    label: 'GPT-5.2',
    capabilities: { googleSearch: false, responseSchema: true, maxOutputTokens: 100000 },
  },
  // Claude
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
  const def = getModelDefinition(modelId)
  if (def) return def.provider
  if (modelId.startsWith('claude')) return 'claude'
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'openai'
  return 'gemini'
}

// ─── Singleton clients ────────────────────────────────────────────

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

let _openaiClient: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    })
  }
  return _openaiClient
}

// ─── Public API ───────────────────────────────────────────────────

export function isUsingFallback(): boolean {
  return _useFallback
}

/** @deprecated Use isUsingFallback() */
export const isUsingClaude = isUsingFallback

export function getProviderStatus(): { provider: string; switchedAt: number | null } {
  return { provider: _useFallback ? 'fallback' : 'primary', switchedAt: _switchedAt }
}

export function switchToFallback(reason: string): void {
  if (_useFallback) return
  _useFallback = true
  _switchedAt = Date.now()
  console.warn(`🔄 [AI-PROVIDER] Switching ALL calls to fallback model. Reason: ${reason}`)
}

/** @deprecated Use switchToFallback() */
export const switchToClaude = switchToFallback

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
    msg.includes('429') ||
    lower.includes('overloaded') ||
    lower.includes('high demand') ||
    lower.includes('service unavailable') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('deadline expired') ||
    lower.includes('rate_limit') ||
    lower.includes('rate limit') ||
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

export async function resolveModels(
  agentPrimaryKey: string,
  agentFallbackKey: string,
  agentPrimaryDefault: string = 'gemini-3.1-pro-preview',
  agentFallbackDefault: string = 'gemini-3-flash-preview',
): Promise<[string, string]> {
  const globalOverride = await getConfig('ai_models', 'global.override_agents', true)

  if (globalOverride) {
    const primary = await getConfig('ai_models', 'global.primary_model', 'gpt-5.2-pro-2025-12-11')
    const fallback = await getConfig('ai_models', 'global.fallback_model', 'gpt-5.2-2025-12-11')
    return [primary, fallback]
  }

  const primary = await getConfig('ai_models', agentPrimaryKey, agentPrimaryDefault)
  const fallback = await getConfig('ai_models', agentFallbackKey, agentFallbackDefault)
  return [primary, fallback]
}

// ─── Call options & result ─────────────────────────────────────────

export interface AICallOptions {
  /** Model ID (Gemini, Claude, or OpenAI) */
  model: string
  /** The prompt / contents */
  prompt: string
  /** System instruction */
  systemPrompt?: string
  /** Gemini-specific config (thinking level, max tokens, timeout, etc.) */
  geminiConfig?: GenerateContentConfig
  /** Thinking level as string for effort mapping */
  thinkingLevel?: string
  /** Max output tokens */
  maxOutputTokens?: number
  /** Request timeout in ms */
  timeout?: number
  /** Caller ID for logging */
  callerId?: string
  /** If true, uses Google Search grounding (Gemini only) */
  useGoogleSearch?: boolean
  /** JSON schema for structured output */
  responseSchema?: Record<string, unknown>
}

export interface AICallResult {
  text: string
  provider: AIProvider
  model: string
  switched?: boolean
}

// ─── Main unified call function ───────────────────────────────────

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const { model, callerId = 'unknown' } = options

  // If global fallback is active, use fallback model
  if (_useFallback) {
    const fallbackModel = await getConfig('ai_models', 'global.fallback_model', 'gpt-5.2-2025-12-11')
    const fallbackProvider = getProviderForModel(fallbackModel)
    console.log(`[${callerId}] 🔄 Using fallback ${fallbackModel} (global fallback active)`)
    return callByProvider(options, fallbackModel, fallbackProvider)
  }

  // Route based on model provider
  const provider = getProviderForModel(model)
  return callWithFallback(options, model, provider)
}

// ─── Call with automatic fallback ─────────────────────────────────

async function callWithFallback(
  options: AICallOptions,
  model: string,
  provider: AIProvider,
): Promise<AICallResult> {
  const { callerId = 'unknown' } = options

  try {
    return await callByProvider(options, model, provider)
  } catch (err) {
    if (!isRetryableError(err)) throw err

    const fallbackModel = await getConfig('ai_models', 'global.fallback_model', 'gpt-5.2-2025-12-11')
    const fallbackProvider = getProviderForModel(fallbackModel)

    if (fallbackModel === model) throw err // same model, can't help

    // Check API key availability
    if (fallbackProvider === 'claude' && !process.env.ANTHROPIC_API_KEY) throw err
    if (fallbackProvider === 'openai' && !process.env.OPENAI_API_KEY) throw err
    if (fallbackProvider === 'gemini' && !process.env.GEMINI_API_KEY) throw err

    console.warn(`[${callerId}] ⚠️ ${provider}/${model} failed (retryable)! Switching to fallback: ${fallbackModel}`)
    switchToFallback(`${provider} error from ${model} in ${callerId}`)

    const result = await callByProvider(options, fallbackModel, fallbackProvider)
    return { ...result, switched: true }
  }
}

// ─── Provider router ──────────────────────────────────────────────

async function callByProvider(
  options: AICallOptions,
  model: string,
  provider: AIProvider,
): Promise<AICallResult> {
  switch (provider) {
    case 'openai':
      return callOpenAIModel(options, model)
    case 'claude':
      return callClaudeModel(options, model)
    case 'gemini':
    default:
      return callGeminiDirect({ ...options, model })
  }
}

// ─── Gemini ───────────────────────────────────────────────────────

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

  return { text: response.text || '', provider: 'gemini', model }
}

// ─── OpenAI ───────────────────────────────────────────────────────

async function callOpenAIModel(options: AICallOptions, openaiModel: string): Promise<AICallResult> {
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
    console.warn(`[${callerId}] ⚠️ Google Search requested but OpenAI doesn't support it — skipping`)
  }

  const client = getOpenAIClient()
  const effort = mapThinkingToEffort(thinkingLevel)
  const modelDef = getModelDefinition(openaiModel)
  const maxTokens = Math.min(maxOutputTokens, modelDef?.capabilities.maxOutputTokens || 100000)

  console.log(`[${callerId}] 🟠 Calling OpenAI ${openaiModel} (reasoning_effort: ${effort})`)

  // Build messages
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  let system = systemPrompt || ''
  if (responseSchema) {
    system += `\n\nIMPORTANT: You MUST return your response as valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY the JSON, no extra text or markdown.`
  }
  if (system) {
    messages.push({ role: 'system', content: system })
  }
  messages.push({ role: 'user', content: prompt })

  try {
    const completion = await client.chat.completions.create({
      model: openaiModel,
      messages,
      max_completion_tokens: maxTokens,
      reasoning_effort: effort,
      stream: false,
    } as Parameters<typeof client.chat.completions.create>[0]) as OpenAI.Chat.ChatCompletion

    const text = completion.choices[0]?.message?.content || ''
    console.log(`[${callerId}] 🟠 OpenAI response: ${text.length} chars`)

    return { text, provider: 'openai', model: openaiModel }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${callerId}] ❌ OpenAI ${openaiModel} failed: ${errMsg}`)
    throw err
  }
}

// ─── Claude ───────────────────────────────────────────────────────

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
  const modelDef = getModelDefinition(claudeModel)
  const maxTokens = Math.min(maxOutputTokens, modelDef?.capabilities.maxOutputTokens || 128000)

  console.log(`[${callerId}] 🔵 Calling Claude ${claudeModel} (effort: ${effort})`)

  let system = systemPrompt || ''
  if (responseSchema) {
    system += `\n\nIMPORTANT: You MUST return your response as valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY the JSON, no extra text or markdown.`
  }

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
    return { text, provider: 'claude', model: claudeModel }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${callerId}] ❌ Claude ${claudeModel} failed: ${errMsg}`)
    throw err
  }
}
