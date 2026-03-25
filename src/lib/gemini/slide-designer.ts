/**
 * Gemini AI Slide Designer — 3-Step Pipeline
 *
 * Architecture:
 *   1. Design System — AI generates creative direction + visual system
 *   2. Planner — AI reads ALL wizard data, writes Hebrew copy for every slide
 *   3. Slide Generator — AI generates visual layout per plan (3 parallel batches)
 *
 * Exports:
 * - pipelineFoundation/Batch/Finalize — staged pipeline for Vercel
 * - generateAIPresentation() — full pipeline (non-staged)
 * - regenerateSingleSlide() — single slide regen
 * - generateAISlides() — legacy HTML wrapper
 */

import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'
import type {
  Presentation,
  Slide,
  SlideType,
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
} from '@/types/presentation'

// ── Sub-module imports ──────────────────────────────────
import type {
  BrandDesignInput,
  SlideContentInput,
  PremiumDesignSystem,
  BatchContext,
  SlidePlan,
  PremiumProposalData,
} from './slide-design'

import {
  // Config loaders
  getDesignSystemModels, getBatchModels,
  getSystemInstruction, getImageRoleHints,
  getPacingMap,
  getThinkingLevel, getBatchThinkingLevel,
  getMaxOutputTokens, getTemperature,
  // Schemas
  DESIGN_SYSTEM_SCHEMA, SLIDE_BATCH_SCHEMA,
  // Color utils
  validateAndFixColors,
  // Validation
  validateSlide, autoFixSlide, checkVisualConsistency,
  // Fallbacks
  buildFallbackDesignSystem, buildFallbackSlide, createFallbackSlide,
  // Logo injection
  injectLeadersLogo, injectClientLogo,
} from './slide-design'

// Re-export pipeline types for external consumers
export type { PipelineFoundation, BatchResult, SlidePlan } from './slide-design'

// ─── Constants ──────────────────────────────────────────

/** Sticky fallback — once Pro 503s, skip it for all subsequent calls in this generation */
let _proUnavailable = false
export function resetStickyFallback() { _proUnavailable = false }

/** Fixed layout directive per slide type — mandatory, not a suggestion */
const LAYOUT_MAP: Record<string, string> = {
  cover:              'Typographic Brutalism — oversized brand name 300px+ with textStroke, Aurora BG, dramatic negative space',
  brief:              'Editorial Bleed — image bleeds 60% of canvas with borderRadius capsule, minimal text on opposite side',
  goals:              'Bento Box — asymmetric grid of mixed-size rounded cells with key numbers inside each cell',
  audience:           'Magazine Spread — large pull-quote with dominant image, editorial feel',
  insight:            'Typographic Brutalism — the insight quote at 48px centered, keyword 250px+ hollow in background',
  whyNow:             'Data Art — oversized numbers as visual centerpiece with minimal supporting text',
  strategy:           'Split Screen Asymmetry — right side (700px) dark with title, left side floating cards crossing the divider',
  competitive:        'Bento Box — competitor cards in asymmetric grid with data highlights',
  bigIdea:            'Typographic Brutalism — idea name at 80px, giant hollow keyword 300px+ rotated in background',
  approach:           'Overlapping Z-index cards — layered cards with fake-3D shadows (+12px offset) creating depth',
  deliverables:       'Swiss Grid — structured grid with clear hierarchy, each deliverable in its own cell',
  metrics:            'Data Art — each metric as oversized number (80-140px) with small label below, dramatic spacing',
  influencerStrategy: 'Diagonal Grid — angled composition with criteria as floating tags',
  contentStrategy:    'Overlapping Z-index cards — content themes as layered cards with depth shadows',
  influencers:        'Bento Box — influencer cards in tight grid with circular profile images',
  timeline:           'Cinematic Widescreen — horizontal flow with timeline phases as connected elements',
  closing:            'Typographic Brutalism — BRAND name 350px+ hollow, centered CTA at 80px, Aurora BG',
}

const IMAGE_SIZE_HINTS: Record<string, string> = {
  cover: 'Full-bleed (1920×1080) or right-half (960×1080). Image is the hero.',
  brief: 'Right 40% (768×800), vertically centered. Leave left for text.',
  audience: 'Right 45% (864×900). People-focused, large and immersive.',
  insight: 'Background overlay (1920×1080) with gradient on top, or right 50%.',
  bigIdea: 'Right 60% (1152×1080) full height. The visual IS the idea.',
  strategy: 'Accent image, 30% (576×600), positioned as visual anchor.',
  approach: 'Small accent (480×480), positioned at rule-of-thirds intersection.',
  closing: 'Background overlay (1920×1080) at low opacity, or centered accent.',
}

const TENSION_SLIDES = new Set(['cover', 'insight', 'bigIdea', 'closing'])

// ─── Helpers ────────────────────────────────────────────

function detailedError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts: string[] = [error.message]
  let current: unknown = (error as Error & { cause?: unknown }).cause
  let depth = 0
  while (current && depth < 3) {
    if (current instanceof Error) {
      parts.push(`cause: ${current.message}`)
      current = (current as Error & { cause?: unknown }).cause
    } else {
      parts.push(`cause: ${String(current)}`)
      break
    }
    depth++
  }
  const code = (error as Error & { code?: string }).code
  if (code) parts.push(`code: ${code}`)
  return parts.join(' → ')
}

/** Strip internal fields from proposal data for prompt (reduce tokens) */
function cleanDataForPrompt(data: PremiumProposalData): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_') || key === 'scrapedInfluencers' || key === 'enhancedInfluencers') continue
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    clean[key] = value
  }
  return clean
}

/** Quick CSS shadow/filter syntax check */
function isValidCssShadow(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  return /\d+px|rgba?\(|hsla?\(|inset|blur|brightness|contrast|saturate/.test(value)
}

// ═══════════════════════════════════════════════════════════
//  STEP 1: GENERATE DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════

async function generateDesignSystem(
  brand: BrandDesignInput,
): Promise<PremiumDesignSystem> {
  const requestId = `ds-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 1: Design System for "${brand.brandName}"`)

  console.log(`[SlideDesigner][${requestId}] 📋 Brand input:`, JSON.stringify({ name: brand.brandName, industry: brand.industry, personality: brand.brandPersonality, colors: brand.brandColors, audience: brand.targetAudience }, null, 2))

  const prompt = `<brand>
name: ${brand.brandName}
industry: ${brand.industry || 'לא ידוע'}
personality: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
colors: primary=${brand.brandColors.primary}, secondary=${brand.brandColors.secondary}, accent=${brand.brandColors.accent}
style: ${brand.brandColors.style || 'corporate'}
audience: ${brand.targetAudience || 'מבוגרים 25-45'}
</brand>

<task>
Generate a creative direction and design system JSON for a premium presentation.
</task>

<creative_direction_spec>
Generate these fields:

visualMetaphor: One concrete visual reference. Examples: "Japanese gallery minimalism", "90s fashion magazine", "brutalist concrete architecture". Never generic words like "modern", "clean", "professional".

visualMetaphor_translates_to: Object with concrete design implications:
  - whitespace_ratio: description (e.g. "high — 40%+ white space")
  - max_colors_per_slide: number (2–4)
  - text_alignment: e.g. "edge-anchored" or "asymmetric-offset"
  - image_treatment: e.g. "full-bleed" or "contained-with-margin" or "strip"

visualTension: A surprising contrast pair. Example: "giant broken text + Japanese minimalism".

oneRule: A single rule every slide must follow. Example: "one element always bleeds off-canvas".

colorStory: 3-act narrative for color across the deck. Example: "dark and cold → accent burst in middle → restrained ending".

typographyVoice: Weight contrast description. Example: "900 headings screaming vs 300 body whispering".

emotionalArc: Sequence of 5-6 emotions the viewer should feel across the deck.
</creative_direction_spec>

<design_system_spec>
Generate these exact fields:

colors: {primary, secondary, accent, background (dark, not pure black — add color hint), text (WCAG AA 4.5:1 vs background), cardBg (10-15% lighter/darker than background), cardBorder (low opacity primary or white), gradientStart, gradientEnd, muted (3:1 contrast min), highlight, auroraA, auroraB, auroraC}

typography: {displaySize:80-140, headingSize:48-64, subheadingSize:28-36, bodySize:20-24, captionSize:14-16, letterSpacingTight:-5 to -1, letterSpacingWide:2-8, lineHeightTight:0.9-1.05, lineHeightRelaxed:1.4-1.6, weightPairs:[[heading,body]] e.g. [[900,300]]}

spacing: {unit:8, cardPadding:32-48, cardGap:24-40, safeMargin:80}

effects: {borderRadius:"sharp"|"soft"|"pill", borderRadiusValue:number, decorativeStyle:"geometric"|"organic"|"minimal"|"brutalist", shadowStyle:"none"|"fake-3d"|"glow", auroraGradient:"CSS radial-gradient string from auroraA/B/C"}

motif: {type:"diagonal-lines"|"dots"|"circles"|"angular-cuts"|"wave"|"grid-lines"|"organic-blobs"|"triangles", opacity:0.05-0.2, color:string, implementation:"CSS description"}

Font: Heebo.
</design_system_spec>`

  const sysInstruction = await getSystemInstruction()
  const models = await getDesignSystemModels()
  const [dsThinkingLevel, dsMaxOutputTokens] = await Promise.all([getThinkingLevel(), getMaxOutputTokens()])
  const dsThinking = dsThinkingLevel === 'HIGH' ? ThinkingLevel.HIGH
    : dsThinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM
    : ThinkingLevel.LOW

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] 🤖 Calling ${model} for design system (attempt ${attempt + 1}/${models.length})...`)
      console.log(`[SlideDesigner][${requestId}] 📝 DS prompt length: ${prompt.length} chars | thinking: ${dsThinkingLevel} | maxTokens: ${dsMaxOutputTokens}`)
      const dsResult = await callAI({
        model,
        prompt,
        systemPrompt: sysInstruction,
        geminiConfig: {
          systemInstruction: sysInstruction,
          responseMimeType: 'application/json',
          responseSchema: DESIGN_SYSTEM_SCHEMA,
          thinkingConfig: { thinkingLevel: dsThinking },
          maxOutputTokens: dsMaxOutputTokens,
        },
        responseSchema: DESIGN_SYSTEM_SCHEMA as unknown as Record<string, unknown>,
        thinkingLevel: dsThinkingLevel,
        maxOutputTokens: dsMaxOutputTokens,
        callerId: `${requestId}-ds`,
        noGlobalFallback: true,
      })

      const rawText = dsResult.text || ''
      console.log(`[SlideDesigner][${requestId}] Raw response length: ${rawText.length} chars (model: ${model})`)

      let parsed: PremiumDesignSystem
      try {
        parsed = JSON.parse(rawText) as PremiumDesignSystem
      } catch {
        console.warn(`[SlideDesigner][${requestId}] JSON.parse failed, falling back to robust parser`)
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<PremiumDesignSystem>(rawText)
        if (!fallbackParsed) throw new Error('Both JSON.parse and parseGeminiJson failed')
        parsed = fallbackParsed
      }

      if (parsed?.colors?.primary) {
        parsed.colors = validateAndFixColors(parsed.colors)
        parsed.fonts = parsed.fonts || { heading: 'Heebo', body: 'Heebo' }
        parsed.direction = 'rtl'
        console.log(`[SlideDesigner][${requestId}] ✅ Design System ready (model: ${model}):`)
        console.log(`[SlideDesigner][${requestId}]   🎨 Colors: primary=${parsed.colors.primary} secondary=${parsed.colors.secondary} accent=${parsed.colors.accent} bg=${parsed.colors.background} text=${parsed.colors.text}`)
        console.log(`[SlideDesigner][${requestId}]   📐 Typography: heading=${parsed.typography?.headingSize}px body=${parsed.typography?.bodySize}px weights=${JSON.stringify(parsed.typography?.weightPairs)}`)
        console.log(`[SlideDesigner][${requestId}]   ✨ Effects: radius=${parsed.effects?.borderRadius} shadow=${parsed.effects?.shadowStyle} deco=${parsed.effects?.decorativeStyle}`)
        console.log(`[SlideDesigner][${requestId}]   🎭 Creative: metaphor="${parsed.creativeDirection?.visualMetaphor}" tension="${parsed.creativeDirection?.visualTension}" rule="${parsed.creativeDirection?.oneRule}"`)
        return parsed
      }
      throw new Error(`Invalid design system — parsed colors missing`)
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Design system attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)

      if (attempt === 0 && (msg.includes('503') || msg.includes('fetch failed') || msg.includes('UNAVAILABLE') || msg.includes('overloaded'))) {
        _proUnavailable = true
        console.log(`[SlideDesigner][${requestId}] Marked ${model} as unavailable — subsequent calls will skip to fallback`)
      }

      if (attempt < models.length - 1) {
        console.log(`[SlideDesigner][${requestId}] Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  console.error(`[SlideDesigner][${requestId}] All design system attempts failed, using fallback`)
  return buildFallbackDesignSystem(brand)
}

// ═══════════════════════════════════════════════════════════
//  STEP 2: PLANNER — AI reads ALL data, plans every slide
// ═══════════════════════════════════════════════════════════

async function generateSlidePlan(
  data: PremiumProposalData,
  designSystem: PremiumDesignSystem,
  images: Record<string, string>,
): Promise<SlidePlan[]> {
  const requestId = `plan-${Date.now()}`
  const brandName = data.brandName || 'Unknown'
  console.log(`[SlideDesigner][${requestId}] Step 2: Planner for "${brandName}"`)

  const cleanData = cleanDataForPrompt(data)
  const brandResearch = data._brandResearch || {}
  const influencerResearch = data._influencerStrategy || data.influencerResearch || {}

  // Available images list
  const imageList = Object.entries(images)
    .filter(([, url]) => url)
    .map(([key, url]) => `  - ${key}: ${url}`)
    .join('\n')

  const cd = designSystem.creativeDirection

  const prompt = `אתה קריאייטיב דיירקטור בכיר ב-Leaders, סוכנות שיווק דיגיטלי ישראלית מובילה.

<brand_data>
${JSON.stringify(cleanData, null, 2)}
</brand_data>

<brand_research>
${JSON.stringify(brandResearch, null, 2)}
</brand_research>

<influencer_research>
${JSON.stringify(influencerResearch, null, 2)}
</influencer_research>

<available_images>
${imageList || 'אין תמונות זמינות'}
</available_images>

<creative_direction>
${cd ? `Visual Metaphor: ${cd.visualMetaphor}
Visual Tension: ${cd.visualTension}
One Rule: ${cd.oneRule}
Color Story: ${cd.colorStory}
Typography Voice: ${cd.typographyVoice}
Emotional Arc: ${cd.emotionalArc}` : 'No creative direction available'}
</creative_direction>

<task>
תכנן מצגת הצעת מחיר פרימיום עבור "${brandName}".

כתוב את הקופי העברי המדויק לכל שקף. אתה הקופירייטר והקריאייטיב דיירקטור — תהיה ספציפי, חד, ויצירתי.

סוגי שקפים זמינים (בחר 12-17 מתוכם):
cover, brief, goals, audience, insight, whyNow, strategy, competitive, bigIdea, approach, deliverables, metrics, influencerStrategy, contentStrategy, influencers, timeline, closing

כללים:
1. כל הטקסט בעברית בלבד! גם כותרת הcover חייבת להיות בעברית. שם המותג יכול להיות באנגלית אבל שאר הכותרת בעברית. דוגמה: "${brandName} — הסמכות של יוקרה חכמה" ולא "The Authority of Smart Luxury"
2. cover ו-closing חובה
3. כותרות: קצרות, פרובוקטיביות, ספציפיות למותג. לא "המטרות שלנו" אלא "3 יעדים שישנו את ${brandName}"
4. גוף: מקסימום 2-3 משפטים. תמציתי וחד
5. כרטיסים: כותרת + גוף קצר. מקסימום 5 כרטיסים
6. בולט פוינטס: מקסימום 5 נקודות, כל אחת עד 10 מילים
7. מספרים מפתח: השתמש בנתונים אמיתיים מהדאטה (תקציב, reach, KPIs)
8. שייך תמונות קיימות (existingImageKey) כשהן רלוונטיות. אם אין תמונה מתאימה — כתוב imageDirection לתמונה שצריך ליצור
9. whyNow — רק אם יש נתונים רלוונטיים (whyNowTrigger, israeliMarketContext)
10. competitive — רק אם יש מתחרים בדאטה
11. contentStrategy — רק אם יש contentGuidelines
12. timeline — רק אם יש suggestedTimeline
13. influencers — רק אם יש scrapedInfluencers או recommendations
14. כל שקף צריך emotionalTone שמתאים לסיפור הכולל
15. המצגת היא מסע: פתיחה דרמטית → בניית צורך → פתרון → הוכחה → סגירה
16. COVER: רק כותרת + כותרת משנה קצרה (עד 8 מילים). אין bodyText בcover! זה שקף פתיחה ויזואלי, לא מקום לפרגרף. דוגמה טובה: title="${brandName} — הסטנדרט החדש", subtitle="הקלאסיקה החדשה של המטבח הישראלי"
17. CLOSING: רק כותרת + tagline קצר. אין הנחיות או הערות! כתוב רק תוכן שהקהל רואה. דוגמה: title="בואו נתחיל", tagline="Leaders × ${brandName}"
</task>`

  console.log(`[SlideDesigner][${requestId}] 📝 Plan prompt length: ${prompt.length} chars`)
  console.log(`[SlideDesigner][${requestId}] 🖼️ Available images: ${imageList || 'none'}`)

  // ── GPT-5.4 for Planner (fast, excellent Hebrew, no timeout on long prompts) ──
  const jsonSchema = {
    type: 'object' as const,
    properties: {
      slides: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            slideType: { type: 'string' as const },
            title: { type: 'string' as const },
            subtitle: { type: 'string' as const },
            bodyText: { type: 'string' as const },
            bulletPoints: { type: 'array' as const, items: { type: 'string' as const } },
            cards: { type: 'array' as const, items: { type: 'object' as const, properties: { title: { type: 'string' as const }, body: { type: 'string' as const } }, required: ['title', 'body'] } },
            keyNumber: { type: 'string' as const },
            keyNumberLabel: { type: 'string' as const },
            tagline: { type: 'string' as const },
            imageDirection: { type: 'string' as const },
            existingImageKey: { type: 'string' as const },
            emotionalTone: { type: 'string' as const },
          },
          required: ['slideType', 'title', 'emotionalTone'],
        },
      },
    },
    required: ['slides'],
  }

  const models = ['gpt-5.4', 'gpt-4o-mini']
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] 🤖 Calling ${model} for plan (attempt ${attempt + 1}/${models.length})...`)
      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'אתה קריאייטיב דיירקטור בכיר. תכנן מצגות הצעת מחיר פרימיום בעברית. החזר JSON בלבד.' },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'slide_plan', strict: true, schema: jsonSchema },
        },
        max_completion_tokens: 16384,
      })

      const rawText = completion.choices[0]?.message?.content || '{}'
      console.log(`[SlideDesigner][${requestId}] ✅ ${model} responded: ${rawText.length} chars`)

      let parsed: { slides: SlidePlan[] }
      try {
        parsed = JSON.parse(rawText) as { slides: SlidePlan[] }
      } catch {
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<{ slides: SlidePlan[] }>(rawText)
        if (!fallbackParsed) throw new Error('JSON parse failed')
        parsed = fallbackParsed
      }

      if (parsed?.slides?.length >= 5) {
        // Post-process: sanitize plan content
        for (const slide of parsed.slides) {
          if (slide.slideType === 'cover') {
            delete slide.bodyText
            delete slide.bulletPoints
            delete slide.cards
          }
          if (slide.slideType === 'closing') {
            if (slide.bodyText && /הנחי[הי]|הערה|הוראה|instruction/i.test(slide.bodyText)) delete slide.bodyText
            if (slide.tagline && /הנחי[הי]|הערה|הוראה|instruction/i.test(slide.tagline)) delete slide.tagline
          }
          if (slide.bodyText && /^הנחי[הי]\s*(נוספת|:)/i.test(slide.bodyText.trim())) delete slide.bodyText
        }
        console.log(`[SlideDesigner][${requestId}] ✅ Plan ready: ${parsed.slides.length} slides (model: ${model})`)
        console.log(`[SlideDesigner][${requestId}]   Types: ${parsed.slides.map(s => s.slideType).join(', ')}`)
        for (const s of parsed.slides) {
          console.log(`[SlideDesigner][${requestId}]   📄 ${s.slideType.padEnd(18)} | title="${s.title}" | tone=${s.emotionalTone} | image=${s.existingImageKey || 'none'} | cards=${s.cards?.length || 0} | bullets=${s.bulletPoints?.length || 0} | number=${s.keyNumber || 'none'}`)
        }
        return parsed.slides
      }
      throw new Error(`Plan too short: ${parsed?.slides?.length || 0} slides`)
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Plan attempt ${attempt + 1} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  console.warn(`[SlideDesigner][${requestId}] All plan attempts failed, using fallback plan`)
  return buildFallbackPlan(data, images)
}

/** Fallback plan when AI fails */
function buildFallbackPlan(data: PremiumProposalData, images: Record<string, string>): SlidePlan[] {
  const brandName = data.brandName || 'המותג'
  const plans: SlidePlan[] = [
    { slideType: 'cover', title: brandName, subtitle: data.campaignName || 'הצעת מחיר', emotionalTone: 'dramatic', existingImageKey: images.coverImage ? 'coverImage' : undefined },
    { slideType: 'brief', title: `הסיפור של ${brandName}`, bodyText: data.brandBrief || data.brandObjective || '', emotionalTone: 'warm', existingImageKey: images.brandImage ? 'brandImage' : undefined },
    { slideType: 'goals', title: 'מטרות הקמפיין', bulletPoints: data.goals || [], emotionalTone: 'energetic' },
    { slideType: 'audience', title: 'קהל היעד', bodyText: data.targetDescription || '', emotionalTone: 'analytical', existingImageKey: images.audienceImage ? 'audienceImage' : undefined },
    { slideType: 'insight', title: data.keyInsight || 'התובנה המרכזית', bodyText: data.insightData || '', emotionalTone: 'dramatic' },
    { slideType: 'strategy', title: data.strategyHeadline || 'האסטרטגיה', bodyText: data.strategyDescription || '', cards: (data.strategyPillars || []).map(p => ({ title: p.title, body: p.description })), emotionalTone: 'confident' },
    { slideType: 'bigIdea', title: data.activityTitle || 'הרעיון הגדול', bodyText: data.activityDescription || '', emotionalTone: 'bold' },
    { slideType: 'approach', title: 'הגישה שלנו', cards: (data.activityApproach || []).map(a => ({ title: a.title, body: a.description })), emotionalTone: 'warm', existingImageKey: images.activityImage ? 'activityImage' : undefined },
    { slideType: 'deliverables', title: 'מה אנחנו מספקים', bulletPoints: data.deliverables || [], emotionalTone: 'confident' },
    { slideType: 'metrics', title: 'מדדי הצלחה', bulletPoints: data.successMetrics || [], keyNumber: data.budget ? `₪${data.budget.toLocaleString()}` : undefined, keyNumberLabel: 'תקציב', emotionalTone: 'analytical' },
    { slideType: 'closing', title: `בואו נעשה את זה`, subtitle: brandName, tagline: 'מוכנים להתחיל?', emotionalTone: 'inspiring' },
  ]

  if (data._brandResearch?.competitors?.length) {
    plans.splice(5, 0, { slideType: 'competitive', title: 'הנוף התחרותי', cards: data._brandResearch.competitors.map(c => ({ title: c.name || '', body: c.differentiator || '' })), emotionalTone: 'analytical' })
  }
  if (data.influencerResearch?.recommendations?.length || data.scrapedInfluencers?.length) {
    plans.splice(-1, 0, { slideType: 'influencerStrategy', title: 'אסטרטגיית משפיענים', bodyText: data.influencerResearch?.strategySummary || '', emotionalTone: 'energetic' })
  }

  return plans
}

// ═══════════════════════════════════════════════════════════
//  STEP 3: GENERATE SLIDES (BATCH AST)
// ═══════════════════════════════════════════════════════════

async function generateSlidesBatchAST(
  designSystem: PremiumDesignSystem,
  plans: SlidePlan[],
  batchIndex: number,
  brandName: string,
  batchContext: BatchContext,
  images: Record<string, string>,
): Promise<Slide[]> {
  const requestId = `sb-${batchIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 3: Batch ${batchIndex + 1} (${plans.length} slides)`)

  const [
    pacingMap, _imageRoleHints,
    thinkingLevel, maxOutputTokens, temperature,
  ] = await Promise.all([
    getPacingMap(), getImageRoleHints(),
    getBatchThinkingLevel(), getMaxOutputTokens(), getTemperature(),
  ])

  const resolvedThinking = thinkingLevel === 'HIGH' ? ThinkingLevel.HIGH
    : thinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM
    : ThinkingLevel.LOW

  const colors = designSystem.colors
  const typo = designSystem.typography
  const effects = designSystem.effects
  const motif = designSystem.motif
  const cd = designSystem.creativeDirection

  // Build per-slide directives from plan
  const slidesDescription = plans.map((plan, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = pacingMap[plan.slideType] || pacingMap.brief
    const archetype = LAYOUT_MAP[plan.slideType] || LAYOUT_MAP.brief
    const hasTension = TENSION_SLIDES.has(plan.slideType)
    const imageSizeHint = IMAGE_SIZE_HINTS[plan.slideType] || 'At least 40% of slide area'

    // Resolve image URL
    const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
    const imageTag = imageUrl
      ? `  <image url="${imageUrl}" sizing="${imageSizeHint}" />`
      : plan.imageDirection
      ? `  <image_direction>${plan.imageDirection}</image_direction>\n  <no_image>Create striking decorative shapes and typography to compensate.</no_image>`
      : `  <no_image>Use decorative shapes, watermarks, and dramatic typography instead.</no_image>`

    // Build content block from plan
    const contentParts: string[] = []
    contentParts.push(`  <title>${plan.title}</title>`)
    if (plan.subtitle) contentParts.push(`  <subtitle>${plan.subtitle}</subtitle>`)
    if (plan.keyNumber) contentParts.push(`  <key_number value="${plan.keyNumber}" label="${plan.keyNumberLabel || ''}" />`)
    if (plan.bodyText) contentParts.push(`  <body>${plan.bodyText}</body>`)
    if (plan.bulletPoints?.length) contentParts.push(`  <bullets>\n${plan.bulletPoints.map(b => `    <item>${b}</item>`).join('\n')}\n  </bullets>`)
    if (plan.cards?.length) contentParts.push(`  <cards>\n${plan.cards.map(c => `    <card title="${c.title}">${c.body}</card>`).join('\n')}\n  </cards>`)
    if (plan.tagline) contentParts.push(`  <tagline>${plan.tagline}</tagline>`)

    // Deterministic title zone assignment — cycles through TOP/MIDDLE/BOTTOM
    const TITLE_ZONES = [
      { zone: 'TOP', y: '80–280' },
      { zone: 'MIDDLE', y: '400–550' },
      { zone: 'BOTTOM', y: '650–850' },
    ] as const
    // Cover always TOP, closing always BOTTOM, others cycle
    const titleZone = plan.slideType === 'cover' ? TITLE_ZONES[0]
      : plan.slideType === 'closing' ? TITLE_ZONES[2]
      : TITLE_ZONES[globalIndex % 3]

    return `
<slide index="${globalIndex + 1}" total="${batchContext.totalSlides}" type="${plan.slideType}">
  <emotional_tone>${plan.emotionalTone}</emotional_tone>
  <energy>${pacing.energy}</energy>
  <density>${pacing.density}</density>
  <max_elements>${pacing.maxElements}</max_elements>
  <min_whitespace>${pacing.minWhitespace}%</min_whitespace>
  <title_zone zone="${titleZone.zone}" y_range="${titleZone.y}">MANDATORY: Place the title element in the ${titleZone.zone} zone (y=${titleZone.y}). This is NOT optional.</title_zone>
  <layout_directive>MANDATORY: ${archetype}</layout_directive>
${hasTension ? '  <tension>TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!</tension>' : ''}
${imageTag}
  <content>
${contentParts.join('\n')}
  </content>
</slide>`
  }).join('\n')

  // Determine narrative rhythm for this batch
  const batchPosition = batchContext.totalSlides > 0
    ? batchContext.slideIndex / batchContext.totalSlides
    : 0
  const rhythm = batchPosition <= 0.33
    ? { arc: 'opening', description: 'Opening arc — build curiosity, introduce the brand. More whitespace, spacious layouts. Color: darker/cooler, accent sparingly. DEPTH: heavy shadows, cinematic image filter, tight negative letterSpacing on titles.' }
    : batchPosition <= 0.66
    ? { arc: 'core', description: 'Core content — densest section. Tighter spacing, more cards, bolder colors. Accent used freely. Maintain visual variety. DEPTH: boxShadow on all cards, introduce glassmorphism, aurora gradient backgrounds, textStroke watermarks.' }
    : { arc: 'resolution', description: 'Resolution — transition from dense to spacious. Final slide = maximum whitespace. Color returns to restraint. DEPTH: boxShadow only on closing CTA, largest textStroke watermark, textShadow glow on closing title.' }

  const prompt = buildBatchPrompt(brandName, cd, colors, typo, effects, motif, designSystem, batchContext, slidesDescription, plans.length, rhythm)

  console.log(`[SlideDesigner][${requestId}] 📝 Batch prompt: ${prompt.length} chars | rhythm: ${rhythm.arc}`)
  console.log(`[SlideDesigner][${requestId}] 🎯 Slide directives:`)
  for (const plan of plans) {
    const imgUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
    console.log(`[SlideDesigner][${requestId}]   ${plan.slideType.padEnd(18)} | layout=${(LAYOUT_MAP[plan.slideType] || 'default').slice(0, 40)} | image=${imgUrl ? 'YES' : 'no'} | tone=${plan.emotionalTone}`)
  }

  // Retry with model fallback
  const batchSysInstruction = await getSystemInstruction()
  const batchModels = await getBatchModels()

  const allAttempts: Array<{ model: string; thinking: ThinkingLevel; label: string }> = [
    { model: batchModels[0], thinking: resolvedThinking, label: `${batchModels[0]} (${thinkingLevel})` },
    ...(resolvedThinking !== ThinkingLevel.LOW
      ? [{ model: batchModels[0], thinking: ThinkingLevel.LOW, label: `${batchModels[0]} (LOW fallback)` }]
      : []),
    ...(batchModels[1] !== batchModels[0]
      ? [{ model: batchModels[1], thinking: ThinkingLevel.HIGH, label: `${batchModels[1]} (HIGH fallback)` }]
      : []),
  ]

  const attempts = _proUnavailable
    ? allAttempts.filter(a => a.model !== batchModels[0])
    : allAttempts

  if (_proUnavailable) {
    console.log(`[SlideDesigner][${requestId}] Sticky fallback — skipping ${batchModels[0]}, going straight to ${batchModels[1]}`)
  }

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const { model, thinking, label } = attempts[attempt]

    if (_proUnavailable && model === batchModels[0]) continue

    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${label} (attempt ${attempt + 1}/${attempts.length})...`)

      const batchResult = await callAI({
        model, prompt,
        systemPrompt: batchSysInstruction,
        geminiConfig: {
          systemInstruction: batchSysInstruction,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: thinking },
          maxOutputTokens, temperature,
        },
        responseSchema: SLIDE_BATCH_SCHEMA as unknown as Record<string, unknown>,
        thinkingLevel: thinking === ThinkingLevel.HIGH ? 'HIGH' : thinking === ThinkingLevel.MEDIUM ? 'MEDIUM' : 'LOW',
        maxOutputTokens,
        callerId: `${requestId}-batch`,
        noGlobalFallback: true,
      })

      let parsed: { slides: Slide[] }
      try {
        parsed = JSON.parse(batchResult.text || '') as { slides: Slide[] }
      } catch {
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<{ slides: Slide[] }>(batchResult.text || '')
        if (!fallbackParsed) throw new Error('JSON parse failed')
        parsed = fallbackParsed
      }

      if (parsed?.slides?.length > 0) {
        const generatedSlides = parsed.slides.map((slide, i) => {
          const plan = plans[i]
          const resolvedType = (slide.slideType || plan?.slideType || 'closing') as SlideType
          const archetype = (slide as unknown as Record<string, unknown>).archetype as string | undefined
          const resolvedArchetype = archetype && archetype !== 'N/A' && archetype.trim().length > 2
            ? archetype
            : LAYOUT_MAP[resolvedType] || LAYOUT_MAP.brief
          const rawDramaticChoice = (slide as unknown as Record<string, unknown>).dramaticChoice as string | undefined
          return {
            id: slide.id || `slide-${batchContext.slideIndex + i}`,
            slideType: resolvedType,
            archetype: resolvedArchetype,
            dramaticChoice: rawDramaticChoice && rawDramaticChoice.trim().length > 3
              ? rawDramaticChoice
              : `${resolvedArchetype} — visual emphasis`,
            label: slide.label || plan?.title || `שקף ${batchContext.slideIndex + i + 1}`,
            background: slide.background || { type: 'solid' as const, value: colors.background },
            elements: (slide.elements || []).map((el, j) =>
              sanitizeElement(el, j, batchContext.slideIndex + i, colors)
            ),
          }
        })

        if (generatedSlides.length < plans.length) {
          console.warn(`[SlideDesigner][${requestId}] Got ${generatedSlides.length}/${plans.length} slides — filling with fallbacks`)
          for (let mi = generatedSlides.length; mi < plans.length; mi++) {
            const plan = plans[mi]
            const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
            const fallbackInput: SlideContentInput = {
              slideType: plan.slideType, title: plan.title,
              content: { subtitle: plan.subtitle, bodyText: plan.bodyText, bulletPoints: plan.bulletPoints },
              imageUrl,
            }
            const fb = buildFallbackSlide(fallbackInput, mi, batchContext, colors)
            generatedSlides.push({ ...fb, archetype: LAYOUT_MAP[fb.slideType] || LAYOUT_MAP.brief, dramaticChoice: 'fallback layout' })
          }
        }

        console.log(`[SlideDesigner][${requestId}] ✅ Generated ${generatedSlides.length} AST slides (${label})`)
        for (const slide of generatedSlides) {
          const texts = slide.elements.filter(e => e.type === 'text')
          const shapes = slide.elements.filter(e => e.type === 'shape')
          const imgs = slide.elements.filter(e => e.type === 'image')
          const titleEl = texts.find(e => (e as unknown as {role:string}).role === 'title') as unknown as {fontSize:number, y:number, content:string} | undefined
          console.log(`[SlideDesigner][${requestId}]   🎬 ${slide.slideType.padEnd(18)} | ${slide.elements.length} elements (${texts.length}T ${shapes.length}S ${imgs.length}I) | bg=${slide.background.type} | archetype="${slide.archetype?.slice(0, 35)}"`)
          if (titleEl) console.log(`[SlideDesigner][${requestId}]      title: "${titleEl.content?.slice(0, 30)}" fontSize=${titleEl.fontSize} y=${titleEl.y}`)
          console.log(`[SlideDesigner][${requestId}]      drama: "${slide.dramaticChoice?.slice(0, 60)}"`)
        }
        return generatedSlides
      }
      throw new Error('No slides in AST response')
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Batch attempt ${attempt + 1}/${attempts.length} failed (${label}): ${msg}`)

      if (model === batchModels[0] && (msg.includes('503') || msg.includes('fetch failed') || msg.includes('UNAVAILABLE') || msg.includes('overloaded'))) {
        _proUnavailable = true
      }

      if (attempt < attempts.length - 1) {
        await new Promise(r => setTimeout(r, 1500))
      } else {
        console.warn(`[SlideDesigner][${requestId}] All attempts failed. Generating fallback slides.`)
        return plans.map((plan, i) => {
          const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
          const input: SlideContentInput = { slideType: plan.slideType, title: plan.title, content: { subtitle: plan.subtitle, bodyText: plan.bodyText }, imageUrl }
          return buildFallbackSlide(input, i, batchContext, colors)
        })
      }
    }
  }

  return plans.map((plan, i) => {
    const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
    const input: SlideContentInput = { slideType: plan.slideType, title: plan.title, content: { subtitle: plan.subtitle, bodyText: plan.bodyText }, imageUrl }
    return buildFallbackSlide(input, i, batchContext, colors)
  })
}

// ═══════════════════════════════════════════════════════════
//  ELEMENT SANITIZER
// ═══════════════════════════════════════════════════════════

function sanitizeElement(
  el: SlideElement,
  elIndex: number,
  slideIndex: number,
  colors: PremiumDesignSystem['colors'],
): SlideElement {
  const base = { ...el, id: el.id || `el-${slideIndex}-${elIndex}` }

  const raw = base as unknown as Record<string, unknown>
  if (base.type === 'text') {
    if (!raw.fill || raw.fill === 'transparent') delete raw.fill
    if (!raw.src) delete raw.src
    if (!raw.shapeType) delete raw.shapeType
    if (!raw.objectFit) delete raw.objectFit
  } else if (base.type === 'shape') {
    if (!raw.content) delete raw.content
    if (!raw.color) delete raw.color
    if (!raw.role) delete raw.role
    if (!raw.src) delete raw.src
    if (!raw.objectFit) delete raw.objectFit
    if (!raw.fontSize) delete raw.fontSize
    if (!raw.fontWeight) delete raw.fontWeight
  } else if (base.type === 'image') {
    if (!raw.content) delete raw.content
    if (!raw.color) delete raw.color
    if (!raw.role) delete raw.role
    if (!raw.fill) delete raw.fill
    if (!raw.shapeType) delete raw.shapeType
    if (!raw.fontSize) delete raw.fontSize
    if (!raw.fontWeight) delete raw.fontWeight
  }

  if (base.type === 'text') {
    const txt = base as TextElement
    if (!txt.role) {
      txt.role = txt.fontSize && txt.fontSize >= 80 ? 'title'
        : txt.fontSize && txt.fontSize >= 40 ? 'subtitle'
        : txt.fontSize && txt.fontSize <= 16 ? 'caption'
        : 'body'
    }
    if (!txt.color) {
      if (txt.role === 'decorative') txt.color = `${colors.text || '#F5F5F7'}15`
      else if (txt.role === 'caption' || txt.role === 'label') txt.color = colors.muted || `${colors.text || '#F5F5F7'}80`
      else txt.color = colors.text || '#F5F5F7'
    }
    if (!txt.textAlign) txt.textAlign = 'right'
    if (!txt.fontWeight) {
      txt.fontWeight = txt.role === 'title' ? 900 : txt.role === 'subtitle' ? 700 : txt.role === 'decorative' ? 900 : txt.role === 'label' ? 300 : 400
    }
    if (!txt.fontSize) {
      txt.fontSize = txt.role === 'title' ? 64 : txt.role === 'subtitle' ? 32 : txt.role === 'caption' ? 14 : txt.role === 'label' ? 14 : 20
    }
    if (txt.opacity === undefined) txt.opacity = 1
    if (txt.role === 'decorative' && txt.opacity > 0.3 && txt.fontSize >= 150) txt.opacity = 0.08
    if (txt.letterSpacing === undefined || txt.letterSpacing === 0) {
      if (txt.role === 'label' || txt.role === 'caption') txt.letterSpacing = 4
      else if (txt.role === 'title' && txt.fontSize >= 60) txt.letterSpacing = -2
    }
    if (txt.textShadow && !isValidCssShadow(txt.textShadow)) delete txt.textShadow
    if (txt.boxShadow && !isValidCssShadow(txt.boxShadow)) delete txt.boxShadow
    // Enforce textShadow on titles for depth/readability
    if ((txt.role === 'title' || txt.role === 'subtitle') && !txt.textShadow) {
      txt.textShadow = txt.role === 'title'
        ? '0 4px 24px rgba(0,0,0,0.5)'
        : '0 2px 12px rgba(0,0,0,0.3)'
    }
    if (!txt.content) txt.content = ''
    return txt as unknown as SlideElement
  }

  if (base.type === 'shape') {
    const shape = base as ShapeElement
    if (!shape.fill) {
      shape.fill = (shape.borderRadius || shape.border) ? (colors.cardBg || '#252527') : 'transparent'
    }
    if (!shape.shapeType) shape.shapeType = 'decorative'
    if ((shape.shapeType as string) === 'card' && !shape.boxShadow) shape.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'
    if (shape.boxShadow && !isValidCssShadow(shape.boxShadow)) delete shape.boxShadow
    if (shape.backdropFilter) {
      if (!isValidCssShadow(shape.backdropFilter)) {
        delete shape.backdropFilter
      } else {
        if (shape.fill && !shape.fill.includes('rgba') && !shape.fill.includes('transparent')) shape.fill = 'rgba(255,255,255,0.08)'
        if (!shape.border) shape.border = '1px solid rgba(255,255,255,0.12)'
      }
    }
    return shape as unknown as SlideElement
  }

  if (base.type === 'image') {
    const img = base as ImageElement
    if (!img.objectFit) img.objectFit = 'cover'
    if (!img.src) img.src = ''
    if (img.filter && !isValidCssShadow(img.filter)) delete img.filter
    if (img.boxShadow && !isValidCssShadow(img.boxShadow)) delete img.boxShadow
    return img as unknown as SlideElement
  }

  return base
}

// ═══════════════════════════════════════════════════════════
//  PROMPT BUILDER
// ═══════════════════════════════════════════════════════════

function buildBatchPrompt(
  brandName: string, cd: PremiumDesignSystem['creativeDirection'],
  colors: PremiumDesignSystem['colors'], typo: PremiumDesignSystem['typography'],
  effects: PremiumDesignSystem['effects'], motif: PremiumDesignSystem['motif'],
  designSystem: PremiumDesignSystem,
  batchContext: BatchContext, slidesDescription: string, slideCount: number,
  rhythm: { arc: string; description: string },
): string {
  return `<design_system>
<canvas>1920x1080px</canvas>
<direction>RTL</direction>
<font>Heebo</font>
<colors primary="${colors.primary}" secondary="${colors.secondary}" accent="${colors.accent}" background="${colors.background}" text="${colors.text}" cardBg="${colors.cardBg}" cardBorder="${colors.cardBorder}" muted="${colors.muted}" highlight="${colors.highlight}" gradientStart="${colors.gradientStart}" gradientEnd="${colors.gradientEnd}" />
<aurora>${effects.auroraGradient}</aurora>
<typography display="${typo.displaySize}px" heading_min="${typo.headingSize}px" heading_range="${typo.headingSize}-${typo.displaySize}px — VARY title sizes, do NOT use the same size for every title" subheading="${typo.subheadingSize}px" body="${typo.bodySize}px" caption="${typo.captionSize}px" spacing_tight="${typo.letterSpacingTight}" spacing_wide="${typo.letterSpacingWide}" weight_pairs="${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}" line_tight="${typo.lineHeightTight}" line_relaxed="${typo.lineHeightRelaxed}" />
<cards padding="${designSystem.spacing.cardPadding}px" gap="${designSystem.spacing.cardGap}px" radius="${effects.borderRadiusValue}px" />
<style decorative="${effects.decorativeStyle}" shadow="${effects.shadowStyle}" border_radius="${effects.borderRadius}" />
<motif type="${motif.type}" opacity="${motif.opacity}" color="${motif.color}">${motif.implementation}</motif>
${cd ? `<creative_direction>
  <visual_metaphor>${cd.visualMetaphor}</visual_metaphor>
  <visual_tension>${cd.visualTension}</visual_tension>
  <master_rule>${cd.oneRule}</master_rule>
  <color_story>${cd.colorStory}</color_story>
  <typography_voice>${cd.typographyVoice}</typography_voice>
  <emotional_arc>${cd.emotionalArc}</emotional_arc>
</creative_direction>` : ''}
</design_system>

<slides>
${slidesDescription}
</slides>

<rhythm arc="${rhythm.arc}">
${rhythm.description}
${batchContext.previousSlidesVisualSummary ? `Previous slides context: ${batchContext.previousSlidesVisualSummary}` : 'First batch — no previous context.'}
</rhythm>

<task>
Design ${slideCount} slides for "${brandName}".
The content (text, titles, bullets, cards) is ALREADY DECIDED in each <content> block — use it EXACTLY as written. Do NOT change the Hebrew copy. Your job is VISUAL LAYOUT ONLY.

For each slide, make ONE DRAMATIC CHOICE — a single bold visual decision that defines the slide.
Then build everything else to serve that choice. YOU MUST state it in the "dramaticChoice" field — this field is REQUIRED.

Use the layout_directive as inspiration for your archetype, but push it further. The dramatic choice matters more than following the archetype rigidly.

CRITICAL VARIETY RULES — these override defaults:
1. TITLE POSITION: You MUST vary title Y position across slides. Use ALL three zones:
   - TOP zone: y=80–280 (for some slides)
   - MIDDLE zone: y=400–550 (for some slides)
   - BOTTOM zone: y=650–850 (for some slides)
   NEVER place all titles at the same Y coordinate. In this batch of ${slideCount} slides, use at least 2 different zones.

2. TITLE SIZE: The design system headingSize is a MINIMUM, not a target. Push bigger:
   - At least 1 slide in this batch should have title fontSize ≥ 96px
   - At least 1 slide should have title fontSize ≥ 80px
   - Vary title sizes: 56px, 72px, 96px, 120px — not all the same

3. BACKGROUNDS: At least half the slides in this batch must use gradient backgrounds. Vary gradient directions (135deg, 180deg, 45deg, radial). Do NOT use the same solid color for every slide.

4. Never repeat the same dramatic approach on consecutive slides.
5. RTL: All readable text textAlign = "right".
6. IMAGES: Use exact URL from <image> tag. No image = bold typography and shapes.
7. Content text stays inside canvas. Decorative elements SHOULD bleed outside (-50px to -200px).
8. TEXT SHADOW: EVERY title element MUST have textShadow for depth (e.g. "0 4px 24px rgba(0,0,0,0.5)"). Subtitles too.
9. TITLE ZONE: Each slide has a <title_zone> directive — you MUST place the title at the Y range specified. This creates visual rhythm.
</task>

Return JSON: { "slides": [{ "id": "slide-N", "slideType": "TYPE", "archetype": "APPROACH_NAME", "dramaticChoice": "REQUIRED — describe the ONE bold visual decision", "label": "שם בעברית", "background": { "type": "solid"|"gradient", "value": "..." }, "elements": [...] }] }`
}

// ═══════════════════════════════════════════════════════════
//  MAIN: generateAIPresentation (non-staged)
// ═══════════════════════════════════════════════════════════

export async function generateAIPresentation(
  data: PremiumProposalData,
  config: {
    accentColor?: string; brandLogoUrl?: string; leadersLogoUrl?: string; clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {}
): Promise<Presentation> {
  const requestId = `pres-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n${'═'.repeat(50)}\n[SlideDesigner][${requestId}] Starting for "${data.brandName}"\n${'═'.repeat(50)}\n`)

  _proUnavailable = false

  const brandColors = data._brandColors || { primary: config.accentColor || '#E94560', secondary: '#1A1A2E', accent: config.accentColor || '#E94560', style: 'corporate', mood: 'מקצועי' }
  const brandInput: BrandDesignInput = {
    brandName: data.brandName || 'Unknown',
    industry: typeof data._brandResearch?.industry === 'string' ? data._brandResearch.industry : '',
    brandPersonality: Array.isArray(data._brandResearch?.brandPersonality) ? data._brandResearch.brandPersonality as string[] : [],
    brandColors,
    logoUrl: config.clientLogoUrl || (typeof data._scraped?.logoUrl === 'string' ? data._scraped.logoUrl : undefined) || config.brandLogoUrl || undefined,
    coverImageUrl: config.images?.coverImage || undefined,
    targetAudience: data.targetDescription || '',
  }

  const images: Record<string, string> = { ...(config.images || {}), ...(data._generatedImages || {}) }
  if (config.extraImages) {
    for (const extra of config.extraImages) images[extra.id] = extra.url
  }

  const designSystem = await generateDesignSystem(brandInput)
  const plan = await generateSlidePlan(data, designSystem, images)

  const batchSize = Math.ceil(plan.length / 3)
  const batches: SlidePlan[][] = []
  for (let i = 0; i < plan.length; i += batchSize) batches.push(plan.slice(i, i + batchSize))

  console.log(`[SlideDesigner][${requestId}] ${batches.length} batches: ${batches.map(b => b.length).join(', ')} slides`)

  let slideOffset = 0
  const batchPromises = batches.map((batch, bi) => {
    const ctx: BatchContext = { previousSlidesVisualSummary: '', slideIndex: slideOffset, totalSlides: plan.length }
    slideOffset += batch.length
    return generateSlidesBatchAST(designSystem, batch, bi, data.brandName || '', ctx, images)
  })

  const batchResults = await Promise.allSettled(batchPromises)
  const pacingMap = await getPacingMap()
  const allGeneratedSlides: Slide[] = []

  for (let bi = 0; bi < batchResults.length; bi++) {
    const result = batchResults[bi]
    if (result.status === 'fulfilled') {
      for (const slide of result.value) {
        const pacing = pacingMap[slide.slideType] || pacingMap.brief
        const planItem = plan[allGeneratedSlides.length]
        const imageUrl = planItem?.existingImageKey ? images[planItem.existingImageKey] : undefined
        const validResult = validateSlide(slide, designSystem, pacing, imageUrl)
        const fixable = validResult.issues.filter(i => i.autoFixable)
        allGeneratedSlides.push(fixable.length > 0 ? autoFixSlide(slide, fixable, designSystem, imageUrl) : slide)
      }
    } else {
      console.error(`[SlideDesigner][${requestId}] Batch ${bi + 1} failed:`, result.reason)
      for (const slidePlan of batches[bi]) {
        const imageUrl = slidePlan.existingImageKey ? images[slidePlan.existingImageKey] : undefined
        const input: SlideContentInput = { slideType: slidePlan.slideType, title: slidePlan.title, content: { subtitle: slidePlan.subtitle, bodyText: slidePlan.bodyText }, imageUrl }
        allGeneratedSlides.push(createFallbackSlide(input, designSystem, allGeneratedSlides.length))
      }
    }
  }

  if (allGeneratedSlides.length === 0) throw new Error('All slides failed')

  let totalScore = 0
  for (const slide of allGeneratedSlides) totalScore += validateSlide(slide, designSystem, pacingMap[slide.slideType] || pacingMap.brief).score
  const avgScore = Math.round(totalScore / allGeneratedSlides.length)
  const clientLogoUrl = config.clientLogoUrl || (typeof data._scraped?.logoUrl === 'string' ? data._scraped.logoUrl : '') || config.brandLogoUrl || ''
  const finalSlides = injectClientLogo(injectLeadersLogo(checkVisualConsistency(allGeneratedSlides, designSystem)), clientLogoUrl)

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n${'═'.repeat(50)}\n[SlideDesigner][${requestId}] Done in ${duration}s — ${finalSlides.length} slides, quality: ${avgScore}/100\n${'═'.repeat(50)}\n`)

  return {
    id: `pres-${Date.now()}`, title: data.brandName || 'הצעת מחיר', designSystem,
    slides: finalSlides,
    metadata: { brandName: data.brandName, createdAt: new Date().toISOString(), version: 2, pipeline: 'slide-designer-v5-planner', qualityScore: avgScore, duration: parseFloat(duration) },
  }
}

// ═══════════════════════════════════════════════════════════
//  STAGED PIPELINE (for Vercel timeout)
// ═══════════════════════════════════════════════════════════

export async function pipelineFoundation(
  data: Record<string, unknown>,
  config: {
    accentColor?: string; brandLogoUrl?: string; leadersLogoUrl?: string; clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {}
): Promise<import('./slide-design').PipelineFoundation> {
  const requestId = `found-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Staged pipeline: Foundation`)

  _proUnavailable = false

  const d = data as PremiumProposalData
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const leadersLogo = config.leadersLogoUrl || `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const clientLogo = config.clientLogoUrl || (typeof d._scraped?.logoUrl === 'string' ? d._scraped.logoUrl : '') || config.brandLogoUrl || ''

  const brandColors = d._brandColors || { primary: config.accentColor || '#E94560', secondary: '#1A1A2E', accent: config.accentColor || '#E94560', style: 'corporate', mood: 'מקצועי' }
  const brandInput: BrandDesignInput = {
    brandName: d.brandName || 'Unknown',
    industry: typeof d._brandResearch?.industry === 'string' ? d._brandResearch.industry : '',
    brandPersonality: Array.isArray(d._brandResearch?.brandPersonality) ? d._brandResearch.brandPersonality as string[] : [],
    brandColors, logoUrl: clientLogo || undefined, coverImageUrl: config.images?.coverImage || undefined,
    targetAudience: d.targetDescription || '',
  }

  const images: Record<string, string> = { ...(config.images || {}), ...(d._generatedImages as Record<string, string> || {}) }
  if (config.extraImages) {
    for (const extra of config.extraImages) images[extra.id] = extra.url
  }

  // Step 1: Design System
  const designSystem = await generateDesignSystem(brandInput)

  // Step 2: Planner
  console.log(`[SlideDesigner][${requestId}] Running Planner...`)
  const plan = await generateSlidePlan(d, designSystem, images)

  // Split plan into 3 batches (indices)
  const batchSize = Math.ceil(plan.length / 3)
  const batches: number[][] = []
  for (let i = 0; i < plan.length; i += batchSize) {
    const batch: number[] = []
    for (let j = i; j < Math.min(i + batchSize, plan.length); j++) batch.push(j)
    batches.push(batch)
  }

  const batchSizes = batches.map(b => b.length)
  const foundation: import('./slide-design').PipelineFoundation = {
    designSystem, plan, batches, proposalData: d,
    brandName: d.brandName || '', clientLogo, leadersLogo,
    totalSlides: plan.length, images, batchCount: batches.length, batchSizes,
  }

  console.log(`[SlideDesigner][${requestId}] Foundation complete: ${plan.length} slides planned in ${batches.length} batches (${batchSizes.join(', ')})`)
  return foundation
}

export async function pipelineBatch(
  foundation: import('./slide-design').PipelineFoundation,
  batchIndex: number,
  _previousContext: import('./slide-design').BatchResult | null,
): Promise<import('./slide-design').BatchResult> {
  const requestId = `batch-${batchIndex}-${Date.now()}`
  const batchIndices = foundation.batches[batchIndex]
  if (!batchIndices || batchIndices.length === 0) throw new Error(`Invalid batch index: ${batchIndex}`)

  const batchPlans = batchIndices.map(i => foundation.plan[i])
  let slideOffset = 0
  for (let i = 0; i < batchIndex; i++) slideOffset += foundation.batches[i].length

  console.log(`[SlideDesigner][${requestId}] 🚀 Batch ${batchIndex + 1}/${foundation.batches.length} (${batchPlans.length} slides, offset ${slideOffset}) — Art Director Engine v3`)
  console.log(`[SlideDesigner][${requestId}]   Types: ${batchPlans.map(p => p.slideType).join(', ')}`)

  const ds = foundation.designSystem as PremiumDesignSystem

  try {
    // ═══ Art Director Engine v4 — Semantic Design ═══
    // GPT-5.4 assembles semantic elements (title, cards, watermark, etc.)
    // TypeScript translates semantic intent → pixel-positioned SlideElements
    const { buildSemanticPrompt, parseSemanticResponse, buildFallbackSemanticPresentation } = await import('@/lib/slide-engine/semantic-prompt')
    const { translateSlide } = await import('@/lib/slide-engine/semantic-translator')

    let semanticResult: import('@/lib/slide-engine/semantic-types').SemanticPresentation
    try {
      const prompt = buildSemanticPrompt(batchPlans, ds, foundation.brandName)
      console.log(`[SlideDesigner][${requestId}] 📝 Semantic Design prompt: ${prompt.length} chars`)

      // Call GPT-5.4 with semantic prompt
      console.log(`[SlideDesigner][${requestId}] 🤖 Calling GPT-5.4 for semantic design (medium reasoning)...`)
      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const completion = await openai.chat.completions.create({
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: 'You are a world-class art director. Design each slide by assembling semantic elements. Return ONLY valid JSON. No markdown fences.' },
          { role: 'user', content: prompt },
        ],
        max_completion_tokens: 16384,
        reasoning_effort: 'medium',
        response_format: { type: 'json_object' },
      })
      const rawText = completion.choices[0]?.message?.content || '{}'
      console.log(`[SlideDesigner][${requestId}] ✅ GPT-5.4 responded: ${rawText.length} chars`)

      semanticResult = parseSemanticResponse(rawText, batchPlans)
      console.log(`[SlideDesigner][${requestId}] ✅ Semantic design parsed: ${semanticResult.slides.length} slides`)
      for (const s of semanticResult.slides) {
        console.log(`[SlideDesigner][${requestId}]   🎯 ${s.slideType.padEnd(18)} | ${s.elements.length} elements | bg=${s.background.style} | "${s.dramaticChoice.slice(0, 60)}"`)
      }
    } catch (aiError) {
      const msg = aiError instanceof Error ? aiError.message : String(aiError)
      console.warn(`[SlideDesigner][${requestId}] ⚠️ Semantic AI failed (${msg.slice(0, 100)}), using fallback`)
      semanticResult = buildFallbackSemanticPresentation(batchPlans)
    }

    // ── Step 2: Translate semantic → pixel elements ──
    console.log(`[SlideDesigner][${requestId}] 🏗️ Translating semantic design to pixels...`)
    const generatedSlides: Slide[] = []
    for (let i = 0; i < batchPlans.length; i++) {
      const semantic = semanticResult.slides[i] || semanticResult.slides[0]
      const slide = translateSlide(semantic, batchPlans[i], ds, foundation.images, slideOffset + i)
      generatedSlides.push(slide)
    }

    // Logo injection
    try {
      const { injectLeadersLogo, injectClientLogo } = await import('@/lib/gemini/slide-design/logo-injection')
      let result = injectLeadersLogo(generatedSlides)
      if (foundation.clientLogo) result = injectClientLogo(result, foundation.clientLogo)
      const finalSlides = result
      for (let i = 0; i < finalSlides.length; i++) finalSlides[i].id = `slide-${slideOffset + i}`

      console.log(`[SlideDesigner][${requestId}] ✅ Semantic Engine generated ${finalSlides.length} slides:`)
      for (const slide of finalSlides) {
        const texts = slide.elements.filter((e: SlideElement) => e.type === 'text')
        const shapes = slide.elements.filter((e: SlideElement) => e.type === 'shape')
        const imgs = slide.elements.filter((e: SlideElement) => e.type === 'image')
        const titleEl = texts.find((e: SlideElement) => (e as unknown as {role:string}).role === 'title') as unknown as {fontSize:number, y:number, content:string} | undefined
        console.log(`[SlideDesigner][${requestId}]   🎬 ${slide.slideType.padEnd(18)} | ${slide.elements.length} elements (${texts.length}T ${shapes.length}S ${imgs.length}I) | bg=${slide.background.type}`)
        if (titleEl) console.log(`[SlideDesigner][${requestId}]      title: "${titleEl.content?.slice(0, 35)}" ${titleEl.fontSize}px y=${titleEl.y}`)
      }
      return { slides: finalSlides, visualSummary: '', slideIndex: slideOffset + finalSlides.length }
    } catch {
      // Logo injection failed — return without logos
      for (let i = 0; i < generatedSlides.length; i++) generatedSlides[i].id = `slide-${slideOffset + i}`
      return { slides: generatedSlides, visualSummary: '', slideIndex: slideOffset + generatedSlides.length }
    }
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] ❌ Semantic engine failed entirely:`, error)

    // Fallback: semantic defaults (no AI) + translate
    try {
      const { buildFallbackSemanticPresentation } = await import('@/lib/slide-engine/semantic-prompt')
      const { translateSlide } = await import('@/lib/slide-engine/semantic-translator')
      console.log(`[SlideDesigner][${requestId}] 🔄 Fallback: semantic defaults...`)
      const fallbackSemantic = buildFallbackSemanticPresentation(batchPlans)
      const fallbackSlides = batchPlans.map((plan, i) =>
        translateSlide(fallbackSemantic.slides[i], plan, ds, foundation.images, slideOffset + i)
      )
      return { slides: fallbackSlides, visualSummary: '', slideIndex: slideOffset + fallbackSlides.length }
    } catch {
      // Last resort: legacy fallback
      const fallbackSlides = batchPlans.map((plan, i) => {
        const imageUrl = plan.existingImageKey ? foundation.images[plan.existingImageKey] : undefined
        const input: SlideContentInput = { slideType: plan.slideType, title: plan.title, content: { subtitle: plan.subtitle, bodyText: plan.bodyText }, imageUrl }
        return createFallbackSlide(input, ds, slideOffset + i)
      })
      return { slides: fallbackSlides, visualSummary: '', slideIndex: slideOffset + fallbackSlides.length }
    }
  }
}

export async function pipelineFinalize(
  foundation: import('./slide-design').PipelineFoundation,
  allSlides: Slide[],
): Promise<Presentation> {
  const requestId = `final-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Finalizing: ${allSlides.length} slides`)
  if (allSlides.length === 0) throw new Error('No slides to finalize')

  const pacingMap = await getPacingMap()
  const ds = foundation.designSystem as PremiumDesignSystem

  const validatedSlides: Slide[] = []
  let totalScore = 0
  for (let si = 0; si < allSlides.length; si++) {
    const slide = allSlides[si]
    const plan = foundation.plan[si]
    const imageUrl = plan?.existingImageKey ? foundation.images[plan.existingImageKey] : undefined
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const result = validateSlide(slide, ds, pacing, imageUrl)
    totalScore += result.score
    validatedSlides.push(result.issues.some(i => i.autoFixable) ? autoFixSlide(slide, result.issues, ds, imageUrl) : slide)
  }

  const avgScore = Math.round(totalScore / allSlides.length)
  const finalSlides = injectClientLogo(injectLeadersLogo(checkVisualConsistency(validatedSlides, ds)), foundation.clientLogo)

  console.log(`[SlideDesigner][${requestId}] Finalized: ${finalSlides.length} slides, quality: ${avgScore}/100`)
  return {
    id: `pres-${Date.now()}`, title: foundation.brandName || 'הצעת מחיר', designSystem: ds,
    slides: finalSlides,
    metadata: { brandName: foundation.brandName, createdAt: new Date().toISOString(), version: 2, pipeline: 'slide-designer-v5-planner-staged', qualityScore: avgScore },
  }
}

// ═══════════════════════════════════════════════════════════
//  SINGLE SLIDE REGENERATION
// ═══════════════════════════════════════════════════════════

export async function regenerateSingleSlide(
  designSystem: PremiumDesignSystem,
  slideContent: SlideContentInput,
  brandName: string,
  _creativeDirection?: unknown,
  _layoutStrategy?: unknown,
  instruction?: string,
): Promise<Slide> {
  const plan: SlidePlan = {
    slideType: slideContent.slideType,
    title: slideContent.title,
    bodyText: instruction
      ? `${String(slideContent.content?.subtitle || slideContent.content?.description || '')}\n\nהנחיה נוספת: ${instruction}`
      : String(slideContent.content?.subtitle || slideContent.content?.description || ''),
    emotionalTone: 'confident',
    existingImageKey: slideContent.imageUrl ? 'image' : undefined,
  }
  const images: Record<string, string> = slideContent.imageUrl ? { image: slideContent.imageUrl } : {}

  const slides = await generateSlidesBatchAST(
    designSystem, [plan], 0, brandName,
    { previousSlidesVisualSummary: '', slideIndex: 0, totalSlides: 1 },
    images,
  )
  if (slides.length === 0) throw new Error('Failed to regenerate slide')

  const pacingMap = await getPacingMap()
  const pacing = pacingMap[slideContent.slideType] || pacingMap.brief
  const validation = validateSlide(slides[0], designSystem, pacing, slideContent.imageUrl)
  if (validation.issues.some(i => i.autoFixable)) {
    return autoFixSlide(slides[0], validation.issues, designSystem, slideContent.imageUrl)
  }
  return slides[0]
}

// ═══════════════════════════════════════════════════════════
//  LEGACY WRAPPER: HTML output
// ═══════════════════════════════════════════════════════════

import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'

export async function generateAISlides(
  documentData: PremiumProposalData,
  config: {
    accentColor?: string; brandLogoUrl?: string; leadersLogoUrl?: string; clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {},
): Promise<string[]> {
  const presentation = await generateAIPresentation(documentData, config)
  return presentationToHtmlSlides(presentation)
}
