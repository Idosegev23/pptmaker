/**
 * Gemini AI Slide Designer — Clean 2-Step Pipeline
 *
 * 2-Step process:
 * 1. generateDesignSystem() → Brand design tokens (colors, typography, spacing, effects)
 * 2. generateSlidesBatchAST() → JSON AST slides on 1920×1080 canvas
 *
 * Optimized for Gemini 3.1 Pro:
 * - responseMimeType: 'application/json'
 * - maxOutputTokens: 32000 (prevents truncation)
 * - ThinkingLevel enum for predictable reasoning
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type {
  Presentation,
  Slide,
  DesignSystem,
  SlideType,
  FontWeight,
} from '@/types/presentation'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3.1-pro-preview'

// ─── Types ─────────────────────────────────────────────

interface BrandDesignInput {
  brandName: string
  industry?: string
  brandPersonality?: string[]
  brandColors: {
    primary: string
    secondary: string
    accent: string
    background?: string
    text?: string
    style?: string
    mood?: string
  }
  logoUrl?: string
  coverImageUrl?: string
  targetAudience?: string
}

interface SlideContentInput {
  slideType: string
  title: string
  content: Record<string, unknown>
  imageUrl?: string
}

/** Premium Design System — extended design tokens */
interface PremiumDesignSystem extends DesignSystem {
  colors: {
    primary: string; secondary: string; accent: string
    background: string; text: string; cardBg: string; cardBorder: string
    gradientStart: string; gradientEnd: string; muted: string; highlight: string
    auroraA: string; auroraB: string; auroraC: string
  }
  fonts: { heading: string; body: string }
  direction: 'rtl' | 'ltr'
  typography: {
    displaySize: number; headingSize: number; subheadingSize: number
    bodySize: number; captionSize: number
    letterSpacingTight: number; letterSpacingWide: number
    lineHeightTight: number; lineHeightRelaxed: number
    weightPairs: [number, number][]
  }
  spacing: { unit: number; cardPadding: number; cardGap: number; safeMargin: number }
  effects: {
    borderRadius: 'sharp' | 'soft' | 'pill'
    borderRadiusValue: number
    decorativeStyle: 'geometric' | 'organic' | 'minimal' | 'brutalist'
    shadowStyle: 'none' | 'fake-3d' | 'glow'
    auroraGradient: string
  }
  motif: { type: string; opacity: number; color: string; implementation: string }
}

interface BatchContext {
  previousSlidesVisualSummary: string
  slideIndex: number
  totalSlides: number
}

interface PacingDirective {
  energy: 'calm' | 'building' | 'peak' | 'breath' | 'finale'
  density: 'minimal' | 'balanced' | 'dense'
  surprise: boolean
  maxElements: number
  minWhitespace: number
}

interface ValidationResult {
  valid: boolean
  score: number
  issues: ValidationIssue[]
}

interface ValidationIssue {
  severity: 'critical' | 'warning' | 'suggestion'
  category: string
  message: string
  elementId?: string
  autoFixable: boolean
}

interface BoundingBox { x: number; y: number; width: number; height: number }

// Staged pipeline interfaces
export interface PipelineFoundation {
  designSystem: PremiumDesignSystem
  batches: SlideContentInput[][]
  brandName: string
  clientLogo: string
  leadersLogo: string
  totalSlides: number
}

export interface BatchResult {
  slides: Slide[]
  visualSummary: string
  slideIndex: number
}

// ─── Pacing Map ────────────────────────────────────────

const PACING_MAP: Record<string, PacingDirective> = {
  cover:     { energy: 'peak', density: 'minimal', surprise: true, maxElements: 8, minWhitespace: 40 },
  brief:     { energy: 'calm', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
  goals:     { energy: 'building', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
  audience:  { energy: 'building', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
  insight:   { energy: 'peak', density: 'minimal', surprise: true, maxElements: 8, minWhitespace: 40 },
  strategy:  { energy: 'building', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
  bigIdea:   { energy: 'peak', density: 'minimal', surprise: true, maxElements: 10, minWhitespace: 35 },
  approach:  { energy: 'calm', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
  deliverables: { energy: 'calm', density: 'dense', surprise: false, maxElements: 18, minWhitespace: 20 },
  metrics:   { energy: 'building', density: 'dense', surprise: false, maxElements: 16, minWhitespace: 20 },
  influencerStrategy: { energy: 'calm', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 30 },
  influencers: { energy: 'breath', density: 'dense', surprise: false, maxElements: 20, minWhitespace: 15 },
  closing:   { energy: 'finale', density: 'minimal', surprise: true, maxElements: 8, minWhitespace: 45 },
}

// ─── Color Helpers ─────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace('#', '').match(/.{2}/g)
  if (!match || match.length < 3) return null
  return { r: parseInt(match[0], 16), g: parseInt(match[1], 16), b: parseInt(match[2], 16) }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1)
  const c2 = hexToRgb(hex2)
  if (!c1 || !c2) return 1
  const l1 = relativeLuminance(c1.r, c1.g, c1.b)
  const l2 = relativeLuminance(c2.r, c2.g, c2.b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function adjustLightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const adjust = (v: number) => Math.min(255, Math.max(0, Math.round(v + amount * 255)))
  const r = adjust(rgb.r).toString(16).padStart(2, '0')
  const g = adjust(rgb.g).toString(16).padStart(2, '0')
  const b = adjust(rgb.b).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function validateAndFixColors(colors: PremiumDesignSystem['colors']): PremiumDesignSystem['colors'] {
  const fixed = { ...colors }

  // Text on background: need 4.5:1
  let textContrast = contrastRatio(fixed.text, fixed.background)
  let attempts = 0
  while (textContrast < 4.5 && attempts < 20) {
    fixed.text = adjustLightness(fixed.text, textContrast < 2 ? 0.1 : 0.03)
    textContrast = contrastRatio(fixed.text, fixed.background)
    attempts++
  }

  // Accent on background: need 3:1
  let accentContrast = contrastRatio(fixed.accent, fixed.background)
  attempts = 0
  while (accentContrast < 3 && attempts < 20) {
    fixed.accent = adjustLightness(fixed.accent, 0.05)
    accentContrast = contrastRatio(fixed.accent, fixed.background)
    attempts++
  }

  // Card background must differ from main background
  if (contrastRatio(fixed.cardBg, fixed.background) < 1.1) {
    fixed.cardBg = adjustLightness(fixed.cardBg, 0.06)
  }

  // Muted text: 3:1 minimum
  let mutedContrast = contrastRatio(fixed.muted, fixed.background)
  attempts = 0
  while (mutedContrast < 3 && attempts < 20) {
    fixed.muted = adjustLightness(fixed.muted, 0.04)
    mutedContrast = contrastRatio(fixed.muted, fixed.background)
    attempts++
  }

  return fixed
}

// ─── Spatial Helpers ───────────────────────────────────

function computeOccupiedArea(elements: BoundingBox[]): number {
  const canvasArea = 1920 * 1080
  let occupied = 0
  for (const el of elements) occupied += el.width * el.height
  return Math.min(occupied / canvasArea, 1)
}

function computeBalanceScore(elements: BoundingBox[]): number {
  const cols = 4, rows = 3
  const cellW = 1920 / cols, cellH = 1080 / rows
  const cells = Array.from({ length: cols * rows }, () => 0)

  for (const el of elements) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * cellW, cy = r * cellH
        const overlapX = Math.max(0, Math.min(el.x + el.width, cx + cellW) - Math.max(el.x, cx))
        const overlapY = Math.max(0, Math.min(el.y + el.height, cy + cellH) - Math.max(el.y, cy))
        cells[r * cols + c] += overlapX * overlapY
      }
    }
  }

  const maxCell = Math.max(...cells)
  if (maxCell === 0) return 0.5
  const normalized = cells.map(c => c / maxCell)
  const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length
  const variance = normalized.reduce((a, b) => a + (b - mean) ** 2, 0) / normalized.length
  return Math.max(0, 1 - variance * 2)
}

// ─── Format Helper ─────────────────────────────────────

function formatNum(n?: number): string {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}

// ═══════════════════════════════════════════════════════════
//  STEP 1: GENERATE DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════

async function generateDesignSystem(
  brand: BrandDesignInput,
): Promise<PremiumDesignSystem> {
  const requestId = `ds-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 1: Design System for "${brand.brandName}"`)

  const prompt = `אתה Art Director ב-Pentagram. צור מערכת עיצוב למצגת WOW עבור "${brand.brandName}".

## מידע על המותג:
- תעשייה: ${brand.industry || 'לא ידוע'}
- אישיות: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
- צבע ראשי: ${brand.brandColors.primary}
- צבע משני: ${brand.brandColors.secondary}
- צבע הדגשה: ${brand.brandColors.accent}
- סגנון: ${brand.brandColors.style || 'corporate'}
- קהל יעד: ${brand.targetAudience || 'מבוגרים 25-45'}

## דרישות:
צור Design System פרימיום שמכבד את הצבעים המקוריים אבל מעשיר אותם.
חשוב כמו Creative Director — מה המטאפורה הויזואלית? מה המתח? מה עושה את המצגת הזו מיוחדת?

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
- displaySize: 80-140 (שער)
- headingSize: 48-64
- subheadingSize: 28-36
- bodySize: 20-24
- captionSize: 14-16
- letterSpacingTight: -5 עד -1 (כותרות)
- letterSpacingWide: 2 עד 8 (subtitles)
- lineHeightTight: 0.9-1.05 (כותרות)
- lineHeightRelaxed: 1.4-1.6 (גוף)
- weightPairs: [[heading, body]] — למשל [[900,300]] או [[700,400]]

### מרווחים (spacing):
- unit: 8, cardPadding: 32-48, cardGap: 24-40, safeMargin: 80

### אפקטים (effects):
- borderRadius: "sharp" / "soft" / "pill" + borderRadiusValue
- decorativeStyle: "geometric" / "organic" / "minimal" / "brutalist"
- shadowStyle: "none" / "fake-3d" / "glow"
- auroraGradient: מחרוזת CSS radial-gradient

### מוטיב חוזר (motif):
- type: (diagonal-lines / dots / circles / angular-cuts / wave / grid-lines / organic-blobs / triangles)
- opacity: 0.05-0.2, color: צבע, implementation: תיאור

פונט: Heebo. החזר JSON בלבד.`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } },
    })

    const parsed = parseGeminiJson<PremiumDesignSystem>(response.text || '')
    if (parsed?.colors?.primary) {
      parsed.colors = validateAndFixColors(parsed.colors)
      parsed.fonts = parsed.fonts || { heading: 'Heebo', body: 'Heebo' }
      parsed.direction = 'rtl'
      console.log(`[SlideDesigner][${requestId}] Design system ready. Style: ${parsed.effects?.decorativeStyle}`)
      return parsed
    }
    throw new Error('Invalid design system response')
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Design system failed, using fallback:`, error)
    return buildFallbackDesignSystem(brand)
  }
}

function buildFallbackDesignSystem(brand: BrandDesignInput): PremiumDesignSystem {
  return {
    colors: validateAndFixColors({
      primary: brand.brandColors.primary, secondary: brand.brandColors.secondary,
      accent: brand.brandColors.accent, background: '#0a0a12', text: '#f0f0f5',
      cardBg: '#14142a', cardBorder: brand.brandColors.primary + '25',
      gradientStart: brand.brandColors.primary, gradientEnd: brand.brandColors.accent,
      muted: '#808090', highlight: brand.brandColors.accent,
      auroraA: brand.brandColors.primary + '50', auroraB: brand.brandColors.accent + '50',
      auroraC: brand.brandColors.secondary + '60',
    }),
    fonts: { heading: 'Heebo', body: 'Heebo' }, direction: 'rtl',
    typography: {
      displaySize: 104, headingSize: 56, subheadingSize: 32, bodySize: 22, captionSize: 15,
      letterSpacingTight: -3, letterSpacingWide: 5,
      lineHeightTight: 1.0, lineHeightRelaxed: 1.5,
      weightPairs: [[800, 400]],
    },
    spacing: { unit: 8, cardPadding: 40, cardGap: 32, safeMargin: 80 },
    effects: {
      borderRadius: 'soft', borderRadiusValue: 16,
      decorativeStyle: 'geometric', shadowStyle: 'none',
      auroraGradient: `radial-gradient(circle at 20% 50%, ${brand.brandColors.primary}40 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${brand.brandColors.accent}30 0%, transparent 50%)`,
    },
    motif: { type: 'diagonal-lines', opacity: 0.08, color: brand.brandColors.primary, implementation: 'repeating-linear-gradient' },
  }
}

// ═══════════════════════════════════════════════════════════
//  STEP 2: GENERATE SLIDES (AST)
// ═══════════════════════════════════════════════════════════

async function generateSlidesBatchAST(
  designSystem: PremiumDesignSystem,
  slides: SlideContentInput[],
  batchIndex: number,
  brandName: string,
  batchContext: BatchContext,
): Promise<Slide[]> {
  const requestId = `sb-${batchIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 2: Batch ${batchIndex + 1} (${slides.length} slides)`)

  const colors = designSystem.colors
  const typo = designSystem.typography
  const effects = designSystem.effects
  const motif = designSystem.motif

  const simpleSlideDescs = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const contentJson = JSON.stringify(slide.content, null, 2)
    return `שקף ${globalIndex + 1}: "${slide.title}" (type: ${slide.slideType})
${slide.imageUrl ? `תמונה: ${slide.imageUrl}` : 'ללא תמונה — השתמש בצורות וצבעים'}
תוכן: ${contentJson}`
  }).join('\n\n')

  const prompt = `אתה Art Director / Creative Director בסוכנות פרסום מובילה.
אתה מקבל מותג, Design System, ותוכן — ואתה מחליט על הלייאוט, הקומפוזיציה, והאווירה הויזואלית.

עצב ${slides.length} שקפים למותג "${brandName}".

## זהות המותג (Design System שנוצר עבור המותג הזה)
Canvas: 1920x1080px | RTL (עברית) | פונט: Heebo
צבעים: primary ${colors.primary} | secondary ${colors.secondary} | accent ${colors.accent} | bg ${colors.background} | text ${colors.text} | cards ${colors.cardBg} | gradients ${colors.gradientStart}→${colors.gradientEnd}
טיפוגרפיה: display ${typo.displaySize}px | heading ${typo.headingSize}px weight ${typo.weightPairs[0]?.[0] || 800} | body ${typo.bodySize}px weight ${typo.weightPairs[0]?.[1] || 400} | caption ${typo.captionSize}px
letter-spacing: tight ${typo.letterSpacingTight} (כותרות) | wide ${typo.letterSpacingWide} (labels)
line-height: tight ${typo.lineHeightTight} (כותרות) | relaxed ${typo.lineHeightRelaxed} (גוף)
אפקטים: borderRadius ${effects.borderRadiusValue}px (${effects.borderRadius}) | decorativeStyle: ${effects.decorativeStyle} | shadow: ${effects.shadowStyle}
מוטיב: ${motif.type} | opacity ${motif.opacity} | ${motif.implementation}
aurora: ${effects.auroraGradient}

## התפקיד שלך
אתה מחליט על הלייאוט של כל שקף. אין תבנית קבועה — אתה בוחר קומפוזיציה, חלוקת שטח, מיקום אלמנטים, גדלי פונט, ו-shapes דקורטיביים בהתאם ל:
1. **אופי המותג** — המותג הוא ${effects.decorativeStyle}. שמור על השפה הויזואלית הזו בכל שקף
2. **תוכן השקף** — שקף עם מספר אחד גדול ≠ שקף עם 4 כרטיסים ≠ שקף עם תמונה
3. **מקצב** — שקפים דרמטיים (שער, תובנה, רעיון) = מינימום אלמנטים, מקסימום impact. שקפי תוכן = יותר צפיפות
4. **מגוון** — כל שקף חייב להיות שונה מהקודם. שנה: כיוון חלוקה, מיקום כותרת, פרופורציות, שימוש בצבע

חשוב כמו Art Director: מה המטאפורה? מה הסיפור הויזואלי? איך המותג הזה מרגיש?

## כללים טכניים
- textAlign: "right" תמיד (RTL). כל הטקסט בעברית (חוץ ממספרים ושמות באנגלית)
- zIndex: 0-1 רקע, 2-3 דקורציה, 4-6 תוכן, 7-10 כותרות
- אסור: box-shadow, blur, filter
- חובה בכל שקף: לפחות 1 shape דקורטיבי + כותרת + תוכן
- תמונות: אם יש imageUrl, חובה image element בגודל ≥40% מהשקף
- מספרים: כשיש נתון מספרי (budget, reach, followers) — הציג אותו בפונט ענק (80-140px)
- כותרות HERO (שער, תובנה, רעיון מרכזי): display size (${typo.displaySize}px), letterSpacing ${typo.letterSpacingTight}
- shapes דקורטיביים: השתמש ב-${motif.type} כמוטיב חוזר, opacity ${motif.opacity}

## דוגמה — שקף ברמת WOW (הרמה הזו!):
\`\`\`json
{
  "id": "slide-5", "slideType": "insight", "label": "התובנה",
  "background": { "type": "gradient", "value": "linear-gradient(135deg, ${colors.background} 0%, ${colors.secondary}dd 100%)" },
  "elements": [
    { "id": "s-1", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0, "shapeType": "background", "fill": "radial-gradient(circle at 80% 30%, ${colors.accent}15 0%, transparent 60%)", "opacity": 1 },
    { "id": "s-2", "type": "shape", "x": 1400, "y": -200, "width": 800, "height": 800, "zIndex": 1, "shapeType": "decorative", "fill": "${colors.primary}", "opacity": 0.06, "borderRadius": 999, "rotation": 0 },
    { "id": "s-3", "type": "shape", "x": 100, "y": 180, "width": 6, "height": 200, "zIndex": 3, "shapeType": "decorative", "fill": "${colors.accent}", "opacity": 0.9 },
    { "id": "t-1", "type": "text", "x": 140, "y": 120, "width": 300, "height": 40, "zIndex": 8, "content": "THE INSIGHT", "fontSize": 16, "fontWeight": 400, "color": "${colors.accent}", "textAlign": "right", "role": "label", "letterSpacing": 8 },
    { "id": "t-2", "type": "text", "x": 140, "y": 200, "width": 1200, "height": 300, "zIndex": 10, "content": "הצרכן הישראלי מחפש חוויה אמיתית — לא עוד פרסומת", "fontSize": 72, "fontWeight": 800, "color": "${colors.text}", "textAlign": "right", "role": "title", "lineHeight": 1.05, "letterSpacing": -3 },
    { "id": "t-3", "type": "text", "x": 140, "y": 530, "width": 700, "height": 100, "zIndex": 7, "content": "מקור: מחקר שוק 2024 | n=2,400", "fontSize": 18, "fontWeight": 400, "color": "${colors.muted}", "textAlign": "right", "role": "caption", "lineHeight": 1.5 },
    { "id": "s-4", "type": "shape", "x": 140, "y": 660, "width": 200, "height": 2, "zIndex": 3, "shapeType": "divider", "fill": "${colors.accent}", "opacity": 0.4 }
  ]
}
\`\`\`

${batchContext.previousSlidesVisualSummary ? `## שקפים שכבר נוצרו (הבאים חייבים להיות שונים בלייאוט!):\n${batchContext.previousSlidesVisualSummary}` : ''}

## שקפים ליצירה
${simpleSlideDescs}

החזר JSON: { "slides": [{ "id": "slide-N", "slideType": "TYPE", "label": "שם", "background": { "type": "solid"|"gradient", "value": "..." }, "elements": [...] }] }`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        maxOutputTokens: 32000,
      },
    })

    const parsed = parseGeminiJson<{ slides: Slide[] }>(response.text || '')

    if (parsed?.slides?.length > 0) {
      console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} AST slides`)

      return parsed.slides.map((slide, i) => ({
        id: slide.id || `slide-${batchContext.slideIndex + i}`,
        slideType: (slide.slideType || slides[i]?.slideType || 'closing') as SlideType,
        label: slide.label || slides[i]?.title || `שקף ${batchContext.slideIndex + i + 1}`,
        background: slide.background || { type: 'solid', value: colors.background },
        elements: (slide.elements || []).map((el, j) => ({
          ...el,
          id: el.id || `el-${batchContext.slideIndex + i}-${j}`,
        })),
      }))
    }

    throw new Error('No slides in AST response')
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Batch ${batchIndex + 1} failed:`, error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════
//  VALIDATION + AUTO-FIX
// ═══════════════════════════════════════════════════════════

function validateSlide(
  slide: Slide,
  designSystem: PremiumDesignSystem,
  pacing: PacingDirective,
): ValidationResult {
  const issues: ValidationIssue[] = []
  let score = 100

  const elements = slide.elements || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textElements = elements.filter((e: any) => e.type === 'text')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentTexts = textElements.filter((e: any) => e.role !== 'decorative')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBoxes: BoundingBox[] = elements.map((e: any) => ({ x: e.x || 0, y: e.y || 0, width: e.width || 0, height: e.height || 0 }))

  // Contrast check
  for (const el of contentTexts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const color = (el as any).color
    if (color && !color.includes('transparent')) {
      const bgColor = designSystem.colors.background
      const cr = contrastRatio(color.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7), bgColor)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fontSize = (el as any).fontSize || 20
      const minContrast = fontSize >= 48 ? 3 : 4.5
      if (cr < minContrast) {
        issues.push({
          severity: 'critical', category: 'contrast',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          message: `contrast ${cr.toFixed(1)}:1 (min ${minContrast}:1)`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          elementId: (el as any).id, autoFixable: true,
        })
        score -= 15
      }
    }
  }

  // Element count
  if (elements.length > pacing.maxElements) {
    issues.push({ severity: 'warning', category: 'density', message: `${elements.length} elements (max ${pacing.maxElements})`, autoFixable: false })
    score -= 10
  }

  // Whitespace
  const whitespace = 1 - computeOccupiedArea(allBoxes)
  if (whitespace < pacing.minWhitespace) {
    issues.push({ severity: 'warning', category: 'whitespace', message: `Whitespace ${Math.round(whitespace * 100)}% (min ${Math.round(pacing.minWhitespace * 100)}%)`, autoFixable: false })
    score -= 8
  }

  // Safe zone
  for (const el of contentTexts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = el as any
    if ((e.x || 0) < 60 || ((e.x || 0) + (e.width || 0)) > 1860 || (e.y || 0) < 60 || ((e.y || 0) + (e.height || 0)) > 1020) {
      issues.push({ severity: 'warning', category: 'safe-zone', message: `Content outside safe zone`, elementId: e.id, autoFixable: true })
      score -= 5
    }
  }

  // Scale contrast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fontSizes = contentTexts.map((e: any) => e.fontSize || 20).filter((s: number) => s > 0)
  if (fontSizes.length >= 2) {
    const ratio = Math.max(...fontSizes) / Math.min(...fontSizes)
    const minRatio = pacing.energy === 'peak' ? 8 : 4
    if (ratio < minRatio) {
      issues.push({ severity: 'suggestion', category: 'scale', message: `Font ratio ${ratio.toFixed(1)}:1 (recommend ≥${minRatio}:1)`, autoFixable: false })
      score -= 5
    }
  }

  // Hierarchy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const titles = contentTexts.filter((e: any) => e.role === 'title')
  if (titles.length === 0 && slide.slideType !== 'cover') {
    issues.push({ severity: 'warning', category: 'hierarchy', message: 'No title element', autoFixable: false })
    score -= 10
  }

  // Balance
  const balance = computeBalanceScore(allBoxes)
  if (balance < 0.3) {
    issues.push({ severity: 'suggestion', category: 'balance', message: `Balance ${(balance * 100).toFixed(0)}/100`, autoFixable: false })
    score -= 5
  }

  return { valid: issues.filter(i => i.severity === 'critical').length === 0, score: Math.max(0, score), issues }
}

function autoFixSlide(slide: Slide, issues: ValidationIssue[], designSystem: PremiumDesignSystem): Slide {
  const fixed = { ...slide, elements: [...slide.elements] }

  for (const issue of issues) {
    if (!issue.autoFixable || !issue.elementId) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elIndex = fixed.elements.findIndex((e: any) => e.id === issue.elementId)
    if (elIndex === -1) continue

    if (issue.category === 'contrast') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = { ...fixed.elements[elIndex] } as any
      let color = el.color || '#ffffff'
      let attempts = 0
      while (contrastRatio(color, designSystem.colors.background) < 4.5 && attempts < 20) {
        color = adjustLightness(color, 0.05)
        attempts++
      }
      el.color = color
      fixed.elements[elIndex] = el
    }

    if (issue.category === 'safe-zone') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = { ...fixed.elements[elIndex] } as any
      el.x = Math.max(80, Math.min(el.x, 1920 - 80 - (el.width || 200)))
      el.y = Math.max(80, Math.min(el.y, 1080 - 80 - (el.height || 60)))
      fixed.elements[elIndex] = el
    }
  }

  return fixed
}

function checkVisualConsistency(slides: Slide[], _designSystem: PremiumDesignSystem): Slide[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTitles: { slideIndex: number; y: number; fontSize: number; element: any }[] = []

  slides.forEach((slide, si) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titles = (slide.elements || []).filter((e: any) => e.role === 'title' && e.type === 'text')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of titles) allTitles.push({ slideIndex: si, y: (t as any).y || 0, fontSize: (t as any).fontSize || 48, element: t })
  })

  if (allTitles.length < 3) return slides

  const regularTitles = allTitles.filter(t =>
    slides[t.slideIndex]?.slideType !== 'cover' && slides[t.slideIndex]?.slideType !== 'closing'
  )

  if (regularTitles.length > 0) {
    // Align title Y positions to median
    const medianY = regularTitles.map(t => t.y).sort((a, b) => a - b)[Math.floor(regularTitles.length / 2)]
    for (const t of regularTitles) {
      if (Math.abs(t.y - medianY) > 60) t.element.y = medianY
    }

    // Normalize heading font sizes
    const headingSizes = regularTitles.map(t => t.element.fontSize || 48)
    const medianSize = headingSizes.sort((a, b) => a - b)[Math.floor(headingSizes.length / 2)]
    for (const t of regularTitles) {
      if (Math.abs(t.fontSize - medianSize) > 6 && Math.abs(t.fontSize - medianSize) < 30) {
        t.element.fontSize = medianSize
      }
    }
  }

  return slides
}

// ═══════════════════════════════════════════════════════════
//  FALLBACK SLIDE
// ═══════════════════════════════════════════════════════════

function createFallbackSlide(input: SlideContentInput, designSystem: PremiumDesignSystem, index: number): Slide {
  const colors = designSystem.colors
  const typo = designSystem.typography
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const title = (input.content as any).headline || (input.content as any).brandName || input.title || `שקף ${index + 1}`

  return {
    id: `slide-fallback-${index}`,
    slideType: input.slideType as SlideType,
    label: input.title,
    background: { type: 'solid', value: colors.background },
    elements: [
      { id: `fb-${index}-bg`, type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
        shapeType: 'decorative', fill: `radial-gradient(circle at 50% 50%, ${colors.cardBg} 0%, ${colors.background} 100%)`, opacity: 1 },
      { id: `fb-${index}-line`, type: 'shape', x: 120, y: 200, width: 60, height: 4, zIndex: 4,
        shapeType: 'decorative', fill: colors.accent, opacity: 0.8 },
      { id: `fb-${index}-title`, type: 'text', x: 120, y: 220, width: 800, height: 100, zIndex: 10,
        content: title, fontSize: typo.headingSize, fontWeight: (typo.weightPairs[0]?.[0] || 800) as FontWeight,
        color: colors.text, textAlign: 'right', lineHeight: typo.lineHeightTight,
        letterSpacing: typo.letterSpacingTight, role: 'title' },
      { id: `fb-${index}-motif`, type: 'shape', x: -100, y: 800, width: 2200, height: 1, zIndex: 2,
        shapeType: 'decorative', fill: colors.muted, opacity: designSystem.motif.opacity, rotation: 15 },
    ],
  }
}

// ═══════════════════════════════════════════════════════════
//  DATA TYPES
// ═══════════════════════════════════════════════════════════

interface PremiumProposalData {
  brandName?: string
  issueDate?: string
  campaignName?: string
  campaignSubtitle?: string
  brandBrief?: string
  brandPainPoints?: string[]
  brandObjective?: string
  goals?: string[]
  goalsDetailed?: { title: string; description: string }[]
  targetGender?: string
  targetAgeRange?: string
  targetDescription?: string
  targetBehavior?: string
  targetInsights?: string[]
  keyInsight?: string
  insightSource?: string
  insightData?: string
  strategyHeadline?: string
  strategyDescription?: string
  strategyPillars?: { title: string; description: string }[]
  activityTitle?: string
  activityConcept?: string
  activityDescription?: string
  activityApproach?: { title: string; description: string }[]
  activityDifferentiator?: string
  deliverables?: string[]
  deliverablesDetailed?: { type: string; quantity: number; description: string; purpose: string }[]
  deliverablesSummary?: string
  budget?: number
  currency?: string
  potentialReach?: number
  potentialEngagement?: number
  cpe?: number
  cpm?: number
  estimatedImpressions?: number
  metricsExplanation?: string
  influencerStrategy?: string
  influencerCriteria?: string[]
  contentGuidelines?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  influencerResearch?: any
  scrapedInfluencers?: { name?: string; username?: string; profilePicUrl?: string; followers?: number; engagementRate?: number }[]
  enhancedInfluencers?: { name: string; username: string; profilePicUrl: string; categories: string[]; followers: number; engagementRate: number }[]
  _brandColors?: { primary: string; secondary: string; accent: string; background?: string; text?: string; style?: string; mood?: string; palette?: string[] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _brandResearch?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _scraped?: any
  _generatedImages?: Record<string, string>
  _extraImages?: { id: string; url: string; placement: string }[]
  _imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// ═══════════════════════════════════════════════════════════
//  SLIDE CONTENT BUILDER
// ═══════════════════════════════════════════════════════════

function buildSlideBatches(
  data: PremiumProposalData,
  config: { images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string } } = {},
): SlideContentInput[][] {
  const currency = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : '₪'

  const batch1: SlideContentInput[] = [
    { slideType: 'cover', title: 'שער', content: { brandName: data.brandName, campaignSubtitle: data.campaignSubtitle || data.strategyHeadline || 'הצעת שיתוף פעולה', issueDate: data.issueDate || new Date().toLocaleDateString('he-IL') }, imageUrl: config.images?.coverImage },
    { slideType: 'brief', title: 'למה התכנסנו?', content: { headline: 'למה התכנסנו?', brandBrief: data.brandBrief || '', painPoints: data.brandPainPoints || [], objective: data.brandObjective || '' }, imageUrl: config.images?.brandImage },
    { slideType: 'goals', title: 'מטרות הקמפיין', content: { headline: 'מטרות הקמפיין', goals: data.goalsDetailed || (data.goals || []).map(g => ({ title: g, description: '' })) } },
    { slideType: 'audience', title: 'קהל היעד', content: { headline: 'קהל היעד', gender: data.targetGender || '', ageRange: data.targetAgeRange || '', description: data.targetDescription || '', behavior: data.targetBehavior || '', insights: data.targetInsights || [] }, imageUrl: config.images?.audienceImage },
    { slideType: 'insight', title: 'התובנה המרכזית', content: { headline: 'התובנה המרכזית', keyInsight: data.keyInsight || '', source: data.insightSource || '', data: data.insightData || '' } },
  ]

  const batch2: SlideContentInput[] = [
    { slideType: 'strategy', title: 'האסטרטגיה', content: { headline: 'האסטרטגיה', strategyHeadline: data.strategyHeadline || '', description: data.strategyDescription || '', pillars: data.strategyPillars || [] } },
    { slideType: 'bigIdea', title: 'הרעיון המרכזי', content: { headline: data.activityTitle || 'הרעיון המרכזי', concept: data.activityConcept || '', description: data.activityDescription || '' }, imageUrl: config.images?.activityImage || config.images?.brandImage },
    { slideType: 'approach', title: 'הגישה שלנו', content: { headline: 'הגישה שלנו', approaches: data.activityApproach || [], differentiator: data.activityDifferentiator || '' } },
    { slideType: 'deliverables', title: 'תוצרים', content: { headline: 'תוצרים', deliverables: data.deliverablesDetailed || (data.deliverables || []).map(d => ({ type: d, quantity: 1, description: '' })), summary: data.deliverablesSummary || '' } },
    { slideType: 'metrics', title: 'יעדים ומדדים', content: { headline: 'יעדים ומדדים', budget: data.budget ? `${currency}${formatNum(data.budget)}` : '', reach: formatNum(data.potentialReach), engagement: formatNum(data.potentialEngagement), impressions: formatNum(data.estimatedImpressions), cpe: data.cpe ? `${currency}${data.cpe.toFixed(1)}` : '', explanation: data.metricsExplanation || '' } },
  ]

  const influencers = data.enhancedInfluencers || data.scrapedInfluencers?.map(i => ({
    name: i.name || i.username || '', username: i.username || '', profilePicUrl: i.profilePicUrl || '',
    categories: [] as string[], followers: i.followers || 0, engagementRate: i.engagementRate || 0,
  })) || []
  const aiRecs = data.influencerResearch?.recommendations || []

  const batch3: SlideContentInput[] = [
    { slideType: 'influencerStrategy', title: 'אסטרטגיית משפיענים', content: { headline: 'אסטרטגיית משפיענים', strategy: data.influencerStrategy || '', criteria: data.influencerCriteria || [], guidelines: data.contentGuidelines || [] } },
  ]
  if (influencers.length > 0 || aiRecs.length > 0) {
    batch3.push({
      slideType: 'influencers', title: 'משפיענים מומלצים',
      content: {
        headline: 'משפיענים מומלצים',
        influencers: influencers.slice(0, 6).map(inf => ({ name: inf.name, username: inf.username, profilePicUrl: inf.profilePicUrl, followers: formatNum(inf.followers), engagementRate: `${inf.engagementRate?.toFixed(1) || '0'}%`, categories: inf.categories?.join(', ') || '' })),
        aiRecommendations: aiRecs.slice(0, 6).map((rec: { name?: string; handle?: string; followers?: string; engagement?: string; whyRelevant?: string; profilePicUrl?: string }) => ({ name: rec.name || '', handle: rec.handle || '', followers: rec.followers || '', engagement: rec.engagement || '', reason: rec.whyRelevant || '', profilePicUrl: rec.profilePicUrl || '' })),
      },
    })
  }
  batch3.push({ slideType: 'closing', title: 'סיום', content: { brandName: data.brandName || '', headline: "LET'S CREATE TOGETHER", subheadline: `נשמח להתחיל לעבוד עם ${data.brandName}` } })

  return [batch1, batch2, batch3]
}

// ═══════════════════════════════════════════════════════════
//  MAIN: generateAIPresentation
// ═══════════════════════════════════════════════════════════

export async function generateAIPresentation(
  data: PremiumProposalData,
  config: {
    accentColor?: string
    brandLogoUrl?: string
    leadersLogoUrl?: string
    clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {}
): Promise<Presentation> {
  const requestId = `pres-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`[SlideDesigner][${requestId}] Starting for "${data.brandName}"`)
  console.log(`${'═'.repeat(50)}\n`)

  const brandColors = data._brandColors || {
    primary: config.accentColor || '#E94560',
    secondary: '#1A1A2E',
    accent: config.accentColor || '#E94560',
    style: 'corporate',
    mood: 'מקצועי',
  }

  const brandInput: BrandDesignInput = {
    brandName: data.brandName || 'Unknown',
    industry: data._brandResearch?.industry || '',
    brandPersonality: data._brandResearch?.brandPersonality || [],
    brandColors,
    logoUrl: config.clientLogoUrl || data._scraped?.logoUrl || config.brandLogoUrl || undefined,
    coverImageUrl: config.images?.coverImage || undefined,
    targetAudience: data.targetDescription || '',
  }

  // ── Step 1: Design System ──
  console.log(`[SlideDesigner] ── Step 1/2: Design System ──`)
  const designSystem = await generateDesignSystem(brandInput)

  // ── Step 2: Generate slides in batches ──
  console.log(`[SlideDesigner] ── Step 2/2: Slide Generation ──`)
  const allBatches = buildSlideBatches(data, config)

  let allSlides: Slide[] = []
  let visualSummary = ''
  let slideIndex = 0

  for (let b = 0; b < allBatches.length; b++) {
    const batch = allBatches[b]
    console.log(`[SlideDesigner] Batch ${b + 1}/${allBatches.length} (${batch.length} slides)`)
    try {
      const batchSlides = await generateSlidesBatchAST(
        designSystem, batch, b, data.brandName || '',
        { previousSlidesVisualSummary: visualSummary, slideIndex, totalSlides: allBatches.flat().length },
      )
      allSlides.push(...batchSlides)
      visualSummary += batchSlides.map((s, i) => {
        const elCount = s.elements?.length || 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasImage = s.elements?.some((e: any) => e.type === 'image') || false
        return `שקף ${slideIndex + i + 1} (${s.slideType}): ${elCount} elements, hasImage: ${hasImage}`
      }).join('\n') + '\n'
      slideIndex += batch.length
    } catch (error) {
      console.error(`[SlideDesigner] Batch ${b + 1} failed:`, error)
      for (const slide of batch) allSlides.push(createFallbackSlide(slide, designSystem, slideIndex++))
    }
  }

  if (allSlides.length === 0) throw new Error('All batches failed — no slides generated')

  // ── Validate + auto-fix ──
  console.log(`[SlideDesigner] Validating ${allSlides.length} slides...`)
  const validatedSlides: Slide[] = []
  let totalScore = 0

  for (const slide of allSlides) {
    const pacing = PACING_MAP[slide.slideType as string] || PACING_MAP.brief
    const result = validateSlide(slide, designSystem, pacing)
    totalScore += result.score
    if (result.issues.some(i => i.severity === 'critical' && i.autoFixable)) {
      validatedSlides.push(autoFixSlide(slide, result.issues, designSystem))
    } else {
      validatedSlides.push(slide)
    }
  }

  const avgScore = Math.round(totalScore / allSlides.length)
  const finalSlides = checkVisualConsistency(validatedSlides, designSystem)

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`[SlideDesigner][${requestId}] Done in ${duration}s — ${finalSlides.length} slides, quality: ${avgScore}/100`)
  console.log(`${'═'.repeat(50)}\n`)

  return {
    id: `pres-${Date.now()}`,
    title: data.brandName || 'הצעת מחיר',
    designSystem,
    slides: finalSlides,
    metadata: {
      brandName: data.brandName,
      createdAt: new Date().toISOString(),
      version: 2,
      pipeline: 'slide-designer-v3',
      qualityScore: avgScore,
      duration: parseFloat(duration),
    },
  }
}

// ═══════════════════════════════════════════════════════════
//  STAGED PIPELINE (for Vercel timeout)
// ═══════════════════════════════════════════════════════════

/**
 * Stage 1: Design System + batch preparation. Runs in ~30-50s.
 */
export async function pipelineFoundation(
  data: Record<string, unknown>,
  config: {
    accentColor?: string
    brandLogoUrl?: string
    leadersLogoUrl?: string
    clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {}
): Promise<PipelineFoundation> {
  const requestId = `found-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Staged pipeline: Foundation`)

  const d = data as PremiumProposalData
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const leadersLogo = config.leadersLogoUrl || `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const clientLogo = config.clientLogoUrl || d._scraped?.logoUrl || config.brandLogoUrl || ''

  const brandColors = d._brandColors || {
    primary: config.accentColor || '#E94560',
    secondary: '#1A1A2E',
    accent: config.accentColor || '#E94560',
    style: 'corporate',
    mood: 'מקצועי',
  }

  const brandInput: BrandDesignInput = {
    brandName: d.brandName || 'Unknown',
    industry: d._brandResearch?.industry || '',
    brandPersonality: d._brandResearch?.brandPersonality || [],
    brandColors,
    logoUrl: clientLogo || undefined,
    coverImageUrl: config.images?.coverImage || undefined,
    targetAudience: d.targetDescription || '',
  }

  // Step 1: Design System
  console.log(`[SlideDesigner][${requestId}] Generating design system...`)
  const designSystem = await generateDesignSystem(brandInput)

  // Prepare batches
  const allBatches = buildSlideBatches(d, config)

  const foundation: PipelineFoundation = {
    designSystem,
    batches: allBatches,
    brandName: d.brandName || '',
    clientLogo,
    leadersLogo,
    totalSlides: allBatches.flat().length,
  }

  console.log(`[SlideDesigner][${requestId}] Foundation complete: ${foundation.totalSlides} slides across ${allBatches.length} batches`)
  return foundation
}

/**
 * Stage 2 (per batch): Generate one batch of slides. Runs in ~40-60s.
 */
export async function pipelineBatch(
  foundation: PipelineFoundation,
  batchIndex: number,
  previousContext: BatchResult | null,
): Promise<BatchResult> {
  const requestId = `batch-${batchIndex}-${Date.now()}`
  const batch = foundation.batches[batchIndex]
  if (!batch) throw new Error(`Invalid batch index: ${batchIndex}`)

  const slideIndex = previousContext?.slideIndex ?? 0
  const visualSummary = previousContext?.visualSummary ?? ''

  console.log(`[SlideDesigner][${requestId}] Batch ${batchIndex + 1}/${foundation.batches.length} (${batch.length} slides)`)

  try {
    const batchSlides = await generateSlidesBatchAST(
      foundation.designSystem, batch, batchIndex, foundation.brandName,
      { previousSlidesVisualSummary: visualSummary, slideIndex, totalSlides: foundation.totalSlides },
    )

    const newVisualSummary = visualSummary + batchSlides.map((s, i) => {
      const elCount = s.elements?.length || 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasImage = s.elements?.some((e: any) => e.type === 'image') || false
      return `שקף ${slideIndex + i + 1} (${s.slideType}): ${elCount} elements, hasImage: ${hasImage}`
    }).join('\n') + '\n'

    console.log(`[SlideDesigner][${requestId}] Batch ${batchIndex + 1} done: ${batchSlides.length} slides`)
    return { slides: batchSlides, visualSummary: newVisualSummary, slideIndex: slideIndex + batch.length }
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Batch ${batchIndex + 1} failed:`, error)
    const fallbackSlides: Slide[] = []
    for (let i = 0; i < batch.length; i++) {
      fallbackSlides.push(createFallbackSlide(batch[i], foundation.designSystem, slideIndex + i))
    }
    return { slides: fallbackSlides, visualSummary, slideIndex: slideIndex + batch.length }
  }
}

/**
 * Stage 3: Validate, auto-fix, consistency check, assemble final Presentation.
 */
export function pipelineFinalize(
  foundation: PipelineFoundation,
  allSlides: Slide[],
): Presentation {
  const requestId = `final-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Finalizing: ${allSlides.length} slides`)

  if (allSlides.length === 0) throw new Error('No slides to finalize')

  const validatedSlides: Slide[] = []
  let totalScore = 0

  for (const slide of allSlides) {
    const pacing = PACING_MAP[slide.slideType as string] || PACING_MAP.brief
    const result = validateSlide(slide, foundation.designSystem, pacing)
    totalScore += result.score
    if (result.issues.some(i => i.severity === 'critical' && i.autoFixable)) {
      validatedSlides.push(autoFixSlide(slide, result.issues, foundation.designSystem))
    } else {
      validatedSlides.push(slide)
    }
  }

  const avgScore = Math.round(totalScore / allSlides.length)
  const finalSlides = checkVisualConsistency(validatedSlides, foundation.designSystem)

  console.log(`[SlideDesigner][${requestId}] Finalized: ${finalSlides.length} slides, quality: ${avgScore}/100`)

  return {
    id: `pres-${Date.now()}`,
    title: foundation.brandName || 'הצעת מחיר',
    designSystem: foundation.designSystem,
    slides: finalSlides,
    metadata: {
      brandName: foundation.brandName,
      createdAt: new Date().toISOString(),
      version: 2,
      pipeline: 'slide-designer-v3-staged',
      qualityScore: avgScore,
    },
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

  const pacing = PACING_MAP[slideContent.slideType] || PACING_MAP.brief
  const validation = validateSlide(slides[0], designSystem, pacing)
  if (validation.issues.some(i => i.severity === 'critical' && i.autoFixable)) {
    return autoFixSlide(slides[0], validation.issues, designSystem)
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
    accentColor?: string
    brandLogoUrl?: string
    leadersLogoUrl?: string
    clientLogoUrl?: string
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
    imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  } = {},
): Promise<string[]> {
  const presentation = await generateAIPresentation(documentData, config)
  return presentationToHtmlSlides(presentation)
}
