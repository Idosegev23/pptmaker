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

/** Sticky fallback — once Pro 503s, skip it for all subsequent batch calls in this generation */
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
        console.log(`[SlideDesigner][${requestId}] Design system ready. Style: ${parsed.effects?.decorativeStyle} (model: ${model})`)
        return parsed
      }
      throw new Error(`Invalid design system — parsed colors missing`)
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Design system attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)

      // Mark Pro as unavailable for sticky fallback
      if (attempt === 0 && (msg.includes('503') || msg.includes('fetch failed') || msg.includes('UNAVAILABLE') || msg.includes('overloaded'))) {
        _proUnavailable = true
        console.log(`[SlideDesigner][${requestId}] 🔴 Marked ${model} as unavailable — batches will skip to fallback`)
      }

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
      // Safety net: if curated content is too thin (only headline, no body/bullets/cards),
      // inject raw content so the model has data to work with
      const hasSubstance = curated.bodyText || curated.bulletPoints?.length || curated.cards?.length || curated.keyNumber || curated.tagline
      if (!hasSubstance && slide.content && Object.keys(slide.content).length > 1) {
        const rawStr = JSON.stringify(slide.content, null, 1)
        if (rawStr.length > 20 && rawStr.length < 2000) {
          contentBlock += `\n  <supplementary_data>\n${rawStr}\n  </supplementary_data>`
        }
      }
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

  // Determine narrative rhythm for this batch
  const batchPosition = batchContext.totalSlides > 0
    ? batchContext.slideIndex / batchContext.totalSlides
    : 0
  const rhythm = batchPosition <= 0.33
    ? { arc: 'opening' as const, description: 'Opening arc — build curiosity, introduce the brand. More whitespace, spacious layouts. Color: darker/cooler, accent sparingly. Max 2 consecutive image slides, then 1 typography-only. DEPTH: heavy shadows (Tier 2 boxShadow on hero elements), cinematic image filter "brightness(0.7) contrast(1.15)", tight negative letterSpacing on titles.' }
    : batchPosition <= 0.66
    ? { arc: 'core' as const, description: 'Core content — densest section. Tighter spacing, more cards, bolder colors. Accent used freely. Maintain visual variety. DEPTH: Tier 1 boxShadow on all cards, introduce 1 glassmorphism card (backdropFilter: "blur(16px) saturate(1.8)" + semi-transparent fill), aurora gradient backgrounds, textStroke watermarks on 2+ slides.' }
    : { arc: 'resolution' as const, description: 'Resolution — transition from dense to spacious. Final slide = maximum whitespace, deep breath. Color returns to restraint. DEPTH: Tier 2 boxShadow only on closing CTA, largest textStroke watermark, textShadow glow on closing title.' }

  const prompt = buildBatchPrompt(brandName, cd, colors, typo, effects, motif, designSystem, batchContext, slidesDescription, slides.length, rhythm)

  // Retry with model fallback
  const batchSysInstruction = await getSystemInstruction()
  const batchModels = await getBatchModels()

  // Sticky fallback: if Pro already 503'd in this generation, skip directly to fallback model
  const allAttempts: Array<{ model: string; thinking: ThinkingLevel; label: string }> = [
    { model: batchModels[0], thinking: resolvedThinking, label: `${batchModels[0]} (${thinkingLevel})` },
    ...(resolvedThinking !== ThinkingLevel.LOW
      ? [{ model: batchModels[0], thinking: ThinkingLevel.LOW, label: `${batchModels[0]} (LOW fallback)` }]
      : []),
    ...(batchModels[1] !== batchModels[0]
      ? [{ model: batchModels[1], thinking: ThinkingLevel.HIGH, label: `${batchModels[1]} (HIGH fallback)` }]
      : []),
  ]

  // If Pro is known-unavailable, skip straight to fallback model
  const attempts = _proUnavailable
    ? allAttempts.filter(a => a.model !== batchModels[0])
    : allAttempts

  if (_proUnavailable) {
    console.log(`[SlideDesigner][${requestId}] ⚡ Sticky fallback — skipping ${batchModels[0]} (known 503), going straight to ${batchModels[1]}`)
  }

  // === DEBUG: Log prompt to file ===
  const debugDir = '/tmp/slide-debug'
  try {
    const { mkdirSync, writeFileSync } = await import('fs')
    mkdirSync(debugDir, { recursive: true })
    writeFileSync(`${debugDir}/batch-${batchIndex}-prompt.txt`, prompt, 'utf8')
    console.log(`[SlideDesigner][${requestId}] 📝 Prompt saved to ${debugDir}/batch-${batchIndex}-prompt.txt (${prompt.length} chars)`)
  } catch { /* ignore fs errors */ }

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
        noGlobalFallback: true,
      })

      // === DEBUG: Log raw response to file ===
      try {
        const { writeFileSync } = await import('fs')
        writeFileSync(`${debugDir}/batch-${batchIndex}-response-raw.json`, batchResult.text || '', 'utf8')
        console.log(`[SlideDesigner][${requestId}] 📝 Raw response saved to ${debugDir}/batch-${batchIndex}-response-raw.json (${(batchResult.text || '').length} chars, model: ${label})`)
      } catch { /* ignore */ }

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
        // === DEBUG: Log parsed + sanitized to file ===
        try {
          const { writeFileSync } = await import('fs')
          writeFileSync(`${debugDir}/batch-${batchIndex}-parsed.json`, JSON.stringify(parsed, null, 2), 'utf8')
        } catch { /* ignore */ }

        const generatedSlides = parsed.slides.map((slide, i) => {
          const resolvedType = (slide.slideType || slides[i]?.slideType || 'closing') as SlideType
          // Enforce archetype — fill from LAYOUT_MAP if model didn't return it
          const archetype = (slide as unknown as Record<string, unknown>).archetype as string | undefined
          const resolvedArchetype = archetype && archetype !== 'N/A' && archetype.trim().length > 2
            ? archetype
            : LAYOUT_MAP[resolvedType] || LAYOUT_MAP.brief
          return {
            id: slide.id || `slide-${batchContext.slideIndex + i}`,
            slideType: resolvedType,
            archetype: resolvedArchetype,
            label: slide.label || slides[i]?.title || `שקף ${batchContext.slideIndex + i + 1}`,
            background: slide.background || { type: 'solid' as const, value: colors.background },
            elements: (slide.elements || []).map((el, j) =>
              sanitizeElement(el, j, batchContext.slideIndex + i, colors)
            ),
          }
        })

        // If model returned fewer slides than expected, fill in with fallbacks
        if (generatedSlides.length < slides.length) {
          console.warn(`[SlideDesigner][${requestId}] ⚠️ Got ${generatedSlides.length}/${slides.length} slides — filling missing with fallbacks`)
          for (let mi = generatedSlides.length; mi < slides.length; mi++) {
            const fb = buildFallbackSlide(slides[mi], mi, batchContext, colors)
            generatedSlides.push({ ...fb, archetype: LAYOUT_MAP[fb.slideType] || LAYOUT_MAP.brief })
          }
        }

        console.log(`[SlideDesigner][${requestId}] Generated ${generatedSlides.length} AST slides (${label})`)
        return generatedSlides
      }
      throw new Error('No slides in AST response')
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Batch attempt ${attempt + 1}/${attempts.length} failed (${label}): ${msg}`)

      // Mark Pro as unavailable for sticky fallback (503/overloaded/fetch fail)
      if (model === batchModels[0] && (msg.includes('503') || msg.includes('fetch failed') || msg.includes('UNAVAILABLE') || msg.includes('overloaded'))) {
        _proUnavailable = true
        console.log(`[SlideDesigner][${requestId}] 🔴 Marked ${batchModels[0]} as unavailable — subsequent batches will skip to fallback`)
      }

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

/** Quick CSS shadow/filter syntax check — reject garbage strings from AI */
function isValidCssShadow(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  // Must contain at least one number with px or a recognized keyword
  return /\d+px|rgba?\(|hsla?\(|inset|blur|brightness|contrast|saturate/.test(value)
}

function sanitizeElement(
  el: SlideElement,
  elIndex: number,
  slideIndex: number,
  colors: PremiumDesignSystem['colors'],
): SlideElement {
  const base = { ...el, id: el.id || `el-${slideIndex}-${elIndex}` }

  // Clean up cross-type fields that the flat schema forces on all elements
  const raw = base as unknown as Record<string, unknown>
  if (base.type === 'text') {
    // Remove shape/image fields that don't belong on text
    if (!raw.fill || raw.fill === 'transparent') delete raw.fill
    if (!raw.src) delete raw.src
    if (!raw.shapeType) delete raw.shapeType
    if (!raw.objectFit) delete raw.objectFit
  } else if (base.type === 'shape') {
    // Remove text/image fields that don't belong on shapes
    if (!raw.content) delete raw.content
    if (!raw.color) delete raw.color
    if (!raw.role) delete raw.role
    if (!raw.src) delete raw.src
    if (!raw.objectFit) delete raw.objectFit
    if (!raw.fontSize) delete raw.fontSize
    if (!raw.fontWeight) delete raw.fontWeight
  } else if (base.type === 'image') {
    // Remove text/shape fields that don't belong on images
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
    // Infer role first (needed for other defaults)
    if (!txt.role) {
      txt.role = txt.fontSize && txt.fontSize >= 80 ? 'title'
        : txt.fontSize && txt.fontSize >= 40 ? 'subtitle'
        : txt.fontSize && txt.fontSize <= 16 ? 'caption'
        : 'body'
    }
    // Color based on role: readable text gets text color, decorative/muted gets muted
    if (!txt.color) {
      if (txt.role === 'decorative') {
        txt.color = `${colors.text || '#F5F5F7'}15` // very faint for watermarks
      } else if (txt.role === 'caption' || txt.role === 'label') {
        txt.color = colors.muted || `${colors.text || '#F5F5F7'}80`
      } else {
        txt.color = colors.text || '#F5F5F7'
      }
    }
    if (!txt.textAlign) txt.textAlign = 'right'
    if (!txt.fontWeight) {
      txt.fontWeight = txt.role === 'title' ? 900
        : txt.role === 'subtitle' ? 700
        : txt.role === 'decorative' ? 900
        : txt.role === 'label' ? 300
        : 400
    }
    if (!txt.fontSize) {
      txt.fontSize = txt.role === 'title' ? 64
        : txt.role === 'subtitle' ? 32
        : txt.role === 'caption' ? 14
        : txt.role === 'label' ? 14
        : 20
    }
    if (txt.opacity === undefined) txt.opacity = 1
    // Fix common issue: decorative text should have low opacity, not full
    if (txt.role === 'decorative' && txt.opacity > 0.3 && txt.fontSize >= 150) {
      txt.opacity = 0.08
    }
    // Default letterSpacing: labels/captions get wide, large titles get tight
    if (txt.letterSpacing === undefined || txt.letterSpacing === 0) {
      if (txt.role === 'label' || txt.role === 'caption') {
        txt.letterSpacing = 4
      } else if (txt.role === 'title' && txt.fontSize >= 60) {
        txt.letterSpacing = -2
      }
    }
    // Validate textShadow — delete if malformed
    if (txt.textShadow && !isValidCssShadow(txt.textShadow)) {
      delete txt.textShadow
    }
    // Validate boxShadow — delete if malformed
    if (txt.boxShadow && !isValidCssShadow(txt.boxShadow)) {
      delete txt.boxShadow
    }
    // Ensure text has content
    if (!txt.content) txt.content = ''
    return txt as unknown as SlideElement
  }

  if (base.type === 'shape') {
    const shape = base as ShapeElement
    if (!shape.fill) {
      // If it's a card-like shape (has border or borderRadius), give it cardBg
      if (shape.borderRadius || shape.border) {
        shape.fill = colors.cardBg || '#252527'
      } else {
        shape.fill = 'transparent'
      }
    }
    if (!shape.shapeType) shape.shapeType = 'decorative'
    // Default boxShadow for card shapes
    if ((shape.shapeType as string) === 'card' && !shape.boxShadow) {
      shape.boxShadow = '0 4px 20px rgba(0,0,0,0.2)'
    }
    // Validate boxShadow
    if (shape.boxShadow && !isValidCssShadow(shape.boxShadow)) {
      delete shape.boxShadow
    }
    // backdropFilter shapes: ensure fill is semi-transparent
    if (shape.backdropFilter) {
      if (!isValidCssShadow(shape.backdropFilter)) {
        delete shape.backdropFilter
      } else {
        // Convert solid fill to semi-transparent for glass effect
        if (shape.fill && !shape.fill.includes('rgba') && !shape.fill.includes('transparent')) {
          shape.fill = 'rgba(255,255,255,0.08)'
        }
        if (!shape.border) {
          shape.border = '1px solid rgba(255,255,255,0.12)'
        }
      }
    }
    return shape as unknown as SlideElement
  }

  if (base.type === 'image') {
    const img = base as ImageElement
    if (!img.objectFit) img.objectFit = 'cover'
    if (!img.src) img.src = ''
    // Validate filter syntax
    if (img.filter && !isValidCssShadow(img.filter)) {
      delete img.filter
    }
    // Validate boxShadow
    if (img.boxShadow && !isValidCssShadow(img.boxShadow)) {
      delete img.boxShadow
    }
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
<typography display="${typo.displaySize}px" heading="${typo.headingSize}px" subheading="${typo.subheadingSize}px" body="${typo.bodySize}px" caption="${typo.captionSize}px" spacing_tight="${typo.letterSpacingTight}" spacing_wide="${typo.letterSpacingWide}" weight_pairs="${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}" line_tight="${typo.lineHeightTight}" line_relaxed="${typo.lineHeightRelaxed}" />
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
CRITICAL ARCHETYPE RULE: Each slide MUST use the layout_directive archetype from its <slide> tag. Return it in the "archetype" field (e.g. "typographic-brutalism", "bento-box", "magazine-spread", "data-art", "split-screen", "swiss-grid", "diagonal-grid", "overlapping-zindex"). Do NOT return "N/A" or empty — pick from the archetype list.
Each slide must have a unique composition — never repeat the same title position two slides in a row.
TITLE POSITION: Title (role="title") must be in the TOP THIRD of the slide (y < 300) except for closing slide. NEVER place title at y > 400. Title fontSize MUST be at least ${typo.headingSize}px for regular slides, ${typo.displaySize}px for cover/bigIdea/insight/closing.
CANVAS BLEED: At least 1-2 decorative shapes per slide should extend beyond the 1920×1080 canvas (negative x/y or width/height exceeding bounds). This creates premium editorial feel.
UNIQUE CONTENT: Each slide MUST have unique card titles and body text. Do NOT repeat the same cards or text across different slides — each slideType covers a different topic.
DEPTH HIERARCHY: Use boxShadow on card shapes ("0 4px 20px rgba(0,0,0,0.2)"), textShadow on hero titles ("0 0 40px rgba(accent,0.25)"), filter on images ("brightness(0.9) contrast(1.05)"). Include at least 1 glass card (backdropFilter) in core batch. At least 2 decorative shapes per content slide.
</task>

<validation>
Before returning JSON, verify each slide passes ALL checks:
1. Element count: 6-15 elements per slide.
2. Title fontSize >= ${typo.headingSize}px (hero slides: ${typo.displaySize}px). Title at y < 300.
3. Font ratio: max_fontSize / min_fontSize >= 4:1 (peak slides: >= 10:1).
4. No text directly on image without gradient overlay shape between them.
5. Body text width <= 700px.
6. All readable text: textAlign = "right" (RTL).
7. No content element extends beyond 1920x1080 canvas (decorative bleeds OK).
8. Every text has color. Every shape has fill. Every image has src from provided URLs only.
9. Card shapes contain text elements inside them.
10. No duplicate content between slides — each slide has unique text.
If any check fails, fix before returning.
</validation>

Return JSON: { "slides": [{ "id": "slide-N", "slideType": "TYPE", "archetype": "ARCHETYPE_NAME", "label": "שם בעברית", "background": { "type": "solid"|"gradient", "value": "..." }, "elements": [...] }] }`
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

  // Reset sticky fallback for each new presentation generation
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
