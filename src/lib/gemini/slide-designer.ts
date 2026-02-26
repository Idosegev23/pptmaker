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
  ImageElement,
} from '@/types/presentation'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})
const FLASH_MODEL = 'gemini-3-flash-preview' // Primary — fast, cheap, ThinkingLevel.HIGH handles complexity
const PRO_MODEL = 'gemini-3.1-pro-preview'   // Fallback when Flash fails

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
  creativeDirection?: {
    visualMetaphor: string
    visualTension: string
    oneRule: string
    colorStory: string
    typographyVoice: string
    emotionalArc: string
  }
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

// ─── Anti-Patterns Blacklist ──────────────────────────
const ANTI_PATTERNS = `
## ❌ דפוסים אסורים (Anti-Patterns) — הפרה = פסילה:
1. ❌ טקסט ממורכז בדיוק באמצע המסך (x:960, y:540) — BORING
2. ❌ כל האלמנטים מיושרים לאותו קו אנכי — שטוח ומת
3. ❌ 3 כרטיסים זהים ברוחב שווה בשורה — PowerPoint גנרי
4. ❌ gradient ליניארי פשוט (שמאל→ימין או למעלה→למטה) — 2015
5. ❌ עיגול מאחורי טקסט כ"הדגשה" — קלישאה
6. ❌ borderRadius: 8 על הכל — זה UI, לא editorial design
7. ❌ אייקונים קטנים ליד כל bullet point — PowerPoint vibes
8. ❌ כל הטקסטים באותו fontSize (למשל הכל 24px) — אין היררכיה
9. ❌ יותר מ-3 צבעים שונים לטקסט באותו שקף — בלגן
10. ❌ אלמנטים שממוקמים "בערך" — כל מיקום חייב להיות מכוון ומדויק
11. ❌ opacity: 0.5 על טקסט קריא — חייב להיות readable
12. ❌ rotation על body text — רק על דקורטיבי/watermark
`

// ─── Depth Layering System ───────────────────────────
const DEPTH_LAYERS = `
## שכבות עומק (Depth Layers) — כל אלמנט חייב לשבת בשכבה אחת:
- Layer 0 (zIndex: 0-1):    BACKGROUND — aurora, gradient, texture, full-bleed color
- Layer 1 (zIndex: 2-3):    DECORATIVE — watermark text, geometric shapes, motif patterns, thin architectural lines
- Layer 2 (zIndex: 4-5):    STRUCTURE — cards, containers, dividers, image frames
- Layer 3 (zIndex: 6-8):    CONTENT — body text, data, images, influencer cards
- Layer 4 (zIndex: 9-10):   HERO — main title, key number, focal element, brand name

חוק: אלמנטים מאותה שכבה לא חופפים (אלא אם אחד מהם decorative עם opacity < 0.3).
`

// ─── Composition Rules ───────────────────────────────
const COMPOSITION_RULES = `
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
`

// ─── Layout Techniques Palette ────────────────────────
const LAYOUT_TECHNIQUES = [
  'Typographic Brutalism',
  'Editorial Bleed',
  'Bento Box',
  'Swiss Grid',
  'Deconstructed Collage',
  'Cinematic Widescreen',
  'Kinetic Typography (frozen)',
  'Data Art',
  'Negative Space Dominance',
  'Split Screen Asymmetry',
  'Overlay Chaos (controlled)',
  'Magazine Spread',
  'Architectural Grid',
  'Poster Style (single focal)',
] as const

// ─── Color Temperature ────────────────────────────────
const TEMPERATURE_MAP: Record<string, 'cold' | 'neutral' | 'warm'> = {
  cover: 'cold', brief: 'cold', goals: 'neutral', audience: 'neutral',
  insight: 'warm', strategy: 'neutral', bigIdea: 'warm', approach: 'neutral',
  deliverables: 'neutral', metrics: 'neutral', influencerStrategy: 'cold',
  influencers: 'neutral', closing: 'warm',
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

  const prompt = `אתה Creative Director + Art Director ב-Sagmeister & Walsh / Pentagram. המשימה: לייצר כיוון קריאטיבי + Design System מלא למצגת ברמת Awwwards עבור "${brand.brandName}".

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

פונט: Heebo. החזר JSON בלבד עם שני חלקים: creativeDirection (object) + כל שאר שדות ה-Design System.`

  // Flash first (fast + cheap), Pro fallback
  const models = [FLASH_MODEL, PRO_MODEL]
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for design system (attempt ${attempt + 1}/${models.length})...`)
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } },
      })

      const parsed = parseGeminiJson<PremiumDesignSystem>(response.text || '')
      if (parsed?.colors?.primary) {
        parsed.colors = validateAndFixColors(parsed.colors)
        parsed.fonts = parsed.fonts || { heading: 'Heebo', body: 'Heebo' }
        parsed.direction = 'rtl'
        console.log(`[SlideDesigner][${requestId}] Design system ready. Style: ${parsed.effects?.decorativeStyle} (model: ${model})`)
        if (attempt > 0) console.log(`[SlideDesigner][${requestId}] ✅ Design system succeeded with fallback (${model})`)
        return parsed
      }
      throw new Error('Invalid design system response')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[SlideDesigner][${requestId}] Design system attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[SlideDesigner][${requestId}] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error(`[SlideDesigner][${requestId}] All design system attempts failed, using fallback`)
  return buildFallbackDesignSystem(brand)
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

  // Creative Direction from Design System (if available)
  const cd = designSystem.creativeDirection

  // ── Build per-slide directives with pacing & layout ──
  const slidesDescription = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
    const temperature = TEMPERATURE_MAP[slide.slideType] || 'neutral'
    const contentJson = JSON.stringify(slide.content, null, 2)
    const hasTension = ['cover', 'insight', 'bigIdea', 'closing'].includes(slide.slideType)

    return `
═══ שקף ${globalIndex + 1}/${batchContext.totalSlides}: "${slide.title}" (${slide.slideType}) ═══
🌡️ Temperature: ${temperature} | ⚡ Energy: ${pacing.energy} | 📊 Density: ${pacing.density}
${hasTension ? '🔥 TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!' : ''}
📐 מקסימום ${pacing.maxElements} אלמנטים | לפחות ${pacing.minWhitespace}% רווח לבן
${slide.imageUrl ? `🖼️ Image: ${slide.imageUrl} — חובה element מסוג "image"!` : '🚫 אין תמונה — השתמש ב-shapes דקורטיביים, watermarks, טיפוגרפיה דרמטית'}
תוכן:
\`\`\`json
${contentJson}
\`\`\``
  }).join('\n')

  const prompt = `אתה ארט דיירקטור גאון ברמת Awwwards / Pentagram / Sagmeister & Walsh.
המצגת חייבת להיראות כמו **מגזין אופנה פרימיום / editorial design** — לא כמו PowerPoint!

עצב ${slides.length} שקפים למותג "${brandName}".

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

${COMPOSITION_RULES}

${DEPTH_LAYERS}

${ANTI_PATTERNS}

## Micro-Typography:
- כותרות ענקיות (60px+): letterSpacing: ${typo.letterSpacingTight} (tight!) + lineHeight: ${typo.lineHeightTight}
- Labels/subtitles: letterSpacing: ${typo.letterSpacingWide} (spaced out!) + fontWeight: ${typo.weightPairs[0]?.[1] || 300}
- כותרות: fontWeight: ${typo.weightPairs[0]?.[0] || 900} | גוף: fontWeight: ${typo.weightPairs[0]?.[1] || 300}
- מספרים ענקים (metrics/budget): fontWeight 900, letterSpacing: -4, fontSize 80-140px

## White Space:
רווח לבן הוא אלמנט עיצובי פעיל. הכותרת הראשית חייבת מרחק של 80px+ מכל אלמנט אחר.

## Visual Anchor:
כל שקף חייב anchor ויזואלי — האלמנט הראשון שהעין רואה. סדר: anchor → title → details.

## Frozen Motion:
אלמנטים דקורטיביים שנראים "באמצע תנועה": rotation 3-8°, x קרוב לקצה, clipPath שחותך.

## Layout Techniques (בחר אחת לכל שקף):
${LAYOUT_TECHNIQUES.map((t, i) => `${i + 1}. ${t}`).join('\n')}
אסור לחזור על אותה טכניקה יותר מפעמיים! שקפי peak (cover/insight/bigIdea/closing) = הטכניקות הכי דרמטיות.

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

### דוגמה 2 — שקף מדדים (Bento Box + Data Art):
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

⚠️ צור עיצוב **שונה לחלוטין** מהדוגמאות — הן רק ברמת האיכות, לא בסגנון.

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

החזר JSON: { "slides": [{ "id": "slide-N", "slideType": "TYPE", "label": "שם בעברית", "background": { "type": "solid"|"gradient", "value": "..." }, "elements": [...] }] }`

  // Flash first (fast + cheap), Pro fallback
  const batchModels = [FLASH_MODEL, PRO_MODEL]
  for (let attempt = 0; attempt < batchModels.length; attempt++) {
    const model = batchModels[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for batch (attempt ${attempt + 1}/${batchModels.length})...`)
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          maxOutputTokens: 32000,
        },
      })

      const parsed = parseGeminiJson<{ slides: Slide[] }>(response.text || '')

      if (parsed?.slides?.length > 0) {
        console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} AST slides (model: ${model})`)
        if (attempt > 0) console.log(`[SlideDesigner][${requestId}] ✅ Batch succeeded with fallback (${model})`)

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
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[SlideDesigner][${requestId}] Batch attempt ${attempt + 1}/${batchModels.length} failed (${model}): ${msg}`)
      if (attempt < batchModels.length - 1) {
        console.log(`[SlideDesigner][${requestId}] ⚡ Falling back to ${batchModels[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000))
      } else {
        throw error
      }
    }
  }
  throw new Error('All slide generation attempts failed')
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
  config: {
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
  } = {},
): SlideContentInput[][] {
  const currency = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : '₪'

  // Build a map of extra images by placement for easy lookup
  const extraByPlacement: Record<string, string> = {}
  for (const img of config.extraImages || []) {
    if (img.url && img.placement) extraByPlacement[img.placement] = img.url
  }

  const batch1: SlideContentInput[] = [
    { slideType: 'cover', title: 'שער', content: { brandName: data.brandName, campaignSubtitle: data.campaignSubtitle || data.strategyHeadline || 'הצעת שיתוף פעולה', issueDate: data.issueDate || new Date().toLocaleDateString('he-IL') }, imageUrl: config.images?.coverImage },
    { slideType: 'brief', title: 'למה התכנסנו?', content: { headline: 'למה התכנסנו?', brandBrief: data.brandBrief || '', painPoints: data.brandPainPoints || [], objective: data.brandObjective || '' }, imageUrl: config.images?.brandImage },
    { slideType: 'goals', title: 'מטרות הקמפיין', content: { headline: 'מטרות הקמפיין', goals: data.goalsDetailed || (data.goals || []).map(g => ({ title: g, description: '' })) }, imageUrl: extraByPlacement['goals'] },
    { slideType: 'audience', title: 'קהל היעד', content: { headline: 'קהל היעד', gender: data.targetGender || '', ageRange: data.targetAgeRange || '', description: data.targetDescription || '', behavior: data.targetBehavior || '', insights: data.targetInsights || [] }, imageUrl: config.images?.audienceImage },
    { slideType: 'insight', title: 'התובנה המרכזית', content: { headline: 'התובנה המרכזית', keyInsight: data.keyInsight || '', source: data.insightSource || '', data: data.insightData || '' }, imageUrl: extraByPlacement['insight'] },
  ]

  const batch2: SlideContentInput[] = [
    { slideType: 'strategy', title: 'האסטרטגיה', content: { headline: 'האסטרטגיה', strategyHeadline: data.strategyHeadline || '', description: data.strategyDescription || '', pillars: data.strategyPillars || [] }, imageUrl: extraByPlacement['strategy'] },
    { slideType: 'bigIdea', title: 'הרעיון המרכזי', content: { headline: data.activityTitle || 'הרעיון המרכזי', concept: data.activityConcept || '', description: data.activityDescription || '' }, imageUrl: config.images?.activityImage || config.images?.brandImage },
    { slideType: 'approach', title: 'הגישה שלנו', content: { headline: 'הגישה שלנו', approaches: data.activityApproach || [], differentiator: data.activityDifferentiator || '' }, imageUrl: extraByPlacement['approach'] },
    { slideType: 'deliverables', title: 'תוצרים', content: { headline: 'תוצרים', deliverables: data.deliverablesDetailed || (data.deliverables || []).map(d => ({ type: d, quantity: 1, description: '' })), summary: data.deliverablesSummary || '' } },
    { slideType: 'metrics', title: 'יעדים ומדדים', content: { headline: 'יעדים ומדדים', budget: data.budget ? `${currency}${formatNum(data.budget)}` : '', reach: formatNum(data.potentialReach), engagement: formatNum(data.potentialEngagement), impressions: formatNum(data.estimatedImpressions), cpe: data.cpe ? `${currency}${data.cpe.toFixed(1)}` : '', explanation: data.metricsExplanation || '' } },
  ]

  const influencers = data.enhancedInfluencers || data.scrapedInfluencers?.map(i => ({
    name: i.name || i.username || '', username: i.username || '', profilePicUrl: i.profilePicUrl || '',
    categories: [] as string[], followers: i.followers || 0, engagementRate: i.engagementRate || 0,
  })) || []
  // Research saves as _influencerStrategy, wizard maps to influencerResearch — check both
  const researchStrategy = data._influencerStrategy || data.influencerResearch
  const aiRecs = researchStrategy?.recommendations || []

  const batch3: SlideContentInput[] = [
    { slideType: 'influencerStrategy', title: 'אסטרטגיית משפיענים', content: { headline: 'אסטרטגיית משפיענים', strategy: data.influencerStrategy || researchStrategy?.strategySummary || '', criteria: data.influencerCriteria || researchStrategy?.contentThemes?.map((t: { theme?: string }) => t.theme || t) || [], guidelines: data.contentGuidelines || [] } },
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
  const consistentSlides = checkVisualConsistency(validatedSlides, designSystem)
  const withLeadersLogo = injectLeadersLogo(consistentSlides)
  const clientLogoUrl = config.clientLogoUrl || data._scraped?.logoUrl || config.brandLogoUrl || ''
  const finalSlides = injectClientLogo(withLeadersLogo, clientLogoUrl)

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

// ─── Leaders Logo Injection ────────────────────────────

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function hexToLuminance(hex: string): number {
  let clean = hex.replace('#', '')
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('')
  if (clean.length !== 6) return 0.2 // fallback — assume dark
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const adj = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * adj(r) + 0.7152 * adj(g) + 0.0722 * adj(b)
}

function extractDominantColor(bg: Slide['background']): string {
  if (bg.type === 'solid') return bg.value
  if (bg.type === 'gradient') {
    const match = bg.value.match(/#[0-9a-fA-F]{3,8}/)
    return match ? match[0] : '#1a1a2e'
  }
  return '#1a1a2e' // image backgrounds assumed dark
}

function injectLeadersLogo(slides: Slide[]): Slide[] {
  const baseUrl = getAppBaseUrl()
  const whiteLogoUrl = `${baseUrl}/logo.png`
  const blackLogoUrl = `${baseUrl}/logoblack.png`

  return slides.map(slide => {
    const bgColor = extractDominantColor(slide.background)
    const luminance = hexToLuminance(bgColor)
    const isDark = luminance < 0.45
    const logoUrl = isDark ? whiteLogoUrl : blackLogoUrl

    const logoElement: ImageElement = {
      id: `leaders-logo-${slide.id}`,
      type: 'image',
      src: logoUrl,
      alt: 'Leaders',
      x: 40,
      y: 1000,
      width: 140,
      height: 50,
      zIndex: 99,
      objectFit: 'contain',
      opacity: 0.7,
    }

    return {
      ...slide,
      elements: [...slide.elements, logoElement],
    }
  })
}

// ─── Client Logo Injection ────────────────────────────

const CLIENT_LOGO_SLIDES: Record<string, { x: number; y: number; width: number; height: number; opacity: number }> = {
  cover:   { x: 1620, y: 60, width: 220, height: 80, opacity: 0.95 },
  bigIdea: { x: 1660, y: 60, width: 180, height: 65, opacity: 0.85 },
  closing: { x: 810, y: 100, width: 300, height: 110, opacity: 1.0 },
}

function injectClientLogo(slides: Slide[], clientLogoUrl: string): Slide[] {
  if (!clientLogoUrl) return slides

  return slides.map(slide => {
    const placement = CLIENT_LOGO_SLIDES[slide.slideType as string]
    if (!placement) return slide

    const logoElement: ImageElement = {
      id: `client-logo-${slide.id}`,
      type: 'image',
      src: clientLogoUrl,
      alt: 'Client Brand',
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      zIndex: 95,
      objectFit: 'contain',
      opacity: placement.opacity,
    }

    return {
      ...slide,
      elements: [...slide.elements, logoElement],
    }
  })
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
  const consistentSlides = checkVisualConsistency(validatedSlides, foundation.designSystem)
  const withLeadersLogo = injectLeadersLogo(consistentSlides)
  const finalSlides = injectClientLogo(withLeadersLogo, foundation.clientLogo)

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
