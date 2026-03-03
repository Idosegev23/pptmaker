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
  CuratedSlideContent,
} from '@/types/presentation'
import { curateSlideContent } from './content-curator'

// ── Sub-module imports ──────────────────────────────────
import type {
  BrandDesignInput,
  SlideContentInput,
  PremiumDesignSystem,
  BatchContext,
  PremiumProposalData,
} from './slide-design'

import {
  // Config loaders
  getDesignSystemModels, getBatchModels,
  getSystemInstruction, getDesignPrinciples, getElementFormat,
  getTechnicalRules, getFinalInstruction, getImageRoleHints,
  getPacingMap, getDepthLayers,
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
  // Content builder
  buildSlideBatches,
  // Logo injection
  injectLeadersLogo, injectClientLogo,
} from './slide-design'

// Re-export pipeline types for external consumers
export type { PipelineFoundation, BatchResult } from './slide-design'

// AI calls routed through callAI() in @/lib/ai-provider (Gemini primary, Claude fallback)

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

  const sysInstruction = await getSystemInstruction()
  const models = await getDesignSystemModels()
  const [dsThinkingLevel, dsMaxOutputTokens] = await Promise.all([getThinkingLevel(), getMaxOutputTokens()])
  const dsThinking = dsThinkingLevel === 'HIGH' ? ThinkingLevel.HIGH
    : dsThinkingLevel === 'MEDIUM' ? ThinkingLevel.MEDIUM
    : ThinkingLevel.LOW

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for design system (attempt ${attempt + 1}/${models.length})...`)
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
      })
      if (dsResult.switched) console.warn(`[SlideDesigner][${requestId}] 🔄 Switched to Claude for design system`)

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
    pacingMap, imageRoleHints,
    _designPrinciples, _depthLayers, _elementFormat, _technicalRules, _finalInstruction,
    thinkingLevel, maxOutputTokens, temperature,
  ] = await Promise.all([
    getPacingMap(), getImageRoleHints(),
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

  // Build per-slide directives
  const slidesDescription = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const imageRoleHint = imageRoleHints[slide.slideType] || 'An image that reinforces the slide message.'
    const archetype = LAYOUT_MAP[slide.slideType] || LAYOUT_MAP.brief
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
  <layout_directive>MANDATORY: ${archetype}</layout_directive>
${hasTension ? '  <tension>TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!</tension>' : ''}
${imageTag}
${emotionNote}
${cdPerSlide}
  <content>
${contentBlock}
  </content>
</slide>`
  }).join('\n')

  const prompt = buildBatchPrompt(brandName, cd, colors, typo, effects, motif, designSystem, _designPrinciples, _depthLayers, _elementFormat, _technicalRules, _finalInstruction, batchContext, slidesDescription, slides.length)

  // Retry with model fallback
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
    const { model, thinking, label } = attempts[attempt]
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
      })
      if (batchResult.switched) console.warn(`[SlideDesigner][${requestId}] 🔄 Switched to Claude for batch`)

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
        console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} AST slides (${label})`)
        return parsed.slides.map((slide, i) => ({
          id: slide.id || `slide-${batchContext.slideIndex + i}`,
          slideType: (slide.slideType || slides[i]?.slideType || 'closing') as SlideType,
          label: slide.label || slides[i]?.title || `שקף ${batchContext.slideIndex + i + 1}`,
          background: slide.background || { type: 'solid' as const, value: colors.background },
          elements: (slide.elements || []).map((el, j) =>
            sanitizeElement(el, j, batchContext.slideIndex + i, colors)
          ),
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
//  ELEMENT SANITIZER — fills in missing properties from Design System
// ═══════════════════════════════════════════════════════════

function sanitizeElement(
  el: SlideElement,
  elIndex: number,
  slideIndex: number,
  colors: PremiumDesignSystem['colors'],
): SlideElement {
  const base = { ...el, id: el.id || `el-${slideIndex}-${elIndex}` }

  if (base.type === 'text') {
    const txt = base as TextElement
    if (!txt.color) txt.color = colors.text || '#F5F5F7'
    if (!txt.textAlign) txt.textAlign = 'right'
    if (!txt.role) txt.role = txt.fontSize && txt.fontSize >= 80 ? 'title' : txt.fontSize && txt.fontSize >= 40 ? 'subtitle' : 'body'
    if (!txt.fontWeight) txt.fontWeight = txt.role === 'title' ? 900 : txt.role === 'subtitle' ? 700 : 400
    if (txt.opacity === undefined) txt.opacity = 1
    return txt as unknown as SlideElement
  }

  if (base.type === 'shape') {
    const shape = base as ShapeElement
    if (!shape.fill) shape.fill = 'transparent'
    if (!shape.shapeType) shape.shapeType = 'decorative'
    return shape as unknown as SlideElement
  }

  if (base.type === 'image') {
    const img = base as ImageElement
    if (!img.objectFit) img.objectFit = 'cover'
    if (!img.src) img.src = ''
    return img as unknown as SlideElement
  }

  return base
}

// ═══════════════════════════════════════════════════════════
//  PROMPT BUILDERS (extracted for readability)
// ═══════════════════════════════════════════════════════════

function buildBatchPrompt(
  brandName: string, cd: PremiumDesignSystem['creativeDirection'],
  colors: PremiumDesignSystem['colors'], typo: PremiumDesignSystem['typography'],
  effects: PremiumDesignSystem['effects'], motif: PremiumDesignSystem['motif'],
  designSystem: PremiumDesignSystem, _designPrinciples: string, _depthLayers: string,
  _elementFormat: string, _technicalRules: string, _finalInstruction: string,
  batchContext: BatchContext, slidesDescription: string, slideCount: number,
): string {
  return `אתה ארט דיירקטור גאון ברמת Awwwards / Pentagram / Sagmeister & Walsh.
המצגת חייבת להיראות כמו **מגזין אופנה פרימיום / editorial design** — לא כמו PowerPoint!

עצב ${slideCount} שקפים למותג "${brandName}".

══════════════════════════════════
🧠 THE CREATIVE BRIEF
══════════════════════════════════
${cd ? `
**מטאפורה ויזואלית:** ${cd.visualMetaphor}
**מתח ויזואלי:** ${cd.visualTension}
**חוק-על (כל שקף חייב לקיים):** ${cd.oneRule}
**סיפור צבע:** ${cd.colorStory}
**קול טיפוגרפי:** ${cd.typographyVoice}
**מסע רגשי:** ${cd.emotionalArc}
` : `חשוב כמו Creative Director — מה המטאפורה הויזואלית של "${brandName}"? מה המתח? מה מפתיע?`}

══════════════════════════════════
🎨 DESIGN SYSTEM
══════════════════════════════════
Canvas: 1920×1080px | RTL (עברית) | פונט: Heebo

צבעים: primary ${colors.primary} | secondary ${colors.secondary} | accent ${colors.accent}
רקע: ${colors.background} | טקסט: ${colors.text} | כרטיסים: ${colors.cardBg}
מושתק: ${colors.muted} | highlight: ${colors.highlight}
Aurora: ${effects.auroraGradient}

טיפוגרפיה: display ${typo.displaySize}px | heading ${typo.headingSize}px | body ${typo.bodySize}px | caption ${typo.captionSize}px
Spacing tight: ${typo.letterSpacingTight} | wide: ${typo.letterSpacingWide}
Weight pairs: ${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}
Line height: tight ${typo.lineHeightTight} | relaxed ${typo.lineHeightRelaxed}

Card: padding ${designSystem.spacing.cardPadding}px | gap ${designSystem.spacing.cardGap}px | radius ${effects.borderRadiusValue}px
Decorative style: ${effects.decorativeStyle} | Shadow: ${effects.shadowStyle}

Motif: ${motif.type} (opacity: ${motif.opacity}, color: ${motif.color})
${motif.implementation}

══════════════════════════════════
📐 COMPOSITION & QUALITY RULES
══════════════════════════════════

## חוקי קומפוזיציה (Composition Rules):

### Rule of Thirds:
נקודות העניין הויזואליות חייבות לשבת על אחד מ-4 צמתי ⅓:
- נקודה A: x=640, y=360
- נקודה B: x=1280, y=360
- נקודה C: x=640, y=720
- נקודה D: x=1280, y=720
הכותרת הראשית תמיד על נקודה A או B (צד ימין — RTL).

### Diagonal Dominance:
אלמנטים צריכים ליצור קו אלכסוני מנחה דינמי (מימין-למעלה לשמאל-למטה) — לא ישר ולא סטטי.

### Focal Point Triangle:
ב-3 האלמנטים הראשיים (title, visual, supporting) — מקמם אותם כמשולש שמקיף את מרכז העניין.

### Scale Contrast (חובה):
היחס בין הפונט הגדול ביותר לפונט הקטן ביותר בשקף חייב להיות לפחות 5:1.
למשל: אם הכותרת 96px, caption צריך להיות 18px או פחות.
שקפי peak (cover, insight, bigIdea, closing): יחס 10:1 לפחות (למשל 300px ו-18px).

## שכבות עומק (Depth Layers) — כל אלמנט חייב לשבת בשכבה אחת:
- Layer 0 (zIndex: 0-1):    BACKGROUND — aurora, gradient, texture, full-bleed color
- Layer 1 (zIndex: 2-3):    DECORATIVE — watermark text, geometric shapes, motif patterns, thin architectural lines
- Layer 2 (zIndex: 4-5):    STRUCTURE — cards, containers, dividers, image frames
- Layer 3 (zIndex: 6-8):    CONTENT — body text, data, images, influencer cards
- Layer 4 (zIndex: 9-10):   HERO — main title, key number, focal element, brand name

חוק: אלמנטים מאותה שכבה לא חופפים (אלא אם אחד מהם decorative עם opacity < 0.3).

## ❌ Anti-Patterns (הפרה = פסילה):
1. ❌ טקסט ממורכז בדיוק באמצע המסך (x:960, y:540) — BORING
2. ❌ כל האלמנטים על אותו קו אנכי / 3 כרטיסים זהים ברוחב שווה — PowerPoint
3. ❌ כל הטקסטים באותו fontSize — חייב היררכיה (יחס ≥5:1 בין גדול לקטן)
4. ❌ opacity < 0.7 על טקסט קריא / rotation על body text
5. ❌ טקסט חופף טקסט אחר — כל אלמנט חייב שטח משלו עם 20px+ רווח
6. ❌ תמונה שמכסה טקסט בלי gradient overlay — טקסט חייב להיות קריא

## Typography:
- כותרות 60px+: letterSpacing ${typo.letterSpacingTight}, lineHeight ${typo.lineHeightTight}, fontWeight ${typo.weightPairs[0]?.[0] || 900}
- Labels: letterSpacing ${typo.letterSpacingWide}, fontWeight ${typo.weightPairs[0]?.[1] || 300}
- מספרים גדולים: fontSize 80-140px, fontWeight 900, letterSpacing -4
- רווח לבן = אלמנט עיצובי. כותרת ראשית: 80px+ מכל אלמנט אחר

══════════════════════════════════
🛠️ EDITORIAL DESIGN RULES (THE WOW FACTOR!)
══════════════════════════════════

1. **שבור את התבנית:** אף שקף לא נראה כמו PowerPoint עם כותרת ובולטים. לייאוט א-סימטרי!
2. **Watermarks ענקיים:** בכל שקף — טקסט רקע עצום (200-400px) עם opacity 0.03-0.08, rotation -5 עד -15. זה נותן עומק!
3. **clip-path / shapes דינמיים:** אל תעשה רק ריבועים. shapes בזווית, עיגולים שגולשים מחוץ למסך, קווים אלכסוניים
4. **טיפוגרפיה אדירה:** כותרות שחותכות את המסך. textStroke (קו מתאר) לטקסט דקורטיבי. ניגוד חד בין weight 900 ל-300
5. **מספרים = drama:** נתון של "500K" מקבל fontSize: 120+, accent color, ושטח ענק. הטקסט שמתחתיו קטן ומגזיני
6. **Gradient overlays:** גרדיאנטים מעל תמונות (linear-gradient to top) כדי שטקסט יבלוט
7. **קווים ומפרידים אלגנטיים:** קווים דקים (1-2px) ב-accent color, מפרידים בין אזורים, מסגרות חלקיות
8. **כרטיסים = לא סתם ריבועים:** offset borders, רקעים מדורגים, fake-3d shadow (shape ב-+12px offset)

══════════════════════════════════
📦 ELEMENT TYPES (JSON FORMAT)
══════════════════════════════════

### Shape:
{ "id": "el-X", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0,
  "shapeType": "background"|"decorative"|"divider", "fill": "#hex or gradient", "clipPath": "...",
  "borderRadius": px, "opacity": 0-1, "rotation": degrees, "border": "1px solid rgba(...)" }

### Text:
{ "id": "el-X", "type": "text", "x": 80, "y": 120, "width": 800, "height": 80, "zIndex": 10,
  "content": "טקסט", "fontSize": px, "fontWeight": 100-900, "color": "#hex", "textAlign": "right",
  "role": "title"|"subtitle"|"body"|"caption"|"label"|"decorative", "lineHeight": 0.9-1.6,
  "letterSpacing": px, "opacity": 0-1, "rotation": degrees,
  "textStroke": { "width": 2, "color": "#hex" } }
  *** role "decorative" = watermark text ענק, opacity נמוך, rotation, fontSize 200+ ***

### Image:
{ "id": "el-X", "type": "image", "x": 960, "y": 0, "width": 960, "height": 1080, "zIndex": 5,
  "src": "THE_URL", "objectFit": "cover", "borderRadius": px, "clipPath": "..." }

**תמונות קריטי**: אם יש imageUrl לשקף → חובה element מסוג "image" עם src=URL, גודל ≥40% מהשקף

══════════════════════════════════
🖼️ REFERENCE EXAMPLES (THIS IS WHAT WOW LOOKS LIKE)
══════════════════════════════════

### דוגמה 1 — שקף שער (Typographic Brutalism):
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

⚠️ צור עיצוב שונה מהדוגמה — היא רק ברמת האיכות, לא בסגנון. כל שקף חייב layout_directive שלו!

══════════════════════════════════
📝 CONTEXT FROM PREVIOUS SLIDES
══════════════════════════════════
${batchContext.previousSlidesVisualSummary || 'זה הבאצ׳ הראשון — אין הקשר קודם.'}

══════════════════════════════════
📋 SLIDES TO CREATE
══════════════════════════════════
${slidesDescription}

══════════════════════════════════
⚙️ TECHNICAL RULES
══════════════════════════════════
- textAlign: "right" תמיד (RTL). כל הטקסט בעברית
- zIndex layering: 0-1 רקע, 2-3 דקורציה, 4-5 מבנה, 6-8 תוכן, 9-10 hero
- 🚫 אסור: box-shadow, backdrop-filter, filter: blur
- ✅ Fake 3D: shape ב-x+12,y+12 fill:#000 opacity:0.12-0.18
- לתמונות full-bleed: image ב-zIndex 1, gradient overlay ב-zIndex 2, טקסט ב-zIndex 8+
- מספרים מרכזיים: fontSize 80-140px, fontWeight 900, accent color
- תמונות עם URL: חובה element מסוג "image" עם src=URL, גודל ≥40% מהשקף

לפני שליחת ה-JSON, דמיין כל שקף מנטלית ב-1920×1080:
1. האם אני קורא כל טקסט בבירור?
2. שום דבר לא מוסתר מאחורי אלמנט אחר?
3. אם יש תמונה — יש לה מקום משלה? טקסט לא עולה עליה ישירות?
4. הקומפוזיציה מרגישה כמו עמוד מגזין פרימיום?
5. אם בדיקה נכשלת — תקן את הלייאוט לפני שליחת ה-JSON.
רק תמונות עם URL שסופק בתוכן. לעולם אל תמציא URL.

החזר JSON: { "slides": [{ "id": "slide-N", "slideType": "TYPE", "label": "שם בעברית", "background": { "type": "solid"|"gradient", "value": "..." }, "elements": [...] }] }`
}

// (buildSingleSlidePrompt removed — batch generation only)

// ═══════════════════════════════════════════════════════════
//  MAIN: generateAIPresentation (parallel 3-batch)
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
  const allBatches = buildSlideBatches(data, config)
  const flatSlides = allBatches.flat()

  console.log(`[SlideDesigner][${requestId}] ${allBatches.length} batches: ${allBatches.map(b => b.length).join(', ')} slides`)

  let allCurated: CuratedSlideContent[] = []
  try {
    allCurated = await curateSlideContent(flatSlides, data.brandName || '', designSystem.creativeDirection)
  } catch (err) {
    console.warn(`[SlideDesigner][${requestId}] Curation failed:`, err)
  }

  // Build curated batches aligned to the 3 batch groups
  let curatedOffset = 0
  const curatedBatches = allBatches.map(batch => {
    const batchCurated = allCurated.slice(curatedOffset, curatedOffset + batch.length)
    curatedOffset += batch.length
    return batchCurated.length > 0 ? batchCurated : undefined
  })

  // Generate all 3 batches in parallel
  console.log(`[SlideDesigner][${requestId}] Generating ${allBatches.length} batches in parallel...`)
  let slideOffset = 0
  const batchPromises = allBatches.map((batch, bi) => {
    const ctx: BatchContext = { previousSlidesVisualSummary: '', slideIndex: slideOffset, totalSlides: flatSlides.length }
    slideOffset += batch.length
    return generateSlidesBatchAST(designSystem, batch, bi, data.brandName || '', ctx, curatedBatches[bi])
  })

  const batchResults = await Promise.allSettled(batchPromises)
  const pacingMap = await getPacingMap()
  const allGeneratedSlides: Slide[] = []

  for (let bi = 0; bi < batchResults.length; bi++) {
    const result = batchResults[bi]
    if (result.status === 'fulfilled') {
      for (let si = 0; si < result.value.length; si++) {
        const slide = result.value[si]
        const inputSlide = flatSlides[allGeneratedSlides.length]
        const pacing = pacingMap[slide.slideType] || pacingMap.brief
        const validResult = validateSlide(slide, designSystem, pacing, inputSlide?.imageUrl)
        const fixable = validResult.issues.filter(i => i.autoFixable)
        const finalSlide = fixable.length > 0 ? autoFixSlide(slide, fixable, designSystem, inputSlide?.imageUrl) : slide
        allGeneratedSlides.push(finalSlide)
      }
    } else {
      console.error(`[SlideDesigner][${requestId}] Batch ${bi + 1} failed:`, result.reason)
      for (const slide of allBatches[bi]) {
        allGeneratedSlides.push(createFallbackSlide(slide, designSystem, allGeneratedSlides.length))
      }
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
    metadata: { brandName: data.brandName, createdAt: new Date().toISOString(), version: 2, pipeline: 'slide-designer-v4-parallel', qualityScore: avgScore, duration: parseFloat(duration) },
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
  const allBatches = buildSlideBatches(d, config)
  const allSlides = allBatches.flat()

  console.log(`[SlideDesigner][${requestId}] Running Content Curator on ${allSlides.length} slides (${allBatches.length} batches: ${allBatches.map(b => b.length).join(', ')})...`)
  let allCurated: CuratedSlideContent[] = []
  try {
    allCurated = await curateSlideContent(allSlides, d.brandName || '', designSystem.creativeDirection)
    console.log(`[SlideDesigner][${requestId}] Content Curator complete: ${allCurated.length} slides curated`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[SlideDesigner][${requestId}] Content Curator failed (${msg}), will use raw content`)
  }

  // Align curated content to 3 batch groups
  let curatedOffset = 0
  const curatedBatches = allCurated.length > 0
    ? allBatches.map(batch => {
        const batchCurated = allCurated.slice(curatedOffset, curatedOffset + batch.length)
        curatedOffset += batch.length
        return batchCurated
      })
    : undefined

  const batchSizes = allBatches.map(b => b.length)
  const foundation = { designSystem, batches: allBatches, curatedBatches, allCurated, allSlides, brandName: d.brandName || '', clientLogo, leadersLogo, totalSlides: allSlides.length, batchCount: allBatches.length, batchSizes }
  console.log(`[SlideDesigner][${requestId}] Foundation complete: ${foundation.totalSlides} slides in ${allBatches.length} batches`)
  return foundation
}

export async function pipelineBatch(
  foundation: import('./slide-design').PipelineFoundation,
  batchIndex: number,
  _previousContext: import('./slide-design').BatchResult | null,
): Promise<import('./slide-design').BatchResult> {
  const requestId = `batch-${batchIndex}-${Date.now()}`
  const batch = foundation.batches[batchIndex]
  if (!batch || batch.length === 0) throw new Error(`Invalid batch index: ${batchIndex}`)

  // Calculate slide offset for this batch
  let slideOffset = 0
  for (let i = 0; i < batchIndex; i++) slideOffset += foundation.batches[i].length

  const curatedBatch = foundation.curatedBatches?.[batchIndex]
  console.log(`[SlideDesigner][${requestId}] Batch ${batchIndex + 1}/${foundation.batches.length} (${batch.length} slides, offset ${slideOffset})${curatedBatch ? ' +curated' : ' (raw)'}`)

  const batchContext: BatchContext = {
    previousSlidesVisualSummary: '',
    slideIndex: slideOffset,
    totalSlides: foundation.totalSlides,
  }

  try {
    const generatedSlides = await generateSlidesBatchAST(
      foundation.designSystem as PremiumDesignSystem,
      batch, batchIndex, foundation.brandName, batchContext, curatedBatch,
    )

    const pacingMap = await getPacingMap()
    const finalSlides: Slide[] = []
    for (let i = 0; i < generatedSlides.length; i++) {
      const slide = generatedSlides[i]
      const inputSlide = batch[i]
      const pacing = pacingMap[slide.slideType] || pacingMap.brief
      const validResult = validateSlide(slide, foundation.designSystem as PremiumDesignSystem, pacing, inputSlide?.imageUrl)
      const fixable = validResult.issues.filter(issue => issue.autoFixable)
      const finalSlide = fixable.length > 0
        ? autoFixSlide(slide, fixable, foundation.designSystem as PremiumDesignSystem, inputSlide?.imageUrl)
        : slide
      finalSlides.push(finalSlide)
    }

    console.log(`[SlideDesigner][${requestId}] Batch ${batchIndex + 1} done: ${finalSlides.length} slides`)
    return { slides: finalSlides, visualSummary: '', slideIndex: slideOffset + finalSlides.length }
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Batch ${batchIndex + 1} failed:`, error)
    const fallbackSlides = batch.map((slide, i) => createFallbackSlide(slide, foundation.designSystem as PremiumDesignSystem, slideOffset + i))
    return { slides: fallbackSlides, visualSummary: '', slideIndex: slideOffset + fallbackSlides.length }
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
