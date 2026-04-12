/**
 * Research Agent v8 — Brain only, no rendering.
 *
 * Architecture:
 *   Phase 1 (built-in tools): google_search + url_context → brand research
 *   Phase 2 (function declarations):
 *     - search_influencers → real IMAI data
 *     - draft_brand_content → brief, goals, audience (steps 1-3)
 *     - draft_strategy_content → insight, strategy, creative (steps 4-6)
 *     - draft_execution_content → deliverables, influencers, KPI (steps 7-9)
 *
 * Output: research data + draft wizard content + image prompts
 * Does NOT generate slides — that's slide-designer.ts's job.
 */

import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { searchIsraeliInfluencers, getAudienceReport } from '@/lib/imai/client'

// ─── Types ──────────────────────────────────────────────

export interface ResearchAgentInput {
  brandName: string
  briefText: string
  briefFileUri?: string
  briefFileMime?: string
}

export interface ResearchAgentOutput {
  /** Raw research text from google_search + url_context */
  researchText: string
  /** Structured brand research (matches BrandResearch type for UI display) */
  structuredResearch: Record<string, unknown> | null
  /** IMAI influencer results */
  influencers: Array<{
    username: string
    fullname: string
    followers: number
    engagement_rate: number
    rationale?: string
  }>
  /** Draft content for wizard steps 1-3 */
  brandContent: {
    brandBrief?: string
    brandObjective?: string
    goals?: string[]
    targetDescription?: string
    targetAgeRange?: string
    targetGender?: string
  } | null
  /** Draft content for wizard steps 4-6 */
  strategyContent: {
    keyInsight?: string
    insightData?: string
    strategyHeadline?: string
    strategyPillars?: Array<{ title: string; description: string }>
    activityTitle?: string
    activityDescription?: string
  } | null
  /** Draft content for wizard steps 7-9 */
  executionContent: {
    deliverables?: string[]
    influencerStrategy?: string
    influencerCriteria?: string[]
    budget?: number
    potentialReach?: number
    successMetrics?: string[]
  } | null
  /** Image generation prompts (deferred to background job) */
  imagePrompts: Array<{ type: string; prompt: string }>
  /** Brand colors extracted from research */
  brandColors: { primary: string; accent: string; background: string } | null
  totalToolCalls: number
  durationMs: number
}

export type ResearchProgressCallback = (event: {
  stage: 'research' | 'influencers' | 'drafting' | 'done' | 'error'
  message: string
  progress?: number
}) => void

// ─── Gemini Client ──────────────────────────────────────

let _client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: { timeout: 600_000 },
    })
  }
  return _client
}

// ─── Function Declarations ──────────────────────────────

const FUNCTION_DECLARATIONS = [
  {
    name: 'search_influencers',
    description:
      'Search for Israeli influencers on IMAI. Returns real data. ' +
      'You MUST call this to find influencers for the campaign.',
    parameters: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' }, description: 'Topic keywords in English' },
        platform: { type: 'string', enum: ['instagram', 'tiktok'] },
        minFollowers: { type: 'integer' },
        maxFollowers: { type: 'integer' },
        limit: { type: 'integer' },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'get_influencer_audience',
    description: 'Get audience demographics for a specific influencer. Use on top 2-3 candidates only.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        platform: { type: 'string', enum: ['instagram', 'tiktok'] },
      },
      required: ['username'],
    },
  },
  {
    name: 'draft_brand_content',
    description:
      'Draft wizard steps 1-3: brand brief, campaign goals, target audience. ' +
      'Call this AFTER researching the brand. All text in Hebrew.',
    parameters: {
      type: 'object',
      properties: {
        brandBrief: { type: 'string', description: 'מה האתגר של המותג? למה פנו אלינו? 2-3 משפטים.' },
        brandObjective: { type: 'string', description: 'למה הבריף הזה? משפט אחד.' },
        goals: { type: 'array', items: { type: 'string' }, description: '2-4 יעדי קמפיין ממוקדים' },
        targetDescription: { type: 'string', description: 'תיאור קהל היעד — 2-3 משפטים' },
        targetAgeRange: { type: 'string', description: 'טווח גילאים (25-45)' },
        targetGender: { type: 'string', description: 'נשים/גברים/שניהם' },
      },
      required: ['brandBrief', 'goals', 'targetDescription'],
    },
  },
  {
    name: 'draft_strategy_content',
    description:
      'Draft wizard steps 4-6: insight, strategy, creative idea. ' +
      'Call this AFTER drafting brand content. All text in Hebrew.',
    parameters: {
      type: 'object',
      properties: {
        keyInsight: { type: 'string', description: 'תובנה חדה ומפתיעה — משפט אחד עם נתון' },
        insightData: { type: 'string', description: 'הנתון שתומך בתובנה' },
        strategyHeadline: { type: 'string', description: 'כותרת האסטרטגיה — 5-8 מילים' },
        strategyPillars: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['title', 'description'],
          },
          description: '3 pillars אסטרטגיים',
        },
        activityTitle: { type: 'string', description: 'שם הקמפיין / הרעיון הגדול' },
        activityDescription: { type: 'string', description: 'תיאור הקונספט — 2-3 משפטים' },
      },
      required: ['keyInsight', 'strategyHeadline', 'strategyPillars', 'activityTitle'],
    },
  },
  {
    name: 'draft_execution_content',
    description:
      'Draft wizard steps 7-9: deliverables, influencer strategy, KPIs. ' +
      'Call this AFTER drafting strategy and searching influencers. All text in Hebrew.',
    parameters: {
      type: 'object',
      properties: {
        deliverables: { type: 'array', items: { type: 'string' }, description: 'רשימת תוצרים (3-6 פריטים)' },
        influencerStrategy: { type: 'string', description: 'אסטרטגיית משפיענים — 2-3 משפטים' },
        influencerCriteria: { type: 'array', items: { type: 'string' }, description: 'קריטריונים לבחירת משפיענים' },
        budget: { type: 'number', description: 'תקציב מומלץ (שקלים). 0 אם לא ידוע.' },
        potentialReach: { type: 'number', description: 'Reach צפוי' },
        successMetrics: { type: 'array', items: { type: 'string' }, description: 'מדדי הצלחה (3-5)' },
      },
      required: ['deliverables', 'influencerStrategy', 'successMetrics'],
    },
  },
  {
    name: 'suggest_image_prompts',
    description:
      'Suggest 3-4 image generation prompts for the presentation. ' +
      'These will be generated in the background while the user edits the wizard.',
    parameters: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['cover', 'brand', 'audience', 'activity'] },
              prompt: { type: 'string', description: 'Detailed image prompt in English (cinematic, editorial, 16:9)' },
            },
            required: ['type', 'prompt'],
          },
        },
      },
      required: ['images'],
    },
  },
]

// ─── The Agent ──────────────────────────────────────────

export async function runResearchAgent(
  input: ResearchAgentInput,
  onProgress?: ResearchProgressCallback,
): Promise<ResearchAgentOutput> {
  const requestId = `research-agent-${Date.now()}`
  const startTs = Date.now()

  console.log(`[ResearchAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[ResearchAgent][${requestId}] 🚀 START — brand: "${input.brandName}"`)
  console.log(`[ResearchAgent][${requestId}]    brief: ${input.briefText.length} chars`)
  console.log(`[ResearchAgent][${requestId}]    fileUri: ${input.briefFileUri || 'none'}`)

  const client = getClient()
  let totalToolCalls = 0
  let researchText = ''
  let structuredResearch: Record<string, unknown> | null = null
  const influencers: ResearchAgentOutput['influencers'] = []
  let brandContent: ResearchAgentOutput['brandContent'] = null
  let strategyContent: ResearchAgentOutput['strategyContent'] = null
  let executionContent: ResearchAgentOutput['executionContent'] = null
  const imagePrompts: ResearchAgentOutput['imagePrompts'] = []
  let brandColors: ResearchAgentOutput['brandColors'] = null

  // ════════════════════════════════════════════════════════
  // PHASE 1: Research — built-in tools only
  // ════════════════════════════════════════════════════════

  console.log(`[ResearchAgent][${requestId}] 📚 Phase 1: Research`)
  onProgress?.({ stage: 'research', message: '🔍 חוקר את המותג...', progress: 10 })

  const researchPrompt = `חקור את המותג "${input.brandName}" בשוק הישראלי.
חפש באינטרנט וסרוק את האתר שלהם. מצא את כל המידע שתוכל.

מהבריף:
${input.briefText.slice(0, 5000)}

החזר את הממצאים כ-JSON מובנה בפורמט הבא (ללא markdown fences):
{
  "brandName": "${input.brandName}",
  "officialName": "שם רשמי באנגלית",
  "industry": "תעשייה",
  "subIndustry": "תת-תעשייה",
  "founded": "שנת הקמה",
  "headquarters": "מיקום",
  "website": "URL",
  "companyDescription": "תיאור מקיף בעברית — 3-5 משפטים",
  "marketPosition": "פסקה על הפוזיציה בשוק",
  "pricePositioning": "budget/mid-range/premium/luxury",
  "competitors": [{"name": "שם", "description": "תיאור", "differentiator": "מה מבדיל"}],
  "uniqueSellingPoints": ["יתרון 1", "יתרון 2"],
  "mainProducts": [{"name": "שם מוצר", "description": "תיאור"}],
  "targetDemographics": {
    "primaryAudience": {"gender": "", "ageRange": "", "socioeconomic": "", "lifestyle": "", "interests": [], "painPoints": []}
  },
  "brandPersonality": ["תכונה 1", "תכונה 2"],
  "brandValues": ["ערך 1"],
  "toneOfVoice": "תיאור הטון",
  "visualIdentity": {"primaryColors": ["#XXXXXX"], "style": "", "moodKeywords": []},
  "socialPresence": {"instagram": {"handle": "", "followers": ""}, "tiktok": {"handle": ""}},
  "previousCampaigns": [{"name": "", "description": ""}],
  "industryTrends": ["טרנד 1"],
  "contentThemes": ["נושא 1"],
  "suggestedApproach": "פסקה על אסטרטגיה מומלצת",
  "dominantPlatformInIsrael": "אינסטגרם/טיקטוק",
  "israeliMarketContext": "הקשר ישראלי ספציפי",
  "confidence": "high/medium/low",
  "sources": [{"title": "מקור", "url": "URL"}]
}

חשוב: החזר JSON בלבד. אל תעטוף ב-\`\`\`. כתוב תוכן עשיר בעברית.
בסוף הJSON, בשורה חדשה, ציין: PRIMARY=#XXXXXX ACCENT=#XXXXXX`

  try {
    let contents: unknown
    if (input.briefFileUri && input.briefFileMime) {
      contents = [{
        role: 'user',
        parts: [
          { fileData: { mimeType: input.briefFileMime, fileUri: input.briefFileUri } },
          { text: researchPrompt },
        ],
      }]
    } else {
      contents = researchPrompt
    }

    const researchResponse: any = await client.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: contents as any,
      config: {
        thinkingConfig: { thinkingLevel: 'HIGH' as any },
        maxOutputTokens: 16000,
        tools: [{ googleSearch: {} }, { urlContext: {} }],
      } as GenerateContentConfig,
    })

    researchText = researchResponse.text || ''
    console.log(`[ResearchAgent][${requestId}] ✅ Research: ${researchText.length} chars`)

    // Try to parse structured JSON from research
    try {
      const jsonMatch = researchText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        structuredResearch = JSON.parse(jsonMatch[0])
        console.log(`[ResearchAgent][${requestId}]   📊 Structured research parsed: ${Object.keys(structuredResearch!).length} fields`)
      }
    } catch {
      console.warn(`[ResearchAgent][${requestId}]   ⚠️ Could not parse structured research JSON`)
    }

    // Extract colors from research text or structured data
    const colorMatch = researchText.match(/PRIMARY=#([0-9A-Fa-f]{6})/)
    const accentMatch = researchText.match(/ACCENT=#([0-9A-Fa-f]{6})/)
    const structColors = (structuredResearch as any)?.visualIdentity?.primaryColors
    if (colorMatch) {
      brandColors = {
        primary: `#${colorMatch[1]}`,
        accent: accentMatch ? `#${accentMatch[1]}` : `#${colorMatch[1]}`,
        background: '#0C0C10',
      }
    } else if (structColors?.length) {
      brandColors = {
        primary: structColors[0],
        accent: structColors[1] || structColors[0],
        background: '#0C0C10',
      }
    }
    if (brandColors) {
      console.log(`[ResearchAgent][${requestId}]   🎨 Colors: ${brandColors.primary} / ${brandColors.accent}`)
    }
  } catch (err) {
    console.error(`[ResearchAgent][${requestId}] ⚠️ Research failed:`, err instanceof Error ? err.message : err)
    researchText = `לא הצלחתי לחקור את "${input.brandName}". משתמש במידע מהבריף בלבד.`
  }

  onProgress?.({ stage: 'research', message: '✅ מחקר הושלם', progress: 30 })

  // ════════════════════════════════════════════════════════
  // PHASE 2: Draft content + IMAI — function declarations only
  // ════════════════════════════════════════════════════════

  console.log(`[ResearchAgent][${requestId}] 🎯 Phase 2: Draft + IMAI`)
  onProgress?.({ stage: 'drafting', message: '📝 מנסח תוכן ראשוני...', progress: 40 })

  const draftPrompt = `Based on the research below, do the following IN ORDER:

1. Call search_influencers with relevant keywords for "${input.brandName}" (industry-related)
2. Call draft_brand_content — draft brief, goals, audience (Hebrew)
3. Call draft_strategy_content — draft insight, strategy, creative (Hebrew)
4. Call draft_execution_content — draft deliverables, influencers, KPIs (Hebrew)
5. Call suggest_image_prompts — suggest 3-4 images for the presentation

RESEARCH RESULTS:
${researchText.slice(0, 12000)}

BRIEF:
${input.briefText.slice(0, 5000)}

IMPORTANT:
- All text content must be in Hebrew
- The insight must be sharp and data-backed — not generic
- The strategy must be concrete with 3 specific pillars
- Use REAL data from the research, don't invent
- Call ALL 5 functions in order`

  const history: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: 'user', parts: [{ text: draftPrompt }] },
  ]

  const MAX_ITERATIONS = 15

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    console.log(`[ResearchAgent][${requestId}] 🔁 Iteration ${iter + 1}/${MAX_ITERATIONS} (${totalToolCalls} tool calls)`)

    const response: any = await client.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: history as any,
      config: {
        systemInstruction: `אתה אסטרטג שיווק ומחקר מותגים בכיר בסוכנות Leaders.
תפקידך: לחקור מותג, למצוא משפיענים אמיתיים, ולנסח תוכן ראשוני ל-9 שלבי הוויזרד.
כל הטקסט בעברית. תובנות חדות. אסטרטגיות קונקרטיות. אל תמציא נתונים.`,
        thinkingConfig: { thinkingLevel: 'MEDIUM' as any },
        maxOutputTokens: 32000,
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] as any,
      } as GenerateContentConfig,
    })

    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []
    const functionCalls = parts.filter((p: any) => p.functionCall)

    if (functionCalls.length === 0) {
      console.log(`[ResearchAgent][${requestId}] ✅ Phase 2 done: ${totalToolCalls} tool calls`)
      break
    }

    history.push({ role: 'model', parts })
    const responseParts: Array<Record<string, unknown>> = []

    for (const part of functionCalls) {
      const fc = part.functionCall
      const name = fc.name as string
      const args = fc.args || {}
      totalToolCalls++

      console.log(`[ResearchAgent][${requestId}]   🔧 ${name}(${JSON.stringify(args).slice(0, 120)})`)

      let result: unknown

      try {
        switch (name) {
          case 'search_influencers': {
            onProgress?.({ stage: 'influencers', message: '🔍 מחפש משפיענים ב-IMAI...', progress: 50 })
            const keywords = (args.keywords as string[]) || []
            const found = await searchIsraeliInfluencers(keywords, {
              platform: (args.platform as 'instagram' | 'tiktok') || 'instagram',
              minFollowers: (args.minFollowers as number) || 5000,
              maxFollowers: (args.maxFollowers as number) || 500000,
              limit: (args.limit as number) || 10,
            })
            const mapped = found.slice(0, 10).map(i => ({
              username: i.username, fullname: i.fullname,
              followers: i.followers, engagement_rate: i.engagement_rate,
            }))
            influencers.push(...mapped.map(i => ({ ...i, rationale: '' })))
            result = mapped
            console.log(`[ResearchAgent][${requestId}]     → ${mapped.length} influencers`)
            break
          }

          case 'get_influencer_audience': {
            const report = await getAudienceReport(args.username as string, (args.platform as any) || 'instagram')
            result = {
              username: report.user_profile.username,
              followers: report.user_profile.followers,
              credibility: report.audience_followers?.data?.audience_credibility,
            }
            break
          }

          case 'draft_brand_content': {
            onProgress?.({ stage: 'drafting', message: '📝 מנסח בריף, מטרות וקהל יעד...', progress: 60 })
            brandContent = args as ResearchAgentOutput['brandContent']
            result = { success: true, step: 'brand_content' }
            console.log(`[ResearchAgent][${requestId}]     → Brand content drafted`)
            break
          }

          case 'draft_strategy_content': {
            onProgress?.({ stage: 'drafting', message: '📝 מנסח תובנה, אסטרטגיה וקריאייטיב...', progress: 70 })
            strategyContent = args as ResearchAgentOutput['strategyContent']
            result = { success: true, step: 'strategy_content' }
            console.log(`[ResearchAgent][${requestId}]     → Strategy content drafted`)
            break
          }

          case 'draft_execution_content': {
            onProgress?.({ stage: 'drafting', message: '📝 מנסח תוצרים, משפיענים ו-KPI...', progress: 80 })
            executionContent = args as ResearchAgentOutput['executionContent']
            result = { success: true, step: 'execution_content' }
            console.log(`[ResearchAgent][${requestId}]     → Execution content drafted`)
            break
          }

          case 'suggest_image_prompts': {
            onProgress?.({ stage: 'drafting', message: '🎨 מכין רעיונות לתמונות...', progress: 85 })
            const imgs = (args.images as Array<{ type: string; prompt: string }>) || []
            imagePrompts.push(...imgs)
            result = { success: true, imageCount: imgs.length }
            console.log(`[ResearchAgent][${requestId}]     → ${imgs.length} image prompts`)
            break
          }

          default:
            result = { error: `Unknown function: ${name}` }
        }
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) }
        console.error(`[ResearchAgent][${requestId}]     ❌ ${name} failed:`, result)
      }

      responseParts.push({ functionResponse: { name, response: { result } } })
    }

    history.push({ role: 'user', parts: responseParts })
  }

  const durationMs = Date.now() - startTs
  console.log(`[ResearchAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[ResearchAgent][${requestId}] ✅ DONE — ${totalToolCalls} tool calls, ${durationMs}ms`)
  console.log(`[ResearchAgent][${requestId}]    research: ${researchText.length} chars`)
  console.log(`[ResearchAgent][${requestId}]    influencers: ${influencers.length}`)
  console.log(`[ResearchAgent][${requestId}]    brandContent: ${brandContent ? 'YES' : 'NO'}`)
  console.log(`[ResearchAgent][${requestId}]    strategyContent: ${strategyContent ? 'YES' : 'NO'}`)
  console.log(`[ResearchAgent][${requestId}]    executionContent: ${executionContent ? 'YES' : 'NO'}`)
  console.log(`[ResearchAgent][${requestId}]    imagePrompts: ${imagePrompts.length}`)
  console.log(`[ResearchAgent][${requestId}]    colors: ${brandColors ? brandColors.primary : 'none'}`)
  console.log(`[ResearchAgent][${requestId}] ═══════════════════════════════════════`)

  onProgress?.({ stage: 'done', message: '✅ מחקר ותוכן מוכנים', progress: 100 })

  return {
    researchText,
    structuredResearch,
    influencers,
    brandContent,
    strategyContent,
    executionContent,
    imagePrompts,
    brandColors,
    totalToolCalls,
    durationMs,
  }
}
