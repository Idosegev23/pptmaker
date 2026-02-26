/**
 * Gemini AI Slide Designer — Production-Grade 2-Step Pipeline
 *
 * 2-Step process:
 * 1. generateDesignSystem() → Brand design tokens (colors, typography, spacing, effects)
 * 2. generateSlidesBatchAST() → JSON AST slides on 1920×1080 canvas
 *
 * Production features:
 * - Native Structured Outputs (responseSchema) for guaranteed JSON
 * - System Instructions for consistent persona
 * - Strict TypeScript — zero `any` casts
 * - Exponential backoff on retries
 * - Layout Archetypes for anti-generic design
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai'
import type {
  Presentation,
  Slide,
  DesignSystem,
  SlideType,
  FontWeight,
  ImageElement,
  TextElement,
  SlideElement,
} from '@/types/presentation'
import { isTextElement } from '@/types/presentation'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})
const FLASH_MODEL = 'gemini-3-flash-preview' // Primary — fast, cheap, ThinkingLevel.HIGH handles complexity
const PRO_MODEL = 'gemini-3.1-pro-preview'   // Fallback when Flash fails

// ─── System Instruction (shared persona) ─────────────────

const SYSTEM_INSTRUCTION = `אתה Creative Director + Art Director ב-Sagmeister & Walsh / Pentagram.
המומחיות שלך: עיצוב מצגות editorial ברמת Awwwards.
כל מצגת חייבת להרגיש כמו מגזין אופנה פרימיום — לא כמו PowerPoint.
אתה עובד בעברית (RTL). פונט: Heebo. קנבס: 1920x1080.
אתה מעולם לא חוזר על אותו layout — כל שקף שונה מקודמו.
אתה משתמש ב-JSON AST בלבד — ללא HTML, ללא CSS.`

// ─── Layout Archetypes (anti-generic design) ──────────────

const LAYOUT_ARCHETYPES = [
  'Brutalist typography — כותרת ענקית שחורגת מהמסך עם negative x-axis overflow + watermark טקסט שקוף',
  'Asymmetric 30/70 split — חלוקה א-סימטרית עם אלמנט דקורטיבי שחוצה את הקו המפריד',
  'Overlapping Z-index cards — כרטיסים חופפים עם fake-3D shadows ואפקט עומק',
  'Full-bleed image — תמונה מלאה עם שכבת gradient ו-text cutout overlay שקוף',
  'Diagonal grid — קומפוזיציה אלכסונית עם טקסט מסובב וקווי grid דקים',
  'Bento box — רשת א-סימטרית של תאים בגדלים שונים עם נתונים ויזואליים',
  'Magazine spread — פריסת מגזין עם pull-quote ענק ותמונה דומיננטית',
  'Data art — מספרים ענקיים כאלמנט ויזואלי מרכזי עם דקורציה מינימלית',
]

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

// ─── Anti-Patterns (condensed) ──────────────────────────
const ANTI_PATTERNS = `
❌ אסור: טקסט ממורכז במרכז המסך | 3 כרטיסים זהים בשורה | כל הfonts באותו גודל | gradient ליניארי פשוט | rotation על body text | opacity < 0.7 על טקסט קריא
`

// ─── Depth Layering (condensed) ───────────────────────
const DEPTH_LAYERS = `
zIndex: 0-1=BG(gradient/aurora) | 2-3=DECOR(watermark,shapes) | 4-5=STRUCTURE(cards,dividers) | 6-8=CONTENT(text,data,images) | 9-10=HERO(title,key number)
`

// ─── Composition Rules (condensed) ────────────────────
const COMPOSITION_RULES = `
- Rule of Thirds: focal points at (640,360), (1280,360), (640,720), (1280,720). Title on right ⅓ (RTL)
- Scale Contrast: max font / min font ≥ 5:1 (peak slides: ≥ 10:1)
- 80px+ clear space around main title
- Diagonal flow: right-top → left-bottom, never static/centered
- 3 main elements form a triangle around the focal point
`

// ─── Color Temperature ────────────────────────────────
const TEMPERATURE_MAP: Record<string, 'cold' | 'neutral' | 'warm'> = {
  cover: 'cold', brief: 'cold', goals: 'neutral', audience: 'neutral',
  insight: 'warm', strategy: 'neutral', bigIdea: 'warm', approach: 'neutral',
  deliverables: 'neutral', metrics: 'neutral', influencerStrategy: 'cold',
  influencers: 'neutral', closing: 'warm',
}

// ─── DRY Color Helpers ───────────────────────────────────

/** Consolidated hex parser — handles 3-char, 6-char, and 8-char (alpha) hex codes */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let clean = hex.replace('#', '')
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('')
  if (clean.length === 8) clean = clean.slice(0, 6)
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return { r, g, b }
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** Thin wrapper using consolidated hexToRgb + relativeLuminance */
function hexToLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.2 // fallback — assume dark
  return relativeLuminance(rgb.r, rgb.g, rgb.b)
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

  let textContrast = contrastRatio(fixed.text, fixed.background)
  let attempts = 0
  while (textContrast < 4.5 && attempts < 20) {
    fixed.text = adjustLightness(fixed.text, textContrast < 2 ? 0.1 : 0.03)
    textContrast = contrastRatio(fixed.text, fixed.background)
    attempts++
  }

  let accentContrast = contrastRatio(fixed.accent, fixed.background)
  attempts = 0
  while (accentContrast < 3 && attempts < 20) {
    fixed.accent = adjustLightness(fixed.accent, 0.05)
    accentContrast = contrastRatio(fixed.accent, fixed.background)
    attempts++
  }

  if (contrastRatio(fixed.cardBg, fixed.background) < 1.1) {
    fixed.cardBg = adjustLightness(fixed.cardBg, 0.06)
  }

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

// ─── Structured Output Schemas ─────────────────────────

const DESIGN_SYSTEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    creativeDirection: {
      type: Type.OBJECT,
      properties: {
        visualMetaphor: { type: Type.STRING },
        visualTension: { type: Type.STRING },
        oneRule: { type: Type.STRING },
        colorStory: { type: Type.STRING },
        typographyVoice: { type: Type.STRING },
        emotionalArc: { type: Type.STRING },
      },
      required: ['visualMetaphor', 'visualTension', 'oneRule', 'colorStory', 'typographyVoice', 'emotionalArc'],
    },
    colors: {
      type: Type.OBJECT,
      properties: {
        primary: { type: Type.STRING }, secondary: { type: Type.STRING },
        accent: { type: Type.STRING }, background: { type: Type.STRING },
        text: { type: Type.STRING }, cardBg: { type: Type.STRING },
        cardBorder: { type: Type.STRING }, gradientStart: { type: Type.STRING },
        gradientEnd: { type: Type.STRING }, muted: { type: Type.STRING },
        highlight: { type: Type.STRING }, auroraA: { type: Type.STRING },
        auroraB: { type: Type.STRING }, auroraC: { type: Type.STRING },
      },
      required: ['primary', 'secondary', 'accent', 'background', 'text', 'cardBg', 'cardBorder',
        'gradientStart', 'gradientEnd', 'muted', 'highlight', 'auroraA', 'auroraB', 'auroraC'],
    },
    fonts: {
      type: Type.OBJECT,
      properties: { heading: { type: Type.STRING }, body: { type: Type.STRING } },
      required: ['heading', 'body'],
    },
    typography: {
      type: Type.OBJECT,
      properties: {
        displaySize: { type: Type.INTEGER }, headingSize: { type: Type.INTEGER },
        subheadingSize: { type: Type.INTEGER }, bodySize: { type: Type.INTEGER },
        captionSize: { type: Type.INTEGER },
        letterSpacingTight: { type: Type.NUMBER }, letterSpacingWide: { type: Type.NUMBER },
        lineHeightTight: { type: Type.NUMBER }, lineHeightRelaxed: { type: Type.NUMBER },
        weightPairs: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
      },
      required: ['displaySize', 'headingSize', 'subheadingSize', 'bodySize', 'captionSize',
        'letterSpacingTight', 'letterSpacingWide', 'lineHeightTight', 'lineHeightRelaxed', 'weightPairs'],
    },
    spacing: {
      type: Type.OBJECT,
      properties: {
        unit: { type: Type.INTEGER }, cardPadding: { type: Type.INTEGER },
        cardGap: { type: Type.INTEGER }, safeMargin: { type: Type.INTEGER },
      },
      required: ['unit', 'cardPadding', 'cardGap', 'safeMargin'],
    },
    effects: {
      type: Type.OBJECT,
      properties: {
        borderRadius: { type: Type.STRING, enum: ['sharp', 'soft', 'pill'] },
        borderRadiusValue: { type: Type.INTEGER },
        decorativeStyle: { type: Type.STRING, enum: ['geometric', 'organic', 'minimal', 'brutalist'] },
        shadowStyle: { type: Type.STRING, enum: ['none', 'fake-3d', 'glow'] },
        auroraGradient: { type: Type.STRING },
      },
      required: ['borderRadius', 'borderRadiusValue', 'decorativeStyle', 'shadowStyle', 'auroraGradient'],
    },
    motif: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING }, opacity: { type: Type.NUMBER },
        color: { type: Type.STRING }, implementation: { type: Type.STRING },
      },
      required: ['type', 'opacity', 'color', 'implementation'],
    },
  },
  required: ['colors', 'fonts', 'typography', 'spacing', 'effects', 'motif'],
}

/** Flat element schema — all element type fields combined, type-specific ones are optional */
const SLIDE_ELEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    type: { type: Type.STRING, enum: ['text', 'shape', 'image'] },
    x: { type: Type.NUMBER }, y: { type: Type.NUMBER },
    width: { type: Type.NUMBER }, height: { type: Type.NUMBER },
    zIndex: { type: Type.INTEGER },
    opacity: { type: Type.NUMBER },
    rotation: { type: Type.NUMBER },
    // Text fields
    content: { type: Type.STRING },
    fontSize: { type: Type.NUMBER },
    fontWeight: { type: Type.INTEGER },
    color: { type: Type.STRING },
    textAlign: { type: Type.STRING },
    role: { type: Type.STRING },
    lineHeight: { type: Type.NUMBER },
    letterSpacing: { type: Type.NUMBER },
    textStroke: {
      type: Type.OBJECT,
      properties: { width: { type: Type.NUMBER }, color: { type: Type.STRING } },
      required: ['width', 'color'],
    },
    // Shape fields
    shapeType: { type: Type.STRING },
    fill: { type: Type.STRING },
    borderRadius: { type: Type.NUMBER },
    clipPath: { type: Type.STRING },
    border: { type: Type.STRING },
    // Image fields
    src: { type: Type.STRING },
    alt: { type: Type.STRING },
    objectFit: { type: Type.STRING },
  },
  required: ['id', 'type', 'x', 'y', 'width', 'height', 'zIndex'],
}

const SLIDE_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          slideType: { type: Type.STRING },
          label: { type: Type.STRING },
          background: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['solid', 'gradient', 'image'] },
              value: { type: Type.STRING },
            },
            required: ['type', 'value'],
          },
          elements: { type: Type.ARRAY, items: SLIDE_ELEMENT_SCHEMA },
        },
        required: ['id', 'slideType', 'label', 'background', 'elements'],
      },
    },
  },
  required: ['slides'],
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

  // Flash first (fast + no 503), Pro fallback with exponential backoff
  const models = [FLASH_MODEL, PRO_MODEL]
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for design system (attempt ${attempt + 1}/${models.length})...`)
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: DESIGN_SYSTEM_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          maxOutputTokens: 65536,
        },
      })

      const rawText = response.text || ''
      console.log(`[SlideDesigner][${requestId}] Raw response length: ${rawText.length} chars (model: ${model})`)
      if (rawText.length < 100) {
        console.error(`[SlideDesigner][${requestId}] Response too short: "${rawText}"`)
      }

      // With responseSchema, JSON.parse should always succeed. Dynamic fallback for safety.
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

      const topKeys = Object.keys(parsed).join(', ')
      console.log(`[SlideDesigner][${requestId}] Parsed keys: [${topKeys}]`)

      if (parsed?.colors?.primary) {
        parsed.colors = validateAndFixColors(parsed.colors)
        parsed.fonts = parsed.fonts || { heading: 'Heebo', body: 'Heebo' }
        parsed.direction = 'rtl'
        console.log(`[SlideDesigner][${requestId}] Design system ready. Style: ${parsed.effects?.decorativeStyle} (model: ${model})`)
        if (attempt > 0) console.log(`[SlideDesigner][${requestId}] ✅ Design system succeeded with fallback (${model})`)
        return parsed
      }
      throw new Error(`Invalid design system response — parsed colors missing. Keys: [${topKeys}]`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[SlideDesigner][${requestId}] Design system attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[SlideDesigner][${requestId}] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
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

  // ── Image sizing hints per slide type ──
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

  // ── Build per-slide directives with pacing, layout & archetype ──
  const slidesDescription = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
    const temperature = TEMPERATURE_MAP[slide.slideType] || 'neutral'
    const contentJson = JSON.stringify(slide.content, null, 2)
    const hasTension = ['cover', 'insight', 'bigIdea', 'closing'].includes(slide.slideType)
    const imageSizeHint = IMAGE_SIZE_HINTS[slide.slideType] || 'At least 40% of slide area'
    const archetype = LAYOUT_ARCHETYPES[(globalIndex + batchIndex * 3) % LAYOUT_ARCHETYPES.length]

    return `
═══ שקף ${globalIndex + 1}/${batchContext.totalSlides}: "${slide.title}" (${slide.slideType}) ═══
🌡️ Temperature: ${temperature} | ⚡ Energy: ${pacing.energy} | 📊 Density: ${pacing.density}
${hasTension ? '🔥 TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!' : ''}
📐 מקסימום ${pacing.maxElements} אלמנטים | לפחות ${pacing.minWhitespace}% רווח לבן
📐 Mandatory Layout Archetype: ${archetype}
${slide.imageUrl ? `🖼️ Image: ${slide.imageUrl} — חובה element מסוג "image"!\n📏 Image sizing: ${imageSizeHint}` : '🚫 אין תמונה — השתמש ב-shapes דקורטיביים, watermarks, טיפוגרפיה דרמטית'}
תוכן:
\`\`\`json
${contentJson}
\`\`\``
  }).join('\n')

  const prompt = `עצב ${slides.length} שקפים למותג "${brandName}".

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

## Typography:
- כותרות (60px+): letterSpacing ${typo.letterSpacingTight}, lineHeight ${typo.lineHeightTight}, weight ${typo.weightPairs[0]?.[0] || 900}
- גוף/labels: letterSpacing ${typo.letterSpacingWide}, weight ${typo.weightPairs[0]?.[1] || 300}
- מספרים ענקים: weight 900, letterSpacing -4, fontSize 80-140px
- Watermark: role "decorative", fontSize 200-400, opacity 0.03-0.08, rotation -5° to -15°, textStroke

## Design Principles:
- א-סימטרי! לא PowerPoint. כל שקף שונה מקודמו
- Fake 3D shadows (shape offset +12px, opacity 0.15), gradient overlays על תמונות
- קווים דקים (1-2px) ב-accent color כמפרידים אלגנטיים

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
${batchContext.previousSlidesVisualSummary
    ? `⚠️ ANTI-REPETITION: הנה מה שכבר עוצב. אסור לחזור על אותם layouts, צבעים דומיננטיים, או מיקומי כותרת! כל שקף חייב להפתיע.\n${batchContext.previousSlidesVisualSummary}`
    : 'זה הבאצ׳ הראשון — אין הקשר קודם.'}

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
- ✅ Fake 3D: shape ב-x+12,y+12 fill:#000 opacity:0.12-0.18`

  // Flash first (fast + cheap), Pro fallback with exponential backoff
  const batchModels = [FLASH_MODEL, PRO_MODEL]
  for (let attempt = 0; attempt < batchModels.length; attempt++) {
    const model = batchModels[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for batch (attempt ${attempt + 1}/${batchModels.length})...`)
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          maxOutputTokens: 65536,
          temperature: 0.8,
        },
      })

      // With responseSchema, JSON.parse should always succeed. Dynamic fallback for safety.
      let parsed: { slides: Slide[] }
      try {
        parsed = JSON.parse(response.text || '') as { slides: Slide[] }
      } catch {
        console.warn(`[SlideDesigner][${requestId}] JSON.parse failed, falling back to robust parser`)
        const { parseGeminiJson } = await import('@/lib/utils/json-cleanup')
        const fallbackParsed = parseGeminiJson<{ slides: Slide[] }>(response.text || '')
        if (!fallbackParsed) throw new Error('Both JSON.parse and parseGeminiJson failed')
        parsed = fallbackParsed
      }

      if (parsed?.slides?.length > 0) {
        console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} AST slides (model: ${model})`)
        if (attempt > 0) console.log(`[SlideDesigner][${requestId}] ✅ Batch succeeded with fallback (${model})`)

        return parsed.slides.map((slide, i) => ({
          id: slide.id || `slide-${batchContext.slideIndex + i}`,
          slideType: (slide.slideType || slides[i]?.slideType || 'closing') as SlideType,
          label: slide.label || slides[i]?.title || `שקף ${batchContext.slideIndex + i + 1}`,
          background: slide.background || { type: 'solid' as const, value: colors.background },
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
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
      } else {
        throw error
      }
    }
  }
  throw new Error('All slide generation attempts failed')
}

// ═══════════════════════════════════════════════════════════
//  VALIDATION + AUTO-FIX (Type-safe, zero `any` casts)
// ═══════════════════════════════════════════════════════════

function validateSlide(
  slide: Slide,
  designSystem: PremiumDesignSystem,
  pacing: PacingDirective,
): ValidationResult {
  const issues: ValidationIssue[] = []
  let score = 100

  const elements: SlideElement[] = slide.elements || []
  const textElements = elements.filter(isTextElement)
  const contentTexts = textElements.filter(el => el.role !== 'decorative')
  const allBoxes: BoundingBox[] = elements.map(e => ({ x: e.x || 0, y: e.y || 0, width: e.width || 0, height: e.height || 0 }))

  // Contrast check
  for (const el of contentTexts) {
    const color = el.color
    if (color && !color.includes('transparent')) {
      const bgColor = designSystem.colors.background
      const cr = contrastRatio(color.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7), bgColor)
      const fontSize = el.fontSize || 20
      const minContrast = fontSize >= 48 ? 3 : 4.5
      if (cr < minContrast) {
        issues.push({
          severity: 'critical', category: 'contrast',
          message: `contrast ${cr.toFixed(1)}:1 (min ${minContrast}:1)`,
          elementId: el.id, autoFixable: true,
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
    if (el.x < 60 || (el.x + el.width) > 1860 || el.y < 60 || (el.y + el.height) > 1020) {
      issues.push({ severity: 'warning', category: 'safe-zone', message: 'Content outside safe zone', elementId: el.id, autoFixable: true })
      score -= 5
    }
  }

  // Scale contrast
  const fontSizes = contentTexts.map(e => e.fontSize || 20).filter(s => s > 0)
  if (fontSizes.length >= 2) {
    const ratio = Math.max(...fontSizes) / Math.min(...fontSizes)
    const minRatio = pacing.energy === 'peak' ? 8 : 4
    if (ratio < minRatio) {
      issues.push({ severity: 'suggestion', category: 'scale', message: `Font ratio ${ratio.toFixed(1)}:1 (recommend ≥${minRatio}:1)`, autoFixable: false })
      score -= 5
    }
  }

  // Hierarchy
  const titles = contentTexts.filter(e => e.role === 'title')
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
    const elIndex = fixed.elements.findIndex(e => e.id === issue.elementId)
    if (elIndex === -1) continue

    if (issue.category === 'contrast') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        let color = updated.color || '#ffffff'
        let attempts = 0
        while (contrastRatio(color, designSystem.colors.background) < 4.5 && attempts < 20) {
          color = adjustLightness(color, 0.05)
          attempts++
        }
        updated.color = color
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'safe-zone') {
      const el = fixed.elements[elIndex]
      const updated = { ...el }
      updated.x = Math.max(80, Math.min(updated.x, 1920 - 80 - (updated.width || 200)))
      updated.y = Math.max(80, Math.min(updated.y, 1080 - 80 - (updated.height || 60)))
      fixed.elements[elIndex] = updated
    }
  }

  return fixed
}

function checkVisualConsistency(slides: Slide[], _designSystem: PremiumDesignSystem): Slide[] {
  const allTitles: { slideIndex: number; y: number; fontSize: number; element: TextElement }[] = []

  slides.forEach((slide, si) => {
    const titles = (slide.elements || []).filter(
      (e): e is TextElement => isTextElement(e) && e.role === 'title'
    )
    for (const t of titles) {
      allTitles.push({ slideIndex: si, y: t.y || 0, fontSize: t.fontSize || 48, element: t })
    }
  })

  if (allTitles.length < 3) return slides

  // Skip peak-energy slides that intentionally use different sizes/positions
  const regularTitles = allTitles.filter(t => {
    const st = slides[t.slideIndex]?.slideType
    return st !== 'cover' && st !== 'closing' && st !== 'bigIdea' && st !== 'insight'
  })

  if (regularTitles.length > 0) {
    // Align title Y positions to median (only fix wild outliers, 100px+ deviation)
    const medianY = regularTitles.map(t => t.y).sort((a, b) => a - b)[Math.floor(regularTitles.length / 2)]
    for (const t of regularTitles) {
      if (Math.abs(t.y - medianY) > 100) t.element.y = medianY
    }

    // Normalize heading font sizes (only fix unintentional drift, 6-15px range)
    const headingSizes = regularTitles.map(t => t.element.fontSize || 48)
    const medianSize = headingSizes.sort((a, b) => a - b)[Math.floor(headingSizes.length / 2)]
    for (const t of regularTitles) {
      if (Math.abs(t.fontSize - medianSize) > 6 && Math.abs(t.fontSize - medianSize) < 15) {
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
  const content = input.content
  const title = (typeof content.headline === 'string' ? content.headline : undefined)
    || (typeof content.brandName === 'string' ? content.brandName : undefined)
    || input.title
    || `שקף ${index + 1}`

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

interface InfluencerResearchData {
  strategySummary?: string
  recommendations?: { name?: string; handle?: string; followers?: string; engagement?: string; whyRelevant?: string; profilePicUrl?: string }[]
  contentThemes?: { theme?: string }[]
  [key: string]: unknown
}

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
  influencerResearch?: InfluencerResearchData
  scrapedInfluencers?: { name?: string; username?: string; profilePicUrl?: string; followers?: number; engagementRate?: number }[]
  enhancedInfluencers?: { name: string; username: string; profilePicUrl: string; categories: string[]; followers: number; engagementRate: number }[]
  _brandColors?: { primary: string; secondary: string; accent: string; background?: string; text?: string; style?: string; mood?: string; palette?: string[] }
  _brandResearch?: { industry?: string; brandPersonality?: string[]; [key: string]: unknown }
  _scraped?: { logoUrl?: string; [key: string]: unknown }
  _generatedImages?: Record<string, string>
  _extraImages?: { id: string; url: string; placement: string }[]
  _imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  _influencerStrategy?: InfluencerResearchData
  [key: string]: unknown
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
  batch3.push({ slideType: 'closing', title: 'סיום', content: { brandName: data.brandName || '', headline: 'בואו ניצור ביחד', subheadline: `נשמח להתחיל לעבוד עם ${data.brandName}` } })

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
    industry: typeof data._brandResearch?.industry === 'string' ? data._brandResearch.industry : '',
    brandPersonality: Array.isArray(data._brandResearch?.brandPersonality) ? data._brandResearch.brandPersonality as string[] : [],
    brandColors,
    logoUrl: config.clientLogoUrl || (typeof data._scraped?.logoUrl === 'string' ? data._scraped.logoUrl : undefined) || config.brandLogoUrl || undefined,
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
        const hasImage = s.elements?.some(e => e.type === 'image') || false
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
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
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
  const clientLogoUrl = config.clientLogoUrl || (typeof data._scraped?.logoUrl === 'string' ? data._scraped.logoUrl : '') || config.brandLogoUrl || ''
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
  const clientLogo = config.clientLogoUrl || (typeof d._scraped?.logoUrl === 'string' ? d._scraped.logoUrl : '') || config.brandLogoUrl || ''

  const brandColors = d._brandColors || {
    primary: config.accentColor || '#E94560',
    secondary: '#1A1A2E',
    accent: config.accentColor || '#E94560',
    style: 'corporate',
    mood: 'מקצועי',
  }

  const brandInput: BrandDesignInput = {
    brandName: d.brandName || 'Unknown',
    industry: typeof d._brandResearch?.industry === 'string' ? d._brandResearch.industry : '',
    brandPersonality: Array.isArray(d._brandResearch?.brandPersonality) ? d._brandResearch.brandPersonality as string[] : [],
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
      const hasImage = s.elements?.some(e => e.type === 'image') || false
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
    const placement = CLIENT_LOGO_SLIDES[slide.slideType]
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
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
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
