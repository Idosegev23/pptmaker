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

let _geminiClient: GoogleGenAI | null = null
function getGeminiClient(): GoogleGenAI {
  if (!_geminiClient) {
    _geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: { timeout: 600_000 },
    })
  }
  return _geminiClient
}

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
      timeout: 600_000, // 10 min — slide batches need long generation time
    })
  }
  return _openaiClient
}

// ─── Public API ───────────────────────────────────────────────────

export function getProviderStatus(): { provider: string; switchedAt: number | null } {
  return { provider: 'per-call', switchedAt: null }
}

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
): Promise<string[]> {
  try {
    const { getConfig } = await import('@/lib/config/admin-config')
    const primary = await getConfig('ai_models', agentPrimaryKey, agentPrimaryDefault) as string
    const fallback = await getConfig('ai_models', agentFallbackKey, agentFallbackDefault) as string
    return [primary, fallback]
  } catch {
    // If admin config unavailable, use defaults
    return [agentPrimaryDefault, agentFallbackDefault]
  }
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
  /** Caller ID for logging */
  callerId?: string
  /** If true, uses Google Search grounding (Gemini only) */
  useGoogleSearch?: boolean
  /** JSON schema for structured output */
  responseSchema?: Record<string, unknown>
  /** Skip global fallback — caller manages retries. Error propagates directly. */
  noGlobalFallback?: boolean
}

export interface AICallResult {
  text: string
  provider: AIProvider
  model: string
  switched?: boolean
}

// ─── Main unified call function ───────────────────────────────────

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const { model, noGlobalFallback } = options
  const provider = getProviderForModel(model)

  // If caller manages its own retries, skip global fallback — let errors propagate
  if (noGlobalFallback) {
    return callByProvider(options, model, provider)
  }

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

    const fallbackModel = await getConfig('ai_models', 'global.fallback_model', 'gemini-3-flash-preview')
    const fallbackProvider = getProviderForModel(fallbackModel)

    if (fallbackModel === model) throw err // same model, can't help

    // Check API key availability
    if (fallbackProvider === 'claude' && !process.env.ANTHROPIC_API_KEY) throw err
    if (fallbackProvider === 'openai' && !process.env.OPENAI_API_KEY) throw err
    if (fallbackProvider === 'gemini' && !process.env.GEMINI_API_KEY) throw err

    console.warn(`[${callerId}] ⚠️ ${provider}/${model} failed (retryable)! Trying fallback: ${fallbackModel}`)

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
    callerId = 'unknown',
    useGoogleSearch = false,
    responseSchema,
  } = options

  console.log(`[${callerId}] 🟢 Calling Gemini ${model}`)

  const client = getGeminiClient()
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      ...geminiConfig,
      maxOutputTokens: geminiConfig?.maxOutputTokens || maxOutputTokens,
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

  // GPT-5.2 Pro minimum effort is 'medium'; supports medium/high/xhigh
  const isProModel = openaiModel.includes('-pro')
  const clampedEffort = (isProModel && effort === 'low') ? 'medium' : effort

  console.log(`[${callerId}] 🟠 Calling OpenAI ${openaiModel} via Responses API (reasoning_effort: ${clampedEffort})`)

  // Build instructions (system prompt + schema hint)
  let instructions = systemPrompt || ''
  if (responseSchema) {
    instructions += `\n\nIMPORTANT: You MUST return your response as valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY the JSON, no extra text or markdown.`
  }

  try {
    const response = await (client.responses as any).create({
      model: openaiModel,
      instructions: instructions || undefined,
      input: prompt,
      max_output_tokens: maxTokens,
      reasoning: { effort: clampedEffort },
      store: false,
    })

    const text = response.output_text || ''
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
