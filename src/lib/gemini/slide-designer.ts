/**
 * Gemini AI Slide Designer — Production-Grade Pipeline
 *
 * Core orchestration module. All utilities, schemas, and helpers
 * are in ./slide-design/ sub-modules.
 *
 * Exports:
 * - generateAIPresentation() — full presentation generation
 * - pipelineFoundation/Batch/Finalize — staged pipeline for Vercel
 * - regenerateSingleSlide() — single slide regen
 * - generateAISlides() — legacy HTML wrapper
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type {
  Presentation,
  Slide,
  SlideType,
  ImageElement,
  TextElement,
  CuratedSlideContent,
} from '@/types/presentation'
import { isTextElement } from '@/types/presentation'
import { curateSlideContent } from './content-curator'

// ── Sub-module imports ──────────────────────────────────
import type {
  BrandDesignInput,
  SlideContentInput,
  PremiumDesignSystem,
  BatchContext,
  SingleSlideContext,
  PacingDirective,
  PremiumProposalData,
} from './slide-design'

import {
  // Config loaders
  getDesignSystemModels, getBatchModels,
  getSystemInstruction, getDesignPrinciples, getElementFormat,
  getTechnicalRules, getFinalInstruction, getImageRoleHints,
  getLayoutArchetypes, getPacingMap, getDepthLayers,
  getThinkingLevel, getBatchThinkingLevel,
  getMaxOutputTokens, getTemperature,
  // Schemas
  DESIGN_SYSTEM_SCHEMA, SLIDE_BATCH_SCHEMA,
  // Color utils
  validateAndFixColors,
  // Validation
  validateSlide, autoFixSlide, checkVisualConsistency,
  // Fallbacks
  buildFallbackDesignSystem, buildSimpleFallbackSlide, buildFallbackSlide, createFallbackSlide,
  // Content builder
  buildSlideBatches,
  // Logo injection
  injectLeadersLogo, injectClientLogo,
} from './slide-design'

// Re-export pipeline types for external consumers
export type { PipelineFoundation, BatchResult } from './slide-design'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})

// ─── Quality Constants (restored from v3 that produced good results) ──

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

const TEMPERATURE_MAP: Record<string, 'cold' | 'neutral' | 'warm'> = {
  cover: 'cold', brief: 'cold', goals: 'neutral', audience: 'neutral',
  insight: 'warm', strategy: 'neutral', bigIdea: 'warm', approach: 'neutral',
  deliverables: 'neutral', metrics: 'neutral', influencerStrategy: 'cold',
  influencers: 'neutral', closing: 'warm',
}

const TENSION_SLIDES = new Set(['cover', 'insight', 'bigIdea', 'closing'])

// ─── Helpers ────────────────────────────────────────────

/** Extract detailed error info including nested cause chain */
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

// ═══════════════════════════════════════════════════════════
//  STEP 1: GENERATE DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════

async function generateDesignSystem(
  brand: BrandDesignInput,
): Promise<PremiumDesignSystem> {
  const requestId = `ds-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 1: Design System for "${brand.brandName}"`)

  const prompt = `המשימה: לייצר כיוון קריאטיבי + Design System מלא למצגת ברמת Awwwards עבור "${brand.brandName}".

## מידע על המותג:
- תעשייה: ${brand.industry || 'לא ידוע'}
- אישיות: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
- צבע ראשי: ${brand.brandColors.primary}
- צבע משני: ${brand.brandColors.secondary}
- צבע הדגשה: ${brand.brandColors.accent}
- סגנון: ${brand.brandColors.style || 'corporate'}
- קהל יעד: ${brand.targetAudience || 'מבוגרים 25-45'}

═══════════════════════════════
🧠 PART 1: CREATIVE DIRECTION
═══════════════════════════════
חשוב כמו Creative Director. כל מותג חייב להרגיש אחרת. אל תחזור על "מודרני ונקי" — זה ריק מתוכן.

### creativeDirection:
1. **visualMetaphor** — מטאפורה ויזואלית קונקרטית. לא "מקצועי" אלא "ארכיטקטורה ברוטליסטית של בטון חשוף" או "גלריית אמנות מינימליסטית יפנית" או "מגזין אופנה של שנות ה-90".
2. **visualTension** — ההפתעה. למשל: "טקסט ענק שבור + מינימליזם יפני" או "נתונים קרים בתוך אסתטיקה חמה אורגנית".
3. **oneRule** — חוק אחד שכל שקף חייב לקיים. למשל: "תמיד יש אלמנט אחד שחורג מהמסגרת" או "הצבע הראשי מופיע רק כנקודת מיקוד אחת קטנה".
4. **colorStory** — נרטיב: "מתחילה בחושך וקור, מתחממת באמצע עם פרץ של accent, וחוזרת לאיפוק בסוף".
5. **typographyVoice** — איך הטיפוגרפיה "מדברת"? למשל: "צורחת — כותרות ענקיות 900 weight לצד גוף רזה 300".
6. **emotionalArc** — המסע הרגשי: סקרנות → הבנה → התלהבות → ביטחון → רצון לפעול.

═══════════════════════════════
🎨 PART 2: DESIGN SYSTEM
═══════════════════════════════

### צבעים (colors):
- primary, secondary, accent — מבוססים על צבעי המותג
- background — כהה מאוד (לא שחור טהור — עם hint של צבע)
- text — בהיר מספיק ל-WCAG AA (4.5:1 contrast מול background)
- cardBg — נבדל מהרקע (יותר בהיר/כהה ב-10-15%)
- cardBorder — עדין (opacity נמוך של primary או white)
- gradientStart, gradientEnd — לגרדיאנטים דקורטיביים
- muted — צבע טקסט מושתק (3:1 contrast minimum)
- highlight — accent שני (complementary או analogous)
- auroraA, auroraB, auroraC — 3 צבעים ל-mesh gradient

### טיפוגרפיה (typography):
- displaySize: 80-140 (שער) — חשוב! לא displaySize של 48, זה לכותרות ענקיות
- headingSize: 48-64
- subheadingSize: 28-36
- bodySize: 20-24
- captionSize: 14-16
- letterSpacingTight: -5 עד -1 (כותרות גדולות — tight!)
- letterSpacingWide: 2 עד 8 (subtitles/labels — spaced out!)
- lineHeightTight: 0.9-1.05 (כותרות)
- lineHeightRelaxed: 1.4-1.6 (גוף)
- weightPairs: [[heading, body]] — למשל [[900,300]] או [[700,400]] — חובה ניגוד חד!

### מרווחים (spacing):
- unit: 8, cardPadding: 32-48, cardGap: 24-40, safeMargin: 80

### אפקטים (effects):
- borderRadius: "sharp" / "soft" / "pill" + borderRadiusValue
- decorativeStyle: "geometric" / "organic" / "minimal" / "brutalist"
- shadowStyle: "none" / "fake-3d" / "glow"
- auroraGradient: מחרוזת CSS מוכנה של radial-gradient mesh מ-3 צבעים

### מוטיב חוזר (motif):
- type: (diagonal-lines / dots / circles / angular-cuts / wave / grid-lines / organic-blobs / triangles)
- opacity: 0.05-0.2, color: צבע, implementation: תיאור CSS

פונט: Heebo.`

  const DS_TIMEOUT_MS = 150_000
  const sysInstruction = await getSystemInstruction()
  const models = await getDesignSystemModels()
  const [dsThinkingLevel, dsMaxOutputTokens] = await Promise.all([getThinkingLevel(), getMaxOutputTokens()])
  const dsThinking = dsThinkingLevel === 'HIGH' ? ThinkingLevel.HIGH
    : dsThinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM
    : ThinkingLevel.LOW

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for design system (attempt ${attempt + 1}/${models.length}, timeout ${DS_TIMEOUT_MS / 1000}s)...`)
      const dsCall = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: sysInstruction,
          responseMimeType: 'application/json',
          responseSchema: DESIGN_SYSTEM_SCHEMA,
          thinkingConfig: { thinkingLevel: dsThinking },
          maxOutputTokens: dsMaxOutputTokens,
          httpOptions: { timeout: DS_TIMEOUT_MS },
        },
      })
      const dsTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DS_TIMEOUT')), DS_TIMEOUT_MS)
      )
      const response = await Promise.race([dsCall, dsTimeout])

      const rawText = response.text || ''
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
        console.log(`[SlideDesigner][${requestId}] Design system ready. Style: ${parsed.effects?.decorativeStyle} (model: ${model})`)
        return parsed
      }
      throw new Error(`Invalid design system — parsed colors missing`)
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Design system attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[SlideDesigner][${requestId}] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  console.error(`[SlideDesigner][${requestId}] All design system attempts failed, using fallback`)
  return buildFallbackDesignSystem(brand)
}

// ═══════════════════════════════════════════════════════════
//  STEP 2: GENERATE SLIDES (BATCH AST)
// ═══════════════════════════════════════════════════════════

async function generateSlidesBatchAST(
  designSystem: PremiumDesignSystem,
  slides: SlideContentInput[],
  batchIndex: number,
  brandName: string,
  batchContext: BatchContext,
  curatedSlides?: CuratedSlideContent[],
): Promise<Slide[]> {
  const requestId = `sb-${batchIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 2: Batch ${batchIndex + 1} (${slides.length} slides)`)

  const [
    pacingMap, layoutArchetypes, imageRoleHints,
    designPrinciples, depthLayers, elementFormat, technicalRules, finalInstruction,
    thinkingLevel, maxOutputTokens, temperature,
  ] = await Promise.all([
    getPacingMap(), getLayoutArchetypes(), getImageRoleHints(),
    getDesignPrinciples(), getDepthLayers(), getElementFormat(), getTechnicalRules(), getFinalInstruction(),
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

  // Semantic archetype selection
  const usedArchetypes = new Set<number>()
  function selectArchetype(slideType: string, globalIdx: number): string {
    const typeAffinities: Record<string, number[]> = {
      cover: [0, 3, 6], insight: [0, 3, 7], bigIdea: [0, 3, 6],
      brief: [1, 6, 3], audience: [1, 3, 6],
      strategy: [2, 5, 4], approach: [2, 5, 1],
      goals: [5, 7, 2], deliverables: [5, 2, 4],
      metrics: [7, 5, 4], competitive: [5, 4, 2],
      closing: [0, 3, 6], whyNow: [7, 0, 3],
    }
    const preferred = typeAffinities[slideType] || [globalIdx % layoutArchetypes.length]
    for (const idx of preferred) {
      if (!usedArchetypes.has(idx) && idx < layoutArchetypes.length) {
        usedArchetypes.add(idx)
        return layoutArchetypes[idx]
      }
    }
    for (let idx = 0; idx < layoutArchetypes.length; idx++) {
      if (!usedArchetypes.has(idx)) { usedArchetypes.add(idx); return layoutArchetypes[idx] }
    }
    usedArchetypes.clear()
    const fallbackIdx = preferred[0] ?? (globalIdx % layoutArchetypes.length)
    usedArchetypes.add(fallbackIdx)
    return layoutArchetypes[fallbackIdx]
  }

  // Build per-slide directives
  const slidesDescription = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const imageRoleHint = imageRoleHints[slide.slideType] || 'An image that reinforces the slide message.'
    const archetype = selectArchetype(slide.slideType, globalIndex)
    const curated = curatedSlides?.[i]
    const colorTemp = TEMPERATURE_MAP[slide.slideType] || 'neutral'
    const hasTension = TENSION_SLIDES.has(slide.slideType)
    const imageSizeHint = IMAGE_SIZE_HINTS[slide.slideType] || 'At least 40% of slide area'

    let contentBlock: string
    if (curated) {
      const parts: string[] = []
      if (curated.title) parts.push(`  <headline>${curated.title}</headline>`)
      if (curated.subtitle) parts.push(`  <subtitle>${curated.subtitle}</subtitle>`)
      if (curated.keyNumber) parts.push(`  <key_number value="${curated.keyNumber}" label="${curated.keyNumberLabel || ''}" />`)
      if (curated.bodyText) parts.push(`  <body>${curated.bodyText}</body>`)
      if (curated.bulletPoints?.length) parts.push(`  <bullets>\n${curated.bulletPoints.map(b => `    <item>${b}</item>`).join('\n')}\n  </bullets>`)
      if (curated.cards?.length) parts.push(`  <cards>\n${curated.cards.map(c => `    <card title="${c.title}">${c.body}</card>`).join('\n')}\n  </cards>`)
      if (curated.tagline) parts.push(`  <tagline>${curated.tagline}</tagline>`)
      contentBlock = parts.join('\n')
    } else {
      contentBlock = `  <raw_json>\n${JSON.stringify(slide.content, null, 2)}\n  </raw_json>`
    }

    const emotionNote = curated?.emotionalNote ? `  <emotion>${curated.emotionalNote}</emotion>` : ''
    const cdPerSlide = cd?.oneRule ? `  <master_rule>${cd.oneRule}</master_rule>` : ''
    const imageRole = curated?.imageRole || ''
    const imageTag = slide.imageUrl
      ? `  <image url="${slide.imageUrl}" role="${imageRoleHint}" visual_role="${imageRole}" sizing="${imageSizeHint}" />`
      : `  <no_image>Use decorative shapes, watermarks, and dramatic typography instead.</no_image>`

    return `
<slide index="${globalIndex + 1}" total="${batchContext.totalSlides}" type="${slide.slideType}">
  <color_temperature>${colorTemp}</color_temperature>
  <energy>${pacing.energy}</energy>
  <density>${pacing.density}</density>
  <max_elements>${pacing.maxElements}</max_elements>
  <min_whitespace>${pacing.minWhitespace}%</min_whitespace>
  <layout_inspiration>${archetype}</layout_inspiration>
${hasTension ? '  <tension>TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!</tension>' : ''}
${imageTag}
${emotionNote}
${cdPerSlide}
  <content>
${contentBlock}
  </content>
</slide>`
  }).join('\n')

  const prompt = buildBatchPrompt(brandName, cd, colors, typo, effects, motif, designSystem, designPrinciples, depthLayers, elementFormat, technicalRules, finalInstruction, batchContext, slidesDescription, slides.length)

  // 3-tier retry
  const TIER_TIMEOUTS = [180_000, 120_000, 90_000]
  const TOTAL_BUDGET_MS = 480_000
  const functionStartTime = Date.now()
  const batchSysInstruction = await getSystemInstruction()
  const batchModels = await getBatchModels()

  const attempts: Array<{ model: string; thinking: ThinkingLevel; label: string }> = [
    { model: batchModels[0], thinking: resolvedThinking, label: `${batchModels[0]} (${thinkingLevel})` },
    ...(resolvedThinking !== ThinkingLevel.LOW
      ? [{ model: batchModels[0], thinking: ThinkingLevel.LOW, label: `${batchModels[0]} (LOW fallback)` }]
      : []),
    ...(batchModels[1] !== batchModels[0]
      ? [{ model: batchModels[1], thinking: ThinkingLevel.LOW, label: `${batchModels[1]} (LOW fallback)` }]
      : []),
  ]

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const elapsedTotal = Date.now() - functionStartTime
    if (elapsedTotal > TOTAL_BUDGET_MS) {
      console.warn(`[SlideDesigner][${requestId}] ⚠️ Total budget exceeded. Generating fallback slides.`)
      return slides.map((slide, i) => buildFallbackSlide(slide, i, batchContext, colors))
    }

    const { model, thinking, label } = attempts[attempt]
    const callTimeout = Math.min(TIER_TIMEOUTS[attempt] || 90_000, TOTAL_BUDGET_MS - elapsedTotal)
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${label} (attempt ${attempt + 1}/${attempts.length}, timeout ${Math.round(callTimeout / 1000)}s)...`)

      const geminiCall = ai.models.generateContent({
        model, contents: prompt,
        config: {
          systemInstruction: batchSysInstruction,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: thinking },
          maxOutputTokens, temperature,
          httpOptions: { timeout: callTimeout },
        },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('BATCH_TIMEOUT')), callTimeout)
      )
      const response = await Promise.race([geminiCall, timeoutPromise])

      let parsed: { slides: Slide[] }
      try {
        parsed = JSON.parse(response.text || '') as { slides: Slide[] }
      } catch {
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<{ slides: Slide[] }>(response.text || '')
        if (!fallbackParsed) throw new Error('JSON parse failed')
        parsed = fallbackParsed
      }

      if (parsed?.slides?.length > 0) {
        console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} AST slides (${label})`)
        return parsed.slides.map((slide, i) => ({
          id: slide.id || `slide-${batchContext.slideIndex + i}`,
          slideType: (slide.slideType || slides[i]?.slideType || 'closing') as SlideType,
          label: slide.label || slides[i]?.title || `שקף ${batchContext.slideIndex + i + 1}`,
          background: slide.background || { type: 'solid' as const, value: colors.background },
          elements: (slide.elements || []).map((el, j) => ({ ...el, id: el.id || `el-${batchContext.slideIndex + i}-${j}` })),
        }))
      }
      throw new Error('No slides in AST response')
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Batch attempt ${attempt + 1}/${attempts.length} failed (${label}): ${msg}`)
      if (attempt < attempts.length - 1) {
        await new Promise(r => setTimeout(r, 1500))
      } else {
        console.warn(`[SlideDesigner][${requestId}] ⚠️ All attempts failed. Generating fallback slides.`)
        return slides.map((slide, i) => buildFallbackSlide(slide, i, batchContext, colors))
      }
    }
  }
  throw new Error('All slide generation attempts failed')
}

// ═══════════════════════════════════════════════════════════
//  SEQUENTIAL SINGLE-SLIDE GENERATION
// ═══════════════════════════════════════════════════════════

async function generateSingleSlide(
  designSystem: PremiumDesignSystem,
  slide: SlideContentInput,
  curated: CuratedSlideContent | undefined,
  slideIndex: number,
  brandName: string,
  context: SingleSlideContext,
): Promise<Slide> {
  const requestId = `ss-${slideIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Sequential slide ${slideIndex + 1}/${context.totalSlides} (${slide.slideType})`)

  const [
    pacingMap, layoutArchetypes, imageRoleHints,
    designPrinciples, depthLayers, elementFormat, technicalRules, finalInstruction,
    thinkingLevel, maxOutputTokens, modelTemperature,
  ] = await Promise.all([
    getPacingMap(), getLayoutArchetypes(), getImageRoleHints(),
    getDesignPrinciples(), getDepthLayers(), getElementFormat(), getTechnicalRules(), getFinalInstruction(),
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

  // Select archetype
  const typeAffinities: Record<string, number[]> = {
    cover: [0, 3, 6], insight: [0, 3, 7], bigIdea: [0, 3, 6],
    brief: [1, 6, 3], audience: [1, 3, 6],
    strategy: [2, 5, 4], approach: [2, 5, 1],
    goals: [5, 7, 2], deliverables: [5, 2, 4],
    metrics: [7, 5, 4], competitive: [5, 4, 2],
    closing: [0, 3, 6], whyNow: [7, 0, 3],
  }
  const preferred = typeAffinities[slide.slideType] || [slideIndex % layoutArchetypes.length]
  let archetype = layoutArchetypes[preferred[0] % layoutArchetypes.length]
  for (const idx of preferred) {
    if (idx < layoutArchetypes.length) { archetype = layoutArchetypes[idx]; break }
  }

  // Build presentation story context
  const storyLines = context.allCurated.map((c, i) => {
    const marker = i === slideIndex ? ' ← YOU ARE DESIGNING THIS ONE' : (i < slideIndex ? ' (done)' : '')
    const summary = [c.title, c.keyNumber ? `keyNumber: ${c.keyNumber}` : '', c.bulletPoints?.length ? `${c.bulletPoints.length} bullets` : '', c.cards?.length ? `${c.cards.length} cards` : '', c.tagline ? `tagline: "${c.tagline}"` : ''].filter(Boolean).join(' | ')
    return `  Slide ${i + 1} (${c.slideType}): "${summary}"${marker}`
  }).join('\n')

  // Build previous slides context
  let previousSlidesBlock: string
  if (context.previousSlides.length > 0) {
    const summaries = context.previousSlides.map(prev => {
      const compactElements = (prev.elements || []).map(el => {
        const base: Record<string, unknown> = { type: el.type, x: el.x, y: el.y, w: el.width, h: el.height }
        if (isTextElement(el)) { base.role = el.role; base.fontSize = el.fontSize }
        if (el.type === 'image') { base.objectFit = (el as ImageElement).objectFit }
        if (el.type === 'shape') { base.shapeType = (el as { shapeType?: string }).shapeType }
        return base
      })
      const titleEl = (prev.elements || []).find(e => isTextElement(e) && e.role === 'title') as TextElement | undefined
      const imgEl = (prev.elements || []).find(e => e.type === 'image')
      const titlePos = titleEl ? `title at x:${titleEl.x} y:${titleEl.y}` : 'no title'
      const imgPos = imgEl ? `image at x:${imgEl.x} y:${imgEl.y} w:${imgEl.width} h:${imgEl.height}` : 'no image'
      return `<previous_slide type="${prev.slideType}">
  <layout_summary>${titlePos}, ${imgPos}, bg: ${prev.background?.type}=${prev.background?.value?.slice(0, 80)}</layout_summary>
  <elements>${JSON.stringify(compactElements)}</elements>
</previous_slide>`
    }).join('\n')
    previousSlidesBlock = `${summaries}\nYOUR SLIDE MUST USE A DIFFERENT layout.`
  } else {
    previousSlidesBlock = 'This is the first slide — design freely with maximum impact.'
  }

  // Build content block
  const pacing = pacingMap[slide.slideType] || pacingMap.brief
  const imageRoleHint = imageRoleHints[slide.slideType] || 'An image that reinforces the slide message.'
  const colorTemp = TEMPERATURE_MAP[slide.slideType] || 'neutral'
  const hasTension = TENSION_SLIDES.has(slide.slideType)
  const imageSizeHint = IMAGE_SIZE_HINTS[slide.slideType] || 'At least 40% of slide area'

  let contentBlock: string
  if (curated) {
    const parts: string[] = []
    if (curated.title) parts.push(`<headline>${curated.title}</headline>`)
    if (curated.subtitle) parts.push(`<subtitle>${curated.subtitle}</subtitle>`)
    if (curated.keyNumber) parts.push(`<key_number value="${curated.keyNumber}" label="${curated.keyNumberLabel || ''}" />`)
    if (curated.bodyText) parts.push(`<body>${curated.bodyText}</body>`)
    if (curated.bulletPoints?.length) parts.push(`<bullets>\n${curated.bulletPoints.map(b => `  <item>${b}</item>`).join('\n')}\n</bullets>`)
    if (curated.cards?.length) parts.push(`<cards>\n${curated.cards.map(c => `  <card title="${c.title}">${c.body}</card>`).join('\n')}\n</cards>`)
    if (curated.tagline) parts.push(`<tagline>${curated.tagline}</tagline>`)
    contentBlock = parts.join('\n')
  } else {
    contentBlock = `<raw_json>\n${JSON.stringify(slide.content, null, 2)}\n</raw_json>`
  }

  const emotionNote = curated?.emotionalNote ? `\n<emotion>${curated.emotionalNote}</emotion>` : ''
  const imageTag = slide.imageUrl
    ? `<image url="${slide.imageUrl}" role="${imageRoleHint}" sizing="${imageSizeHint}" />`
    : '<no_image>Use decorative shapes, watermarks, and dramatic typography instead.</no_image>'

  const prompt = buildSingleSlidePrompt(brandName, cd, colors, typo, effects, motif, designSystem, designPrinciples, depthLayers, elementFormat, technicalRules, finalInstruction, storyLines, previousSlidesBlock, slideIndex, context.totalSlides, slide.slideType, pacing, archetype, imageTag, emotionNote, contentBlock, colorTemp, hasTension)

  // Call Gemini with retry
  const CALL_TIMEOUT = 60_000
  const batchSysInstruction = await getSystemInstruction()
  const batchModels = await getBatchModels()

  const attempts: Array<{ model: string; thinking: ThinkingLevel; label: string }> = [
    { model: batchModels[0], thinking: resolvedThinking, label: `${batchModels[0]} (${thinkingLevel})` },
    ...(resolvedThinking !== ThinkingLevel.LOW
      ? [{ model: batchModels[0], thinking: ThinkingLevel.LOW, label: `${batchModels[0]} (LOW)` }]
      : []),
    ...(batchModels[1] !== batchModels[0]
      ? [{ model: batchModels[1], thinking: ThinkingLevel.LOW, label: `${batchModels[1]} (LOW)` }]
      : []),
  ]

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const { model, thinking, label } = attempts[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${label} (attempt ${attempt + 1}/${attempts.length})...`)
      const geminiCall = ai.models.generateContent({
        model, contents: prompt,
        config: {
          systemInstruction: batchSysInstruction,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: thinking },
          maxOutputTokens, temperature: modelTemperature,
          httpOptions: { timeout: CALL_TIMEOUT },
        },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SINGLE_SLIDE_TIMEOUT')), CALL_TIMEOUT)
      )
      const response = await Promise.race([geminiCall, timeoutPromise])

      let parsed: { slides: Slide[] }
      try {
        parsed = JSON.parse(response.text || '') as { slides: Slide[] }
      } catch {
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallback = parseGeminiJson<{ slides: Slide[] }>(response.text || '')
        if (!fallback) throw new Error('JSON parse failed')
        parsed = fallback
      }

      if (parsed?.slides?.length > 0) {
        const result = parsed.slides[0]
        console.log(`[SlideDesigner][${requestId}] Slide ${slideIndex + 1} generated: ${result.elements?.length || 0} elements (${label})`)
        return {
          id: result.id || `slide-${slideIndex}`,
          slideType: (result.slideType || slide.slideType) as SlideType,
          label: result.label || slide.title || `שקף ${slideIndex + 1}`,
          background: result.background || { type: 'solid' as const, value: colors.background },
          elements: (result.elements || []).map((el, j) => ({ ...el, id: el.id || `el-${slideIndex}-${j}` })),
        }
      }
      throw new Error('No slides in response')
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Attempt ${attempt + 1}/${attempts.length} failed (${label}): ${msg}`)
      if (attempt < attempts.length - 1) await new Promise(r => setTimeout(r, 1500))
    }
  }

  console.warn(`[SlideDesigner][${requestId}] All attempts failed. Generating fallback.`)
  return buildSimpleFallbackSlide(slide, slideIndex, colors)
}

// ═══════════════════════════════════════════════════════════
//  PROMPT BUILDERS (extracted for readability)
// ═══════════════════════════════════════════════════════════

function buildBatchPrompt(
  brandName: string, cd: PremiumDesignSystem['creativeDirection'],
  colors: PremiumDesignSystem['colors'], typo: PremiumDesignSystem['typography'],
  effects: PremiumDesignSystem['effects'], motif: PremiumDesignSystem['motif'],
  designSystem: PremiumDesignSystem, designPrinciples: string, depthLayers: string,
  elementFormat: string, technicalRules: string, finalInstruction: string,
  batchContext: BatchContext, slidesDescription: string, slideCount: number,
): string {
  return `<task>
Design ${slideCount} premium presentation slides for "${brandName}".
Canvas: 1920×1080px | RTL Hebrew | Font: Heebo | textAlign: "right" always.
Each slide MUST have a unique layout — never repeat a composition.
</task>

<creative_brief>
${cd ? `Visual Metaphor: ${cd.visualMetaphor}\nVisual Tension: ${cd.visualTension}\nMaster Rule (EVERY slide must obey): ${cd.oneRule}\nColor Story: ${cd.colorStory}\nTypography Voice: ${cd.typographyVoice}\nEmotional Arc: ${cd.emotionalArc}` : `Think like a Creative Director — what is the visual metaphor for "${brandName}"?`}
</creative_brief>

<design_system>
Colors: primary ${colors.primary} | secondary ${colors.secondary} | accent ${colors.accent}
Background: ${colors.background} | Text: ${colors.text} | Cards: ${colors.cardBg}
Muted: ${colors.muted} | Highlight: ${colors.highlight}
Aurora: ${effects.auroraGradient}

Typography: display ${typo.displaySize}px | heading ${typo.headingSize}px | sub ${typo.subheadingSize}px | body ${typo.bodySize}px | caption ${typo.captionSize}px
Spacing: tight ${typo.letterSpacingTight} | wide ${typo.letterSpacingWide} | Weights: ${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}
Line height: tight ${typo.lineHeightTight} | relaxed ${typo.lineHeightRelaxed}

Cards: padding ${designSystem.spacing.cardPadding}px | gap ${designSystem.spacing.cardGap}px | radius ${effects.borderRadiusValue}px
Style: ${effects.decorativeStyle} | Shadow: ${effects.shadowStyle} | Motif: ${motif.type} @ ${motif.opacity}
</design_system>

<design_principles>
${designPrinciples}
DEPTH LAYERS: ${depthLayers}
ANTI-PATTERNS: Centered text in middle | 3 identical cards | All fonts same size | Simple linear gradient | Rotation on body text | Opacity < 0.7 on readable text
</design_principles>

<typography_rules>
- Headlines (60px+): letterSpacing ${typo.letterSpacingTight}, lineHeight ${typo.lineHeightTight}, weight ${typo.weightPairs[0]?.[0] || 900}
- Body/labels: letterSpacing ${typo.letterSpacingWide}, weight ${typo.weightPairs[0]?.[1] || 300}
- Giant numbers: weight 900, letterSpacing -4, fontSize 80-140px
- Watermark: role "decorative", fontSize 200-400, opacity 0.03-0.08, rotation -5° to -15°, textStroke: { width: 2, color: "#ffffff" }
</typography_rules>

<element_format>
${elementFormat}
</element_format>

<technical_rules>
${technicalRules}
- Create depth through layered shapes with subtle offset shadows
- For full-bleed images: image at zIndex 1, gradient overlay at zIndex 2, text at zIndex 8+
- Key numbers: fontSize 80-140px, fontWeight 900, accent color
- Images with URL: MUST include element type "image" with src=URL, size ≥40% of slide
</technical_rules>

<visualization_checklist>
BEFORE outputting each slide, mentally render it at 1920×1080:
1. Can I read every text? 2. No overlapping without contrast layer? 3. Asymmetric composition? 4. ONE dominant element? 5. Key number feels like hero? 6. Enough white space? 7. Different from previous?
If ANY check fails → fix before outputting.
</visualization_checklist>

<reference_examples>
These examples show the QUALITY LEVEL expected. Create COMPLETELY DIFFERENT designs — these are structure references only.

Example 1 — Cover (Typographic Brutalism):
\`\`\`json
{
  "id": "slide-1", "slideType": "cover", "label": "שער",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "bg", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0, "shapeType": "background", "fill": "radial-gradient(circle at 20% 30%, ${colors.primary}50 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${colors.accent}50 0%, transparent 50%)", "opacity": 0.7 },
    { "id": "watermark", "type": "text", "x": -150, "y": 180, "width": 2200, "height": 500, "zIndex": 2, "content": "BRAND", "fontSize": 380, "fontWeight": 900, "color": "transparent", "textAlign": "center", "lineHeight": 0.9, "letterSpacing": -8, "opacity": 0.12, "rotation": -8, "textStroke": { "width": 2, "color": "#ffffff" }, "role": "decorative" },
    { "id": "line", "type": "shape", "x": 160, "y": 620, "width": 340, "height": 1, "zIndex": 2, "shapeType": "decorative", "fill": "${colors.text}30", "opacity": 1 },
    { "id": "accent-circle", "type": "shape", "x": 1450, "y": -80, "width": 400, "height": 400, "zIndex": 2, "shapeType": "decorative", "fill": "${colors.accent}", "clipPath": "circle(50%)", "opacity": 0.12 },
    { "id": "title", "type": "text", "x": 120, "y": 380, "width": 900, "height": 200, "zIndex": 10, "content": "שם המותג", "fontSize": ${typo.displaySize}, "fontWeight": 900, "color": "${colors.text}", "textAlign": "right", "lineHeight": 1.0, "letterSpacing": -4, "role": "title" },
    { "id": "subtitle", "type": "text", "x": 120, "y": 610, "width": 600, "height": 50, "zIndex": 8, "content": "הצעת שיתוף פעולה", "fontSize": 22, "fontWeight": 300, "color": "${colors.text}70", "textAlign": "right", "letterSpacing": 6, "role": "subtitle" },
    { "id": "date", "type": "text", "x": 120, "y": 680, "width": 300, "height": 30, "zIndex": 8, "content": "ינואר 2025", "fontSize": 16, "fontWeight": 300, "color": "${colors.text}40", "textAlign": "right", "letterSpacing": 3, "role": "caption" }
  ]
}
\`\`\`

Example 2 — Metrics (Bento Box + Data Art):
\`\`\`json
{
  "id": "slide-10", "slideType": "metrics", "label": "מדדים",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "bg", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0, "shapeType": "background", "fill": "radial-gradient(circle at 50% 50%, ${colors.cardBg} 0%, ${colors.background} 70%)", "opacity": 1 },
    { "id": "wm", "type": "text", "x": 800, "y": 600, "width": 1400, "height": 500, "zIndex": 1, "content": "DATA", "fontSize": 300, "fontWeight": 900, "color": "transparent", "textAlign": "center", "opacity": 0.04, "rotation": -12, "textStroke": { "width": 2, "color": "${colors.text}" }, "role": "decorative" },
    { "id": "label", "type": "text", "x": 120, "y": 80, "width": 400, "height": 30, "zIndex": 8, "content": "יעדים ומדדים", "fontSize": 14, "fontWeight": 400, "color": "${colors.accent}", "textAlign": "right", "letterSpacing": 4, "role": "label" },
    { "id": "title", "type": "text", "x": 120, "y": 120, "width": 800, "height": 80, "zIndex": 10, "content": "המספרים שמאחורי התוכנית", "fontSize": 56, "fontWeight": 800, "color": "${colors.text}", "textAlign": "right", "lineHeight": 1.1, "letterSpacing": -2, "role": "title" },
    { "id": "c1-shadow", "type": "shape", "x": 135, "y": 275, "width": 520, "height": 320, "zIndex": 4, "shapeType": "decorative", "fill": "#000000", "borderRadius": 24, "opacity": 0.15 },
    { "id": "c1", "type": "shape", "x": 120, "y": 260, "width": 520, "height": 320, "zIndex": 5, "shapeType": "decorative", "fill": "${colors.cardBg}", "borderRadius": 24, "opacity": 1, "border": "1px solid ${colors.text}10" },
    { "id": "c1-num", "type": "text", "x": 160, "y": 290, "width": 440, "height": 120, "zIndex": 8, "content": "2.5M", "fontSize": 88, "fontWeight": 900, "color": "${colors.accent}", "textAlign": "right", "lineHeight": 1, "letterSpacing": -3, "role": "body" },
    { "id": "c1-lbl", "type": "text", "x": 160, "y": 420, "width": 440, "height": 40, "zIndex": 8, "content": "חשיפות צפויות", "fontSize": 22, "fontWeight": 400, "color": "${colors.text}80", "textAlign": "right", "role": "body" },
    { "id": "c2-shadow", "type": "shape", "x": 695, "y": 275, "width": 520, "height": 320, "zIndex": 4, "shapeType": "decorative", "fill": "#000000", "borderRadius": 24, "opacity": 0.15 },
    { "id": "c2", "type": "shape", "x": 680, "y": 260, "width": 520, "height": 320, "zIndex": 5, "shapeType": "decorative", "fill": "${colors.cardBg}", "borderRadius": 24, "opacity": 1, "border": "1px solid ${colors.text}10" },
    { "id": "c2-num", "type": "text", "x": 720, "y": 290, "width": 440, "height": 120, "zIndex": 8, "content": "12.4%", "fontSize": 88, "fontWeight": 900, "color": "${colors.highlight}", "textAlign": "right", "lineHeight": 1, "letterSpacing": -3, "role": "body" },
    { "id": "c2-lbl", "type": "text", "x": 720, "y": 420, "width": 440, "height": 40, "zIndex": 8, "content": "אחוז מעורבות", "fontSize": 22, "fontWeight": 400, "color": "${colors.text}80", "textAlign": "right", "role": "body" }
  ]
}
\`\`\`

⚠️ Design slides that are DIFFERENT from these examples — use them only for quality/structure reference.
</reference_examples>

<previous_slides>
${batchContext.previousSlidesVisualSummary ? `Already designed:\n${batchContext.previousSlidesVisualSummary}` : 'First batch — no previous slides.'}
</previous_slides>

<slides_to_design>
${slidesDescription}
</slides_to_design>

<final_instruction>
${finalInstruction}
</final_instruction>`
}

function buildSingleSlidePrompt(
  brandName: string, cd: PremiumDesignSystem['creativeDirection'],
  colors: PremiumDesignSystem['colors'], typo: PremiumDesignSystem['typography'],
  effects: PremiumDesignSystem['effects'], motif: PremiumDesignSystem['motif'],
  designSystem: PremiumDesignSystem, designPrinciples: string, depthLayers: string,
  elementFormat: string, technicalRules: string, finalInstruction: string,
  storyLines: string, previousSlidesBlock: string,
  slideIndex: number, totalSlides: number, slideType: string,
  pacing: PacingDirective, archetype: string, imageTag: string,
  emotionNote: string, contentBlock: string,
  temperature?: string, hasTension?: boolean,
): string {
  return `<task>
Design exactly 1 premium presentation slide for "${brandName}".
Canvas: 1920×1080px | RTL Hebrew | Font: Heebo | textAlign: "right" always.
This must look like a premium fashion magazine / editorial design — NOT PowerPoint!
</task>

<creative_brief>
${cd ? `Visual Metaphor: ${cd.visualMetaphor}\nVisual Tension: ${cd.visualTension}\nMaster Rule (EVERY slide must obey): ${cd.oneRule}\nColor Story: ${cd.colorStory}\nTypography Voice: ${cd.typographyVoice}\nEmotional Arc: ${cd.emotionalArc}` : `Think like a Creative Director for "${brandName}".`}
</creative_brief>

<design_system>
Colors: primary ${colors.primary} | secondary ${colors.secondary} | accent ${colors.accent}
Background: ${colors.background} | Text: ${colors.text} | Cards: ${colors.cardBg}
Muted: ${colors.muted} | Highlight: ${colors.highlight}
Aurora: ${effects.auroraGradient}

Typography: display ${typo.displaySize}px | heading ${typo.headingSize}px | sub ${typo.subheadingSize}px | body ${typo.bodySize}px | caption ${typo.captionSize}px
Spacing: tight ${typo.letterSpacingTight} | wide ${typo.letterSpacingWide} | Weights: ${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}
Line height: tight ${typo.lineHeightTight} | relaxed ${typo.lineHeightRelaxed}

Cards: padding ${designSystem.spacing.cardPadding}px | gap ${designSystem.spacing.cardGap}px | radius ${effects.borderRadiusValue}px
Style: ${effects.decorativeStyle} | Shadow: ${effects.shadowStyle} | Motif: ${motif.type} @ ${motif.opacity}
</design_system>

<full_presentation_story>
${storyLines}
</full_presentation_story>

<previous_slide_designs>
${previousSlidesBlock}
</previous_slide_designs>

<slide_to_design index="${slideIndex + 1}" total="${totalSlides}" type="${slideType}">
<temperature>${temperature || 'neutral'}</temperature>
<energy>${pacing.energy}</energy>
<density>${pacing.density}</density>
<max_elements>${pacing.maxElements}</max_elements>
<min_whitespace>${pacing.minWhitespace}%</min_whitespace>
<layout_inspiration>${archetype}</layout_inspiration>
${hasTension ? '<tension>TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!</tension>' : ''}
${imageTag}${emotionNote}
${cd?.oneRule ? `<master_rule>${cd.oneRule}</master_rule>` : ''}
<content>
${contentBlock}
</content>
</slide_to_design>

<design_principles>
${designPrinciples}
DEPTH LAYERS: ${depthLayers}
ANTI-PATTERNS: Centered text | 3 identical cards | All fonts same size | Simple gradient | Rotation on body text | Opacity < 0.7 on readable text
</design_principles>

<typography_rules>
- Headlines (60px+): letterSpacing ${typo.letterSpacingTight}, lineHeight ${typo.lineHeightTight}, weight ${typo.weightPairs[0]?.[0] || 900}
- Body/labels: letterSpacing ${typo.letterSpacingWide}, weight ${typo.weightPairs[0]?.[1] || 300}
- Giant numbers: weight 900, letterSpacing -4, fontSize 80-140px
- Watermark: role "decorative", fontSize 200-400, opacity 0.03-0.08, rotation -5° to -15°, textStroke: { width: 2, color: "#ffffff" }
</typography_rules>

<element_format>
${elementFormat}
</element_format>

<technical_rules>
${technicalRules}
- Create depth through layered shapes with subtle offset shadows
- For full-bleed images: image at zIndex 1, gradient overlay at zIndex 2, text at zIndex 8+
- Key numbers: fontSize 80-140px, fontWeight 900, accent color
- Images with URL: MUST include element type "image" with src=URL, size ≥40% of slide
</technical_rules>

<image_placement>
When an image URL is provided:
- You MUST include an image element. YOU decide size, position, cropping.
- Consider: full-bleed, half-split, corner accent, centered hero, asymmetric panel.
- If full-bleed: add gradient overlay for text readability.
NEVER use default positions. Every image placement must be a creative decision.
</image_placement>

<reference_examples>
Quality/structure reference — create YOUR OWN design, different from these:

Cover example (structure only):
\`\`\`json
{
  "id": "slide-1", "slideType": "cover", "label": "שער",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "bg", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0, "shapeType": "background", "fill": "radial-gradient(circle at 20% 30%, ${colors.primary}50 0%, transparent 50%)", "opacity": 0.7 },
    { "id": "watermark", "type": "text", "x": -150, "y": 180, "width": 2200, "height": 500, "zIndex": 2, "content": "BRAND", "fontSize": 380, "fontWeight": 900, "color": "transparent", "textAlign": "center", "lineHeight": 0.9, "letterSpacing": -8, "opacity": 0.12, "rotation": -8, "textStroke": { "width": 2, "color": "#ffffff" }, "role": "decorative" },
    { "id": "title", "type": "text", "x": 120, "y": 380, "width": 900, "height": 200, "zIndex": 10, "content": "שם המותג", "fontSize": ${typo.displaySize}, "fontWeight": 900, "color": "${colors.text}", "textAlign": "right", "lineHeight": 1.0, "letterSpacing": -4, "role": "title" },
    { "id": "subtitle", "type": "text", "x": 120, "y": 610, "width": 600, "height": 50, "zIndex": 8, "content": "הצעת שיתוף פעולה", "fontSize": 22, "fontWeight": 300, "color": "${colors.text}70", "textAlign": "right", "letterSpacing": 6, "role": "subtitle" }
  ]
}
\`\`\`
</reference_examples>

<visualization_checklist>
BEFORE outputting, mentally render at 1920×1080:
1. Can I read every text? 2. No overlapping without contrast layer? 3. Asymmetric? 4. ONE dominant element? 5. Key number = hero? 6. Enough white space? 7. Different from previous?
If ANY check fails → fix before outputting.
</visualization_checklist>

<final_instruction>
${finalInstruction}
</final_instruction>`
}

// ═══════════════════════════════════════════════════════════
//  MAIN: generateAIPresentation
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

  const designSystem = await generateDesignSystem(brandInput)
  const allBatches = await buildSlideBatches(data, config)
  const flatSlides = allBatches.flat()

  let allCurated: CuratedSlideContent[] = []
  try {
    allCurated = await curateSlideContent(flatSlides, data.brandName || '', designSystem.creativeDirection)
  } catch (err) {
    console.warn(`[SlideDesigner][${requestId}] Curation failed:`, err)
  }

  const allGeneratedSlides: Slide[] = []
  let previousSlides: Slide[] = []
  const pacingMap = await getPacingMap()

  for (let si = 0; si < flatSlides.length; si++) {
    try {
      const generatedSlide = await generateSingleSlide(designSystem, flatSlides[si], allCurated[si], si, data.brandName || '', { allCurated, previousSlides: previousSlides.slice(-2), totalSlides: flatSlides.length })
      const pacing = pacingMap[flatSlides[si].slideType] || pacingMap.brief
      const validResult = validateSlide(generatedSlide, designSystem, pacing, flatSlides[si].imageUrl)
      const finalSlide = validResult.issues.some(i => i.autoFixable)
        ? autoFixSlide(generatedSlide, validResult.issues.filter(i => i.autoFixable), designSystem, flatSlides[si].imageUrl)
        : generatedSlide
      allGeneratedSlides.push(finalSlide)
      previousSlides = [...previousSlides, finalSlide].slice(-2)
    } catch (error) {
      console.error(`[SlideDesigner] Slide ${si + 1} failed:`, error)
      const fallback = createFallbackSlide(flatSlides[si], designSystem, si)
      allGeneratedSlides.push(fallback)
      previousSlides = [...previousSlides, fallback].slice(-2)
    }
  }

  if (allGeneratedSlides.length === 0) throw new Error('All slides failed')

  let totalScore = 0
  for (const slide of allGeneratedSlides) {
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    totalScore += validateSlide(slide, designSystem, pacing).score
  }
  const avgScore = Math.round(totalScore / allGeneratedSlides.length)
  const clientLogoUrl = config.clientLogoUrl || (typeof data._scraped?.logoUrl === 'string' ? data._scraped.logoUrl : '') || config.brandLogoUrl || ''
  const finalSlides = injectClientLogo(injectLeadersLogo(checkVisualConsistency(allGeneratedSlides, designSystem)), clientLogoUrl)

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n${'═'.repeat(50)}\n[SlideDesigner][${requestId}] Done in ${duration}s — ${finalSlides.length} slides, quality: ${avgScore}/100\n${'═'.repeat(50)}\n`)

  return {
    id: `pres-${Date.now()}`, title: data.brandName || 'הצעת מחיר', designSystem,
    slides: finalSlides,
    metadata: { brandName: data.brandName, createdAt: new Date().toISOString(), version: 2, pipeline: 'slide-designer-v3', qualityScore: avgScore, duration: parseFloat(duration) },
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

  const designSystem = await generateDesignSystem(brandInput)
  const allBatches = await buildSlideBatches(d, config)
  const allSlides = allBatches.flat()
  const singleSlideBatches = allSlides.map(s => [s])

  console.log(`[SlideDesigner][${requestId}] Running Content Curator on ${allSlides.length} slides...`)
  let allCurated: CuratedSlideContent[] = []
  try {
    allCurated = await curateSlideContent(allSlides, d.brandName || '', designSystem.creativeDirection)
    console.log(`[SlideDesigner][${requestId}] Content Curator complete: ${allCurated.length} slides curated`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[SlideDesigner][${requestId}] Content Curator failed (${msg}), will use raw content`)
  }

  const curatedBatches = allCurated.length > 0 ? allCurated.map(c => [c]) : undefined

  const foundation = { designSystem, batches: singleSlideBatches, curatedBatches, allCurated, allSlides, brandName: d.brandName || '', clientLogo, leadersLogo, totalSlides: allSlides.length }
  console.log(`[SlideDesigner][${requestId}] Foundation complete: ${foundation.totalSlides} slides (sequential mode)`)
  return foundation
}

export async function pipelineBatch(
  foundation: import('./slide-design').PipelineFoundation,
  batchIndex: number,
  previousContext: import('./slide-design').BatchResult | null,
): Promise<import('./slide-design').BatchResult> {
  const requestId = `seq-${batchIndex}-${Date.now()}`
  const slideIndex = batchIndex
  const slide = foundation.allSlides[slideIndex]
  if (!slide) throw new Error(`Invalid slide index: ${slideIndex}`)

  const curated = foundation.allCurated?.[slideIndex]
  const previousSlides = previousContext?.generatedSlides || []

  console.log(`[SlideDesigner][${requestId}] Sequential slide ${slideIndex + 1}/${foundation.totalSlides} (${slide.slideType})${curated ? ' +curated' : ' (raw)'}`)

  try {
    const generatedSlide = await generateSingleSlide(foundation.designSystem as PremiumDesignSystem, slide, curated, slideIndex, foundation.brandName, { allCurated: foundation.allCurated || [], previousSlides: previousSlides.slice(-2), totalSlides: foundation.totalSlides })
    const pacingMap = await getPacingMap()
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const validationResult = validateSlide(generatedSlide, foundation.designSystem as PremiumDesignSystem, pacing, slide.imageUrl)
    let finalSlide = generatedSlide
    if (!validationResult.valid || validationResult.score < 70) {
      const fixable = validationResult.issues.filter(i => i.autoFixable)
      if (fixable.length > 0) {
        finalSlide = autoFixSlide(generatedSlide, fixable, foundation.designSystem as PremiumDesignSystem, slide.imageUrl)
        console.log(`[SlideDesigner][${requestId}] Auto-fixed ${fixable.length} issues`)
      }
    }
    const updatedHistory = [...previousSlides, finalSlide].slice(-2)
    console.log(`[SlideDesigner][${requestId}] Slide ${slideIndex + 1} done: ${finalSlide.elements?.length || 0} elements`)
    return { slides: [finalSlide], visualSummary: '', slideIndex: slideIndex + 1, generatedSlides: updatedHistory }
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Slide ${slideIndex + 1} failed:`, error)
    const fallbackSlide = createFallbackSlide(slide, foundation.designSystem as PremiumDesignSystem, slideIndex)
    return { slides: [fallbackSlide], visualSummary: '', slideIndex: slideIndex + 1, generatedSlides: [...previousSlides, fallbackSlide].slice(-2) }
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
  const allInputs = foundation.batches.flat()
  const ds = foundation.designSystem as PremiumDesignSystem

  const validatedSlides: Slide[] = []
  let totalScore = 0
  for (let si = 0; si < allSlides.length; si++) {
    const slide = allSlides[si]
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const result = validateSlide(slide, ds, pacing, allInputs[si]?.imageUrl)
    totalScore += result.score
    validatedSlides.push(result.issues.some(i => i.autoFixable) ? autoFixSlide(slide, result.issues, ds, allInputs[si]?.imageUrl) : slide)
  }

  const avgScore = Math.round(totalScore / allSlides.length)
  const finalSlides = injectClientLogo(injectLeadersLogo(checkVisualConsistency(validatedSlides, ds)), foundation.clientLogo)

  console.log(`[SlideDesigner][${requestId}] Finalized: ${finalSlides.length} slides, quality: ${avgScore}/100`)
  return {
    id: `pres-${Date.now()}`, title: foundation.brandName || 'הצעת מחיר', designSystem: ds,
    slides: finalSlides,
    metadata: { brandName: foundation.brandName, createdAt: new Date().toISOString(), version: 2, pipeline: 'slide-designer-v3-staged', qualityScore: avgScore },
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
  const modifiedContent = instruction
    ? { ...slideContent, title: `${slideContent.title}\n\nהנחיה נוספת: ${instruction}` }
    : slideContent

  const slides = await generateSlidesBatchAST(
    designSystem, [modifiedContent], 0, brandName,
    { previousSlidesVisualSummary: '', slideIndex: 0, totalSlides: 1 },
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
