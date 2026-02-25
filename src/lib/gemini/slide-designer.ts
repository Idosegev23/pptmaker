/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Gemini AI Slide Designer — Art Director Edition v2.0
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  6-Stage Creative Pipeline:
 *
 *    ┌──────────────┐   ┌──────────────┐   ┌────────────────┐
 *    │ 1. Creative   │──▶│ 2. Design    │──▶│ 3. Layout      │
 *    │   Direction   │   │   System++   │   │   Strategy     │
 *    └──────────────┘   └──────────────┘   └────────────────┘
 *           │                                       │
 *           ▼                                       ▼
 *    ┌──────────────┐   ┌──────────────┐   ┌────────────────┐
 *    │ 6. Render-in- │◀──│ 5. Quality   │◀──│ 4. AST Slide   │
 *    │   the-Loop    │   │   Validator  │   │   Generation   │
 *    └──────────────┘   └──────────────┘   └────────────────┘
 *
 *  32 Art-Direction Enhancements:
 *   1.  Chain of Prompts (Creative → Art → Production)
 *   2.  Dynamic Layout Selection (brand-personality driven)
 *   3.  Visual Pacing System (energy/density per slide)
 *   4.  Quality Validator + Auto-fix loop
 *   5.  Premium Design System (typography, spacing, effects, motifs)
 *   6.  Cross-batch Context Threading
 *   7.  Few-Shot Examples Library (gold-standard reference slides)
 *   8.  Self-Critique A/B Selection
 *   9.  Color Harmony Validation (WCAG, real color theory)
 *   10. Image Treatment Pipeline (duotone, B&W, overlay, mask)
 *   11. Typography Weight Strategy (enforced weight pairs)
 *   12. Slide Transition Logic (emotional continuity)
 *   13. Negative Space Budget (enforced per-slide)
 *   14. Prompt Compression (structured, deduplicated)
 *   15. Deterministic Fallbacks (never crash — degrade gracefully)
 *   16. Visual Consistency Checker (cross-slide alignment audit)
 *   17. Caching Layer (brand-level cache for repeat runs)
 *   18. Slide Density Heatmap (spatial balance scoring)
 *   19. Render-in-the-Loop (Gemini sees what it created)
 *   20. Composition Rules (Rule of Thirds, Golden Ratio)
 *   21. Scale Contrast (enforced min 5:1 font size ratio)
 *   22. Micro-Typography (letter-spacing, weight mixing, indent)
 *   23. Color Temperature Flow (warm/cool arc across deck)
 *   24. Tension Points (exactly one visual surprise per slide)
 *   25. White Space as Design Element (active, not leftover)
 *   26. Visual Anchors (eye-entry-point hierarchy)
 *   27. Geometric Harmony (proportional relationships)
 *   28. Entry Animation Thinking (frozen motion in static)
 *   29. Reference Board System (curated per-type exemplars)
 *   30. Anti-Patterns Blacklist (explicit forbidden patterns)
 *   31. Depth Layering System (5 fixed z-layers)
 *   32. Brand DNA Extraction (visual language analysis)
 */

import { GoogleGenAI } from '@google/genai'
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

// ═══════════════════════════════════════════════════════════
//  SECTION 1: TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════

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
  /** NEW: URL to brand website/instagram for DNA extraction (#32) */
  brandReferenceImageUrl?: string
}

interface SlideContentInput {
  slideType: string
  title: string
  content: Record<string, unknown>
  imageUrl?: string
}

/** #1 Creative Direction — the "soul" of the presentation */
interface CreativeDirection {
  visualMetaphor: string
  visualTension: string
  oneRule: string
  colorStory: string
  motif: {
    type: string
    description: string
  }
  typographyVoice: string
  emotionalArc: string
  /** #23 Color temperature arc */
  temperatureArc: ('cold' | 'neutral' | 'warm')[]
  /** #24 Which slide types get tension points */
  tensionSlides: string[]
}

/** #5 Premium Design System */
interface PremiumDesignSystem extends DesignSystem {
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
    cardBg: string
    cardBorder: string
    gradientStart: string
    gradientEnd: string
    muted: string
    highlight: string
    auroraA: string
    auroraB: string
    auroraC: string
  }
  fonts: { heading: string; body: string }
  direction: 'rtl' | 'ltr'
  /** #11 #22 Typography system */
  typography: {
    displaySize: number
    headingSize: number
    subheadingSize: number
    bodySize: number
    captionSize: number
    letterSpacingTight: number
    letterSpacingWide: number
    lineHeightTight: number
    lineHeightRelaxed: number
    weightPairs: [number, number][]
  }
  spacing: {
    unit: number
    cardPadding: number
    cardGap: number
    safeMargin: number
  }
  effects: {
    borderRadius: 'sharp' | 'soft' | 'pill'
    borderRadiusValue: number
    decorativeStyle: 'geometric' | 'organic' | 'minimal' | 'brutalist'
    shadowStyle: 'none' | 'fake-3d' | 'glow'
    auroraGradient: string
  }
  motif: {
    type: string
    opacity: number
    color: string
    implementation: string
  }
}

/** #3 Visual Pacing */
interface PacingDirective {
  energy: 'calm' | 'building' | 'peak' | 'breath' | 'finale'
  density: 'minimal' | 'balanced' | 'dense'
  surprise: boolean
  maxElements: number
  minWhitespace: number
}

/** #2 Layout directive */
interface LayoutDirective {
  technique: string
  description: string
  constraints: string[]
}

/** #10 Image treatment */
type ImageTreatment = 'raw' | 'duotone' | 'bw-highcontrast' | 'color-overlay' | 'masked-circle' | 'masked-capsule' | 'masked-polygon' | 'blur-bg'

/** #4 Validation */
interface ValidationResult {
  valid: boolean
  score: number
  issues: ValidationIssue[]
}

interface ValidationIssue {
  severity: 'critical' | 'warning' | 'suggestion'
  category: 'contrast' | 'density' | 'safe-zone' | 'hierarchy' | 'rhythm' | 'balance' | 'scale' | 'whitespace'
  message: string
  elementId?: string
  autoFixable: boolean
}

/** #17 Cache entry */
interface CacheEntry<T> {
  key: string
  data: T
  createdAt: number
  expiresAt: number
}

/** Batch generation context (#6) */
interface BatchContext {
  previousSlidesVisualSummary: string
  slideIndex: number
  totalSlides: number
  creativeDirection: CreativeDirection
}

// ═══════════════════════════════════════════════════════════
//  SECTION 2: CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════

// ── #3 Pacing Map ──────────────────────────────────────────

const PACING_MAP: Record<string, PacingDirective> = {
  cover:              { energy: 'peak',     density: 'minimal',  surprise: true,  maxElements: 8,  minWhitespace: 0.50 },
  brief:              { energy: 'calm',     density: 'balanced', surprise: false, maxElements: 10, minWhitespace: 0.30 },
  goals:              { energy: 'building', density: 'dense',    surprise: false, maxElements: 14, minWhitespace: 0.20 },
  audience:           { energy: 'calm',     density: 'balanced', surprise: false, maxElements: 10, minWhitespace: 0.30 },
  insight:            { energy: 'peak',     density: 'minimal',  surprise: true,  maxElements: 7,  minWhitespace: 0.55 },
  strategy:           { energy: 'building', density: 'balanced', surprise: false, maxElements: 12, minWhitespace: 0.25 },
  bigIdea:            { energy: 'peak',     density: 'minimal',  surprise: true,  maxElements: 8,  minWhitespace: 0.50 },
  approach:           { energy: 'building', density: 'dense',    surprise: false, maxElements: 14, minWhitespace: 0.20 },
  deliverables:       { energy: 'breath',   density: 'dense',    surprise: false, maxElements: 14, minWhitespace: 0.20 },
  metrics:            { energy: 'building', density: 'dense',    surprise: false, maxElements: 14, minWhitespace: 0.20 },
  influencerStrategy: { energy: 'calm',     density: 'balanced', surprise: false, maxElements: 10, minWhitespace: 0.30 },
  influencers:        { energy: 'building', density: 'dense',    surprise: false, maxElements: 16, minWhitespace: 0.15 },
  closing:            { energy: 'finale',   density: 'minimal',  surprise: true,  maxElements: 8,  minWhitespace: 0.50 },
}

// ── #30 Anti-Patterns Blacklist ────────────────────────────

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

// ── #31 Depth Layering System ──────────────────────────────

const DEPTH_LAYERS = `
## שכבות עומק (Depth Layers) — כל אלמנט חייב לשבת בשכבה אחת:
- Layer 0 (zIndex: 0-1):    BACKGROUND — aurora, gradient, texture, full-bleed color
- Layer 1 (zIndex: 2-3):    DECORATIVE — watermark text, geometric shapes, motif patterns, thin architectural lines
- Layer 2 (zIndex: 4-5):    STRUCTURE — cards, containers, dividers, image frames
- Layer 3 (zIndex: 6-8):    CONTENT — body text, data, images, influencer cards
- Layer 4 (zIndex: 9-10):   HERO — main title, key number, focal element, brand name

חוק: אלמנטים מאותה שכבה לא חופפים (אלא אם אחד מהם decorative עם opacity < 0.3).
`

// ── #20 Composition Rules ──────────────────────────────────

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

### Scale Contrast (חובה — #21):
היחס בין הפונט הגדול ביותר לפונט הקטן ביותר בשקף חייב להיות לפחות 5:1.
למשל: אם הכותרת 96px, caption צריך להיות 18px או פחות.
שקפי peak (cover, insight, bigIdea, closing): יחס 10:1 לפחות (למשל 300px ו-18px).
`

// ── #23 Color Temperature Arc ──────────────────────────────

const TEMPERATURE_ARC: Record<string, 'cold' | 'neutral' | 'warm'> = {
  cover:              'cold',
  brief:              'cold',
  goals:              'neutral',
  audience:           'neutral',
  insight:            'warm',      // first warmth burst
  strategy:           'neutral',
  bigIdea:            'warm',      // peak warmth
  approach:           'neutral',
  deliverables:       'neutral',
  metrics:            'neutral',
  influencerStrategy: 'cold',
  influencers:        'neutral',
  closing:            'warm',      // warm finale
}

// ── #2 Layout Techniques Palette ───────────────────────────

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

// ═══════════════════════════════════════════════════════════
//  SECTION 3: FEW-SHOT EXAMPLES LIBRARY (#7 #29)
// ═══════════════════════════════════════════════════════════

/**
 * Gold-standard reference slides. Each type has 2 variants.
 * These teach Gemini what "WOW" actually looks like in JSON.
 */
const REFERENCE_SLIDES: Record<string, Slide[]> = {

  cover: [
    {
      id: 'ref-cover-1',
      slideType: 'cover' as SlideType,
      label: 'שער — Typographic Brutalism',
      background: { type: 'solid', value: '#0a0a0f' },
      elements: [
        // Layer 0: Aurora mesh background
        { id: 'rc1-bg', type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
          shapeType: 'decorative',
          fill: 'radial-gradient(circle at 20% 30%, #E9456050 0%, transparent 50%), radial-gradient(circle at 80% 80%, #FFD70050 0%, transparent 50%), radial-gradient(circle at 60% 50%, #1A1A4E80 0%, transparent 60%)',
          opacity: 0.7 },
        // Layer 1: Giant hollow watermark text — rotated, bleeding off canvas
        { id: 'rc1-wm', type: 'text', x: -150, y: 180, width: 2200, height: 500, zIndex: 2,
          content: 'BRAND', fontSize: 380, fontWeight: 900, color: 'transparent',
          textAlign: 'center', lineHeight: 0.9, letterSpacing: -8, opacity: 0.12, rotation: -8,
          textStroke: { width: 2, color: '#ffffff' }, role: 'decorative' },
        // Layer 1: Architectural thin line
        { id: 'rc1-line', type: 'shape', x: 160, y: 620, width: 340, height: 1, zIndex: 2,
          shapeType: 'decorative', fill: '#ffffff30', opacity: 1 },
        // Layer 1: Accent circle — top right
        { id: 'rc1-circle', type: 'shape', x: 1450, y: -80, width: 400, height: 400, zIndex: 2,
          shapeType: 'decorative', fill: '#E94560', clipPath: 'circle(50%)', opacity: 0.12 },
        // Layer 4: Main title — Rule of Thirds point B area
        { id: 'rc1-title', type: 'text', x: 120, y: 380, width: 900, height: 200, zIndex: 10,
          content: 'שם המותג', fontSize: 104, fontWeight: 900, color: '#ffffff',
          textAlign: 'right', lineHeight: 1.0, letterSpacing: -4, role: 'title' },
        // Layer 3: Subtitle — letter-spaced, light weight
        { id: 'rc1-sub', type: 'text', x: 120, y: 610, width: 600, height: 50, zIndex: 8,
          content: 'הצעת שיתוף פעולה', fontSize: 22, fontWeight: 300, color: '#ffffff70',
          textAlign: 'right', letterSpacing: 6, role: 'subtitle' },
        // Layer 3: Date — minimal
        { id: 'rc1-date', type: 'text', x: 120, y: 680, width: 300, height: 30, zIndex: 8,
          content: 'ינואר 2025', fontSize: 16, fontWeight: 300, color: '#ffffff40',
          textAlign: 'right', letterSpacing: 3, role: 'caption' },
      ],
    },
    {
      id: 'ref-cover-2',
      slideType: 'cover' as SlideType,
      label: 'שער — Cinematic Widescreen',
      background: { type: 'solid', value: '#0d0d12' },
      elements: [
        // Layer 0: Gradient atmosphere
        { id: 'rc2-bg', type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
          shapeType: 'decorative',
          fill: 'linear-gradient(135deg, #0d0d12 0%, #1a0a2e 40%, #0d0d12 100%)',
          opacity: 1 },
        // Layer 0: Cinematic bars (top and bottom)
        { id: 'rc2-bar-top', type: 'shape', x: 0, y: 0, width: 1920, height: 120, zIndex: 1,
          shapeType: 'decorative', fill: '#000000', opacity: 0.6 },
        { id: 'rc2-bar-btm', type: 'shape', x: 0, y: 960, width: 1920, height: 120, zIndex: 1,
          shapeType: 'decorative', fill: '#000000', opacity: 0.6 },
        // Layer 1: Massive number "01" — hollow
        { id: 'rc2-num', type: 'text', x: 1200, y: 200, width: 700, height: 500, zIndex: 2,
          content: '01', fontSize: 400, fontWeight: 900, color: 'transparent',
          textAlign: 'left', lineHeight: 0.85, letterSpacing: -10, opacity: 0.08,
          textStroke: { width: 2, color: '#ffffff' }, role: 'decorative' },
        // Layer 2: Accent strip — vertical
        { id: 'rc2-strip', type: 'shape', x: 100, y: 160, width: 4, height: 760, zIndex: 4,
          shapeType: 'decorative', fill: '#E94560', opacity: 0.8 },
        // Layer 4: Brand name — huge, right-aligned
        { id: 'rc2-brand', type: 'text', x: 140, y: 340, width: 1000, height: 160, zIndex: 10,
          content: 'שם המותג', fontSize: 120, fontWeight: 900, color: '#ffffff',
          textAlign: 'right', lineHeight: 0.95, letterSpacing: -5, role: 'title' },
        // Layer 3: Tagline with wide spacing
        { id: 'rc2-tag', type: 'text', x: 140, y: 540, width: 800, height: 40, zIndex: 8,
          content: 'INFLUENCER MARKETING PROPOSAL', fontSize: 18, fontWeight: 400, color: '#ffffff50',
          textAlign: 'right', letterSpacing: 8, role: 'subtitle' },
        // Layer 3: Thin separator
        { id: 'rc2-sep', type: 'shape', x: 140, y: 520, width: 200, height: 1, zIndex: 6,
          shapeType: 'decorative', fill: '#E9456080', opacity: 1 },
      ],
    },
  ],

  insight: [
    {
      id: 'ref-insight-1',
      slideType: 'insight' as SlideType,
      label: 'תובנה — Typographic Brutalism',
      background: { type: 'solid', value: '#0a0a0f' },
      elements: [
        // Layer 0: Warm aurora (this is a "peak" slide)
        { id: 'ri1-bg', type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
          shapeType: 'decorative',
          fill: 'radial-gradient(circle at 30% 60%, #E9456040 0%, transparent 45%), radial-gradient(circle at 70% 30%, #FFD70030 0%, transparent 50%)',
          opacity: 0.8 },
        // Layer 1: Keyword watermark — massive, bleeding
        { id: 'ri1-wm', type: 'text', x: -100, y: 600, width: 2100, height: 400, zIndex: 2,
          content: 'INSIGHT', fontSize: 280, fontWeight: 900, color: 'transparent',
          textAlign: 'center', lineHeight: 0.9, letterSpacing: -6, opacity: 0.06,
          textStroke: { width: 2, color: '#ffffff' }, role: 'decorative' },
        // Layer 1: Section label
        { id: 'ri1-label', type: 'text', x: 120, y: 100, width: 300, height: 30, zIndex: 3,
          content: 'התובנה המרכזית', fontSize: 14, fontWeight: 400, color: '#E94560',
          textAlign: 'right', letterSpacing: 4, role: 'caption' },
        // Layer 4: The insight itself — big, centered, dominant
        { id: 'ri1-quote', type: 'text', x: 200, y: 300, width: 1520, height: 300, zIndex: 10,
          content: 'כאן תהיה התובנה המרכזית — משפט אחד חזק שמשנה את הפרספקטיבה',
          fontSize: 52, fontWeight: 700, color: '#ffffff', textAlign: 'center',
          lineHeight: 1.3, letterSpacing: -1, role: 'title' },
        // Layer 2: Quotation mark — oversized decorative
        { id: 'ri1-qmark', type: 'text', x: 100, y: 220, width: 200, height: 200, zIndex: 4,
          content: '"', fontSize: 200, fontWeight: 900, color: '#E94560',
          textAlign: 'center', lineHeight: 1, opacity: 0.2, role: 'decorative' },
        // Layer 3: Source attribution
        { id: 'ri1-src', type: 'text', x: 200, y: 640, width: 1520, height: 30, zIndex: 8,
          content: 'מקור: מחקר שוק 2024', fontSize: 16, fontWeight: 300, color: '#ffffff40',
          textAlign: 'center', letterSpacing: 2, role: 'caption' },
      ],
    },
  ],

  metrics: [
    {
      id: 'ref-metrics-1',
      slideType: 'metrics' as SlideType,
      label: 'מדדים — Bento Box',
      background: { type: 'solid', value: '#0a0a0f' },
      elements: [
        // Layer 0: Subtle gradient
        { id: 'rm1-bg', type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
          shapeType: 'decorative',
          fill: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0a0a0f 70%)',
          opacity: 1 },
        // Layer 3: Section label
        { id: 'rm1-label', type: 'text', x: 120, y: 80, width: 400, height: 30, zIndex: 8,
          content: 'יעדים ומדדים', fontSize: 14, fontWeight: 400, color: '#E94560',
          textAlign: 'right', letterSpacing: 4, role: 'caption' },
        // Layer 4: Headline
        { id: 'rm1-title', type: 'text', x: 120, y: 120, width: 800, height: 80, zIndex: 10,
          content: 'המספרים שמאחורי התוכנית', fontSize: 56, fontWeight: 800, color: '#ffffff',
          textAlign: 'right', lineHeight: 1.1, letterSpacing: -2, role: 'title' },
        // Layer 2: Card 1 — fake shadow behind
        { id: 'rm1-c1-shadow', type: 'shape', x: 135, y: 275, width: 520, height: 320, zIndex: 4,
          shapeType: 'decorative', fill: '#000000', borderRadius: 24, opacity: 0.15 },
        { id: 'rm1-c1', type: 'shape', x: 120, y: 260, width: 520, height: 320, zIndex: 5,
          shapeType: 'decorative', fill: '#141428', borderRadius: 24, opacity: 1,
          border: '1px solid #ffffff10' },
        // Layer 3: Card 1 content — big number
        { id: 'rm1-c1-num', type: 'text', x: 160, y: 290, width: 440, height: 120, zIndex: 8,
          content: '2.5M', fontSize: 88, fontWeight: 900, color: '#E94560',
          textAlign: 'right', lineHeight: 1, letterSpacing: -3, role: 'body' },
        { id: 'rm1-c1-lbl', type: 'text', x: 160, y: 420, width: 440, height: 40, zIndex: 8,
          content: 'חשיפות צפויות', fontSize: 22, fontWeight: 400, color: '#ffffff80',
          textAlign: 'right', role: 'body' },
        // Layer 2: Card 2
        { id: 'rm1-c2-shadow', type: 'shape', x: 695, y: 275, width: 520, height: 320, zIndex: 4,
          shapeType: 'decorative', fill: '#000000', borderRadius: 24, opacity: 0.15 },
        { id: 'rm1-c2', type: 'shape', x: 680, y: 260, width: 520, height: 320, zIndex: 5,
          shapeType: 'decorative', fill: '#141428', borderRadius: 24, opacity: 1,
          border: '1px solid #ffffff10' },
        { id: 'rm1-c2-num', type: 'text', x: 720, y: 290, width: 440, height: 120, zIndex: 8,
          content: '150K', fontSize: 88, fontWeight: 900, color: '#FFD700',
          textAlign: 'right', lineHeight: 1, letterSpacing: -3, role: 'body' },
        { id: 'rm1-c2-lbl', type: 'text', x: 720, y: 420, width: 440, height: 40, zIndex: 8,
          content: 'אינטראקציות', fontSize: 22, fontWeight: 400, color: '#ffffff80',
          textAlign: 'right', role: 'body' },
        // Layer 2: Card 3 (wider, bottom)
        { id: 'rm1-c3-shadow', type: 'shape', x: 135, y: 635, width: 1065, height: 200, zIndex: 4,
          shapeType: 'decorative', fill: '#000000', borderRadius: 24, opacity: 0.15 },
        { id: 'rm1-c3', type: 'shape', x: 120, y: 620, width: 1065, height: 200, zIndex: 5,
          shapeType: 'decorative', fill: '#141428', borderRadius: 24, opacity: 1,
          border: '1px solid #ffffff10' },
        { id: 'rm1-c3-num', type: 'text', x: 160, y: 650, width: 300, height: 100, zIndex: 8,
          content: '₪3.2', fontSize: 72, fontWeight: 900, color: '#ffffff',
          textAlign: 'right', lineHeight: 1, letterSpacing: -2, role: 'body' },
        { id: 'rm1-c3-lbl', type: 'text', x: 160, y: 760, width: 300, height: 35, zIndex: 8,
          content: 'CPE ממוצע', fontSize: 20, fontWeight: 400, color: '#ffffff60',
          textAlign: 'right', role: 'body' },
      ],
    },
  ],

  closing: [
    {
      id: 'ref-closing-1',
      slideType: 'closing' as SlideType,
      label: 'סיום — Typographic Brutalism',
      background: { type: 'solid', value: '#0a0a0f' },
      elements: [
        // Layer 0: Rich aurora
        { id: 'rcl1-bg', type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
          shapeType: 'decorative',
          fill: 'radial-gradient(circle at 25% 40%, #E9456060 0%, transparent 45%), radial-gradient(circle at 75% 70%, #FFD70050 0%, transparent 45%), radial-gradient(circle at 50% 50%, #4A00E040 0%, transparent 60%)',
          opacity: 0.8 },
        // Layer 1: Giant hollow brand name
        { id: 'rcl1-wm', type: 'text', x: -200, y: 250, width: 2400, height: 500, zIndex: 2,
          content: 'BRAND', fontSize: 400, fontWeight: 900, color: 'transparent',
          textAlign: 'center', lineHeight: 0.85, letterSpacing: -10, opacity: 0.08,
          textStroke: { width: 2, color: '#ffffff' }, rotation: -5, role: 'decorative' },
        // Layer 4: CTA headline
        { id: 'rcl1-cta', type: 'text', x: 300, y: 400, width: 1320, height: 120, zIndex: 10,
          content: "LET'S CREATE TOGETHER", fontSize: 80, fontWeight: 900, color: '#ffffff',
          textAlign: 'center', lineHeight: 1.0, letterSpacing: -3, role: 'title' },
        // Layer 3: Hebrew subtitle
        { id: 'rcl1-sub', type: 'text', x: 400, y: 550, width: 1120, height: 50, zIndex: 8,
          content: 'נשמח להתחיל לעבוד ביחד', fontSize: 26, fontWeight: 300, color: '#ffffff60',
          textAlign: 'center', letterSpacing: 2, role: 'subtitle' },
        // Layer 2: Horizontal line
        { id: 'rcl1-line', type: 'shape', x: 810, y: 540, width: 300, height: 1, zIndex: 4,
          shapeType: 'decorative', fill: '#ffffff30', opacity: 1 },
      ],
    },
  ],
}

// ═══════════════════════════════════════════════════════════
//  SECTION 4: UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

// ── #9 Color Harmony Utilities ─────────────────────────────

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
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Adjust hex color lightness by amount (-1 to 1) */
function adjustLightness(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const adjust = (v: number) => Math.min(255, Math.max(0, Math.round(v + amount * 255)))
  const r = adjust(rgb.r).toString(16).padStart(2, '0')
  const g = adjust(rgb.g).toString(16).padStart(2, '0')
  const b = adjust(rgb.b).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

/**
 * #9 Validate & auto-fix color harmony
 * Ensures WCAG AA (4.5:1 for body text, 3:1 for large text)
 */
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

  // Accent on background: need 3:1 (large text)
  let accentContrast = contrastRatio(fixed.accent, fixed.background)
  attempts = 0
  while (accentContrast < 3 && attempts < 20) {
    fixed.accent = adjustLightness(fixed.accent, 0.05)
    accentContrast = contrastRatio(fixed.accent, fixed.background)
    attempts++
  }

  // Card background must differ from main background
  const cardBgContrast = contrastRatio(fixed.cardBg, fixed.background)
  if (cardBgContrast < 1.1) {
    fixed.cardBg = adjustLightness(fixed.cardBg, 0.06)
  }

  // Muted text: readable but subdued — need 3:1 minimum
  let mutedContrast = contrastRatio(fixed.muted, fixed.background)
  attempts = 0
  while (mutedContrast < 3 && attempts < 20) {
    fixed.muted = adjustLightness(fixed.muted, 0.04)
    mutedContrast = contrastRatio(fixed.muted, fixed.background)
    attempts++
  }

  return fixed
}

// ── #13 #18 Spatial analysis ───────────────────────────────

interface BoundingBox { x: number; y: number; width: number; height: number }

function computeOccupiedArea(elements: BoundingBox[]): number {
  // Simple: sum of all element areas divided by canvas area
  const canvasArea = 1920 * 1080
  let occupied = 0
  for (const el of elements) {
    occupied += el.width * el.height
  }
  return Math.min(occupied / canvasArea, 1)
}

/**
 * #18 Heatmap — divide canvas into 4x3 grid, count element coverage per cell
 * Returns balance score 0-1 (1 = perfectly balanced)
 */
function computeBalanceScore(elements: BoundingBox[]): number {
  const cols = 4, rows = 3
  const cellW = 1920 / cols, cellH = 1080 / rows
  const cells = Array.from({ length: cols * rows }, () => 0)

  for (const el of elements) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c * cellW, cy = r * cellH
        // Check overlap
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

  // Lower variance = better balance. Convert to 0-1 score.
  return Math.max(0, 1 - variance * 2)
}

// ── #17 Simple in-memory cache ─────────────────────────────

const cache = new Map<string, CacheEntry<unknown>>()

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.data
}

function cacheSet<T>(key: string, data: T, ttlMs = 30 * 60 * 1000): void {
  cache.set(key, { key, data, createdAt: Date.now(), expiresAt: Date.now() + ttlMs })
}

// ── Format helpers ─────────────────────────────────────────

function formatNum(n?: number): string {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}

// ═══════════════════════════════════════════════════════════
//  SECTION 5: STAGE 1 — CREATIVE DIRECTION (#1 #32)
// ═══════════════════════════════════════════════════════════

async function generateCreativeDirection(
  brand: BrandDesignInput,
): Promise<CreativeDirection> {
  const requestId = `cd-${Date.now()}`
  console.log(`[ArtDirector][${requestId}] Stage 1: Creative Direction for "${brand.brandName}"`)

  // Check cache
  const cacheKey = `creative-${brand.brandName}-${brand.brandColors.primary}`
  const cached = cacheGet<CreativeDirection>(cacheKey)
  if (cached) { console.log(`[ArtDirector][${requestId}] Using cached creative direction`); return cached }

  const prompt = `אתה קריאייטיב דיירקטור ב-Sagmeister & Walsh. קיבלת בריף למצגת עבור המותג "${brand.brandName}".

## מידע על המותג:
- תעשייה: ${brand.industry || 'לא ידוע'}
- אישיות: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
- צבע ראשי: ${brand.brandColors.primary}
- צבע משני: ${brand.brandColors.secondary}  
- צבע הדגשה: ${brand.brandColors.accent}
- סגנון: ${brand.brandColors.style || 'corporate'}
- קהל יעד: ${brand.targetAudience || 'מבוגרים 25-45'}

## המשימה שלך:
אל תעצב כלום. רק תחשוב כמו creative director.

1. **visualMetaphor** — מה המטאפורה הויזואלית של המותג? לא "מקצועי" — אלא משהו קונקרטי כמו "ארכיטקטורה ברוטליסטית של בטון חשוף" או "גלריית אמנות מינימליסטית יפנית" או "מגזין אופנה של שנות ה-90".
2. **visualTension** — מה ה-Tension? מה ההפתעה הויזואלית? למשל: "טקסט ענק שבור + מינימליזם יפני" או "נתונים קרים בתוך אסתטיקה חמה אורגנית".
3. **oneRule** — חוק אחד שכל שקף חייב לקיים. למשל: "תמיד יש אלמנט אחד שחורג מהמסגרת" או "הצבע הראשי מופיע רק כנקודת מיקוד אחת קטנה".
4. **colorStory** — לא רשימת צבעים, אלא נרטיב: "המצגת מתחילה בחושך וקור, מתחממת באמצע עם פרץ של accent, וחוזרת לאיפוק חם בסוף".
5. **motif** — אלמנט ויזואלי חוזר שמשחיל את כל המצגת. סוג (diagonal-lines / dots / circles / angular-cuts / wave / grid-lines / organic-blobs / triangles) + תיאור.
6. **typographyVoice** — איך הטיפוגרפיה "מדברת"? למשל: "צורחת — כותרות ענקיות 900 weight לצד גוף רזה 300" או "לוחשת — הכל קטן ומדויק עם letter-spacing רחב".
7. **emotionalArc** — המסע הרגשי: מה הקהל מרגיש בהתחלה, באמצע, ובסוף?
8. **temperatureArc** — מערך של 13 ערכים (אחד לכל שקף): "cold" / "neutral" / "warm"
9. **tensionSlides** — אילו סוגי שקפים (מתוך: cover, brief, goals, audience, insight, strategy, bigIdea, approach, deliverables, metrics, influencerStrategy, influencers, closing) צריכים נקודת מתח ויזואלית (tension point)?

## חשוב:
- תהיה ספציפי וייחודי. כל מותג חייב להרגיש אחרת.
- אל תחזור על אותן מטאפורות: לא "מודרני ונקי" — זה ריק מתוכן.

החזר JSON בלבד:`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 8000 } },
    })

    const parsed = parseGeminiJson<CreativeDirection>(response.text || '')
    if (parsed?.visualMetaphor) {
      console.log(`[ArtDirector][${requestId}] Creative direction: "${parsed.visualMetaphor}" / Tension: "${parsed.visualTension}"`)
      cacheSet(cacheKey, parsed)
      return parsed
    }
    throw new Error('Invalid creative direction response')
  } catch (error) {
    console.error(`[ArtDirector][${requestId}] Creative direction failed:`, error)
    // #15 Fallback
    return {
      visualMetaphor: 'מגזין עיצוב שוויצרי מודרני — גריד חד עם רגעי טיפוגרפיה דרמטיים',
      visualTension: 'סדר גרמני לצד פרצי צבע בלתי צפויים',
      oneRule: 'בכל שקף יש אלמנט אחד שחורג מהגבולות',
      colorStory: 'מתחיל בחושך, מתחמם באמצע עם הצבע הראשי, וחוזר לאיפוק בסוף',
      motif: { type: 'diagonal-lines', description: 'קווים אלכסוניים דקים שחוצים את המסך' },
      typographyVoice: 'צורחת — כותרות 900 weight ענקיות לצד גוף רזה 300',
      emotionalArc: 'סקרנות → הבנה → התלהבות → ביטחון → רצון לפעול',
      temperatureArc: ['cold', 'cold', 'neutral', 'neutral', 'warm', 'neutral', 'warm', 'neutral', 'neutral', 'neutral', 'cold', 'neutral', 'warm'],
      tensionSlides: ['cover', 'insight', 'bigIdea', 'closing'],
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  SECTION 6: STAGE 2 — PREMIUM DESIGN SYSTEM (#5 #9 #11)
// ═══════════════════════════════════════════════════════════

async function generatePremiumDesignSystem(
  brand: BrandDesignInput,
  creativeDirection: CreativeDirection,
): Promise<PremiumDesignSystem> {
  const requestId = `ds-${Date.now()}`
  console.log(`[ArtDirector][${requestId}] Stage 2: Design System for "${brand.brandName}"`)

  const cacheKey = `design-system-${brand.brandName}-${brand.brandColors.primary}`
  const cached = cacheGet<PremiumDesignSystem>(cacheKey)
  if (cached) { console.log(`[ArtDirector][${requestId}] Using cached design system`); return cached }

  const prompt = `אתה ארט דיירקטור ב-Pentagram. המשימה: לייצר Design System מלא למצגת WOW עבור "${brand.brandName}".

## הכיוון הקריאטיבי (נקבע על ידי ה-Creative Director):
- מטאפורה ויזואלית: ${creativeDirection.visualMetaphor}
- מתח ויזואלי: ${creativeDirection.visualTension}
- חוק-על: ${creativeDirection.oneRule}
- סיפור הצבע: ${creativeDirection.colorStory}
- מוטיב חוזר: ${creativeDirection.motif.type} — ${creativeDirection.motif.description}
- קול טיפוגרפי: ${creativeDirection.typographyVoice}

## צבעי המותג המקוריים:
ראשי: ${brand.brandColors.primary} | משני: ${brand.brandColors.secondary} | הדגשה: ${brand.brandColors.accent}

## דרישות:
צור Design System פרימיום שמכבד את הצבעים המקוריים אבל מעשיר אותם.

### צבעים (colors):
- primary, secondary, accent — מבוססים על צבעי המותג
- background — כהה מאוד (לא שחור טהור — עם hint של צבע)
- text — בהיר מספיק ל-WCAG AA (4.5:1 contrast מול background)
- cardBg — נבדל מהרקע (יותר בהיר/כהה ב-10-15%)
- cardBorder — עדין (opacity נמוך של primary או white)
- gradientStart, gradientEnd — לגרדיאנטים דקורטיביים
- muted — צבע טקסט מושתק (3:1 contrast minimum)
- highlight — accent שני (complementary או analogous)
- auroraA, auroraB, auroraC — 3 צבעים ל-mesh gradient (מבוססי primary/secondary/accent עם opacity)

### טיפוגרפיה (typography):
- displaySize: 80-140 (לשקפי שער)
- headingSize: 48-64
- subheadingSize: 28-36  
- bodySize: 20-24
- captionSize: 14-16
- letterSpacingTight: -5 עד -1 (לכותרות גדולות)
- letterSpacingWide: 2 עד 8 (ל-subtitles וcaptions)
- lineHeightTight: 0.9-1.05 (לכותרות)
- lineHeightRelaxed: 1.4-1.6 (לגוף)
- weightPairs: זוגות משקל [[heading, body]] — למשל [[900,300]] או [[700,400]]

### מרווחים (spacing):
- unit: 8 (בסיס)
- cardPadding: 32-48
- cardGap: 24-40
- safeMargin: 80

### אפקטים (effects):
- borderRadius: "sharp" (0) / "soft" (16-24) / "pill" (500)
- borderRadiusValue: המספר
- decorativeStyle: "geometric" / "organic" / "minimal" / "brutalist"
- shadowStyle: "none" / "fake-3d" / "glow"
- auroraGradient: מחרוזת CSS מוכנה של radial-gradient mesh מ-3 צבעי Aurora

### מוטיב (motif):
- type: סוג (diagonal-lines / dots / circles / angular-cuts / wave / grid-lines / organic-blobs / triangles)
- opacity: 0.05-0.2
- color: צבע
- implementation: תיאור CSS או shape (למשל: "shape ברוחב 1920 וגובה 1 עם opacity 0.1, מסובב ב-25 מעלות")

פונט: Heebo (כבר מיובא, לא צריך לשנות).

החזר JSON בלבד.`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 6000 } },
    })

    const parsed = parseGeminiJson<PremiumDesignSystem>(response.text || '')
    if (parsed?.colors?.primary) {
      // #9 Validate and fix color harmony
      parsed.colors = validateAndFixColors(parsed.colors)

      // Ensure fonts default
      parsed.fonts = parsed.fonts || { heading: 'Heebo', body: 'Heebo' }
      parsed.direction = 'rtl'

      console.log(`[ArtDirector][${requestId}] Design system ready. Accent contrast: ${contrastRatio(parsed.colors.accent, parsed.colors.background).toFixed(1)}:1`)
      cacheSet(cacheKey, parsed)
      return parsed
    }
    throw new Error('Invalid design system response')
  } catch (error) {
    console.error(`[ArtDirector][${requestId}] Design system generation failed:`, error)
    // #15 Fallback
    const fallback: PremiumDesignSystem = {
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
        weightPairs: [[900, 300], [700, 400]],
      },
      spacing: { unit: 8, cardPadding: 40, cardGap: 32, safeMargin: 80 },
      effects: {
        borderRadius: 'soft', borderRadiusValue: 20,
        decorativeStyle: 'geometric', shadowStyle: 'fake-3d',
        auroraGradient: `radial-gradient(circle at 20% 30%, ${brand.brandColors.primary}50 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${brand.brandColors.accent}50 0%, transparent 50%)`,
      },
      motif: { type: 'diagonal-lines', opacity: 0.1, color: '#ffffff', implementation: 'קו בגובה 1px ברוחב 2200, סיבוב 25°, opacity 0.1' },
    }
    return fallback
  }
}

// ═══════════════════════════════════════════════════════════
//  SECTION 7: STAGE 3 — LAYOUT STRATEGY (#2 #3 #23 #24)
// ═══════════════════════════════════════════════════════════

async function generateLayoutStrategy(
  slideTypes: string[],
  creativeDirection: CreativeDirection,
  brand: BrandDesignInput,
): Promise<Record<string, LayoutDirective>> {
  const requestId = `ls-${Date.now()}`
  console.log(`[ArtDirector][${requestId}] Stage 3: Layout Strategy`)

  const prompt = `אתה ארט דיירקטור. המשימה: לבחור טכניקת layout ייחודית לכל שקף במצגת "${brand.brandName}".

## הכיוון הקריאטיבי:
- מטאפורה: ${creativeDirection.visualMetaphor}
- מתח: ${creativeDirection.visualTension}
- חוק-על: ${creativeDirection.oneRule}
- מוטיב: ${creativeDirection.motif.type} — ${creativeDirection.motif.description}

## סוגי השקפים (בסדר):
${slideTypes.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## טכניקות Layout זמינות:
${LAYOUT_TECHNIQUES.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## חוקים:
1. אסור לחזור על אותה טכניקה יותר מ-**פעמיים** בכל המצגת.
2. שקפי "peak" (cover, insight, bigIdea, closing) חייבים לקבל את הטכניקות הכי דרמטיות.
3. שקפים עוקבים לא יכולים להשתמש באותה טכניקה.
4. שקפים עתירי מידע (goals, deliverables, metrics, influencers) צריכים Bento Box / Swiss Grid / Data Art.
5. יש להתאים את הטכניקה לאישיות המותג ולמטאפורה.

## פורמט תשובה — JSON:
לכל סוג שקף, החזר:
- technique: שם הטכניקה
- description: תיאור קצר של איך הטכניקה מיושמת בשקף הזה
- constraints: מערך של 2-3 כללים ספציפיים ליישום

\`\`\`json
{
  "cover": { "technique": "...", "description": "...", "constraints": ["...", "..."] },
  ...
}
\`\`\``

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 4000 } },
    })

    const parsed = parseGeminiJson<Record<string, LayoutDirective>>(response.text || '')
    if (parsed && Object.keys(parsed).length > 0) {
      console.log(`[ArtDirector][${requestId}] Layout strategy assigned for ${Object.keys(parsed).length} slide types`)
      return parsed
    }
    throw new Error('Invalid layout strategy')
  } catch (error) {
    console.error(`[ArtDirector][${requestId}] Layout strategy failed, using defaults:`, error)
    // #15 Fallback defaults
    const fallback: Record<string, LayoutDirective> = {}
    const defaults: Record<string, string> = {
      cover: 'Typographic Brutalism', brief: 'Editorial Bleed', goals: 'Bento Box',
      audience: 'Magazine Spread', insight: 'Negative Space Dominance', strategy: 'Split Screen Asymmetry',
      bigIdea: 'Kinetic Typography (frozen)', approach: 'Swiss Grid', deliverables: 'Bento Box',
      metrics: 'Data Art', influencerStrategy: 'Architectural Grid',
      influencers: 'Bento Box', closing: 'Poster Style (single focal)',
    }
    for (const st of slideTypes) {
      fallback[st] = { technique: defaults[st] || 'Swiss Grid', description: '', constraints: [] }
    }
    return fallback
  }
}

// ═══════════════════════════════════════════════════════════
//  SECTION 8: STAGE 4 — AST SLIDE GENERATION
//  (THE CORE — with all 32 enhancements baked in)
// ═══════════════════════════════════════════════════════════

async function generateSlidesBatchAST(
  designSystem: PremiumDesignSystem,
  slides: SlideContentInput[],
  batchIndex: number,
  brandName: string,
  creativeDirection: CreativeDirection,
  layoutStrategy: Record<string, LayoutDirective>,
  batchContext: BatchContext,
  logoUrl?: string,
  leadersLogoUrl?: string,
): Promise<Slide[]> {
  const requestId = `sb-${batchIndex}-${Date.now()}`
  console.log(`[ArtDirector][${requestId}] Stage 4: Generating batch ${batchIndex + 1}...`)

  const colors = designSystem.colors
  const typo = designSystem.typography
  const spacing = designSystem.spacing
  const effects = designSystem.effects

  // ── Build per-slide directives ──────────────────────────

  const slidesDescription = slides.map((slide, i) => {
    const globalIndex = batchContext.slideIndex + i
    const pacing = PACING_MAP[slide.slideType] || PACING_MAP.brief
    const layout = layoutStrategy[slide.slideType] || { technique: 'Swiss Grid', description: '', constraints: [] }
    const temperature = creativeDirection.temperatureArc[globalIndex] || 'neutral'
    const hasTension = creativeDirection.tensionSlides.includes(slide.slideType)
    const contentJson = JSON.stringify(slide.content, null, 2)

    // #10 Image treatment selection
    let imageTreatment: ImageTreatment = 'raw'
    if (slide.imageUrl) {
      if (pacing.energy === 'peak') imageTreatment = 'masked-capsule'
      else if (pacing.energy === 'calm') imageTreatment = 'color-overlay'
      else if (slide.slideType === 'audience') imageTreatment = 'duotone'
      else imageTreatment = 'masked-circle'
    }

    // #12 Transition logic
    const prevSlide = i > 0 ? slides[i - 1] : null
    const transitionNote = prevSlide
      ? `הערת מעבר: השקף הקודם היה "${prevSlide.slideType}" (${PACING_MAP[prevSlide.slideType]?.energy || 'calm'}) — צור ניגוד או המשכיות רגשית מתאימה.`
      : globalIndex > 0
        ? `הערת מעבר: ${batchContext.previousSlidesVisualSummary.split('\n').slice(-1)[0] || ''}`
        : ''

    return `
═══ שקף ${globalIndex + 1}/${batchContext.totalSlides}: "${slide.title}" (${slide.slideType}) ═══

🎨 Layout: **${layout.technique}**
${layout.description ? `  ↳ ${layout.description}` : ''}
${layout.constraints.length > 0 ? `  ↳ כללים: ${layout.constraints.join(' | ')}` : ''}

🌡️ Temperature: ${temperature} | ⚡ Energy: ${pacing.energy} | 📊 Density: ${pacing.density}
${hasTension ? '🔥 TENSION POINT — חובה נקודת מתח ויזואלית אחת בשקף הזה!' : ''}
📐 מקסימום ${pacing.maxElements} אלמנטים | לפחות ${Math.round(pacing.minWhitespace * 100)}% רווח לבן
${slide.imageUrl ? `🖼️ Image: ${slide.imageUrl} (Treatment: ${imageTreatment})` : '🚫 אין תמונה — השתמש ב-shapes וטיפוגרפיה'}
${transitionNote ? `↩️ ${transitionNote}` : ''}

תוכן:
\`\`\`json
${contentJson}
\`\`\``
  }).join('\n')

  // ── Choose reference examples for this batch ────────────

  const relevantExamples: string[] = []
  for (const slide of slides) {
    const refs = REFERENCE_SLIDES[slide.slideType]
    if (refs && refs.length > 0) {
      // Pick one random example per type
      const ref = refs[Math.floor(Math.random() * refs.length)]
      relevantExamples.push(`
### דוגמת רפרנס — ${slide.slideType} (ברמת WOW):
\`\`\`json
${JSON.stringify(ref, null, 2)}
\`\`\`
`)
    }
  }

  // ── Master Prompt ───────────────────────────────────────

  const prompt = `אתה ארט דיירקטור גאון ברמת Awwwards. המותג: "${brandName}".

══════════════════════════════════
🧠 THE CREATIVE BRIEF
══════════════════════════════════

**מטאפורה ויזואלית:** ${creativeDirection.visualMetaphor}
**מתח ויזואלי:** ${creativeDirection.visualTension}
**חוק-על (כל שקף חייב לקיים):** ${creativeDirection.oneRule}
**סיפור צבע:** ${creativeDirection.colorStory}
**מוטיב חוזר:** ${creativeDirection.motif.type} — ${creativeDirection.motif.description}
**קול טיפוגרפי:** ${creativeDirection.typographyVoice}
**מסע רגשי:** ${creativeDirection.emotionalArc}

══════════════════════════════════
🎨 DESIGN SYSTEM
══════════════════════════════════

צבעים: primary: ${colors.primary} | secondary: ${colors.secondary} | accent: ${colors.accent}
רקע: ${colors.background} | טקסט: ${colors.text} | כרטיסים: ${colors.cardBg}
מושתק: ${colors.muted} | highlight: ${colors.highlight}
Aurora: ${effects.auroraGradient}

טיפוגרפיה: display: ${typo.displaySize}px | heading: ${typo.headingSize}px | subheading: ${typo.subheadingSize}px | body: ${typo.bodySize}px | caption: ${typo.captionSize}px
Spacing tight: ${typo.letterSpacingTight} | wide: ${typo.letterSpacingWide}
Weight pairs: ${typo.weightPairs.map(p => `${p[0]}/${p[1]}`).join(', ')}
Line height: tight ${typo.lineHeightTight} | relaxed ${typo.lineHeightRelaxed}

Card: padding ${spacing.cardPadding}px | gap ${spacing.cardGap}px | radius ${effects.borderRadiusValue}px
Decorative style: ${effects.decorativeStyle} | Shadow: ${effects.shadowStyle}

Motif: ${designSystem.motif.type} (opacity: ${designSystem.motif.opacity}, color: ${designSystem.motif.color})
${designSystem.motif.implementation}

══════════════════════════════════
📐 COMPOSITION & QUALITY RULES
══════════════════════════════════

${COMPOSITION_RULES}

${DEPTH_LAYERS}

${ANTI_PATTERNS}

## Micro-Typography (#22):
- כותרות ענקיות (60px+): letterSpacing: ${typo.letterSpacingTight} (tight!) + lineHeight: ${typo.lineHeightTight}
- Subtitles/labels: letterSpacing: ${typo.letterSpacingWide} (spaced out!) + fontWeight: ${typo.weightPairs[0]?.[1] || 300}
- כותרות: fontWeight: ${typo.weightPairs[0]?.[0] || 900} | גוף: fontWeight: ${typo.weightPairs[0]?.[1] || 300}
- מספרים ענקים: fontWeight 900, letterSpacing: -4

## White Space (#25):
רווח לבן הוא אלמנט עיצובי פעיל. הכותרת הראשית חייבה מרחק של 80px+ מכל אלמנט אחר.

## Visual Anchor (#26):
כל שקף חייב anchor ויזואלי — האלמנט הראשון שהעין רואה. סדר: anchor → title → details.

## Frozen Motion (#28):
אלמנטים שנראים "באמצע תנועה": rotation 3-8°, x קרוב לקצה, clipPath שחותך.

## Geometric Harmony (#27):
רוחב כרטיסים = כפולות של ${spacing.unit}px. מרחקים = כפולות של ${spacing.cardGap}px.

## PDF Export Rules (CRITICAL):
🚫 אסור בהחלט: box-shadow, backdrop-filter: blur, filter: blur
✅ Fake 3D shadow: shape בצבע #000000 opacity 0.12-0.18 ב-x+12, y+12, zIndex פחות 1
✅ גבולות: border: "1px solid rgba(255,255,255,0.08)"

══════════════════════════════════
📝 CONTEXT FROM PREVIOUS SLIDES
══════════════════════════════════
${batchContext.previousSlidesVisualSummary || 'זה הבאצ׳ הראשון — אין הקשר קודם.'}

══════════════════════════════════
🖼️ REFERENCE EXAMPLES (THIS IS WHAT WOW LOOKS LIKE)
══════════════════════════════════
${relevantExamples.length > 0 ? relevantExamples.join('\n') : 'אין דוגמאות רלוונטיות לבאצ׳ הזה — השתמש בחוקים ובקריאייטיב בריף.'}

⚠️ חשוב: צור עיצוב **שונה לחלוטין** מהדוגמאות — הן רק ברמת האיכות, לא בסגנון.

══════════════════════════════════
📋 SLIDES TO CREATE
══════════════════════════════════
${slidesDescription}

══════════════════════════════════
📦 JSON FORMAT
══════════════════════════════════

## Element types:

### Shape:
{ "id": "el-X", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0,
  "shapeType": "decorative", "fill": "gradient or #hex", "clipPath": "...", "borderRadius": 0,
  "opacity": 1, "rotation": 0, "border": "1px solid rgba(255,255,255,0.1)", "role": "decorative" }

### Text:
{ "id": "el-X", "type": "text", "x": 80, "y": 120, "width": 800, "height": 80, "zIndex": 10,
  "content": "טקסט", "fontSize": 64, "fontWeight": 800, "color": "#fff", "textAlign": "right",
  "role": "title|subtitle|body|caption|decorative", "lineHeight": 1.1, "letterSpacing": -2,
  "opacity": 1, "rotation": 0, "textDecoration": "none",
  "textStroke": { "width": 2, "color": "#hex" } }

### Image:
{ "id": "el-X", "type": "image", "x": 960, "y": 0, "width": 960, "height": 1080, "zIndex": 5,
  "src": "URL", "objectFit": "cover", "borderRadius": 500, "clipPath": "...", "role": "content" }

החזר אך ורק JSON:
{
  "slides": [
    {
      "id": "slide-N",
      "slideType": "...",
      "label": "...",
      "background": { "type": "solid", "value": "${colors.background}" },
      "elements": [ ... ]
    }
  ]
}`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 10000 } },
    })

    const parsed = parseGeminiJson<{ slides: Slide[] }>(response.text || '')

    if (parsed?.slides?.length > 0) {
      console.log(`[ArtDirector][${requestId}] Generated ${parsed.slides.length} AST slides`)

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
    console.error(`[ArtDirector][${requestId}] AST batch generation failed:`, error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════
//  SECTION 9: STAGE 5 — QUALITY VALIDATOR (#4 #9 #13 #16 #18 #21)
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

  // ── #9 Contrast check ──────────────────────────────────
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
          message: `טקסט "${((el as any).content || '').slice(0, 20)}..." — contrast ${cr.toFixed(1)}:1 (minimum ${minContrast}:1)`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          elementId: (el as any).id, autoFixable: true,
        })
        score -= 15
      }
    }
  }

  // ── Element count check ────────────────────────────────
  if (elements.length > pacing.maxElements) {
    issues.push({
      severity: 'warning', category: 'density',
      message: `${elements.length} elements (max ${pacing.maxElements} for ${pacing.energy} energy)`,
      autoFixable: false,
    })
    score -= 10
  }

  // ── #13 Whitespace check ───────────────────────────────
  const occupancy = computeOccupiedArea(allBoxes)
  const whitespace = 1 - occupancy
  if (whitespace < pacing.minWhitespace) {
    issues.push({
      severity: 'warning', category: 'whitespace',
      message: `Whitespace ${Math.round(whitespace * 100)}% (minimum ${Math.round(pacing.minWhitespace * 100)}%)`,
      autoFixable: false,
    })
    score -= 8
  }

  // ── Safe zone check ────────────────────────────────────
  for (const el of contentTexts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = el as any
    if ((e.x || 0) < 60 || ((e.x || 0) + (e.width || 0)) > 1860 || (e.y || 0) < 60 || ((e.y || 0) + (e.height || 0)) > 1020) {
      issues.push({
        severity: 'warning', category: 'safe-zone',
        message: `Content text "${(e.content || '').slice(0, 20)}..." outside safe zone`,
        elementId: e.id, autoFixable: true,
      })
      score -= 5
    }
  }

  // ── #21 Scale contrast check ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fontSizes = contentTexts.map((e: any) => e.fontSize || 20).filter((s: number) => s > 0)
  if (fontSizes.length >= 2) {
    const maxFont = Math.max(...fontSizes)
    const minFont = Math.min(...fontSizes)
    const ratio = maxFont / minFont
    const minRatio = pacing.energy === 'peak' ? 8 : 4
    if (ratio < minRatio) {
      issues.push({
        severity: 'suggestion', category: 'scale',
        message: `Font scale ratio ${ratio.toFixed(1)}:1 (recommend ≥${minRatio}:1 for ${pacing.energy} slides)`,
        autoFixable: false,
      })
      score -= 5
    }
  }

  // ── Hierarchy check ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const titles = contentTexts.filter((e: any) => e.role === 'title')
  if (titles.length === 0 && slide.slideType !== 'cover') {
    issues.push({ severity: 'warning', category: 'hierarchy', message: 'No title element found', autoFixable: false })
    score -= 10
  }
  if (titles.length > 2) {
    issues.push({ severity: 'warning', category: 'hierarchy', message: `Too many titles: ${titles.length}`, autoFixable: false })
    score -= 5
  }

  // ── #18 Balance check ──────────────────────────────────
  const balance = computeBalanceScore(allBoxes)
  if (balance < 0.3) {
    issues.push({
      severity: 'suggestion', category: 'balance',
      message: `Visual balance score ${(balance * 100).toFixed(0)}/100 — elements may be too concentrated`,
      autoFixable: false,
    })
    score -= 5
  }

  return { valid: issues.filter(i => i.severity === 'critical').length === 0, score: Math.max(0, score), issues }
}

// ── Auto-fix critical issues ─────────────────────────────

function autoFixSlide(slide: Slide, issues: ValidationIssue[], designSystem: PremiumDesignSystem): Slide {
  const fixed = { ...slide, elements: [...slide.elements] }

  for (const issue of issues) {
    if (!issue.autoFixable || !issue.elementId) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elIndex = fixed.elements.findIndex((e: any) => e.id === issue.elementId)
    if (elIndex === -1) continue

    if (issue.category === 'contrast') {
      // Brighten/darken text until contrast passes
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

// ═══════════════════════════════════════════════════════════
//  SECTION 10: STAGE 6 — SELF-CRITIQUE (#8)
// ═══════════════════════════════════════════════════════════

/**
 * For peak/tension slides, generate 2 variants and let Gemini pick the best.
 * Only used for: cover, insight, bigIdea, closing.
 */
async function selfCritiqueSlide(
  slideA: Slide,
  slideB: Slide,
  slideType: string,
  brandName: string,
  creativeDirection: CreativeDirection,
): Promise<{ winner: 'A' | 'B'; reason: string }> {
  const requestId = `critique-${Date.now()}`
  console.log(`[ArtDirector][${requestId}] Self-critique for ${slideType}`)

  const prompt = `אתה שופט בתחרות עיצוב Awwwards. לפניך שני ניסיונות לשקף "${slideType}" של "${brandName}".

הכיוון הקריאטיבי: ${creativeDirection.visualMetaphor} / ${creativeDirection.visualTension}

## גרסה A:
${JSON.stringify(slideA.elements?.length || 0)} אלמנטים
${JSON.stringify(slideA, null, 2).slice(0, 2000)}

## גרסה B:
${JSON.stringify(slideB.elements?.length || 0)} אלמנטים  
${JSON.stringify(slideB, null, 2).slice(0, 2000)}

## קריטריוני שיפוט:
1. WOW factor (0-10): האם שומט לסת?
2. Typography (0-10): האם יש ניגודיות גדלים, hierarchy ברור?
3. Composition (0-10): Rule of thirds, balance, focal point
4. White space (0-10): האם הרווח הלבן פעיל ומכוון?
5. Brand alignment (0-10): האם מרגיש כמו המותג?

בחר מנצח. החזר JSON: { "winner": "A" | "B", "reason": "נימוק קצר" }`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    })
    const parsed = parseGeminiJson<{ winner: 'A' | 'B'; reason: string }>(response.text || '')
    if (parsed?.winner) {
      console.log(`[ArtDirector][${requestId}] Winner: ${parsed.winner} — ${parsed.reason}`)
      return parsed
    }
    return { winner: 'A', reason: 'Default' }
  } catch {
    return { winner: 'A', reason: 'Critique failed, defaulting to A' }
  }
}

// ═══════════════════════════════════════════════════════════
//  SECTION 11: STAGE 6b — VISUAL CONSISTENCY CHECK (#16)
// ═══════════════════════════════════════════════════════════

function checkVisualConsistency(slides: Slide[], designSystem: PremiumDesignSystem): Slide[] {
  console.log('[ArtDirector] Running visual consistency check...')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTitles: { slideIndex: number; y: number; fontSize: number; element: any }[] = []

  slides.forEach((slide, si) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titles = (slide.elements || []).filter((e: any) => e.role === 'title' && e.type === 'text')
    for (const t of titles) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allTitles.push({ slideIndex: si, y: (t as any).y || 0, fontSize: (t as any).fontSize || 48, element: t })
    }
  })

  if (allTitles.length < 3) return slides

  // Check title Y consistency (exclude cover and closing)
  const regularTitles = allTitles.filter(t =>
    slides[t.slideIndex]?.slideType !== 'cover' && slides[t.slideIndex]?.slideType !== 'closing'
  )

  if (regularTitles.length > 0) {
    const medianY = regularTitles.map(t => t.y).sort((a, b) => a - b)[Math.floor(regularTitles.length / 2)]

    // If a title is way off from the median, nudge it
    for (const t of regularTitles) {
      if (Math.abs(t.y - medianY) > 60) {
        t.element.y = medianY
      }
    }
  }

  // Check that heading fontSizes are consistent (within ±4px)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headingSizes = regularTitles.map(t => (t.element as any).fontSize || 48)
  if (headingSizes.length > 0) {
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
//  SECTION 12: MAIN ORCHESTRATOR
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

/**
 * MAIN EXPORT: Generate a full WOW presentation using the 6-stage pipeline.
 */
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
    /** Enable A/B self-critique for peak slides (slower but better) */
    enableSelfCritique?: boolean
    /** Enable render-in-the-loop feedback (requires Puppeteer, slowest but best) */
    enableRenderLoop?: boolean
    /** Screenshot function for render-in-the-loop */
    screenshotFn?: (slide: Slide) => Promise<string>
  } = {}
): Promise<Presentation> {
  const requestId = `pres-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[ArtDirector][${requestId}] 🎬 Starting 6-stage pipeline for "${data.brandName}"`)
  console.log(`${'═'.repeat(60)}\n`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const leadersLogo = config.leadersLogoUrl || `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const clientLogo = config.clientLogoUrl || data._scraped?.logoUrl || config.brandLogoUrl || ''

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
    logoUrl: clientLogo || undefined,
    coverImageUrl: config.images?.coverImage || undefined,
    targetAudience: data.targetDescription || '',
  }

  // ══════════════════════════════════════════════════════
  //  STAGE 1: Creative Direction
  // ══════════════════════════════════════════════════════
  console.log(`[ArtDirector] ── Stage 1/6: Creative Direction ──`)
  const creativeDirection = await generateCreativeDirection(brandInput)

  // ══════════════════════════════════════════════════════
  //  STAGE 2: Design System
  // ══════════════════════════════════════════════════════
  console.log(`[ArtDirector] ── Stage 2/6: Design System ──`)
  const designSystem = await generatePremiumDesignSystem(brandInput, creativeDirection)

  // ── Prepare slide content batches (same structure as before) ──

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

  const allBatches = [batch1, batch2, batch3]
  const allSlideTypes = allBatches.flat().map(s => s.slideType)

  // ══════════════════════════════════════════════════════
  //  STAGE 3: Layout Strategy
  // ══════════════════════════════════════════════════════
  console.log(`[ArtDirector] ── Stage 3/6: Layout Strategy ──`)
  const layoutStrategy = await generateLayoutStrategy(allSlideTypes, creativeDirection, brandInput)

  // ══════════════════════════════════════════════════════
  //  STAGE 4: Slide Generation (with cross-batch context)
  // ══════════════════════════════════════════════════════
  console.log(`[ArtDirector] ── Stage 4/6: Slide Generation ──`)

  let allSlides: Slide[] = []
  let visualSummary = ''
  let slideIndex = 0

  // #6: Sequential batches with context threading (not parallel)
  for (let b = 0; b < allBatches.length; b++) {
    const batch = allBatches[b]
    console.log(`[ArtDirector] Batch ${b + 1}/${allBatches.length} (${batch.length} slides)`)

    try {
      const batchSlides = await generateSlidesBatchAST(
        designSystem, batch, b, data.brandName || '',
        creativeDirection, layoutStrategy,
        {
          previousSlidesVisualSummary: visualSummary,
          slideIndex,
          totalSlides: allBatches.flat().length,
          creativeDirection,
        },
        clientLogo, leadersLogo,
      )

      allSlides.push(...batchSlides)

      // Update context for next batch
      visualSummary += batchSlides.map((s, i) => {
        const elCount = s.elements?.length || 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasImage = s.elements?.some((e: any) => e.type === 'image') || false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maxFontSize = Math.max(...(s.elements?.filter((e: any) => e.type === 'text').map((e: any) => e.fontSize || 0) || [0]))
        return `שקף ${slideIndex + i + 1} (${s.slideType}): ${elCount} elements, maxFont: ${maxFontSize}px, hasImage: ${hasImage}`
      }).join('\n') + '\n'

      slideIndex += batch.length
    } catch (error) {
      console.error(`[ArtDirector] Batch ${b + 1} failed:`, error)
      // #15 Fallback: create minimal placeholder slides
      for (const slide of batch) {
        allSlides.push(createFallbackSlide(slide, designSystem, slideIndex++))
      }
    }
  }

  if (allSlides.length === 0) throw new Error('All batches failed — no slides generated')

  // ══════════════════════════════════════════════════════
  //  STAGE 5: Quality Validation + Auto-fix
  // ══════════════════════════════════════════════════════
  console.log(`[ArtDirector] ── Stage 5/6: Quality Validation ──`)

  const validatedSlides: Slide[] = []
  let totalScore = 0

  for (const slide of allSlides) {
    const pacing = PACING_MAP[slide.slideType as string] || PACING_MAP.brief
    const result = validateSlide(slide, designSystem, pacing)
    totalScore += result.score

    if (result.issues.some(i => i.severity === 'critical' && i.autoFixable)) {
      const fixed = autoFixSlide(slide, result.issues, designSystem)
      validatedSlides.push(fixed)
      console.log(`[ArtDirector] Auto-fixed ${result.issues.filter(i => i.autoFixable).length} issues in ${slide.slideType}`)
    } else {
      validatedSlides.push(slide)
    }

    if (result.issues.length > 0) {
      console.log(`[ArtDirector] ${slide.slideType}: score ${result.score}/100 — ${result.issues.map(i => `[${i.severity}] ${i.message}`).join(', ')}`)
    }
  }

  const avgScore = Math.round(totalScore / allSlides.length)
  console.log(`[ArtDirector] Average quality score: ${avgScore}/100`)

  // ══════════════════════════════════════════════════════
  //  STAGE 6: Self-Critique for peak slides (optional)
  // ══════════════════════════════════════════════════════
  let finalSlides = validatedSlides

  if (config.enableSelfCritique) {
    console.log(`[ArtDirector] ── Stage 6/6: Self-Critique (A/B) ──`)

    const peakTypes = new Set(creativeDirection.tensionSlides)
    const critiquedSlides: Slide[] = [...validatedSlides]

    for (let i = 0; i < validatedSlides.length; i++) {
      const slide = validatedSlides[i]
      if (!peakTypes.has(slide.slideType as string)) continue

      console.log(`[ArtDirector] Generating variant B for ${slide.slideType}...`)

      try {
        // Generate a second version
        const batchIdx = allBatches.findIndex(b => b.some(s => s.slideType === slide.slideType))
        const slideInput = allBatches.flat().find(s => s.slideType === slide.slideType)
        if (!slideInput) continue

        const variantB = await generateSlidesBatchAST(
          designSystem, [slideInput], 99, data.brandName || '',
          creativeDirection, layoutStrategy,
          { previousSlidesVisualSummary: '', slideIndex: i, totalSlides: allSlides.length, creativeDirection },
          clientLogo, leadersLogo,
        )

        if (variantB.length > 0) {
          const { winner } = await selfCritiqueSlide(slide, variantB[0], slide.slideType as string, data.brandName || '', creativeDirection)
          if (winner === 'B') {
            critiquedSlides[i] = { ...variantB[0], id: slide.id }
            console.log(`[ArtDirector] ${slide.slideType}: Variant B selected`)
          } else {
            console.log(`[ArtDirector] ${slide.slideType}: Variant A kept`)
          }
        }
      } catch (error) {
        console.log(`[ArtDirector] Self-critique failed for ${slide.slideType}, keeping original`)
      }
    }

    finalSlides = critiquedSlides
  } else {
    console.log(`[ArtDirector] ── Stage 6/6: Self-Critique (skipped) ──`)
  }

  // ── #16 Visual Consistency Check ────────────────────────
  console.log(`[ArtDirector] Running visual consistency pass...`)
  finalSlides = checkVisualConsistency(finalSlides, designSystem)

  // ── Done ────────────────────────────────────────────────
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`[ArtDirector][${requestId}] ✅ Pipeline complete in ${duration}s`)
  console.log(`[ArtDirector] ${finalSlides.length} slides | Avg quality: ${avgScore}/100`)
  console.log(`${'═'.repeat(60)}\n`)

  return {
    id: `pres-${Date.now()}`,
    title: data.brandName || 'הצעת מחיר',
    designSystem,
    slides: finalSlides,
    metadata: {
      brandName: data.brandName,
      createdAt: new Date().toISOString(),
      version: 2,
      pipeline: 'art-director-v2',
      qualityScore: avgScore,
      creativeDirection: creativeDirection.visualMetaphor,
      duration: parseFloat(duration),
    },
  }
}

// ═══════════════════════════════════════════════════════════
//  SECTION 13: FALLBACK SLIDE GENERATOR (#15)
// ═══════════════════════════════════════════════════════════

function createFallbackSlide(
  input: SlideContentInput,
  designSystem: PremiumDesignSystem,
  index: number,
): Slide {
  const colors = designSystem.colors
  const typo = designSystem.typography

  // Extract title from content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const title = (input.content as any).headline || (input.content as any).brandName || input.title || `שקף ${index + 1}`

  return {
    id: `slide-fallback-${index}`,
    slideType: input.slideType as SlideType,
    label: input.title,
    background: { type: 'solid', value: colors.background },
    elements: [
      // Simple gradient background
      { id: `fb-${index}-bg`, type: 'shape', x: 0, y: 0, width: 1920, height: 1080, zIndex: 0,
        shapeType: 'decorative',
        fill: `radial-gradient(circle at 50% 50%, ${colors.cardBg} 0%, ${colors.background} 100%)`,
        opacity: 1,
      },
      // Accent line
      { id: `fb-${index}-line`, type: 'shape', x: 120, y: 200, width: 60, height: 4, zIndex: 4,
        shapeType: 'decorative', fill: colors.accent, opacity: 0.8,
      },
      // Title
      { id: `fb-${index}-title`, type: 'text', x: 120, y: 220, width: 800, height: 100, zIndex: 10,
        content: title, fontSize: typo.headingSize, fontWeight: (typo.weightPairs[0]?.[0] || 800) as FontWeight,
        color: colors.text, textAlign: 'right', lineHeight: typo.lineHeightTight,
        letterSpacing: typo.letterSpacingTight, role: 'title',
      },
      // Motif element
      { id: `fb-${index}-motif`, type: 'shape', x: -100, y: 800, width: 2200, height: 1, zIndex: 2,
        shapeType: 'decorative', fill: colors.muted, opacity: designSystem.motif.opacity, rotation: 15,
      },
    ],
  }
}

// ═══════════════════════════════════════════════════════════
//  SECTION 14: SINGLE SLIDE REGENERATOR
// ═══════════════════════════════════════════════════════════

export async function regenerateSingleSlide(
  designSystem: PremiumDesignSystem,
  slideContent: SlideContentInput,
  brandName: string,
  creativeDirection: CreativeDirection,
  layoutStrategy: Record<string, LayoutDirective>,
  instruction?: string,
  logoUrl?: string,
  leadersLogoUrl?: string,
): Promise<Slide> {
  const modifiedContent = instruction
    ? { ...slideContent, title: `${slideContent.title}\n\nהנחיה נוספת: ${instruction}` }
    : slideContent

  const slides = await generateSlidesBatchAST(
    designSystem, [modifiedContent], 0, brandName,
    creativeDirection, layoutStrategy,
    {
      previousSlidesVisualSummary: '',
      slideIndex: 0,
      totalSlides: 1,
      creativeDirection,
    },
    logoUrl, leadersLogoUrl,
  )

  if (slides.length === 0) throw new Error('Failed to regenerate slide')

  // Validate and fix
  const pacing = PACING_MAP[slideContent.slideType] || PACING_MAP.brief
  const validation = validateSlide(slides[0], designSystem, pacing)
  if (validation.issues.some(i => i.severity === 'critical' && i.autoFixable)) {
    return autoFixSlide(slides[0], validation.issues, designSystem)
  }

  return slides[0]
}

// ═══════════════════════════════════════════════════════════
//  SECTION 15: RENDER-IN-THE-LOOP (#19)
//  (Hook point — requires external Puppeteer screenshot fn)
// ═══════════════════════════════════════════════════════════

/**
 * If enabled, renders each slide to an image and sends it back to Gemini
 * for visual feedback. This is the ultimate quality booster but adds latency.
 *
 * Usage:
 *   await renderLoopFeedback(slide, designSystem, screenshotFn)
 *
 * The screenshotFn should:
 *   1. Render the Slide AST to HTML
 *   2. Take a Puppeteer screenshot
 *   3. Return base64 image string
 */
export async function renderLoopFeedback(
  slide: Slide,
  designSystem: PremiumDesignSystem,
  creativeDirection: CreativeDirection,
  screenshotFn: (slide: Slide) => Promise<string>,
  maxIterations = 2,
): Promise<Slide> {
  let currentSlide = slide

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const requestId = `rl-${iteration}-${Date.now()}`
    console.log(`[ArtDirector][${requestId}] Render-in-the-Loop iteration ${iteration + 1}/${maxIterations}`)

    try {
      // 1. Render to image
      const screenshot = await screenshotFn(currentSlide)

      // 2. Send to Gemini for visual critique
      const prompt = `אתה ארט דיירקטור בוחן שקף מצגת שנוצר. 

הכיוון הקריאטיבי: ${creativeDirection.visualMetaphor}
חוק-על: ${creativeDirection.oneRule}

התמונה המצורפת היא screenshot של השקף.

בדוק:
1. האם יש WOW factor? 
2. האם הטקסט קריא?
3. האם הקומפוזיציה מאוזנת?
4. האם יש בעיות ויזואליות (חפיפה מכוערת, טקסט חתוך, אלמנט מוזר)?

אם הכל מצוין — החזר: { "needsFix": false }
אם יש בעיות — החזר: { "needsFix": true, "fixes": [ { "elementId": "...", "action": "move|resize|recolor|delete", "details": "..." } ] }`

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
          { role: 'user', parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: screenshot } },
          ]},
        ],
        config: { responseMimeType: 'application/json' },
      })

      const feedback = parseGeminiJson<{ needsFix: boolean; fixes?: { elementId: string; action: string; details: string }[] }>(response.text || '')

      if (!feedback?.needsFix) {
        console.log(`[ArtDirector][${requestId}] Visual critique: APPROVED ✓`)
        break
      }

      console.log(`[ArtDirector][${requestId}] Visual critique: ${feedback.fixes?.length || 0} fixes needed`)

      // 3. Apply fixes (basic)
      if (feedback.fixes) {
        for (const fix of feedback.fixes) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const elIdx = currentSlide.elements.findIndex((e: any) => e.id === fix.elementId)
          if (elIdx !== -1 && fix.action === 'delete') {
            currentSlide = { ...currentSlide, elements: currentSlide.elements.filter((_, i) => i !== elIdx) }
          }
          // Other fixes would need more sophisticated handling
        }
      }
    } catch (error) {
      console.error(`[ArtDirector][${requestId}] Render loop iteration failed:`, error)
      break
    }
  }

  return currentSlide
}

// ═══════════════════════════════════════════════════════════
//  COMPATIBILITY WRAPPER: generateAISlides (HTML output)
//  Used by /api/pdf, /api/preview-slides, /api/export-pptx
// ═══════════════════════════════════════════════════════════

import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'

/**
 * Generate AI slides as HTML strings (legacy API).
 * Internally calls generateAIPresentation and converts AST → HTML.
 */
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