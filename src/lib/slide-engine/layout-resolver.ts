/**
 * Layout Resolver — converts SlideIntent tokens → pixel-positioned Slide.
 *
 * ~200 lines. NO heuristics, NO median-flattening. Pure lookup + math.
 * Each composition is a self-contained function returning positioned elements.
 *
 * Slide Engine v5
 */

import type { Slide, SlideElement, SlideBackground, TextElement, ImageElement, ShapeElement } from '@/types/presentation'
import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import type {
  SlideIntent, ElementIntent, CompositionToken,
  SizeToken, ColorToken, BackgroundToken,
} from './semantic-tokens'

const W = 1920
const H = 1080
const M = 80 // safe margin

let _uid = 0
function uid(prefix: string) { return `${prefix}-${++_uid}` }

// ─── Size Resolution ──────────────────────────────────
function resolveSize(token: SizeToken | null, ds: PremiumDesignSystem): { fontSize: number; lineHeight: number } {
  const base = ds.typography.headingSize || 48
  const map: Record<SizeToken, { fontSize: number; lineHeight: number }> = {
    hero:     { fontSize: Math.round(base * 2.2),  lineHeight: 1.05 },
    headline: { fontSize: Math.round(base * 1.5),  lineHeight: 1.1 },
    title:    { fontSize: base,                     lineHeight: 1.2 },
    subtitle: { fontSize: Math.round(base * 0.65), lineHeight: 1.3 },
    body:     { fontSize: Math.round(base * 0.45), lineHeight: 1.55 },
    caption:  { fontSize: Math.round(base * 0.35), lineHeight: 1.4 },
    micro:    { fontSize: Math.round(base * 0.28), lineHeight: 1.4 },
  }
  return map[token || 'body'] || map.body
}

// ─── Color Resolution ─────────────────────────────────
function resolveColor(token: ColorToken | null, ds: PremiumDesignSystem, bgIsDark: boolean): string {
  const c = ds.colors
  const map: Record<ColorToken, string> = {
    primary: c.primary,
    secondary: c.secondary,
    accent: c.accent,
    'on-dark': c.text || '#F0F4F8',
    'on-light': c.secondary || '#1A1A1B',
    muted: c.muted || `${c.text}80`,
  }
  if (!token) return bgIsDark ? map['on-dark'] : map['on-light']
  return map[token] || (bgIsDark ? map['on-dark'] : map['on-light'])
}

function isBgDark(bg: BackgroundToken): boolean {
  return !['solid-light'].includes(bg)
}

// ─── Background Resolution ────────────────────────────
function resolveBackground(token: BackgroundToken, ds: PremiumDesignSystem): SlideBackground {
  const c = ds.colors
  switch (token) {
    case 'solid-primary': return { type: 'solid', value: c.primary }
    case 'solid-dark':    return { type: 'solid', value: c.background || '#0A0A12' }
    case 'solid-light':   return { type: 'solid', value: '#F4F7FA' }
    case 'gradient-primary':  return { type: 'gradient', value: `linear-gradient(135deg, ${c.primary}, ${c.secondary})` }
    case 'gradient-dramatic': return { type: 'gradient', value: `linear-gradient(160deg, ${c.background || '#0A0A12'}, ${c.primary}40, ${c.background || '#0A0A12'})` }
    case 'gradient-subtle':   return { type: 'gradient', value: `linear-gradient(180deg, ${c.background || '#0A0A12'}, ${c.secondary || '#1A1A2E'})` }
    case 'aurora': return { type: 'gradient', value: ds.effects.auroraGradient || `radial-gradient(ellipse at 20% 50%, ${c.primary}40, transparent 50%), radial-gradient(ellipse at 80% 20%, ${c.accent}30, transparent 50%), ${c.background}` }
    case 'image-full':   return { type: 'solid', value: c.background || '#0A0A12' } // actual image added as element
    case 'image-dimmed':  return { type: 'solid', value: c.background || '#0A0A12' }
    default: return { type: 'solid', value: c.background || '#0A0A12' }
  }
}

// ─── Weight → fontWeight ──────────────────────────────
function resolveWeight(token: ElementIntent['weight']): number {
  switch (token) {
    case 'dominant':   return 900
    case 'prominent':  return 700
    case 'supporting': return 400
    case 'subtle':     return 300
    default: return 400
  }
}

// ─── Build text element helper ────────────────────────
function text(
  el: ElementIntent, ds: PremiumDesignSystem, dark: boolean,
  x: number, y: number, w: number, h: number, zIndex: number,
): TextElement {
  const sz = resolveSize(el.size, ds)
  return {
    id: uid('txt'), type: 'text',
    x, y, width: w, height: h, zIndex,
    content: el.content || '',
    fontSize: sz.fontSize,
    fontWeight: resolveWeight(el.weight),
    color: resolveColor(el.color, ds, dark),
    textAlign: 'right' as const,
    role: (el.role === 'stat' ? 'metric-value' : el.role) as TextElement['role'],
    lineHeight: sz.lineHeight,
    letterSpacing: sz.fontSize >= 80 ? -3 : sz.fontSize >= 48 ? -1 : 0,
    textShadow: el.role === 'title' || el.role === 'stat' ? '0 4px 30px rgba(0,0,0,0.5)' : undefined,
  }
}

// ─── Build image element helper ───────────────────────
function img(
  el: ElementIntent,
  x: number, y: number, w: number, h: number, zIndex: number,
): ImageElement {
  return {
    id: uid('img'), type: 'image',
    x, y, width: w, height: h, zIndex,
    src: el.imageUrl || '', alt: '', objectFit: 'cover' as const,
    opacity: el.imageOpacity ?? 1,
    filter: (el.imageOpacity ?? 1) < 0.5 ? 'brightness(0.5) contrast(1.15)' : undefined,
  }
}

// ─── Build shape element helper ───────────────────────
function shape(
  fill: string,
  x: number, y: number, w: number, h: number, zIndex: number,
  opts?: Partial<ShapeElement>,
): ShapeElement {
  return {
    id: uid('shp'), type: 'shape', shapeType: 'rectangle' as const,
    x, y, width: w, height: h, zIndex, fill,
    ...opts,
  }
}

// ═══════════════════════════════════════════════════════
//  COMPOSITION FUNCTIONS — one per layout, self-contained
// ═══════════════════════════════════════════════════════

type CompositionFn = (els: ElementIntent[], ds: PremiumDesignSystem, dark: boolean) => SlideElement[]

function findEl(els: ElementIntent[], role: string): ElementIntent | undefined {
  return els.find(e => e.role === role)
}
function findImage(els: ElementIntent[]): ElementIntent | undefined {
  return els.find(e => e.type === 'image' && e.imageUrl)
}
function findCards(els: ElementIntent[]): ElementIntent[] {
  return els.filter(e => e.role === 'card-title')
}

const C: Record<CompositionToken, CompositionFn> = {
  // ─── Hero / Cover ───────────────────────────────────
  'hero-center': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImage(els)
    if (image) { r.push(img(image, 0, 0, W, H, 0)); r.push(shape(`linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.3))`, 0, 0, W, H, 1)) }
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, 160, 380, 1600, 200, 9))
    const s = findEl(els, 'subtitle'); if (s) r.push(text(s, ds, dk, 320, 600, 1280, 100, 8))
    r.push(shape(ds.colors.accent, W / 2 - 40, 570, 80, 4, 3)) // accent line
    return r
  },
  'hero-bottom': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImage(els)
    if (image) { r.push(img(image, 0, 0, W, H, 0)); r.push(shape(`linear-gradient(0deg, rgba(0,0,0,0.8) 30%, transparent 70%)`, 0, 0, W, H, 1)) }
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, 750, W - M * 2, 180, 9))
    const s = findEl(els, 'subtitle'); if (s) r.push(text(s, ds, dk, M, 940, W - M * 2, 80, 8))
    return r
  },
  'hero-left': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, 200, 900, 250, 9))
    const s = findEl(els, 'subtitle'); if (s) r.push(text(s, ds, dk, M, 480, 800, 100, 8))
    const b = findEl(els, 'body'); if (b) r.push(text(b, ds, dk, M, 600, 700, 200, 7))
    r.push(shape(ds.colors.accent, M, 460, 60, 4, 3)) // accent line
    return r
  },

  // ─── Split Layouts ──────────────────────────────────
  'split-image-left': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImage(els)
    if (image) r.push(img(image, 0, 0, 940, H, 2))
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, 1000, 180, 840, 200, 9))
    const b = findEl(els, 'body'); if (b) r.push(text(b, ds, dk, 1000, 420, 840, 300, 7))
    const s = findEl(els, 'subtitle'); if (s) r.push(text(s, ds, dk, 1000, 740, 840, 80, 6))
    return r
  },
  'split-image-right': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImage(els)
    if (image) r.push(img(image, 980, 0, 940, H, 2))
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, 180, 840, 200, 9))
    const b = findEl(els, 'body'); if (b) r.push(text(b, ds, dk, M, 420, 840, 300, 7))
    const s = findEl(els, 'subtitle'); if (s) r.push(text(s, ds, dk, M, 740, 840, 80, 6))
    return r
  },

  // ─── Data / Stats ───────────────────────────────────
  'big-number-center': (els, ds, dk) => {
    const r: SlideElement[] = []
    const stat = findEl(els, 'stat'); if (stat) r.push(text({ ...stat, size: 'hero' }, ds, dk, 160, 280, 1600, 300, 9))
    const lbl = findEl(els, 'label') || findEl(els, 'subtitle')
    if (lbl) r.push(text({ ...lbl, size: 'subtitle' }, ds, dk, 320, 620, 1280, 100, 7))
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, M, W - M * 2, 100, 8))
    return r
  },
  'big-number-side': (els, ds, dk) => {
    const r: SlideElement[] = []
    const stat = findEl(els, 'stat'); if (stat) r.push(text({ ...stat, size: 'hero' }, ds, dk, M, 200, 800, 300, 9))
    const lbl = findEl(els, 'label'); if (lbl) r.push(text({ ...lbl, size: 'body' }, ds, dk, M, 520, 800, 100, 7))
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, 1000, 200, 840, 150, 8))
    const b = findEl(els, 'body'); if (b) r.push(text(b, ds, dk, 1000, 400, 840, 300, 6))
    return r
  },
  'data-grid-2': (els, ds, dk) => buildCardGrid(els, ds, dk, 2),
  'data-grid-3': (els, ds, dk) => buildCardGrid(els, ds, dk, 3),
  'data-grid-4': (els, ds, dk) => buildCardGrid(els, ds, dk, 4),

  // ─── Editorial / Content ────────────────────────────
  'editorial-stack': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, M, W - M * 2, 150, 9))
    r.push(shape(ds.colors.accent, M, 240, 60, 4, 3))
    const s = findEl(els, 'subtitle'); if (s) r.push(text(s, ds, dk, M, 270, W - M * 2, 80, 8))
    const b = findEl(els, 'body'); if (b) r.push(text(b, ds, dk, M, 380, W * 0.6, 250, 7))
    // Bullets as stacked text
    els.filter(e => e.role === 'body' && e !== b).forEach((bullet, i) => {
      r.push(text(bullet, ds, dk, M, 660 + i * 50, W * 0.7, 45, 6))
    })
    return r
  },
  'editorial-sidebar': (els, ds, dk) => {
    const r: SlideElement[] = []
    // Sidebar background
    r.push(shape(`${ds.colors.cardBg || ds.colors.primary}15`, W - 400, 0, 400, H, 1))
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, M, W - 500, 150, 9))
    const b = findEl(els, 'body'); if (b) r.push(text(b, ds, dk, M, 280, W - 500, 400, 7))
    // Sidebar content
    const stat = findEl(els, 'stat'); if (stat) r.push(text({ ...stat, size: 'headline' }, ds, dk, W - 380, 200, 340, 150, 8))
    const lbl = findEl(els, 'label'); if (lbl) r.push(text(lbl, ds, dk, W - 380, 370, 340, 80, 6))
    return r
  },
  'quote-center': (els, ds, dk) => {
    const r: SlideElement[] = []
    const q = findEl(els, 'quote') || findEl(els, 'title')
    if (q) r.push(text({ ...q, size: q.size || 'headline' }, ds, dk, 200, 300, 1520, 300, 9))
    const attr = findEl(els, 'caption') || findEl(els, 'subtitle')
    if (attr) r.push(text(attr, ds, dk, 200, 650, 1520, 60, 6))
    r.push(shape(ds.colors.accent, 200, 270, 60, 4, 3))
    return r
  },

  // ─── Visual-heavy ───────────────────────────────────
  'full-bleed-image': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImage(els)
    if (image) { r.push(img(image, 0, 0, W, H, 0)); r.push(shape(`linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 100%)`, 0, 0, W, H, 1)) }
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, true, M, 800, W - M * 2, 150, 9))
    const s = findEl(els, 'subtitle'); if (s) r.push(text(s, ds, true, M, 960, W - M * 2, 60, 8))
    return r
  },
  'image-showcase': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImage(els)
    if (image) r.push(img(image, 200, 100, 1520, 700, 2))
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, 830, W - M * 2, 100, 9))
    const cap = findEl(els, 'caption'); if (cap) r.push(text(cap, ds, dk, M, 940, W - M * 2, 50, 6))
    return r
  },

  // ─── Timeline / Process ─────────────────────────────
  'timeline-horizontal': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, M, W - M * 2, 120, 9))
    // Horizontal line
    r.push(shape(ds.colors.accent, M, 350, W - M * 2, 3, 3))
    // Phase cards from card-title/card-body pairs
    const cards = findCards(els)
    const count = Math.min(cards.length, 5) || 3
    const cardW = Math.floor((W - M * 2 - (count - 1) * 24) / count)
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + 24)
      // Node circle
      r.push(shape(ds.colors.accent, x + cardW / 2 - 8, 342, 16, 16, 4, { borderRadius: 8 } as Partial<ShapeElement>))
      const card = cards[i]
      if (card) r.push(text({ ...card, size: 'subtitle' }, ds, dk, x, 400, cardW, 60, 7))
      const body = els.find(e => e.role === 'card-body' && els.indexOf(e) > els.indexOf(card!))
      if (body) r.push(text({ ...body, size: 'caption' }, ds, dk, x, 470, cardW, 200, 6))
    }
    return r
  },
  'process-3-step': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, M, W - M * 2, 120, 9))
    const cards = findCards(els)
    const count = Math.min(cards.length, 3) || 3
    const cardW = 500
    const gap = (W - M * 2 - count * cardW) / (count - 1 || 1)
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + gap)
      // Step number
      r.push(text({ type: 'text', role: 'stat', content: `${i + 1}`, size: 'headline', weight: 'dominant', color: 'accent', position: null, imageUrl: null, imageOpacity: null }, ds, dk, x, 280, 80, 80, 8))
      // Card bg
      r.push(shape(`${ds.colors.cardBg || ds.colors.primary}12`, x, 260, cardW, 500, 2, { borderRadius: 16 } as Partial<ShapeElement>))
      const card = cards[i]
      if (card) r.push(text({ ...card, size: 'subtitle' }, ds, dk, x + 30, 380, cardW - 60, 60, 7))
      const body = els.find(e => e.role === 'card-body' && els.indexOf(e) > els.indexOf(card!))
      if (body) r.push(text({ ...body, size: 'body' }, ds, dk, x + 30, 460, cardW - 60, 250, 6))
    }
    return r
  },

  // ─── Team / People ──────────────────────────────────
  'team-grid': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, M, W - M * 2, 120, 9))
    const images = els.filter(e => e.type === 'image' && e.imageUrl)
    const count = Math.min(images.length, 4) || 3
    const cardW = Math.floor((W - M * 2 - (count - 1) * 32) / count)
    images.slice(0, count).forEach((person, i) => {
      const x = M + i * (cardW + 32)
      r.push(img(person, x, 260, cardW, cardW, 4))
      const lbl = els.filter(e => e.role === 'label')[i]
      if (lbl) r.push(text(lbl, ds, dk, x, 260 + cardW + 16, cardW, 50, 6))
    })
    return r
  },
  'profile-spotlight': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImage(els)
    if (image) r.push(img(image, M, 150, 500, 500, 4))
    const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, 660, 200, W - 660 - M, 150, 9))
    const b = findEl(els, 'body'); if (b) r.push(text(b, ds, dk, 660, 400, W - 660 - M, 300, 7))
    return r
  },

  // ─── Closing ────────────────────────────────────────
  'closing-cta': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title'); if (t) r.push(text({ ...t, size: t.size || 'headline' }, ds, dk, 200, 350, 1520, 180, 9))
    const cta = findEl(els, 'cta') || findEl(els, 'subtitle')
    if (cta) r.push(text({ ...cta, size: 'subtitle' }, ds, dk, 200, 580, 1520, 80, 8))
    r.push(shape(ds.colors.accent, W / 2 - 40, 540, 80, 4, 3))
    return r
  },
  'closing-minimal': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title'); if (t) r.push(text({ ...t, size: t.size || 'hero' }, ds, dk, 200, 400, 1520, 200, 9))
    return r
  },
}

// ─── Card Grid Builder (shared for data-grid-2/3/4) ──
function buildCardGrid(els: ElementIntent[], ds: PremiumDesignSystem, dk: boolean, cols: number): SlideElement[] {
  const r: SlideElement[] = []
  const t = findEl(els, 'title'); if (t) r.push(text(t, ds, dk, M, M, W - M * 2, 120, 9))

  const cards = findCards(els)
  const rows = cols === 4 ? 2 : 1
  const actualCols = cols === 4 ? 2 : cols
  const gap = 24
  const startY = 260
  const cardW = Math.floor((W - M * 2 - (actualCols - 1) * gap) / actualCols)
  const cardH = rows === 2 ? Math.floor((H - startY - M - gap) / 2) : H - startY - M
  const pad = 28
  const radius = ds.effects.borderRadiusValue || 16

  for (let i = 0; i < Math.min(cards.length, cols); i++) {
    const col = i % actualCols
    const row = Math.floor(i / actualCols)
    const x = M + col * (cardW + gap)
    const y = startY + row * (cardH + gap)

    // Card background
    r.push(shape(ds.colors.cardBg || `${ds.colors.primary}10`, x, y, cardW, cardH, 3, {
      borderRadius: radius,
      border: `1px solid ${ds.colors.cardBorder || ds.colors.primary}20`,
    } as Partial<ShapeElement>))

    // Card title
    const card = cards[i]
    if (card) r.push(text({ ...card, size: 'subtitle' }, ds, dk, x + pad, y + pad, cardW - pad * 2, 40, 7))

    // Card body
    const body = els.filter(e => e.role === 'card-body')[i]
    if (body) r.push(text({ ...body, size: 'body' }, ds, dk, x + pad, y + pad + 50, cardW - pad * 2, cardH - pad * 2 - 50, 6))
  }
  return r
}

// ═══════════════════════════════════════════════════════
//  MAIN RESOLVER
// ═══════════════════════════════════════════════════════

export function resolveLayout(
  intent: SlideIntent,
  plan: { slideType: string; title: string },
  ds: PremiumDesignSystem,
  slideIndex: number,
): Slide {
  _uid = 0
  const dark = isBgDark(intent.background)
  const compositionFn = C[intent.composition]

  if (!compositionFn) {
    console.warn(`[LayoutResolver] Unknown composition "${intent.composition}", falling back to hero-center`)
    return resolveLayout({ ...intent, composition: 'hero-center' }, plan, ds, slideIndex)
  }

  const elements = compositionFn(intent.elements, ds, dark)
  const background = resolveBackground(intent.background, ds)

  return {
    id: `slide-${slideIndex}`,
    slideType: plan.slideType as Slide['slideType'],
    label: plan.title.slice(0, 30),
    archetype: intent.composition,
    dramaticChoice: intent.mood,
    background,
    elements,
  }
}

// ─── Fallback composition per slide type ──────────────
export const FALLBACK_COMPOSITIONS: Record<string, CompositionToken> = {
  cover: 'hero-center',
  brief: 'editorial-stack',
  goals: 'data-grid-3',
  audience: 'split-image-left',
  insight: 'quote-center',
  whyNow: 'big-number-center',
  strategy: 'data-grid-3',
  competitive: 'data-grid-4',
  bigIdea: 'hero-center',
  approach: 'process-3-step',
  deliverables: 'data-grid-3',
  metrics: 'big-number-center',
  influencerStrategy: 'editorial-sidebar',
  contentStrategy: 'data-grid-3',
  influencers: 'team-grid',
  timeline: 'timeline-horizontal',
  closing: 'closing-cta',
}
