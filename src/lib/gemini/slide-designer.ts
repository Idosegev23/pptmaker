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
const PRO_MODEL_DEFAULT = 'gemini-3.1-pro-preview'
const FLASH_MODEL_DEFAULT = 'gemini-3-flash-preview'

async function getSlideDesignerModels(): Promise<string[]> {
  const primary = await getConfig('ai_models', 'slide_designer.primary_model', PRO_MODEL_DEFAULT)
  const fallback = await getConfig('ai_models', 'slide_designer.fallback_model', FLASH_MODEL_DEFAULT)
  return [primary, fallback]
}

// ─── System Instruction (shared persona) ─────────────────

import { getConfig } from '@/lib/config/admin-config'

const SYSTEM_INSTRUCTION_DEFAULT = `<role>
You are a world-class Creative Director and Art Director at a top design agency (Sagmeister & Walsh / Pentagram level).
Your specialty: editorial-quality presentation design that wins Awwwards.
Every presentation must feel like a premium fashion magazine — never like PowerPoint.
</role>

<constraints>
- Output language: Hebrew (RTL). Font: Heebo. Canvas: 1920x1080px.
- Output format: JSON AST only — no HTML, no CSS.
- Every slide must have a unique layout — never repeat the same composition.
</constraints>

<visualization_process>
Before outputting each slide, you MUST mentally visualize it as if looking at the final rendered result:
1. Picture every element on the 1920x1080 canvas at its exact x, y, width, height.
2. Verify no text overlaps other text unintentionally.
3. Verify no text sits on top of an image without a readable contrast layer between them.
4. Verify images don't cover important text elements.
5. Confirm the overall composition feels balanced, intentional, and magazine-quality.
If any issue is found, fix it before outputting the JSON.
</visualization_process>`

async function getSystemInstruction(): Promise<string> {
  return getConfig('ai_prompts', 'slide_designer.system_instruction', SYSTEM_INSTRUCTION_DEFAULT)
}

// ─── Layout Archetypes (anti-generic design) ──────────────

const LAYOUT_ARCHETYPES = [
  'Brutalist typography — oversized title with negative overflow, transparent watermark text behind',
  'Asymmetric split — uneven division with a decorative element crossing the dividing line',
  'Overlapping Z-index cards — layered cards with fake-3D shadows creating depth',
  'Full-bleed image — edge-to-edge image with gradient overlay and text floating on top',
  'Diagonal grid — angled composition with rotated text and thin grid lines',
  'Bento box — asymmetric grid of mixed-size cells with visual data inside',
  'Magazine spread — editorial layout with a large pull-quote and dominant image',
  'Data art — oversized numbers as the visual centerpiece with minimal decoration',
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
  whyNow:    { energy: 'peak', density: 'balanced', surprise: true, maxElements: 10, minWhitespace: 30 },
  competitive: { energy: 'building', density: 'dense', surprise: false, maxElements: 16, minWhitespace: 20 },
  contentStrategy: { energy: 'calm', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
  timeline:  { energy: 'building', density: 'balanced', surprise: false, maxElements: 14, minWhitespace: 25 },
  closing:   { energy: 'finale', density: 'minimal', surprise: true, maxElements: 8, minWhitespace: 45 },
}

// ─── Design Principles (positive patterns — tell the model what TO DO) ──
const DESIGN_PRINCIPLES = `
- Use asymmetric compositions — offset titles, uneven columns, dynamic diagonal flow
- Create strong scale contrast between heading and body text (large titles, small labels)
- Give every readable text element enough contrast against its background (opacity ≥ 0.7)
- Keep clear breathing room around the main title
- Vary card sizes when using multiple cards — make each one different
- Use rich gradients (radial, multi-stop) rather than flat single-color fills
`

// ─── Depth Layering ───────────────────────
const DEPTH_LAYERS = `
zIndex guide: 0-1 = background layers | 2-3 = decorative elements (watermarks, shapes) | 4-5 = structural elements (cards, dividers) | 6-8 = content (text, data, images) | 9-10 = hero elements (main title, key number)
`

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

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y
}

function isImageElement(el: SlideElement): el is ImageElement {
  return el.type === 'image'
}

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
  const sysInstruction = await getSystemInstruction()
  const models = await getSlideDesignerModels()
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for design system (attempt ${attempt + 1}/${models.length})...`)
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: sysInstruction,
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

  // ── Image creative role per slide type (conceptual, not pixel-based) ──
  const IMAGE_ROLE_HINTS: Record<string, string> = {
    cover: 'The image IS the hero — it is the first thing the viewer sees. Let it dominate.',
    brief: 'The image accompanies the story — it supports the text, not competes with it.',
    audience: 'The image represents the people — large, immersive, human.',
    insight: 'The image creates atmosphere — dramatic backdrop or visual element reinforcing the insight.',
    bigIdea: 'The image IS the idea — the visual is the star, text complements it.',
    strategy: 'The image anchors — a visual anchor point that adds depth to the text.',
    approach: 'The image is an accent — a surprising element that adds visual interest.',
    closing: 'The image closes the circle — warm atmosphere, invitation, strong ending.',
    whyNow: 'The image captures urgency — trending visuals, timely context, market energy.',
    competitive: 'The image maps the landscape — abstract market visualization or brand positioning.',
    contentStrategy: 'The image previews content — creative examples, platform visuals, content mood.',
    timeline: 'The image shows progress — journey, roadmap, forward motion.',
  }

  // ── Build per-slide directives ──
  const slidesDescription = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
    const contentJson = JSON.stringify(slide.content, null, 2)
    const imageRoleHint = IMAGE_ROLE_HINTS[slide.slideType] || 'An image that reinforces the slide message.'
    const archetype = LAYOUT_ARCHETYPES[(globalIndex + batchIndex * 3) % LAYOUT_ARCHETYPES.length]

    return `
<slide index="${globalIndex + 1}" total="${batchContext.totalSlides}" type="${slide.slideType}" title="${slide.title}">
  <energy>${pacing.energy}</energy>
  <layout_inspiration>${archetype}</layout_inspiration>
  ${slide.imageUrl ? `<image url="${slide.imageUrl}" role="${imageRoleHint}" />` : '<no_image>Use decorative shapes, watermarks, and dramatic typography instead.</no_image>'}
  <content>
${contentJson}
  </content>
</slide>`
  }).join('\n')

  const prompt = `<task>
Design ${slides.length} premium presentation slides for the brand "${brandName}".
All slide content must be in Hebrew. All text is RTL with textAlign "right".
</task>

<creative_brief>
${cd ? `
Visual Metaphor: ${cd.visualMetaphor}
Visual Tension: ${cd.visualTension}
Master Rule (every slide must follow): ${cd.oneRule}
Color Story: ${cd.colorStory}
Typography Voice: ${cd.typographyVoice}
Emotional Arc: ${cd.emotionalArc}
` : `Think like a Creative Director — what is the visual metaphor for "${brandName}"? What creates tension? What surprises?`}
</creative_brief>

<design_system>
Canvas: 1920×1080px | Direction: RTL (Hebrew) | Font: Heebo

Colors: primary ${colors.primary} | secondary ${colors.secondary} | accent ${colors.accent}
Background: ${colors.background} | Text: ${colors.text} | Cards: ${colors.cardBg}
Muted: ${colors.muted} | Highlight: ${colors.highlight}
Aurora gradient: ${effects.auroraGradient}

Typography sizes: display ${typo.displaySize}px | heading ${typo.headingSize}px | body ${typo.bodySize}px | caption ${typo.captionSize}px
Letter spacing: tight ${typo.letterSpacingTight} | wide ${typo.letterSpacingWide}
Weight pairs: ${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}
Line height: tight ${typo.lineHeightTight} | relaxed ${typo.lineHeightRelaxed}

Card: padding ${designSystem.spacing.cardPadding}px | gap ${designSystem.spacing.cardGap}px | radius ${effects.borderRadiusValue}px
Decorative style: ${effects.decorativeStyle} | Shadow: ${effects.shadowStyle}

Brand motif: ${motif.type} (opacity: ${motif.opacity}, color: ${motif.color})
${motif.implementation}
</design_system>

<design_principles>
${DESIGN_PRINCIPLES}
${DEPTH_LAYERS}
</design_principles>

<element_format>
Shape: { "id", "type": "shape", "x", "y", "width", "height", "zIndex", "shapeType": "background"|"decorative"|"divider", "fill": "#hex or gradient", "clipPath", "borderRadius", "opacity", "rotation", "border" }
Text:  { "id", "type": "text", "x", "y", "width", "height", "zIndex", "content": "Hebrew text", "fontSize", "fontWeight": 100-900, "color", "textAlign": "right", "role": "title"|"subtitle"|"body"|"caption"|"label"|"decorative", "lineHeight", "letterSpacing", "opacity", "rotation", "textStroke": { "width", "color" } }
Image: { "id", "type": "image", "x", "y", "width", "height", "zIndex", "src": "THE_URL", "objectFit": "cover", "borderRadius" }
Note: role "decorative" = large watermark text, low opacity, rotated, fontSize 200+, used as visual texture.
</element_format>

<reference_examples>
These examples show the QUALITY LEVEL expected. Create completely DIFFERENT designs — do not copy these layouts.

Example 1 — Cover slide (Typographic Brutalism, no image):
\`\`\`json
{
  "id": "slide-1", "slideType": "cover", "label": "שער",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "bg", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0, "shapeType": "background", "fill": "radial-gradient(circle at 20% 30%, ${colors.primary}50 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${colors.accent}50 0%, transparent 50%)", "opacity": 0.7 },
    { "id": "watermark", "type": "text", "x": -150, "y": 180, "width": 2200, "height": 500, "zIndex": 2, "content": "BRAND", "fontSize": 380, "fontWeight": 900, "color": "transparent", "textAlign": "center", "lineHeight": 0.9, "letterSpacing": -8, "opacity": 0.12, "rotation": -8, "textStroke": { "width": 2, "color": "#ffffff" }, "role": "decorative" },
    { "id": "title", "type": "text", "x": 120, "y": 380, "width": 900, "height": 200, "zIndex": 10, "content": "שם המותג", "fontSize": ${typo.displaySize}, "fontWeight": 900, "color": "${colors.text}", "textAlign": "right", "lineHeight": 1.0, "letterSpacing": -4, "role": "title" },
    { "id": "subtitle", "type": "text", "x": 120, "y": 610, "width": 600, "height": 50, "zIndex": 8, "content": "הצעת שיתוף פעולה", "fontSize": 22, "fontWeight": 300, "color": "${colors.text}70", "textAlign": "right", "letterSpacing": 6, "role": "subtitle" }
  ]
}
\`\`\`

Example 2 — Brief slide WITH image (Asymmetric Split):
\`\`\`json
{
  "id": "slide-2", "slideType": "brief", "label": "למה התכנסנו?",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "bg", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0, "shapeType": "background", "fill": "${colors.background}", "opacity": 1 },
    { "id": "img", "type": "image", "x": 80, "y": 100, "width": 720, "height": 880, "zIndex": 5, "src": "THE_IMAGE_URL", "objectFit": "cover", "borderRadius": 20 },
    { "id": "title", "type": "text", "x": 880, "y": 200, "width": 900, "height": 100, "zIndex": 10, "content": "למה התכנסנו?", "fontSize": 52, "fontWeight": 800, "color": "${colors.text}", "textAlign": "right", "lineHeight": 1.1, "letterSpacing": -2, "role": "title" },
    { "id": "body", "type": "text", "x": 880, "y": 340, "width": 900, "height": 500, "zIndex": 8, "content": "תוכן הבריף כאן...", "fontSize": 20, "fontWeight": 300, "color": "${colors.text}90", "textAlign": "right", "lineHeight": 1.6, "role": "body" }
  ]
}
\`\`\`
</reference_examples>

<previous_slides>
${batchContext.previousSlidesVisualSummary
    ? `The following slides have already been designed. Each new slide must have a DIFFERENT layout, different dominant color usage, and different title placement.\n${batchContext.previousSlidesVisualSummary}`
    : 'This is the first batch — no previous context.'}
</previous_slides>

<slides_to_create>
${slidesDescription}
</slides_to_create>

<technical_rules>
- textAlign: "right" always (RTL). All content text in Hebrew.
- ${DEPTH_LAYERS}
- Supported properties only: no box-shadow, no backdrop-filter, no filter:blur.
- Fake 3D depth: use a shape at x+12, y+12 with fill:#000 opacity:0.12-0.18.
</technical_rules>

<final_instruction>
Before returning the JSON, mentally render each slide in your mind:
1. VISUALIZE the 1920x1080 canvas with all elements at their exact positions.
2. CHECK: Can I read every text element clearly? Is anything hidden behind another element?
3. CHECK: If there is an image, does it have its own space? Is text placed in a separate area?
4. CHECK: Does the overall composition feel like a premium magazine page?
5. If any check fails, fix the layout before outputting.
Only use image URLs that are explicitly provided in the slide data. Never invent image URLs.
</final_instruction>`

  // Flash first (fast + cheap), Pro fallback with exponential backoff
  const batchSysInstruction = await getSystemInstruction()
  const batchModels = await getSlideDesignerModels()
  for (let attempt = 0; attempt < batchModels.length; attempt++) {
    const model = batchModels[attempt]
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${model} for batch (attempt ${attempt + 1}/${batchModels.length})...`)
      console.log(`[SlideDesigner][${requestId}] PROMPT LENGTH: ${prompt.length} chars`)
      console.log(`[SlideDesigner][${requestId}] PROMPT PREVIEW:\n${prompt.slice(0, 2000)}${prompt.length > 2000 ? '\n... [truncated]' : ''}`)
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: batchSysInstruction,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          maxOutputTokens: 65536,
          temperature: 1.0, // Gemini 3 recommended default — do not lower
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
        // ── DEBUG: Log raw response and parsed details ──
        const rawText = response.text || ''
        console.log(`[SlideDesigner][${requestId}] RAW RESPONSE (${rawText.length} chars):\n${rawText.slice(0, 3000)}${rawText.length > 3000 ? '\n... [truncated]' : ''}`)
        parsed.slides.forEach((s, idx) => {
          const elTypes: Record<string, number> = {}
          for (const el of s.elements || []) elTypes[el.type] = (elTypes[el.type] || 0) + 1
          const typeStr = Object.entries(elTypes).map(([t, c]) => `${t} x${c}`).join(', ')
          console.log(`[SlideDesigner][${requestId}]   PARSED Slide ${idx + 1} (${s.slideType}): ${s.elements?.length || 0} elements [${typeStr}], bg: ${s.background?.type}=${s.background?.value?.slice(0, 60)}`)
        })
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
  expectedImageUrl?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []
  let score = 100

  const elements: SlideElement[] = slide.elements || []
  const textElements = elements.filter(isTextElement)
  const imageElements = elements.filter(isImageElement)
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

  // ── Image validation ──
  if (expectedImageUrl && imageElements.length === 0) {
    issues.push({ severity: 'warning', category: 'missing-image', message: 'Slide has imageUrl but no image element', autoFixable: true })
    score -= 20
  }

  for (const img of imageElements) {
    // Out of bounds
    const ix = img.x || 0, iy = img.y || 0, iw = img.width || 0, ih = img.height || 0
    if (ix < -10 || iy < -10 || ix + iw > 1930 || iy + ih > 1090) {
      issues.push({ severity: 'warning', category: 'image-bounds', message: `Image "${img.id}" out of canvas bounds`, elementId: img.id, autoFixable: true })
      score -= 10
    }

    // Too small (less than 15% of canvas — very small)
    const imgArea = iw * ih
    const canvasArea = 1920 * 1080
    if (imgArea > 0 && imgArea < canvasArea * 0.15) {
      issues.push({ severity: 'suggestion', category: 'image-small', message: `Image "${img.id}" is only ${Math.round(imgArea / canvasArea * 100)}% of canvas`, elementId: img.id, autoFixable: true })
      score -= 5
    }

    // Overlaps title
    const imgBox: BoundingBox = { x: ix, y: iy, width: iw, height: ih }
    const titles = contentTexts.filter(e => e.role === 'title')
    for (const title of titles) {
      const titleBox: BoundingBox = { x: title.x || 0, y: title.y || 0, width: title.width || 0, height: title.height || 0 }
      if (boxesOverlap(imgBox, titleBox)) {
        issues.push({ severity: 'warning', category: 'image-overlap-title', message: `Image "${img.id}" overlaps title "${title.id}"`, elementId: img.id, autoFixable: true })
        score -= 12
      }
    }
  }

  // Balance
  const balance = computeBalanceScore(allBoxes)
  if (balance < 0.3) {
    issues.push({ severity: 'suggestion', category: 'balance', message: `Balance ${(balance * 100).toFixed(0)}/100`, autoFixable: false })
    score -= 5
  }

  return { valid: issues.filter(i => i.severity === 'critical').length === 0, score: Math.max(0, score), issues }
}

function autoFixSlide(slide: Slide, issues: ValidationIssue[], designSystem: PremiumDesignSystem, expectedImageUrl?: string): Slide {
  const fixed = { ...slide, elements: [...slide.elements] }

  for (const issue of issues) {
    if (!issue.autoFixable) continue

    // Missing image — inject a default image element on the right side
    if (issue.category === 'missing-image' && expectedImageUrl) {
      const imgElement: ImageElement = {
        id: `autofix-img-${slide.id}`, type: 'image',
        x: 80, y: 100, width: 720, height: 880, zIndex: 5,
        src: expectedImageUrl, objectFit: 'cover', borderRadius: 20,
      }
      fixed.elements.push(imgElement)
      continue
    }

    if (!issue.elementId) continue
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

    // Image out of bounds — clamp to canvas
    if (issue.category === 'image-bounds') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        updated.x = Math.max(0, updated.x)
        updated.y = Math.max(0, updated.y)
        if (updated.x + updated.width > 1920) updated.width = 1920 - updated.x
        if (updated.y + updated.height > 1080) updated.height = 1080 - updated.y
        fixed.elements[elIndex] = updated
      }
    }

    // Image too small — enlarge to at least 25% of canvas
    if (issue.category === 'image-small') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        const targetArea = 1920 * 1080 * 0.25
        const currentArea = updated.width * updated.height
        if (currentArea > 0 && currentArea < targetArea) {
          const scale = Math.sqrt(targetArea / currentArea)
          updated.width = Math.min(1920, Math.round(updated.width * scale))
          updated.height = Math.min(1080, Math.round(updated.height * scale))
          // Clamp position
          if (updated.x + updated.width > 1920) updated.x = 1920 - updated.width
          if (updated.y + updated.height > 1080) updated.y = 1080 - updated.height
          updated.x = Math.max(0, updated.x)
          updated.y = Math.max(0, updated.y)
        }
        fixed.elements[elIndex] = updated
      }
    }

    // Image overlaps title — move image to opposite side
    if (issue.category === 'image-overlap-title') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        // Find the title to determine which side it's on
        const titles = fixed.elements.filter(e => isTextElement(e) && e.role === 'title') as TextElement[]
        if (titles.length > 0) {
          const titleCenterX = (titles[0].x || 0) + (titles[0].width || 0) / 2
          // Move image to the opposite half
          if (titleCenterX > 960) {
            // Title on right → image to left
            updated.x = 80
          } else {
            // Title on left → image to right
            updated.x = 1920 - updated.width - 80
          }
        }
        fixed.elements[elIndex] = updated
      }
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

  const elements: SlideElement[] = [
    { id: `fb-${index}-bg`, type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
      shapeType: 'decorative', fill: `radial-gradient(circle at 50% 50%, ${colors.cardBg} 0%, ${colors.background} 100%)`, opacity: 1 },
    { id: `fb-${index}-line`, type: 'shape', x: input.imageUrl ? 880 : 120, y: 200, width: 60, height: 4, zIndex: 4,
      shapeType: 'decorative', fill: colors.accent, opacity: 0.8 },
    { id: `fb-${index}-title`, type: 'text', x: input.imageUrl ? 880 : 120, y: 220, width: input.imageUrl ? 900 : 800, height: 100, zIndex: 10,
      content: title, fontSize: typo.headingSize, fontWeight: (typo.weightPairs[0]?.[0] || 800) as FontWeight,
      color: colors.text, textAlign: 'right', lineHeight: typo.lineHeightTight,
      letterSpacing: typo.letterSpacingTight, role: 'title' },
    { id: `fb-${index}-motif`, type: 'shape', x: -100, y: 800, width: 2200, height: 1, zIndex: 2,
      shapeType: 'decorative', fill: colors.muted, opacity: designSystem.motif.opacity, rotation: 15 },
  ]

  // Add image element when imageUrl is available
  if (input.imageUrl) {
    elements.push({
      id: `fb-${index}-img`, type: 'image',
      x: 80, y: 100, width: 720, height: 880, zIndex: 5,
      src: input.imageUrl, objectFit: 'cover', borderRadius: 20,
    })
  }

  return {
    id: `slide-fallback-${index}`,
    slideType: input.slideType as SlideType,
    label: input.title,
    background: { type: 'solid', value: colors.background },
    elements,
  }
}

// ═══════════════════════════════════════════════════════════
//  DATA TYPES
// ═══════════════════════════════════════════════════════════

interface InfluencerResearchData {
  strategySummary?: string
  strategyTitle?: string
  recommendations?: { name?: string; handle?: string; followers?: string; engagement?: string; whyRelevant?: string; profilePicUrl?: string }[]
  contentThemes?: { theme?: string; description?: string }[]
  tiers?: { name?: string; description?: string; recommendedCount?: number; budgetAllocation?: number; purpose?: string }[]
  expectedKPIs?: { metric?: string; target?: string; rationale?: string }[]
  suggestedTimeline?: { phase?: string; duration?: string; activities?: string[] }[]
  potentialRisks?: { risk?: string; mitigation?: string }[]
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
  successMetrics?: string[]
  clientSpecificRequests?: string[]
  measurableTargets?: { metric: string; value: string; timeline: string }[]
  influencerStrategy?: string
  influencerCriteria?: string[]
  contentGuidelines?: string[]
  influencerResearch?: InfluencerResearchData
  scrapedInfluencers?: { name?: string; username?: string; profilePicUrl?: string; followers?: number; engagementRate?: number }[]
  enhancedInfluencers?: { name: string; username: string; profilePicUrl: string; categories: string[]; followers: number; engagementRate: number }[]
  _brandColors?: { primary: string; secondary: string; accent: string; background?: string; text?: string; style?: string; mood?: string; palette?: string[] }
  _brandResearch?: {
    industry?: string
    brandPersonality?: string[]
    brandValues?: string[]
    brandPromise?: string
    companyDescription?: string
    whyNowTrigger?: string
    israeliMarketContext?: string
    dominantPlatformInIsrael?: string
    competitiveGap?: string
    competitiveAdvantages?: string[]
    uniqueSellingPoints?: string[]
    marketPosition?: string
    competitors?: { name?: string; description?: string; differentiator?: string }[]
    competitorCampaigns?: { competitorName?: string; campaignDescription?: string; opportunityForBrand?: string }[]
    industryTrends?: string[]
    targetDemographics?: { primaryAudience?: { gender?: string; ageRange?: string; socioeconomic?: string; lifestyle?: string; interests?: string[]; painPoints?: string[]; aspirations?: string[] }; behavior?: string; purchaseDrivers?: string[] }
    toneOfVoice?: string
    suggestedApproach?: string
    [key: string]: unknown
  }
  _scraped?: { logoUrl?: string; [key: string]: unknown }
  _generatedImages?: Record<string, string>
  _extraImages?: { id: string; url: string; placement: string }[]
  _imageStrategy?: { conceptSummary?: string; visualDirection?: string; styleGuide?: string }
  _influencerStrategy?: InfluencerResearchData
  [key: string]: unknown
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

/** Remove empty/null/undefined/[] fields so the AI prompt isn't cluttered */
function cleanContent(content: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(content)) {
    if (v === '' || v === null || v === undefined) continue
    if (Array.isArray(v) && v.length === 0) continue
    cleaned[k] = v
  }
  return cleaned
}

/** Split an array into chunks of max size */
function chunkByMax<T>(arr: T[], max: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += max) {
    chunks.push(arr.slice(i, i + max))
  }
  return chunks
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
  const br = data._brandResearch || {}
  const ir = data._influencerStrategy || data.influencerResearch || {} as InfluencerResearchData

  // Build a map of extra images by placement for easy lookup
  const extraByPlacement: Record<string, string> = {}
  for (const img of config.extraImages || []) {
    if (img.url && img.placement) extraByPlacement[img.placement] = img.url
  }

  // ── Build all slides in narrative order ──
  const allSlides: SlideContentInput[] = []

  // 1. Cover
  allSlides.push({ slideType: 'cover', title: 'שער', imageUrl: config.images?.coverImage, content: cleanContent({
    brandName: data.brandName,
    campaignSubtitle: data.campaignSubtitle || data.strategyHeadline || 'הצעת שיתוף פעולה',
    issueDate: data.issueDate || new Date().toLocaleDateString('he-IL'),
    industry: br.industry,
    tagline: br.brandPromise,
  }) })

  // 2. Brief
  allSlides.push({ slideType: 'brief', title: 'למה התכנסנו?', imageUrl: config.images?.brandImage, content: cleanContent({
    headline: 'למה התכנסנו?',
    brandBrief: data.brandBrief,
    painPoints: data.brandPainPoints,
    objective: data.brandObjective,
    successMetrics: data.successMetrics,
    clientRequests: data.clientSpecificRequests,
    companyDescription: br.companyDescription,
    brandValues: br.brandValues,
    whyNow: br.whyNowTrigger,
  }) })

  // 3. Goals
  allSlides.push({ slideType: 'goals', title: 'מטרות הקמפיין', imageUrl: extraByPlacement['goals'], content: cleanContent({
    headline: 'מטרות הקמפיין',
    goals: data.goalsDetailed || (data.goals || []).map(g => ({ title: g, description: '' })),
    measurableTargets: data.measurableTargets,
    successMetrics: data.successMetrics,
  }) })

  // 4. Audience
  allSlides.push({ slideType: 'audience', title: 'קהל היעד', imageUrl: config.images?.audienceImage, content: cleanContent({
    headline: 'קהל היעד',
    gender: data.targetGender,
    ageRange: data.targetAgeRange,
    description: data.targetDescription,
    behavior: data.targetBehavior,
    insights: data.targetInsights,
    researchDemographics: br.targetDemographics?.primaryAudience,
    purchaseDrivers: br.targetDemographics?.purchaseDrivers,
  }) })

  // 5. Insight
  allSlides.push({ slideType: 'insight', title: 'התובנה המרכזית', imageUrl: extraByPlacement['insight'], content: cleanContent({
    headline: 'התובנה המרכזית',
    keyInsight: data.keyInsight,
    source: data.insightSource,
    data: data.insightData,
    israeliMarketContext: br.israeliMarketContext,
    industryTrends: (br.industryTrends || []).slice(0, 3),
  }) })

  // 6. (Conditional) Why Now
  const hasWhyNow = br.whyNowTrigger || (br.industryTrends && br.industryTrends.length > 0)
  if (hasWhyNow) {
    allSlides.push({ slideType: 'whyNow', title: 'למה עכשיו?', imageUrl: extraByPlacement['whyNow'], content: cleanContent({
      headline: 'למה עכשיו?',
      whyNowTrigger: br.whyNowTrigger,
      industryTrends: br.industryTrends,
      israeliMarketContext: br.israeliMarketContext,
    }) })
  }

  // 7. Strategy
  allSlides.push({ slideType: 'strategy', title: 'האסטרטגיה', imageUrl: extraByPlacement['strategy'], content: cleanContent({
    headline: 'האסטרטגיה',
    strategyHeadline: data.strategyHeadline,
    description: data.strategyDescription,
    pillars: data.strategyPillars,
    flow: data.strategyFlow as unknown,
    competitiveGap: br.competitiveGap,
  }) })

  // 8. (Conditional) Competitive Landscape
  const competitors = br.competitors || []
  if (competitors.length >= 2) {
    allSlides.push({ slideType: 'competitive', title: 'נוף תחרותי', content: cleanContent({
      headline: 'נוף תחרותי',
      competitors: competitors.slice(0, 5).map(c => ({ name: c.name, description: c.description })),
      marketPosition: br.marketPosition,
      competitiveAdvantages: br.competitiveAdvantages,
      usp: (br.uniqueSellingPoints || []).slice(0, 3),
      competitiveGap: br.competitiveGap,
    }) })
  }

  // 9. Big Idea
  allSlides.push({ slideType: 'bigIdea', title: 'הרעיון המרכזי', imageUrl: config.images?.activityImage || config.images?.brandImage, content: cleanContent({
    headline: data.activityTitle || 'הרעיון המרכזי',
    concept: data.activityConcept,
    description: data.activityDescription,
    differentiator: data.activityDifferentiator,
    brandPersonality: br.brandPersonality,
  }) })

  // 10. Approach
  allSlides.push({ slideType: 'approach', title: 'הגישה שלנו', imageUrl: extraByPlacement['approach'], content: cleanContent({
    headline: 'הגישה שלנו',
    approaches: data.activityApproach,
    differentiator: data.activityDifferentiator,
    contentThemes: (ir.contentThemes || []).slice(0, 4),
  }) })

  // 11. Deliverables
  const quantitiesSummary = data.quantitiesSummary as { campaignDurationMonths?: number; totalDeliverables?: number } | undefined
  allSlides.push({ slideType: 'deliverables', title: 'תוצרים', content: cleanContent({
    headline: 'תוצרים',
    deliverables: data.deliverablesDetailed || (data.deliverables || []).map(d => ({ type: d, quantity: 1, description: '' })),
    summary: data.deliverablesSummary,
    campaignDuration: quantitiesSummary?.campaignDurationMonths ? `${quantitiesSummary.campaignDurationMonths} חודשים` : undefined,
    totalDeliverables: quantitiesSummary?.totalDeliverables,
  }) })

  // 12. Metrics
  allSlides.push({ slideType: 'metrics', title: 'יעדים ומדדים', content: cleanContent({
    headline: 'יעדים ומדדים',
    budget: data.budget ? `${currency}${formatNum(data.budget)}` : undefined,
    reach: formatNum(data.potentialReach),
    engagement: formatNum(data.potentialEngagement),
    impressions: formatNum(data.estimatedImpressions),
    cpe: data.cpe ? `${currency}${data.cpe.toFixed(1)}` : undefined,
    cpm: data.cpm ? `${currency}${data.cpm.toFixed(1)}` : undefined,
    explanation: data.metricsExplanation,
    successMetrics: data.successMetrics,
    measurableTargets: data.measurableTargets,
    expectedKPIs: (ir.expectedKPIs || []).slice(0, 5),
  }) })

  // 13. Influencer Strategy
  allSlides.push({ slideType: 'influencerStrategy', title: 'אסטרטגיית משפיענים', content: cleanContent({
    headline: 'אסטרטגיית משפיענים',
    strategy: data.influencerStrategy || ir.strategySummary,
    criteria: data.influencerCriteria || (ir.contentThemes || []).map((t: { theme?: string }) => t.theme).filter(Boolean),
    guidelines: data.contentGuidelines,
    tiers: (ir.tiers || []).map(t => ({ name: t.name, description: t.description, count: t.recommendedCount })),
    timelinePhases: (ir.suggestedTimeline || []).map(t => ({ phase: t.phase, duration: t.duration, activities: t.activities })),
  }) })

  // 14. (Conditional) Content Strategy
  const hasContentStrategy = (ir.contentThemes || []).length >= 2 || (ir.tiers || []).length >= 2
  if (hasContentStrategy) {
    allSlides.push({ slideType: 'contentStrategy', title: 'אסטרטגיית תוכן', content: cleanContent({
      headline: 'אסטרטגיית תוכן',
      contentThemes: (ir.contentThemes || []).slice(0, 5).map(t => ({ theme: t.theme, description: t.description })),
      tiers: (ir.tiers || []).map(t => ({ name: t.name, description: t.description, count: t.recommendedCount, budgetAllocation: t.budgetAllocation })),
      dominantPlatform: br.dominantPlatformInIsrael,
    }) })
  }

  // 15. Influencers (conditional)
  const influencers = data.enhancedInfluencers || data.scrapedInfluencers?.map(i => ({
    name: i.name || i.username || '', username: i.username || '', profilePicUrl: i.profilePicUrl || '',
    categories: [] as string[], followers: i.followers || 0, engagementRate: i.engagementRate || 0,
  })) || []
  const aiRecs = ir.recommendations || []

  if (influencers.length > 0 || aiRecs.length > 0) {
    allSlides.push({
      slideType: 'influencers', title: 'משפיענים מומלצים',
      content: cleanContent({
        headline: 'משפיענים מומלצים',
        influencers: influencers.slice(0, 6).map(inf => ({ name: inf.name, username: inf.username, profilePicUrl: inf.profilePicUrl, followers: formatNum(inf.followers), engagementRate: `${inf.engagementRate?.toFixed(1) || '0'}%`, categories: inf.categories?.join(', ') || '' })),
        aiRecommendations: aiRecs.slice(0, 6).map((rec: { name?: string; handle?: string; followers?: string; engagement?: string; whyRelevant?: string; profilePicUrl?: string }) => ({ name: rec.name || '', handle: rec.handle || '', followers: rec.followers || '', engagement: rec.engagement || '', reason: rec.whyRelevant || '', profilePicUrl: rec.profilePicUrl || '' })),
      }),
    })
  }

  // 16. (Conditional) Timeline
  const hasTimeline = (data.measurableTargets || []).length > 0 || (ir.suggestedTimeline || []).length > 0
  if (hasTimeline) {
    allSlides.push({ slideType: 'timeline', title: 'מפת דרכים', content: cleanContent({
      headline: 'מפת דרכים',
      measurableTargets: data.measurableTargets,
      timelinePhases: (ir.suggestedTimeline || []).map(t => ({ phase: t.phase, duration: t.duration, activities: t.activities })),
      campaignDuration: quantitiesSummary?.campaignDurationMonths ? `${quantitiesSummary.campaignDurationMonths} חודשים` : undefined,
      expectedKPIs: (ir.expectedKPIs || []).slice(0, 4),
    }) })
  }

  // 17. Closing (always last)
  allSlides.push({ slideType: 'closing', title: 'סיום', content: cleanContent({
    brandName: data.brandName || '',
    headline: 'בואו ניצור ביחד',
    subheadline: `נשמח להתחיל לעבוד עם ${data.brandName}`,
  }) })

  // ── Split into small batches of max 2 for quality ──
  // Gemini struggles with 6 slides per batch (returns 1 instead of 6).
  // 2 slides per batch = reliable output with full element detail.
  return chunkByMax(allSlides, 2)
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

  // ── DEBUG: Log all slide content that will be sent to AI ──
  console.log(`[SlideDesigner][${requestId}] ═══ BATCH CONTENT DUMP ═══`)
  allBatches.forEach((batch, bi) => {
    batch.forEach((slide, si) => {
      const contentKeys = Object.keys(slide.content)
      const nonEmptyKeys = contentKeys.filter(k => {
        const v = slide.content[k]
        return v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
      })
      console.log(`[SlideDesigner][${requestId}]   Batch ${bi + 1}, Slide ${si + 1} (${slide.slideType}): ${nonEmptyKeys.length}/${contentKeys.length} fields filled [${nonEmptyKeys.join(', ')}]${slide.imageUrl ? ' +image' : ''}`)
      console.log(`[SlideDesigner][${requestId}]     content: ${JSON.stringify(slide.content).slice(0, 500)}`)
    })
  })
  console.log(`[SlideDesigner][${requestId}] ═══ END BATCH CONTENT DUMP ═══`)

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

  // Build flat list of expected image URLs for validation
  const allInputs = allBatches.flat()

  // ── Validate + auto-fix ──
  console.log(`[SlideDesigner][${requestId}] ═══ VALIDATION ═══`)
  const validatedSlides: Slide[] = []
  let totalScore = 0

  for (let si = 0; si < allSlides.length; si++) {
    const slide = allSlides[si]
    const expectedImage = allInputs[si]?.imageUrl
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
    const result = validateSlide(slide, designSystem, pacing, expectedImage)
    totalScore += result.score
    const issueStr = result.issues.length > 0 ? result.issues.map(i => `${i.category}(${i.severity}${i.autoFixable ? ',fix' : ''})`).join(', ') : 'clean'
    console.log(`[SlideDesigner][${requestId}]   Slide ${si + 1} (${slide.slideType}): score=${result.score}, issues=[${issueStr}]`)
    if (result.issues.some(i => i.autoFixable)) {
      validatedSlides.push(autoFixSlide(slide, result.issues, designSystem, expectedImage))
    } else {
      validatedSlides.push(slide)
    }
  }
  console.log(`[SlideDesigner][${requestId}] ═══ END VALIDATION ═══`)

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

  // ── DEBUG: Log all slide content for staged pipeline ──
  console.log(`[SlideDesigner][${requestId}] ═══ FOUNDATION BATCH CONTENT ═══`)
  allBatches.forEach((batch, bi) => {
    batch.forEach((slide, si) => {
      const contentKeys = Object.keys(slide.content)
      const nonEmptyKeys = contentKeys.filter(k => {
        const v = slide.content[k]
        return v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
      })
      console.log(`[SlideDesigner][${requestId}]   Batch ${bi + 1}, Slide ${si + 1} (${slide.slideType}): ${nonEmptyKeys.length}/${contentKeys.length} fields [${nonEmptyKeys.join(', ')}]${slide.imageUrl ? ' +image' : ''}`)
      console.log(`[SlideDesigner][${requestId}]     content: ${JSON.stringify(slide.content).slice(0, 500)}`)
    })
  })
  // Also log what research data is available
  console.log(`[SlideDesigner][${requestId}] _brandResearch keys: ${d._brandResearch ? Object.keys(d._brandResearch).join(', ') : 'NONE'}`)
  console.log(`[SlideDesigner][${requestId}] _influencerStrategy keys: ${d._influencerStrategy ? Object.keys(d._influencerStrategy).join(', ') : 'NONE'}`)
  console.log(`[SlideDesigner][${requestId}] ═══ END FOUNDATION BATCH CONTENT ═══`)

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

  // Build flat list of expected image URLs for validation
  const allInputs = foundation.batches.flat()

  console.log(`[SlideDesigner][${requestId}] ═══ FINALIZE VALIDATION ═══`)
  const validatedSlides: Slide[] = []
  let totalScore = 0

  for (let si = 0; si < allSlides.length; si++) {
    const slide = allSlides[si]
    const expectedImage = allInputs[si]?.imageUrl
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
    const result = validateSlide(slide, foundation.designSystem, pacing, expectedImage)
    totalScore += result.score
    const issueStr = result.issues.length > 0 ? result.issues.map(i => `${i.category}(${i.severity}${i.autoFixable ? ',fix' : ''})`).join(', ') : 'clean'
    console.log(`[SlideDesigner][${requestId}]   Slide ${si + 1} (${slide.slideType}): score=${result.score}, issues=[${issueStr}]`)
    if (result.issues.some(i => i.autoFixable)) {
      validatedSlides.push(autoFixSlide(slide, result.issues, foundation.designSystem, expectedImage))
    } else {
      validatedSlides.push(slide)
    }
  }
  console.log(`[SlideDesigner][${requestId}] ═══ END FINALIZE VALIDATION ═══`)

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
  const expectedImage = slideContent.imageUrl
  const validation = validateSlide(slides[0], designSystem, pacing, expectedImage)
  if (validation.issues.some(i => i.autoFixable)) {
    return autoFixSlide(slides[0], validation.issues, designSystem, expectedImage)
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
