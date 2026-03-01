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
  CuratedSlideContent,
} from '@/types/presentation'
import { isTextElement } from '@/types/presentation'
import { curateSlideContent } from './content-curator'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})
import { getConfig } from '@/lib/config/admin-config'
import {
  PROMPT_DEFAULTS,
  DESIGN_DEFAULTS,
  MODEL_DEFAULTS,
  PIPELINE_DEFAULTS,
} from '@/lib/config/defaults'

// Model defaults removed — now sourced from MODEL_DEFAULTS in defaults.ts

/** Extract detailed error info including nested cause chain (Node fetch errors hide details in .cause) */
function detailedError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts: string[] = [error.message]
  // Node.js fetch errors have a .cause with the real reason
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
  // Include error code if present (e.g., ECONNRESET, ETIMEDOUT)
  const code = (error as Error & { code?: string }).code
  if (code) parts.push(`code: ${code}`)
  return parts.join(' → ')
}

/** Models for Design System (foundation) — Pro first for quality */
async function getDesignSystemModels(): Promise<string[]> {
  const primary = await getConfig('ai_models', 'slide_designer.primary_model', MODEL_DEFAULTS['slide_designer.primary_model'].value as string)
  const fallback = await getConfig('ai_models', 'slide_designer.fallback_model', MODEL_DEFAULTS['slide_designer.fallback_model'].value as string)
  return [primary, fallback]
}

/** Models for Batch slide generation — Flash first for speed + reliability */
async function getBatchModels(): Promise<string[]> {
  const primary = await getConfig('ai_models', 'slide_designer.batch_primary_model', MODEL_DEFAULTS['slide_designer.batch_primary_model'].value as string)
  const fallback = await getConfig('ai_models', 'slide_designer.batch_fallback_model', MODEL_DEFAULTS['slide_designer.batch_fallback_model'].value as string)
  return [primary, fallback]
}

// ─── Config Loaders (all connected to admin panel) ────────

async function getSystemInstruction(): Promise<string> {
  return getConfig('ai_prompts', 'slide_designer.system_instruction', PROMPT_DEFAULTS['slide_designer.system_instruction'].value as string)
}

async function getDesignPrinciples(): Promise<string> {
  return getConfig('ai_prompts', 'slide_designer.design_principles', PROMPT_DEFAULTS['slide_designer.design_principles'].value as string)
}

async function getElementFormat(): Promise<string> {
  return getConfig('ai_prompts', 'slide_designer.element_format', PROMPT_DEFAULTS['slide_designer.element_format'].value as string)
}

async function getTechnicalRules(): Promise<string> {
  return getConfig('ai_prompts', 'slide_designer.technical_rules', PROMPT_DEFAULTS['slide_designer.technical_rules'].value as string)
}

async function getFinalInstruction(): Promise<string> {
  return getConfig('ai_prompts', 'slide_designer.final_instruction', PROMPT_DEFAULTS['slide_designer.final_instruction'].value as string)
}

async function getImageRoleHints(): Promise<Record<string, string>> {
  return getConfig('ai_prompts', 'slide_designer.image_role_hints', PROMPT_DEFAULTS['slide_designer.image_role_hints'].value as Record<string, string>)
}

async function getLayoutArchetypes(): Promise<string[]> {
  return getConfig('design_system', 'layout_archetypes', DESIGN_DEFAULTS['layout_archetypes'].value as string[])
}

async function getPacingMap(): Promise<Record<string, PacingDirective>> {
  return getConfig('design_system', 'pacing_map', DESIGN_DEFAULTS['pacing_map'].value as Record<string, PacingDirective>)
}

async function getDepthLayers(): Promise<string> {
  return getConfig('design_system', 'depth_layers', DESIGN_DEFAULTS['depth_layers'].value as string)
}

async function getThinkingLevel(): Promise<string> {
  return getConfig('ai_models', 'slide_designer.thinking_level', MODEL_DEFAULTS['slide_designer.thinking_level'].value as string)
}

async function getBatchThinkingLevel(): Promise<string> {
  return getConfig('ai_models', 'slide_designer.batch_thinking_level', MODEL_DEFAULTS['slide_designer.batch_thinking_level'].value as string)
}

async function getMaxOutputTokens(): Promise<number> {
  return getConfig('ai_models', 'slide_designer.max_output_tokens', MODEL_DEFAULTS['slide_designer.max_output_tokens'].value as number)
}

async function getTemperature(): Promise<number> {
  return getConfig('ai_models', 'slide_designer.temperature', MODEL_DEFAULTS['slide_designer.temperature'].value as number)
}

async function getBatchSize(): Promise<number> {
  return getConfig('pipeline', 'slide_designer.batch_size', PIPELINE_DEFAULTS['slide_designer.batch_size'].value as number)
}

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
  curatedBatches?: CuratedSlideContent[][]
  /** Flat list of all curated slides for full-story context */
  allCurated: CuratedSlideContent[]
  /** Flat list of all raw inputs (1 per slide) */
  allSlides: SlideContentInput[]
  brandName: string
  clientLogo: string
  leadersLogo: string
  totalSlides: number
}

export interface BatchResult {
  slides: Slide[]
  /** @deprecated — kept for backwards compat but no longer used for context */
  visualSummary: string
  slideIndex: number
  /** Full JSON of generated slides for sequential context passing */
  generatedSlides?: Slide[]
}

// ─── All design constants loaded from admin config at runtime via getConfig() ──

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

  // Design system generation with per-call timeout
  const DS_TIMEOUT_MS = 150_000 // 2.5 minutes per attempt (total max ~5 min for 2 attempts)
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
      const isTimeout = error instanceof Error && (
        error.message === 'DS_TIMEOUT' ||
        error.message.includes('timeout') ||
        error.message.includes('fetch failed')
      )
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Design system attempt ${attempt + 1}/${models.length} failed (${model}): ${isTimeout ? 'TIMEOUT — ' : ''}${msg}`)
      if (attempt < models.length - 1) {
        console.log(`[SlideDesigner][${requestId}] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 1500))
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
  curatedSlides?: CuratedSlideContent[],
): Promise<Slide[]> {
  const requestId = `sb-${batchIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Step 2: Batch ${batchIndex + 1} (${slides.length} slides)`)

  // ── Load ALL config from admin panel (cached 60s) ──
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

  // Creative Direction from Design System (if available)
  const cd = designSystem.creativeDirection

  // ── Semantic archetype selection ──
  const usedArchetypes = new Set<number>()

  function selectArchetype(slideType: string, globalIdx: number): string {
    const typeAffinities: Record<string, number[]> = {
      cover: [0, 3, 6],      // Brutalist, Full-bleed, Magazine
      insight: [0, 3, 7],    // Brutalist, Full-bleed, Data art
      bigIdea: [0, 3, 6],    // Brutalist, Full-bleed, Magazine
      brief: [1, 6, 3],      // Asymmetric, Magazine, Full-bleed
      audience: [1, 3, 6],   // Asymmetric, Full-bleed, Magazine
      strategy: [2, 5, 4],   // Z-index cards, Bento, Diagonal
      approach: [2, 5, 1],   // Z-index cards, Bento, Asymmetric
      goals: [5, 7, 2],      // Bento, Data art, Z-index cards
      deliverables: [5, 2, 4], // Bento, Z-index cards, Diagonal
      metrics: [7, 5, 4],    // Data art, Bento, Diagonal
      competitive: [5, 4, 2], // Bento, Diagonal, Z-index cards
      closing: [0, 3, 6],    // Brutalist, Full-bleed, Magazine
      whyNow: [7, 0, 3],     // Data art, Brutalist, Full-bleed
    }

    const preferred = typeAffinities[slideType] || [globalIdx % layoutArchetypes.length]
    for (const idx of preferred) {
      if (!usedArchetypes.has(idx) && idx < layoutArchetypes.length) {
        usedArchetypes.add(idx)
        return layoutArchetypes[idx]
      }
    }
    // All preferred used — pick any unused
    for (let idx = 0; idx < layoutArchetypes.length; idx++) {
      if (!usedArchetypes.has(idx)) {
        usedArchetypes.add(idx)
        return layoutArchetypes[idx]
      }
    }
    // All used — reset and pick from preferred
    usedArchetypes.clear()
    const fallbackIdx = preferred[0] ?? (globalIdx % layoutArchetypes.length)
    usedArchetypes.add(fallbackIdx)
    return layoutArchetypes[fallbackIdx]
  }

  // ── Build per-slide directives ──
  const slidesDescription = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const imageRoleHint = imageRoleHints[slide.slideType] || 'An image that reinforces the slide message.'
    const archetype = selectArchetype(slide.slideType, globalIndex)

    // Use curated content if available, fall back to raw JSON
    const curated = curatedSlides?.[i]
    let contentBlock: string

    if (curated) {
      // Build clean, structured XML from curated content
      const parts: string[] = []
      if (curated.title) parts.push(`  <headline>${curated.title}</headline>`)
      if (curated.subtitle) parts.push(`  <subtitle>${curated.subtitle}</subtitle>`)
      if (curated.keyNumber) parts.push(`  <key_number value="${curated.keyNumber}" label="${curated.keyNumberLabel || ''}" />`)
      if (curated.bodyText) parts.push(`  <body>${curated.bodyText}</body>`)
      if (curated.bulletPoints?.length) {
        parts.push(`  <bullets>\n${curated.bulletPoints.map(b => `    <item>${b}</item>`).join('\n')}\n  </bullets>`)
      }
      if (curated.cards?.length) {
        parts.push(`  <cards>\n${curated.cards.map(c => `    <card title="${c.title}">${c.body}</card>`).join('\n')}\n  </cards>`)
      }
      if (curated.tagline) parts.push(`  <tagline>${curated.tagline}</tagline>`)
      contentBlock = parts.join('\n')
    } else {
      contentBlock = `  <raw_json>\n${JSON.stringify(slide.content, null, 2)}\n  </raw_json>`
    }

    // Per-slide creative note from curator + creative direction
    const emotionNote = curated?.emotionalNote
      ? `  <emotion>${curated.emotionalNote}</emotion>` : ''
    const cdPerSlide = cd?.oneRule
      ? `  <master_rule>${cd.oneRule}</master_rule>` : ''

    const imageRole = curated?.imageRole || ''
    const imageTag = slide.imageUrl
      ? `  <image url="${slide.imageUrl}" role="${imageRoleHint}" visual_role="${imageRole}" />`
      : '  <no_image>Use decorative shapes, watermarks, and dramatic typography instead.</no_image>'

    return `
<slide index="${globalIndex + 1}" total="${batchContext.totalSlides}" type="${slide.slideType}">
  <energy>${pacing.energy}</energy>
  <density>${pacing.density}</density>
  <layout_inspiration>${archetype}</layout_inspiration>
${imageTag}
${emotionNote}
${cdPerSlide}
  <content>
${contentBlock}
  </content>
</slide>`
  }).join('\n')

  const prompt = `<task>
Design ${slides.length} premium presentation slides for "${brandName}".
Canvas: 1920×1080px | RTL Hebrew | Font: Heebo | textAlign: "right" always.
Each slide MUST have a unique layout — never repeat a composition.
</task>

<creative_brief>
${cd ? `Visual Metaphor: ${cd.visualMetaphor}
Visual Tension: ${cd.visualTension}
Master Rule (EVERY slide must obey): ${cd.oneRule}
Color Story: ${cd.colorStory}
Typography Voice: ${cd.typographyVoice}
Emotional Arc: ${cd.emotionalArc}` : `Think like a Creative Director — what is the visual metaphor for "${brandName}"? What creates tension?`}
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
Style: ${effects.decorativeStyle} | Shadow: ${effects.shadowStyle} | Motif: ${motif.type} @ ${motif.opacity} (${motif.implementation})
</design_system>

<design_principles>
${designPrinciples}

DEPTH LAYERS: ${depthLayers}

ANTI-PATTERNS (never do these):
- Centered text in the middle of the screen
- 3 identical equal-width cards in a row
- All fonts at the same size
- Simple linear gradient as only background
- Rotation on body text
- Opacity < 0.7 on readable text
</design_principles>

<element_format>
${elementFormat}
</element_format>

<technical_rules>
${technicalRules}
- Create depth through layered shapes with subtle offset shadows (shape at x+10, y+10, lower zIndex, fill:#000, opacity:0.1-0.15)
- For full-bleed images: place image at zIndex 1, add gradient overlay shape at zIndex 2, then text at zIndex 8+
- For split layouts: image on one side (40-50% width), content on the other with breathing room
- Key numbers: fontSize 80-140px, fontWeight 900, accent color. Label below: fontSize 16-20px, muted color, letterSpacing wide
</technical_rules>

<visualization_checklist>
BEFORE outputting each slide, mentally render it at 1920×1080:
1. Can I read every text? Is contrast sufficient?
2. Does any text overlap another text or sit on an image without a contrast layer?
3. Is the composition asymmetric and interesting (not centered/boring)?
4. Is there a clear visual hierarchy: ONE dominant element, supporting elements smaller?
5. Does the key number (if any) feel like a hero — large, bold, impossible to miss?
6. Is there enough white space? Does the slide breathe?
7. Does this slide look DIFFERENT from the previous one?
If ANY check fails → fix before outputting.
</visualization_checklist>

<previous_slides>
${batchContext.previousSlidesVisualSummary
    ? `Already designed slides (create DIFFERENT layouts, different dominant color, different title position):\n${batchContext.previousSlidesVisualSummary}`
    : 'First batch — no previous slides.'}
</previous_slides>

<slides_to_design>
${slidesDescription}
</slides_to_design>

<quality_reference>
Structure reference (field names only — derive YOUR OWN coordinates and layout from design principles):
- Slide: { id, slideType, label, background: { type: "solid"|"gradient"|"image", value }, elements: [...] }
- Elements: shape (bg/decorative), text (title/body/caption/decorative), image
- Decorative text: role "decorative", fontSize 200+, opacity 0.05-0.15, acts as watermark texture
- Background shapes: radial-gradient with brand colors, mesh gradients for depth
- Always include at least one decorative element per slide (watermark text, gradient shape, motif pattern)
</quality_reference>

<final_instruction>
${finalInstruction}
</final_instruction>`

  // ── 3-tier retry: configured thinking → LOW thinking → fallback slides ──
  // Per-call timeouts descend so total stays well within Vercel 600s limit
  // Tier 1: 180s, Tier 2: 120s, Tier 3: 90s → worst case 390s total
  const TIER_TIMEOUTS = [180_000, 120_000, 90_000]
  const TOTAL_BUDGET_MS = 480_000 // hard cap — leave 120s buffer for Vercel
  const functionStartTime = Date.now()
  const batchSysInstruction = await getSystemInstruction()
  const batchModels = await getBatchModels()

  // Build attempt list: [model, thinkingLevel] pairs
  // Tier 1: primary model + configured thinking
  // Tier 2: primary model + LOW thinking (faster)
  // Tier 3: fallback model + LOW thinking
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
    // Check total time budget before each attempt
    const elapsedTotal = Date.now() - functionStartTime
    if (elapsedTotal > TOTAL_BUDGET_MS) {
      console.warn(`[SlideDesigner][${requestId}] ⚠️ Total budget exceeded (${Math.round(elapsedTotal / 1000)}s). Generating fallback slides.`)
      return slides.map((slide, i) => buildFallbackSlide(slide, i, batchContext, colors))
    }

    const { model, thinking, label } = attempts[attempt]
    const callTimeout = Math.min(TIER_TIMEOUTS[attempt] || 90_000, TOTAL_BUDGET_MS - elapsedTotal)
    try {
      console.log(`[SlideDesigner][${requestId}] Calling ${label} for batch (attempt ${attempt + 1}/${attempts.length}, timeout ${Math.round(callTimeout / 1000)}s)...`)
      console.log(`[SlideDesigner][${requestId}] PROMPT LENGTH: ${prompt.length} chars`)
      if (attempt === 0) {
        console.log(`[SlideDesigner][${requestId}] PROMPT PREVIEW:\n${prompt.slice(0, 2000)}${prompt.length > 2000 ? '\n... [truncated]' : ''}`)
      }

      // Per-call timeout via Promise.race
      const geminiCall = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: batchSysInstruction,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: thinking },
          maxOutputTokens,
          temperature,
          httpOptions: { timeout: callTimeout },
        },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('BATCH_TIMEOUT')), callTimeout)
      )
      const response = await Promise.race([geminiCall, timeoutPromise])

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
        console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} AST slides (${label})`)
        // ── DEBUG: Log raw response and parsed details ──
        const rawText = response.text || ''
        console.log(`[SlideDesigner][${requestId}] RAW RESPONSE (${rawText.length} chars):\n${rawText.slice(0, 3000)}${rawText.length > 3000 ? '\n... [truncated]' : ''}`)
        parsed.slides.forEach((s, idx) => {
          const elTypes: Record<string, number> = {}
          for (const el of s.elements || []) elTypes[el.type] = (elTypes[el.type] || 0) + 1
          const typeStr = Object.entries(elTypes).map(([t, c]) => `${t} x${c}`).join(', ')
          console.log(`[SlideDesigner][${requestId}]   PARSED Slide ${idx + 1} (${s.slideType}): ${s.elements?.length || 0} elements [${typeStr}], bg: ${s.background?.type}=${s.background?.value?.slice(0, 60)}`)
        })
        if (attempt > 0) console.log(`[SlideDesigner][${requestId}] ✅ Batch succeeded with fallback (${label})`)

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
      const isTimeout = error instanceof Error && (
        error.message === 'BATCH_TIMEOUT' ||
        error.message.includes('timeout') ||
        error.message.includes('DEADLINE_EXCEEDED') ||
        error.message.includes('fetch failed')
      )
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Batch attempt ${attempt + 1}/${attempts.length} failed (${label}): ${isTimeout ? 'TIMEOUT — ' : ''}${msg}`)
      if (attempt < attempts.length - 1) {
        console.log(`[SlideDesigner][${requestId}] ⚡ Retrying with ${attempts[attempt + 1].label}...`)
        await new Promise(r => setTimeout(r, 1500))
      } else {
        // All attempts failed — generate fallback placeholder slides
        console.warn(`[SlideDesigner][${requestId}] ⚠️ All ${attempts.length} attempts failed. Generating fallback slides.`)
        return slides.map((slide, i) => buildFallbackSlide(slide, i, batchContext, colors))
      }
    }
  }
  throw new Error('All slide generation attempts failed')
}

// ═══════════════════════════════════════════════════════════
//  SEQUENTIAL SINGLE-SLIDE GENERATION
// ═══════════════════════════════════════════════════════════

interface SingleSlideContext {
  allCurated: CuratedSlideContent[]
  previousSlides: Slide[]
  totalSlides: number
}

/**
 * Generate a single slide with full narrative context.
 * The AI sees: (1) the full presentation story, (2) last 2 slides' JSON,
 * (3) creative direction, (4) this slide's curated content.
 */
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

  // ── Select archetype avoiding recent ones ──
  const recentArchetypes = new Set<string>()
  for (const prev of context.previousSlides) {
    const decorTexts = (prev.elements || []).filter(
      e => isTextElement(e) && e.role === 'decorative'
    )
    if (decorTexts.length > 0) recentArchetypes.add('brutalist')
    const imgEls = (prev.elements || []).filter(e => e.type === 'image')
    if (imgEls.some(img => img.width >= 1800)) recentArchetypes.add('full-bleed')
  }

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
    if (idx < layoutArchetypes.length) {
      archetype = layoutArchetypes[idx]
      break
    }
  }

  // ── Build full presentation story (all curated slides) ──
  const storyLines = context.allCurated.map((c, i) => {
    const marker = i === slideIndex ? ' ← YOU ARE DESIGNING THIS ONE' : (i < slideIndex ? ' (done)' : '')
    const summary = [
      c.title,
      c.keyNumber ? `keyNumber: ${c.keyNumber}` : '',
      c.bulletPoints?.length ? `${c.bulletPoints.length} bullets` : '',
      c.cards?.length ? `${c.cards.length} cards` : '',
      c.tagline ? `tagline: "${c.tagline}"` : '',
    ].filter(Boolean).join(' | ')
    return `  Slide ${i + 1} (${c.slideType}): "${summary}"${marker}`
  }).join('\n')

  // ── Build previous slides context (full compact JSON of last 2) ──
  let previousSlidesBlock: string
  if (context.previousSlides.length > 0) {
    const summaries = context.previousSlides.map(prev => {
      const compactElements = (prev.elements || []).map(el => {
        const base: Record<string, unknown> = {
          type: el.type, x: el.x, y: el.y, w: el.width, h: el.height,
        }
        if (isTextElement(el)) { base.role = el.role; base.fontSize = el.fontSize }
        if (el.type === 'image') { base.objectFit = (el as ImageElement).objectFit }
        if (el.type === 'shape') { base.shapeType = (el as SlideElement & { shapeType?: string }).shapeType }
        return base
      })

      const titleEl = (prev.elements || []).find(e => isTextElement(e) && e.role === 'title') as TextElement | undefined
      const imgEl = (prev.elements || []).find(e => e.type === 'image')
      const titlePos = titleEl ? `title at x:${titleEl.x} y:${titleEl.y} (${titleEl.x > 960 ? 'right' : 'left'} side)` : 'no title'
      const imgPos = imgEl ? `image at x:${imgEl.x} y:${imgEl.y} w:${imgEl.width} h:${imgEl.height}` : 'no image'

      return `<previous_slide type="${prev.slideType}" label="${prev.label}">
  <layout_summary>${titlePos}, ${imgPos}, bg: ${prev.background?.type}=${prev.background?.value?.slice(0, 80)}</layout_summary>
  <elements>${JSON.stringify(compactElements)}</elements>
</previous_slide>`
    }).join('\n')

    previousSlidesBlock = `${summaries}
YOUR SLIDE MUST USE A DIFFERENT layout. Different title position, different image placement, different visual weight distribution.`
  } else {
    previousSlidesBlock = 'This is the first slide — design freely with maximum impact.'
  }

  // ── Build current slide content ──
  const pacing = pacingMap[slide.slideType] || pacingMap.brief
  const imageRoleHint = imageRoleHints[slide.slideType] || 'An image that reinforces the slide message.'

  let contentBlock: string
  if (curated) {
    const parts: string[] = []
    if (curated.title) parts.push(`<headline>${curated.title}</headline>`)
    if (curated.subtitle) parts.push(`<subtitle>${curated.subtitle}</subtitle>`)
    if (curated.keyNumber) parts.push(`<key_number value="${curated.keyNumber}" label="${curated.keyNumberLabel || ''}" />`)
    if (curated.bodyText) parts.push(`<body>${curated.bodyText}</body>`)
    if (curated.bulletPoints?.length) {
      parts.push(`<bullets>\n${curated.bulletPoints.map(b => `  <item>${b}</item>`).join('\n')}\n</bullets>`)
    }
    if (curated.cards?.length) {
      parts.push(`<cards>\n${curated.cards.map(c => `  <card title="${c.title}">${c.body}</card>`).join('\n')}\n</cards>`)
    }
    if (curated.tagline) parts.push(`<tagline>${curated.tagline}</tagline>`)
    contentBlock = parts.join('\n')
  } else {
    contentBlock = `<raw_json>\n${JSON.stringify(slide.content, null, 2)}\n</raw_json>`
  }

  const emotionNote = curated?.emotionalNote ? `\n<emotion>${curated.emotionalNote}</emotion>` : ''
  const imageTag = slide.imageUrl
    ? `<image url="${slide.imageUrl}" role="${imageRoleHint}" />`
    : '<no_image>Use decorative shapes, watermarks, and dramatic typography instead.</no_image>'

  // ═══ THE PROMPT ═══
  const prompt = `<task>
Design exactly 1 premium presentation slide for "${brandName}".
Canvas: 1920×1080px | RTL Hebrew | Font: Heebo | textAlign: "right" always.
</task>

<creative_brief>
${cd ? `Visual Metaphor: ${cd.visualMetaphor}
Visual Tension: ${cd.visualTension}
Master Rule (this slide MUST obey): ${cd.oneRule}
Color Story: ${cd.colorStory}
Typography Voice: ${cd.typographyVoice}
Emotional Arc: ${cd.emotionalArc}` : `Think like a Creative Director for "${brandName}".`}
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
This is the complete presentation. Understand the narrative arc so you design this slide in context:
${storyLines}
</full_presentation_story>

<previous_slide_designs>
${previousSlidesBlock}
</previous_slide_designs>

<slide_to_design index="${slideIndex + 1}" total="${context.totalSlides}" type="${slide.slideType}">
<energy>${pacing.energy}</energy>
<density>${pacing.density}</density>
<layout_inspiration>${archetype}</layout_inspiration>
${imageTag}${emotionNote}
${cd?.oneRule ? `<master_rule>${cd.oneRule}</master_rule>` : ''}
<content>
${contentBlock}
</content>
</slide_to_design>

<design_principles>
${designPrinciples}
DEPTH LAYERS: ${depthLayers}

ANTI-PATTERNS (never do these):
- Centered text in the middle of the screen
- 3 identical equal-width cards in a row
- All fonts at the same size
- Simple linear gradient as only background
- Rotation on body text
- Opacity < 0.7 on readable text
</design_principles>

<element_format>
${elementFormat}
</element_format>

<technical_rules>
${technicalRules}
- Create depth through layered shapes with subtle offset shadows
- For full-bleed images: image at zIndex 1, gradient overlay at zIndex 2, text at zIndex 8+
- For split layouts: image on one side (40-50%), content on the other with breathing room
- Key numbers: fontSize 80-140px, fontWeight 900, accent color
</technical_rules>

<image_placement>
When an image URL is provided:
- You MUST include an image element in your design. This is mandatory.
- YOU decide the size, position, and cropping as part of your creative composition.
- Consider: full-bleed background, half-split, corner accent, centered hero, or asymmetric panel.
- Match the image role to the slide type and content.
- If full-bleed: add gradient overlay shape for text readability.
- If no image URL: use decorative shapes, watermarks, and dramatic typography instead.
NEVER use default positions. Every image placement must be a creative decision.
</image_placement>

<visualization_checklist>
BEFORE outputting, mentally render this slide at 1920×1080:
1. Can I read every text? Is contrast sufficient?
2. Does any text overlap another element without a contrast layer?
3. Is the composition asymmetric and interesting?
4. Is there ONE dominant visual element?
5. Does the key number (if any) feel like a hero?
6. Is there enough white space?
7. Is this slide DIFFERENT from the previous slides?
If ANY check fails → fix before outputting.
</visualization_checklist>

<final_instruction>
${finalInstruction}
</final_instruction>`

  // ── Call Gemini with retry ──
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
        model,
        contents: prompt,
        config: {
          systemInstruction: batchSysInstruction,
          responseMimeType: 'application/json',
          responseSchema: SLIDE_BATCH_SCHEMA,
          thinkingConfig: { thinkingLevel: thinking },
          maxOutputTokens,
          temperature,
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
          elements: (result.elements || []).map((el, j) => ({
            ...el,
            id: el.id || `el-${slideIndex}-${j}`,
          })),
        }
      }
      throw new Error('No slides in response')
    } catch (error) {
      const msg = detailedError(error)
      console.error(`[SlideDesigner][${requestId}] Attempt ${attempt + 1}/${attempts.length} failed (${label}): ${msg}`)
      if (attempt < attempts.length - 1) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  // All attempts failed — return fallback
  console.warn(`[SlideDesigner][${requestId}] All attempts failed. Generating fallback.`)
  return buildSimpleFallbackSlide(slide, slideIndex, colors)
}

/** Simple fallback for single-slide mode */
function buildSimpleFallbackSlide(
  slide: SlideContentInput,
  index: number,
  colors: PremiumDesignSystem['colors'],
): Slide {
  return {
    id: `slide-${index}`,
    slideType: slide.slideType as SlideType,
    label: slide.title || `שקף ${index + 1}`,
    background: { type: 'solid' as const, value: colors.background },
    elements: [
      {
        id: `el-${index}-0`, type: 'shape' as const, x: 0, y: 0, width: 1920, height: 1080,
        zIndex: 0, shapeType: 'background' as const,
        fill: `linear-gradient(135deg, ${colors.primary}30 0%, ${colors.background} 60%, ${colors.accent}20 100%)`,
        opacity: 1,
      },
      {
        id: `el-${index}-1`, type: 'text' as const, x: 120, y: 400, width: 1680, height: 120,
        zIndex: 10, content: slide.title || `שקף ${index + 1}`,
        fontSize: 64, fontWeight: 800 as FontWeight, color: colors.text,
        textAlign: 'right' as const, role: 'title' as const, lineHeight: 1.1,
      },
    ] as SlideElement[],
  }
}

/** Generate a minimal but valid placeholder slide when AI fails */
function buildFallbackSlide(
  slide: SlideContentInput,
  index: number,
  ctx: BatchContext,
  colors: PremiumDesignSystem['colors'],
): Slide {
  const globalIndex = ctx.slideIndex + index
  return {
    id: `slide-${globalIndex}`,
    slideType: slide.slideType as SlideType,
    label: slide.title || `שקף ${globalIndex + 1}`,
    background: { type: 'solid' as const, value: colors.background },
    elements: [
      {
        id: `el-${globalIndex}-0`, type: 'shape' as const, x: 0, y: 0, width: 1920, height: 1080,
        zIndex: 0, shapeType: 'background' as const,
        fill: `linear-gradient(135deg, ${colors.primary}30 0%, ${colors.background} 60%, ${colors.accent}20 100%)`,
        opacity: 1,
      },
      {
        id: `el-${globalIndex}-1`, type: 'text' as const, x: 120, y: 400, width: 1680, height: 120,
        zIndex: 10, content: slide.title || `שקף ${globalIndex + 1}`,
        fontSize: 64, fontWeight: 800 as FontWeight, color: colors.text,
        textAlign: 'right' as const, role: 'title' as const, lineHeight: 1.1,
      },
      {
        id: `el-${globalIndex}-2`, type: 'text' as const, x: 120, y: 560, width: 1680, height: 300,
        zIndex: 8, content: String(slide.content?.subtitle || slide.content?.description || slide.content?.text || ''),
        fontSize: 24, fontWeight: 300 as FontWeight, color: colors.text + '90',
        textAlign: 'right' as const, role: 'body' as const, lineHeight: 1.6,
      },
    ] as SlideElement[],
  }
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

/**
 * Find the best placement for an image by analyzing existing elements.
 * Scans the canvas for the largest unoccupied region.
 */
function findBestImagePlacement(
  elements: SlideElement[],
  bgColor: string,
): { x: number; y: number; width: number; height: number; fullBleed: boolean } {
  const contentBoxes = elements
    .filter(e => e.type === 'text' || (e.type === 'shape' && (e as SlideElement & { shapeType?: string }).shapeType !== 'background'))
    .map(e => ({ x: e.x, y: e.y, width: e.width, height: e.height }))

  if (contentBoxes.length === 0) {
    return { x: 0, y: 0, width: 1920, height: 1080, fullBleed: true }
  }

  // Check if all content is on one side (RTL: content usually on right)
  const contentCenterX = contentBoxes.reduce((sum, b) => sum + b.x + b.width / 2, 0) / contentBoxes.length
  const contentMinX = Math.min(...contentBoxes.map(b => b.x))
  const contentMaxX = Math.max(...contentBoxes.map(b => b.x + b.width))

  // Left half is free — place image there
  if (contentMinX > 800) {
    return { x: 0, y: 0, width: Math.min(contentMinX - 40, 960), height: 1080, fullBleed: false }
  }

  // Right half is free
  if (contentMaxX < 1120) {
    return { x: Math.max(contentMaxX + 40, 960), y: 0, width: 1920 - Math.max(contentMaxX + 40, 960), height: 1080, fullBleed: false }
  }

  // Content spans the width — check vertical space
  const contentMinY = Math.min(...contentBoxes.map(b => b.y))
  const contentMaxY = Math.max(...contentBoxes.map(b => b.y + b.height))

  // Bottom half is free
  if (contentMaxY < 600) {
    return { x: 80, y: contentMaxY + 40, width: 1760, height: 1080 - contentMaxY - 80, fullBleed: false }
  }

  // No clear empty space — use full-bleed behind content
  return { x: 0, y: 0, width: 1920, height: 1080, fullBleed: true }
}

function autoFixSlide(slide: Slide, issues: ValidationIssue[], designSystem: PremiumDesignSystem, expectedImageUrl?: string): Slide {
  const fixed = { ...slide, elements: [...slide.elements] }

  for (const issue of issues) {
    if (!issue.autoFixable) continue

    // Missing image — find best placement by analyzing existing layout
    if (issue.category === 'missing-image' && expectedImageUrl) {
      const placement = findBestImagePlacement(fixed.elements, designSystem.colors.background)
      const imgElement: ImageElement = {
        id: `autofix-img-${slide.id}`, type: 'image',
        x: placement.x, y: placement.y,
        width: placement.width, height: placement.height,
        zIndex: placement.fullBleed ? 1 : 5,
        src: expectedImageUrl, objectFit: 'cover',
        borderRadius: placement.fullBleed ? 0 : 16,
        opacity: placement.fullBleed ? 0.4 : 1,
      }
      fixed.elements.push(imgElement)

      if (placement.fullBleed) {
        fixed.elements.push({
          id: `autofix-overlay-${slide.id}`, type: 'shape' as const,
          x: 0, y: 0, width: 1920, height: 1080, zIndex: 2,
          shapeType: 'background' as const,
          fill: `linear-gradient(180deg, ${designSystem.colors.background}CC 0%, ${designSystem.colors.background}40 40%, ${designSystem.colors.background}CC 100%)`,
          opacity: 1,
        })
      }
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

  // Skip high-energy slides that intentionally use different sizes/positions
  const skipTypes = new Set(['cover', 'closing', 'bigIdea', 'insight', 'whyNow', 'competitive', 'strategy'])
  const regularTitles = allTitles.filter(t => {
    const st = slides[t.slideIndex]?.slideType
    return !skipTypes.has(st)
  })

  if (regularTitles.length > 0) {
    // Only fix extreme Y outliers (200px+ deviation) — allow layout variety
    const medianY = regularTitles.map(t => t.y).sort((a, b) => a - b)[Math.floor(regularTitles.length / 2)]
    for (const t of regularTitles) {
      if (Math.abs(t.y - medianY) > 200) t.element.y = medianY
    }

    // Only normalize extreme font size drift (20px+) — preserve intentional scale differences
    const headingSizes = regularTitles.map(t => t.element.fontSize || 48)
    const medianSize = headingSizes.sort((a, b) => a - b)[Math.floor(headingSizes.length / 2)]
    for (const t of regularTitles) {
      if (Math.abs(t.fontSize - medianSize) > 20) {
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

  if (input.imageUrl) {
    const placement = findBestImagePlacement(elements, colors.background)
    elements.push({
      id: `fb-${index}-img`, type: 'image',
      x: placement.x, y: placement.y,
      width: placement.width, height: placement.height,
      zIndex: placement.fullBleed ? 1 : 5,
      src: input.imageUrl, objectFit: 'cover',
      borderRadius: placement.fullBleed ? 0 : 16,
      opacity: placement.fullBleed ? 0.4 : 1,
    })
    if (placement.fullBleed) {
      elements.push({
        id: `fb-${index}-overlay`, type: 'shape',
        x: 0, y: 0, width: 1920, height: 1080, zIndex: 2,
        shapeType: 'background' as const,
        fill: `linear-gradient(180deg, ${colors.background}CC 0%, ${colors.background}40 40%, ${colors.background}CC 100%)`,
        opacity: 1,
      })
    }
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

async function buildSlideBatches(
  data: PremiumProposalData,
  config: {
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
  } = {},
): Promise<SlideContentInput[][]> {
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

  // ── Split into small batches (configurable via admin panel) ──
  const batchSize = await getBatchSize()
  return chunkByMax(allSlides, batchSize)
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

  // ── Step 2: Build slides + curate content ──
  console.log(`[SlideDesigner] ── Step 2/3: Content Curation ──`)
  const allBatches = await buildSlideBatches(data, config)
  const flatSlides = allBatches.flat()

  let allCurated: CuratedSlideContent[] = []
  try {
    allCurated = await curateSlideContent(flatSlides, data.brandName || '', designSystem.creativeDirection)
    console.log(`[SlideDesigner][${requestId}] Content curated: ${allCurated.length} slides`)
  } catch (err) {
    console.warn(`[SlideDesigner][${requestId}] Curation failed, using raw content:`, err)
  }

  // ── Step 3: Sequential slide generation ──
  console.log(`[SlideDesigner] ── Step 3/3: Sequential Slide Generation (${flatSlides.length} slides) ──`)

  const allGeneratedSlides: Slide[] = []
  let previousSlides: Slide[] = []
  const pacingMap = await getPacingMap()

  for (let si = 0; si < flatSlides.length; si++) {
    const slideInput = flatSlides[si]
    const curated = allCurated[si]
    console.log(`[SlideDesigner] Slide ${si + 1}/${flatSlides.length} (${slideInput.slideType})${curated ? ' +curated' : ''}`)

    try {
      const generatedSlide = await generateSingleSlide(
        designSystem, slideInput, curated, si, data.brandName || '',
        { allCurated, previousSlides: previousSlides.slice(-2), totalSlides: flatSlides.length },
      )

      // Validate + auto-fix inline
      const pacing = pacingMap[slideInput.slideType] || pacingMap.brief
      const validResult = validateSlide(generatedSlide, designSystem, pacing, slideInput.imageUrl)
      let finalSlide = generatedSlide
      if (validResult.issues.some(i => i.autoFixable)) {
        finalSlide = autoFixSlide(generatedSlide, validResult.issues.filter(i => i.autoFixable), designSystem, slideInput.imageUrl)
      }

      allGeneratedSlides.push(finalSlide)
      previousSlides = [...previousSlides, finalSlide].slice(-2)
    } catch (error) {
      console.error(`[SlideDesigner] Slide ${si + 1} failed:`, error)
      const fallback = createFallbackSlide(slideInput, designSystem, si)
      allGeneratedSlides.push(fallback)
      previousSlides = [...previousSlides, fallback].slice(-2)
    }
  }

  if (allGeneratedSlides.length === 0) throw new Error('All slides failed — no slides generated')

  // ── Final validation pass ──
  console.log(`[SlideDesigner][${requestId}] ═══ VALIDATION ═══`)
  const validatedSlides: Slide[] = []
  let totalScore = 0

  for (let si = 0; si < allGeneratedSlides.length; si++) {
    const slide = allGeneratedSlides[si]
    const expectedImage = flatSlides[si]?.imageUrl
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const result = validateSlide(slide, designSystem, pacing, expectedImage)
    totalScore += result.score
    const issueStr = result.issues.length > 0 ? result.issues.map(i => `${i.category}(${i.severity}${i.autoFixable ? ',fix' : ''})`).join(', ') : 'clean'
    console.log(`[SlideDesigner][${requestId}]   Slide ${si + 1} (${slide.slideType}): score=${result.score}, issues=[${issueStr}]`)
    validatedSlides.push(slide)
  }
  console.log(`[SlideDesigner][${requestId}] ═══ END VALIDATION ═══`)

  const avgScore = Math.round(totalScore / allGeneratedSlides.length)
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
  const allBatches = await buildSlideBatches(d, config)

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

  // Flatten all slides for sequential processing (1 slide per batch)
  const allSlides = allBatches.flat()
  const singleSlideBatches = allSlides.map(s => [s])

  // ── Content Curation: transform raw data into presentation-ready copy ──
  console.log(`[SlideDesigner][${requestId}] Running Content Curator on ${allSlides.length} slides...`)
  let allCurated: CuratedSlideContent[] = []

  try {
    // Curate all slides at once for narrative coherence
    allCurated = await curateSlideContent(
      allSlides,
      d.brandName || '',
      designSystem.creativeDirection,
    )
    console.log(`[SlideDesigner][${requestId}] Content Curator complete: ${allCurated.length} slides curated`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[SlideDesigner][${requestId}] Content Curator failed (${msg}), will use raw content`)
  }

  // Build per-slide curatedBatches for backward compat
  const curatedBatches = allCurated.length > 0
    ? allCurated.map(c => [c])
    : undefined

  const foundation: PipelineFoundation = {
    designSystem,
    batches: singleSlideBatches,
    curatedBatches,
    allCurated,
    allSlides,
    brandName: d.brandName || '',
    clientLogo,
    leadersLogo,
    totalSlides: allSlides.length,
  }

  console.log(`[SlideDesigner][${requestId}] Foundation complete: ${foundation.totalSlides} slides (sequential mode)`)
  return foundation
}

/**
 * Stage 2 (per slide): Generate a single slide with full sequential context.
 * batchIndex maps 1:1 to slideIndex in sequential mode.
 * previousContext.generatedSlides carries the last 2 slides' full JSON.
 */
export async function pipelineBatch(
  foundation: PipelineFoundation,
  batchIndex: number,
  previousContext: BatchResult | null,
): Promise<BatchResult> {
  const requestId = `seq-${batchIndex}-${Date.now()}`
  const slideIndex = batchIndex
  const slide = foundation.allSlides[slideIndex]
  if (!slide) throw new Error(`Invalid slide index: ${slideIndex}`)

  const curated = foundation.allCurated?.[slideIndex]
  const previousSlides = previousContext?.generatedSlides || []

  console.log(`[SlideDesigner][${requestId}] Sequential slide ${slideIndex + 1}/${foundation.totalSlides} (${slide.slideType})${curated ? ' +curated' : ' (raw)'} | ${previousSlides.length} prev slides`)

  try {
    const generatedSlide = await generateSingleSlide(
      foundation.designSystem,
      slide,
      curated,
      slideIndex,
      foundation.brandName,
      {
        allCurated: foundation.allCurated || [],
        previousSlides: previousSlides.slice(-2),
        totalSlides: foundation.totalSlides,
      },
    )

    // Validate + auto-fix
    const pacingMap = await getPacingMap()
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
    const validationResult = validateSlide(generatedSlide, foundation.designSystem, pacing, slide.imageUrl)

    let finalSlide = generatedSlide
    if (!validationResult.valid || validationResult.score < 70) {
      const fixableIssues = validationResult.issues.filter(i => i.autoFixable)
      if (fixableIssues.length > 0) {
        finalSlide = autoFixSlide(generatedSlide, fixableIssues, foundation.designSystem, slide.imageUrl)
        console.log(`[SlideDesigner][${requestId}] Auto-fixed ${fixableIssues.length} issues`)
      }
    }

    // Keep sliding window of last 2 slides
    const updatedHistory = [...previousSlides, finalSlide].slice(-2)

    console.log(`[SlideDesigner][${requestId}] Slide ${slideIndex + 1} done: ${finalSlide.elements?.length || 0} elements`)
    return {
      slides: [finalSlide],
      visualSummary: '',
      slideIndex: slideIndex + 1,
      generatedSlides: updatedHistory,
    }
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Slide ${slideIndex + 1} failed:`, error)
    const fallbackSlide = createFallbackSlide(slide, foundation.designSystem, slideIndex)
    const updatedHistory = [...previousSlides, fallbackSlide].slice(-2)
    return {
      slides: [fallbackSlide],
      visualSummary: '',
      slideIndex: slideIndex + 1,
      generatedSlides: updatedHistory,
    }
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
export async function pipelineFinalize(
  foundation: PipelineFoundation,
  allSlides: Slide[],
): Promise<Presentation> {
  const requestId = `final-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Finalizing: ${allSlides.length} slides`)

  if (allSlides.length === 0) throw new Error('No slides to finalize')

  const pacingMap = await getPacingMap()

  // Build flat list of expected image URLs for validation
  const allInputs = foundation.batches.flat()

  console.log(`[SlideDesigner][${requestId}] ═══ FINALIZE VALIDATION ═══`)
  const validatedSlides: Slide[] = []
  let totalScore = 0

  for (let si = 0; si < allSlides.length; si++) {
    const slide = allSlides[si]
    const expectedImage = allInputs[si]?.imageUrl
    const pacing = pacingMap[slide.slideType] || pacingMap.brief
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

  const pacingMap = await getPacingMap()
  const pacing = pacingMap[slideContent.slideType] || pacingMap.brief
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
