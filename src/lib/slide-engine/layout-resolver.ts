/**
 * Layout Resolver v6 — Dramatic compositions with editorial flair.
 *
 * Each composition includes: watermarks, glow shapes, accent lines,
 * bleeding elements, glassmorphic cards, text shadows.
 * NO heuristics, NO median-flattening. Pure lookup + visual drama.
 *
 * Slide Engine v5 + Dramatic Soul v6
 */

import type { Slide, SlideElement, SlideBackground, TextElement, ImageElement, ShapeElement } from '@/types/presentation'
import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import type {
  SlideIntent, ElementIntent, CompositionToken,
  SizeToken, ColorToken, BackgroundToken,
} from './semantic-tokens'

const W = 1920
const H = 1080
const M = 80

let _uid = 0
function uid(prefix: string) { return `${prefix}-${++_uid}` }

// ─── Size Resolution ──────────────────────────────────
function sz(token: SizeToken | null, ds: PremiumDesignSystem): { fontSize: number; lineHeight: number } {
  const base = ds.typography.headingSize || 56
  const map: Record<SizeToken, { fontSize: number; lineHeight: number }> = {
    hero:     { fontSize: Math.round(base * 2.5),  lineHeight: 1.0 },
    headline: { fontSize: Math.round(base * 1.6),  lineHeight: 1.05 },
    title:    { fontSize: base,                     lineHeight: 1.15 },
    subtitle: { fontSize: Math.round(base * 0.6),  lineHeight: 1.3 },
    body:     { fontSize: Math.round(base * 0.42), lineHeight: 1.6 },
    caption:  { fontSize: Math.round(base * 0.3),  lineHeight: 1.4 },
    micro:    { fontSize: Math.round(base * 0.24), lineHeight: 1.4 },
  }
  return map[token || 'body'] || map.body
}

// ─── Color Resolution ─────────────────────────────────
function clr(token: ColorToken | null, ds: PremiumDesignSystem, dk: boolean): string {
  const c = ds.colors
  const map: Record<ColorToken, string> = {
    primary: c.primary, secondary: c.secondary, accent: c.accent,
    'on-dark': c.text || '#F0F4F8', 'on-light': c.secondary || '#1A1A1B',
    muted: c.muted || `${c.text}70`,
  }
  if (!token) return dk ? map['on-dark'] : map['on-light']
  return map[token] || (dk ? map['on-dark'] : map['on-light'])
}

function isBgDark(bg: BackgroundToken): boolean { return bg !== 'solid-light' }

// ─── Background Resolution ────────────────────────────
function resolveBg(token: BackgroundToken, ds: PremiumDesignSystem): SlideBackground {
  const c = ds.colors
  switch (token) {
    case 'solid-primary':     return { type: 'solid', value: c.primary }
    case 'solid-dark':        return { type: 'solid', value: c.background || '#0A0A12' }
    case 'solid-light':       return { type: 'solid', value: '#F4F7FA' }
    case 'gradient-primary':  return { type: 'gradient', value: `linear-gradient(135deg, ${c.primary}, ${c.secondary})` }
    case 'gradient-dramatic':  return { type: 'gradient', value: `linear-gradient(160deg, ${c.background || '#0A0A12'} 0%, ${c.primary}30 50%, ${c.background || '#0A0A12'} 100%)` }
    case 'gradient-subtle':   return { type: 'gradient', value: `linear-gradient(180deg, ${c.background || '#0A0A12'}, ${c.secondary || '#1A1A2E'})` }
    case 'aurora':            return { type: 'gradient', value: ds.effects.auroraGradient || `radial-gradient(ellipse at 20% 50%, ${c.primary}40, transparent 50%), radial-gradient(ellipse at 80% 20%, ${c.accent}30, transparent 50%), ${c.background}` }
    case 'image-full':
    case 'image-dimmed':      return { type: 'solid', value: c.background || '#0A0A12' }
    default:                  return { type: 'solid', value: c.background || '#0A0A12' }
  }
}

// ─── Font Weight ──────────────────────────────────────
function fw(token: ElementIntent['weight']): 300 | 400 | 500 | 600 | 700 | 800 | 900 {
  return token === 'dominant' ? 900 : token === 'prominent' ? 700 : token === 'supporting' ? 400 : 300
}

// ─── Element Builders ─────────────────────────────────

function txt(el: ElementIntent, ds: PremiumDesignSystem, dk: boolean, x: number, y: number, w: number, h: number, z: number, overrides?: Partial<TextElement>): TextElement {
  const s = sz(el.size, ds)
  return {
    id: uid('t'), type: 'text', x, y, width: w, height: h, zIndex: z,
    content: el.content || '', fontSize: s.fontSize, fontWeight: fw(el.weight),
    color: clr(el.color, ds, dk), textAlign: 'right' as const,
    role: (el.role === 'stat' ? 'metric-value' : el.role) as TextElement['role'],
    lineHeight: s.lineHeight,
    letterSpacing: s.fontSize >= 100 ? -5 : s.fontSize >= 60 ? -2 : 0,
    textShadow: s.fontSize >= 48 ? `0 4px 40px rgba(0,0,0,0.5)` : undefined,
    ...overrides,
  }
}

function img(el: ElementIntent, x: number, y: number, w: number, h: number, z: number): ImageElement {
  return {
    id: uid('i'), type: 'image', x, y, width: w, height: h, zIndex: z,
    src: el.imageUrl || '', alt: '', objectFit: 'cover' as const,
    opacity: el.imageOpacity ?? 1,
    filter: (el.imageOpacity ?? 1) < 0.5 ? 'brightness(0.5) contrast(1.15)' : undefined,
  }
}

function shp(fill: string, x: number, y: number, w: number, h: number, z: number, opts?: Partial<ShapeElement>): ShapeElement {
  return { id: uid('s'), type: 'shape', shapeType: 'rectangle' as const, x, y, width: w, height: h, zIndex: z, fill, ...opts }
}

// ─── Dramatic Decorations (shared helpers) ────────────

/** Radial glow shape near content cluster */
function glow(ds: PremiumDesignSystem, x: number, y: number, size: number = 800): ShapeElement {
  return shp(`radial-gradient(circle, ${ds.colors.primary}20, transparent 70%)`, x - size / 2, y - size / 2, size, size, 1)
}

/** Watermark: giant faded text behind content */
function watermark(text: string, ds: PremiumDesignSystem, x: number = 400, y: number = -50): TextElement {
  return {
    id: uid('wm'), type: 'text', x, y, width: 1600, height: 600, zIndex: 2,
    content: text, fontSize: 280, fontWeight: 900,
    color: ds.colors.text || '#ffffff', textAlign: 'right' as const,
    role: 'decorative' as const, opacity: 0.04, letterSpacing: -12, lineHeight: 1,
  }
}

/** Thin accent line */
function accentLine(ds: PremiumDesignSystem, x: number, y: number, w: number = 80, h: number = 3): ShapeElement {
  return shp(ds.colors.accent || ds.colors.primary, x, y, w, h, 5)
}

/** Vertical accent blade */
function accentBlade(ds: PremiumDesignSystem, x: number, y: number, h: number = 200): ShapeElement {
  return shp(ds.colors.accent || ds.colors.primary, x, y, 3, h, 5)
}

// ─── Find helpers ─────────────────────────────────────

function findEl(els: ElementIntent[], role: string) { return els.find(e => e.role === role) }
function findImg(els: ElementIntent[]) { return els.find(e => e.type === 'image' && e.imageUrl) }
function findCards(els: ElementIntent[]) { return els.filter(e => e.role === 'card-title') }

// ═══════════════════════════════════════════════════════
//  COMPOSITIONS — editorial, dramatic, breathing
// ═══════════════════════════════════════════════════════

type Fn = (els: ElementIntent[], ds: PremiumDesignSystem, dk: boolean) => SlideElement[]

const C: Record<CompositionToken, Fn> = {

  // ─── HERO / COVER ───────────────────────────────────

  'hero-center': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(image, 0, 0, W, H, 0))
      r.push(shp('linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.6) 100%)', 0, 0, W, H, 1))
    }
    r.push(glow(ds, W * 0.5, H * 0.4))
    const t = findEl(els, 'title')
    if (t) {
      r.push(watermark(t.content?.split(' ')[0] || '', ds, 200, 100))
      r.push(txt(t, ds, true, 120, 350, 1680, 250, 9, { textShadow: `0 8px 60px rgba(0,0,0,0.6), 0 0 120px ${ds.colors.primary}20` }))
    }
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(s, ds, true, 320, 620, 1280, 80, 8, { opacity: 0.7 }))
    r.push(accentLine(ds, W / 2 - 50, 600, 100))
    return r
  },

  'hero-bottom': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(image, 0, 0, W, H, 0))
      r.push(shp('linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)', 0, 0, W, H, 1))
    }
    r.push(shp(`linear-gradient(90deg, ${ds.colors.primary}, ${ds.colors.accent || ds.colors.primary}, transparent)`, 0, 0, W, 4, 3))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, true, M, 720, W - M * 2, 200, 9))
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(s, ds, true, M, 940, W - M * 2, 60, 8, { opacity: 0.6 }))
    return r
  },

  'hero-left': (els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(ds, 300, 500, 900))
    const t = findEl(els, 'title')
    if (t) {
      r.push(watermark(t.content?.split(' ')[0] || '', ds, -100, 50))
      r.push(txt(t, ds, dk, M, 200, 1000, 280, 9))
    }
    r.push(accentBlade(ds, M - 20, 200, 280))
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(s, ds, dk, M, 520, 800, 80, 8, { color: ds.colors.accent }))
    const b = findEl(els, 'body')
    if (b) r.push(txt(b, ds, dk, M, 630, 680, 200, 7, { opacity: 0.65 }))
    return r
  },

  // ─── SPLIT LAYOUTS ──────────────────────────────────

  'split-image-left': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(image, -40, -40, 1000, H + 80, 2))
      r.push(shp('linear-gradient(to right, transparent 60%, ' + (ds.colors.background || '#0A0A12') + ' 100%)', 0, 0, 1000, H, 3))
    }
    r.push(accentBlade(ds, 1020, 150, 250))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, 1060, 180, 780, 200, 9))
    const b = findEl(els, 'body')
    if (b) r.push(txt(b, ds, dk, 1060, 440, 680, 280, 7, { opacity: 0.7 }))
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(s, ds, dk, 1060, 780, 780, 60, 6, { color: ds.colors.accent, opacity: 0.8 }))
    return r
  },

  'split-image-right': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(image, 960, -40, 1000, H + 80, 2))
      r.push(shp('linear-gradient(to left, transparent 60%, ' + (ds.colors.background || '#0A0A12') + ' 100%)', 960, 0, 1000, H, 3))
    }
    r.push(accentBlade(ds, 880, 150, 250))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, M, 180, 800, 200, 9))
    const b = findEl(els, 'body')
    if (b) r.push(txt(b, ds, dk, M, 440, 680, 280, 7, { opacity: 0.7 }))
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(s, ds, dk, M, 780, 800, 60, 6, { color: ds.colors.accent, opacity: 0.8 }))
    return r
  },

  // ─── DATA / STATS ───────────────────────────────────

  'big-number-center': (els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(ds, W * 0.5, H * 0.4, 1000))
    const stat = findEl(els, 'stat')
    if (stat) {
      r.push(txt({ ...stat, size: 'hero' }, ds, dk, 120, 250, 1680, 350, 9, {
        textShadow: `0 0 80px ${ds.colors.accent}40, 0 8px 40px rgba(0,0,0,0.5)`,
        color: ds.colors.accent || ds.colors.primary,
        textAlign: 'center' as const,
      }))
    }
    const lbl = findEl(els, 'label') || findEl(els, 'subtitle')
    if (lbl) r.push(txt({ ...lbl, size: 'subtitle' }, ds, dk, 320, 640, 1280, 80, 7, { textAlign: 'center' as const, opacity: 0.7 }))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, M, M, W - M * 2, 100, 8))
    r.push(accentLine(ds, W / 2 - 40, 620, 80))
    return r
  },

  'big-number-side': (els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(ds, 400, 400, 800))
    r.push(accentBlade(ds, 920, 100, H - 200))
    const stat = findEl(els, 'stat')
    if (stat) r.push(txt({ ...stat, size: 'hero' }, ds, dk, M, 180, 800, 350, 9, {
      color: ds.colors.accent || ds.colors.primary,
      textShadow: `0 0 60px ${ds.colors.accent}30`,
    }))
    const lbl = findEl(els, 'label')
    if (lbl) r.push(txt({ ...lbl, size: 'body' }, ds, dk, M, 550, 800, 80, 7, { opacity: 0.6 }))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, 980, 200, 860, 180, 8))
    const b = findEl(els, 'body')
    if (b) r.push(txt(b, ds, dk, 980, 440, 680, 280, 6, { opacity: 0.65 }))
    return r
  },

  'data-grid-2': (els, ds, dk) => buildCardGrid(els, ds, dk, 2),
  'data-grid-3': (els, ds, dk) => buildCardGrid(els, ds, dk, 3),
  'data-grid-4': (els, ds, dk) => buildCardGrid(els, ds, dk, 4),

  // ─── EDITORIAL / CONTENT ────────────────────────────

  'editorial-stack': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) {
      r.push(watermark(t.content?.split(' ').slice(-1)[0] || '', ds, 800, -80))
      r.push(txt(t, ds, dk, M, M, W - M * 2, 160, 9))
    }
    r.push(accentLine(ds, M, 260, 60))
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(s, ds, dk, M, 290, W * 0.65, 70, 8, { color: ds.colors.accent }))
    const b = findEl(els, 'body')
    if (b) r.push(txt(b, ds, dk, M, 400, 680, 250, 7, { opacity: 0.7 }))
    // Bullets
    const bullets = els.filter(e => e.role === 'body' && e !== b)
    bullets.forEach((bullet, i) => {
      r.push(txt(bullet, ds, dk, M + 20, 680 + i * 55, W * 0.6, 50, 6, { opacity: 0.6 }))
    })
    return r
  },

  'editorial-sidebar': (els, ds, dk) => {
    const r: SlideElement[] = []
    // Sidebar panel
    r.push(shp(`${ds.colors.primary}10`, W - 420, 0, 420, H, 1, {
      border: `1px solid ${ds.colors.primary}15`,
    } as Partial<ShapeElement>))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, M, M, W - 520, 160, 9))
    r.push(accentLine(ds, M, 260, 60))
    const b = findEl(els, 'body')
    if (b) r.push(txt(b, ds, dk, M, 300, W - 560, 350, 7, { opacity: 0.7 }))
    // Sidebar stat
    const stat = findEl(els, 'stat')
    if (stat) r.push(txt({ ...stat, size: 'hero' }, ds, dk, W - 400, 200, 360, 200, 8, {
      color: ds.colors.accent, textAlign: 'center' as const,
      textShadow: `0 0 40px ${ds.colors.accent}30`,
    }))
    const lbl = findEl(els, 'label')
    if (lbl) r.push(txt(lbl, ds, dk, W - 400, 420, 360, 60, 6, { textAlign: 'center' as const, opacity: 0.6 }))
    return r
  },

  'quote-center': (els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(ds, W * 0.5, H * 0.45, 1200))
    // Giant decorative quote mark
    r.push({
      id: uid('qm'), type: 'text', x: 100, y: 120, width: 400, height: 400, zIndex: 2,
      content: '״', fontSize: 400, fontWeight: 900,
      color: ds.colors.accent || ds.colors.primary, textAlign: 'right' as const,
      role: 'decorative' as const, opacity: 0.08, lineHeight: 1,
    } as TextElement)
    const q = findEl(els, 'quote') || findEl(els, 'title')
    if (q) r.push(txt({ ...q, size: q.size || 'headline' }, ds, dk, 200, 320, 1520, 280, 9, { textAlign: 'center' as const }))
    r.push(accentLine(ds, W / 2 - 40, 630, 80))
    const attr = findEl(els, 'caption') || findEl(els, 'subtitle')
    if (attr) r.push(txt(attr, ds, dk, 200, 670, 1520, 50, 6, { textAlign: 'center' as const, opacity: 0.5 }))
    return r
  },

  // ─── VISUAL-HEAVY ───────────────────────────────────

  'full-bleed-image': (els, ds, _dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(image, 0, 0, W, H, 0))
      r.push(shp('linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 35%, transparent 60%)', 0, 0, W, H, 1))
    }
    r.push(shp(`linear-gradient(90deg, ${ds.colors.primary}, ${ds.colors.accent || ds.colors.primary}, transparent)`, 0, 0, W, 4, 3))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, true, M, 780, W - M * 2, 160, 9, { textShadow: '0 4px 30px rgba(0,0,0,0.7)' }))
    const s = findEl(els, 'subtitle')
    if (s) r.push(txt(s, ds, true, M, 960, W - M * 2, 60, 8, { opacity: 0.65 }))
    return r
  },

  'image-showcase': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) r.push(img(image, 160, 60, 1600, 680, 2, ))
    r.push(accentLine(ds, M, 790, 60))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, M, 810, W - M * 2, 120, 9))
    const cap = findEl(els, 'caption')
    if (cap) r.push(txt(cap, ds, dk, M, 950, W - M * 2, 50, 6, { opacity: 0.5 }))
    return r
  },

  // ─── TIMELINE / PROCESS ─────────────────────────────

  'timeline-horizontal': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, M, M, W - M * 2, 120, 9))
    // Timeline line
    r.push(shp(`linear-gradient(90deg, ${ds.colors.accent}, ${ds.colors.primary})`, M, 340, W - M * 2, 3, 3))
    const cards = findCards(els)
    const count = Math.min(cards.length, 5) || 3
    const cardW = Math.floor((W - M * 2 - (count - 1) * 28) / count)
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + 28)
      // Glowing node
      r.push(shp(ds.colors.accent, x + cardW / 2 - 8, 333, 16, 16, 4, {
        borderRadius: 8, boxShadow: `0 0 12px ${ds.colors.accent}60`,
      } as Partial<ShapeElement>))
      // Step number
      r.push({
        id: uid('t'), type: 'text', x: x, y: 360, width: cardW, height: 40, zIndex: 5,
        content: `0${i + 1}`, fontSize: 28, fontWeight: 900,
        color: ds.colors.accent, textAlign: 'right' as const,
        role: 'label' as const, opacity: 0.5, lineHeight: 1,
      } as TextElement)
      const card = cards[i]
      if (card) r.push(txt({ ...card, size: 'subtitle' }, ds, dk, x, 410, cardW, 50, 7))
      const body = els.filter(e => e.role === 'card-body')[i]
      if (body) r.push(txt({ ...body, size: 'caption' }, ds, dk, x, 475, cardW, 200, 6, { opacity: 0.6 }))
    }
    return r
  },

  'process-3-step': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, M, M, W - M * 2, 120, 9))
    const cards = findCards(els)
    const count = Math.min(cards.length, 3) || 3
    const cardW = 520
    const gap = Math.floor((W - M * 2 - count * cardW) / Math.max(count - 1, 1))
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + gap)
      // Card bg with glass
      r.push(shp(`${ds.colors.cardBg || 'rgba(255,255,255,0.04)'}`, x, 250, cardW, 520, 2, {
        borderRadius: 20, border: `1px solid ${ds.colors.primary}15`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      } as Partial<ShapeElement>))
      // Big step number
      r.push({
        id: uid('t'), type: 'text', x: x + 30, y: 270, width: 120, height: 120, zIndex: 4,
        content: `${i + 1}`, fontSize: 96, fontWeight: 900,
        color: ds.colors.accent, textAlign: 'right' as const,
        role: 'decorative' as const, opacity: 0.15, lineHeight: 1,
      } as TextElement)
      const card = cards[i]
      if (card) r.push(txt({ ...card, size: 'subtitle' }, ds, dk, x + 30, 400, cardW - 60, 60, 7))
      const body = els.filter(e => e.role === 'card-body')[i]
      if (body) r.push(txt({ ...body, size: 'body' }, ds, dk, x + 30, 480, cardW - 60, 240, 6, { opacity: 0.6 }))
    }
    return r
  },

  // ─── TEAM / PEOPLE ──────────────────────────────────

  'team-grid': (els, ds, dk) => {
    const r: SlideElement[] = []
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, M, M, W - M * 2, 120, 9))
    const cards = findCards(els)
    const count = Math.min(cards.length, 3) || 3
    const cardW = Math.floor((W - M * 2 - (count - 1) * 32) / count)
    for (let i = 0; i < count; i++) {
      const x = M + i * (cardW + 32)
      // Card bg
      r.push(shp(`${ds.colors.cardBg || 'rgba(255,255,255,0.04)'}`, x, 250, cardW, H - 250 - M, 2, {
        borderRadius: 16, border: `1px solid ${ds.colors.primary}12`,
      } as Partial<ShapeElement>))
      // Number badge
      r.push({
        id: uid('t'), type: 'text', x: x + 20, y: 270, width: 80, height: 60, zIndex: 4,
        content: `0${i + 1}`, fontSize: 48, fontWeight: 900,
        color: ds.colors.accent, textAlign: 'right' as const,
        role: 'decorative' as const, opacity: 0.3, lineHeight: 1,
      } as TextElement)
      const card = cards[i]
      if (card) r.push(txt({ ...card, size: 'subtitle' }, ds, dk, x + 24, 360, cardW - 48, 60, 7))
      const body = els.filter(e => e.role === 'card-body')[i]
      if (body) r.push(txt({ ...body, size: 'body' }, ds, dk, x + 24, 440, cardW - 48, 300, 6, { opacity: 0.6 }))
    }
    return r
  },

  'profile-spotlight': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) r.push(img(image, M, 120, 520, 520, 4))
    r.push(accentBlade(ds, 660, 150, 280))
    const t = findEl(els, 'title')
    if (t) r.push(txt(t, ds, dk, 700, 180, W - 700 - M, 180, 9))
    const b = findEl(els, 'body')
    if (b) r.push(txt(b, ds, dk, 700, 420, W - 700 - M - 80, 300, 7, { opacity: 0.7 }))
    return r
  },

  // ─── CLOSING ────────────────────────────────────────

  'closing-cta': (els, ds, dk) => {
    const r: SlideElement[] = []
    const image = findImg(els)
    if (image) {
      r.push(img(image, 0, 0, W, H, 0))
      r.push(shp('linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.4))', 0, 0, W, H, 1))
    }
    r.push(glow(ds, W * 0.5, H * 0.45, 1000))
    const t = findEl(els, 'title')
    if (t) r.push(txt({ ...t, size: t.size || 'hero' }, ds, true, 200, 340, 1520, 220, 9, {
      textAlign: 'center' as const,
      textShadow: `0 8px 60px rgba(0,0,0,0.5), 0 0 120px ${ds.colors.primary}15`,
    }))
    r.push(accentLine(ds, W / 2 - 50, 580, 100))
    const cta = findEl(els, 'cta') || findEl(els, 'subtitle')
    if (cta) r.push(txt({ ...cta, size: 'subtitle' }, ds, true, 200, 620, 1520, 80, 8, {
      textAlign: 'center' as const, color: ds.colors.accent, opacity: 0.8,
    }))
    return r
  },

  'closing-minimal': (els, ds, dk) => {
    const r: SlideElement[] = []
    r.push(glow(ds, W * 0.5, H * 0.5, 1200))
    const t = findEl(els, 'title')
    if (t) {
      r.push(watermark(t.content || '', ds, 100, 200))
      r.push(txt({ ...t, size: t.size || 'hero' }, ds, dk, 200, 400, 1520, 250, 9, { textAlign: 'center' as const }))
    }
    return r
  },
}

// ─── Card Grid Builder ────────────────────────────────

function buildCardGrid(els: ElementIntent[], ds: PremiumDesignSystem, dk: boolean, cols: number): SlideElement[] {
  const r: SlideElement[] = []
  const t = findEl(els, 'title')
  if (t) r.push(txt(t, ds, dk, M, M, W - M * 2, 120, 9))

  const cards = findCards(els)
  const rows = cols === 4 ? 2 : 1
  const actualCols = cols === 4 ? 2 : cols
  const gap = 28
  const startY = 260
  const cardW = Math.floor((W - M * 2 - (actualCols - 1) * gap) / actualCols)
  const cardH = rows === 2 ? Math.floor((H - startY - M - gap) / 2) : H - startY - M
  const pad = 32
  const radius = ds.effects.borderRadiusValue || 16

  for (let i = 0; i < Math.min(cards.length, cols); i++) {
    const col = i % actualCols
    const row = Math.floor(i / actualCols)
    const x = M + col * (cardW + gap)
    const y = startY + row * (cardH + gap)
    const isFirst = i === 0

    // Card bg — first card has accent tint
    r.push(shp(
      isFirst ? `${ds.colors.accent || ds.colors.primary}12` : (ds.colors.cardBg || 'rgba(255,255,255,0.04)'),
      x, y, cardW, cardH, 3,
      {
        borderRadius: radius,
        border: `1px solid ${isFirst ? ds.colors.accent || ds.colors.primary : ds.colors.primary}18`,
        boxShadow: isFirst ? `0 8px 40px ${ds.colors.accent || ds.colors.primary}15` : '0 4px 20px rgba(0,0,0,0.15)',
      } as Partial<ShapeElement>,
    ))

    // Number badge (decorative)
    r.push({
      id: uid('t'), type: 'text', x: x + pad, y: y + pad, width: 80, height: 60, zIndex: 4,
      content: `0${i + 1}`, fontSize: 48, fontWeight: 900,
      color: isFirst ? (ds.colors.accent || ds.colors.primary) : ds.colors.text,
      textAlign: 'right' as const, role: 'decorative' as const, opacity: isFirst ? 0.4 : 0.12, lineHeight: 1,
    } as TextElement)

    // Card title
    const card = cards[i]
    if (card) r.push(txt({ ...card, size: 'subtitle' }, ds, dk, x + pad, y + pad + 60, cardW - pad * 2, 50, 7, {
      color: isFirst ? (ds.colors.accent || ds.colors.primary) : clr('on-dark', ds, dk),
    }))

    // Card body
    const body = els.filter(e => e.role === 'card-body')[i]
    if (body) r.push(txt({ ...body, size: 'body' }, ds, dk, x + pad, y + pad + 120, cardW - pad * 2, cardH - pad * 2 - 120, 6, { opacity: 0.6 }))
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
  const dk = isBgDark(intent.background)
  const fn = C[intent.composition]

  if (!fn) {
    console.warn(`[LayoutResolver] Unknown composition "${intent.composition}", falling back to hero-center`)
    return resolveLayout({ ...intent, composition: 'hero-center' }, plan, ds, slideIndex)
  }

  return {
    id: `slide-${slideIndex}`,
    slideType: plan.slideType as Slide['slideType'],
    label: plan.title.slice(0, 30),
    archetype: intent.composition,
    dramaticChoice: intent.mood,
    background: resolveBg(intent.background, ds),
    elements: fn(intent.elements, ds, dk),
  }
}

// ─── Fallback compositions ────────────────────────────
export const FALLBACK_COMPOSITIONS: Record<string, CompositionToken> = {
  cover: 'hero-center', brief: 'split-image-left', goals: 'data-grid-3',
  audience: 'split-image-right', insight: 'quote-center', whyNow: 'big-number-center',
  strategy: 'editorial-stack', competitive: 'data-grid-4', bigIdea: 'hero-center',
  approach: 'process-3-step', deliverables: 'data-grid-3', metrics: 'big-number-center',
  influencerStrategy: 'editorial-sidebar', contentStrategy: 'data-grid-3',
  influencers: 'team-grid', timeline: 'timeline-horizontal', closing: 'closing-cta',
}
