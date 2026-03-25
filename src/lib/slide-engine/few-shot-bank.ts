/**
 * Few-Shot Example Bank v6 — Dramatic examples with editorial reasoning.
 * Each example teaches GPT HOW to think, not just WHAT to output.
 */

import type { SlideIntent } from './semantic-tokens'

export interface FewShotExample {
  description: string
  intent: SlideIntent
}

export const FEW_SHOT_BANK: FewShotExample[] = [
  // ─── THE WHISPER (Space Drama) ──────────────────────
  {
    description: 'SPACE DRAMA — vast emptiness with content in tight cluster. The emptiness IS the design. Only 3 elements needed.',
    intent: {
      composition: 'hero-left', background: 'gradient-dramatic', mood: 'elegant',
      elements: [
        { type: 'text', role: 'title', content: 'הכוח של מה שלא נאמר', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'שטח ריק הוא לא חולשה — הוא ביטחון.', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE SHOUT (Scale Shock) ────────────────────────
  {
    description: 'SCALE SHOCK — hero-sized title IS the visual. No image needed. Typography becomes architecture.',
    intent: {
      composition: 'hero-center', background: 'gradient-dramatic', mood: 'dramatic',
      elements: [
        { type: 'text', role: 'title', content: 'מהפכה שמתחילה מלמטה', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'אסטרטגיית מותג 2025', size: 'caption', weight: 'subtle', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE COLLISION (Tension) ────────────────────────
  {
    description: 'TENSION — image and text fight for the same space. Split layout with image bleeding off edge. Drama through collision.',
    intent: {
      composition: 'split-image-left', background: 'solid-dark', mood: 'dramatic',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: null, color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 1 },
        { type: 'text', role: 'title', content: 'הלקוחות שלכם כבר לא שם', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: '73% מקהל היעד עבר לפלטפורמות שאתם לא נוכחים בהן', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE NUMBER (Data Drama) ────────────────────────
  {
    description: 'DATA DRAMA — one massive number dominates the entire slide. Supporting text is whisper-quiet. The stat screams.',
    intent: {
      composition: 'big-number-center', background: 'aurora', mood: 'dramatic',
      elements: [
        { type: 'text', role: 'stat', content: '73%', size: 'hero', weight: 'dominant', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'label', content: 'מהקמפיינים עוברים את היעד', size: 'subtitle', weight: 'supporting', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'title', content: 'מדדי הצלחה', size: 'title', weight: 'prominent', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE BENTO (Rhythm with hierarchy) ──────────────
  {
    description: 'RHYTHM — cards with progressive hierarchy. First card gets accent tint. Numbers as decorative anchors. NOT equal sizes.',
    intent: {
      composition: 'data-grid-3', background: 'gradient-subtle', mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: '3 יעדים שישנו את המותג', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מודעות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'חשיפה של 2M אנשים', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מכירות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'גידול 35% בהמרות', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'נאמנות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'שיפור retention ב-20%', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE FULL BLEED (Image is everything) ───────────
  {
    description: 'MATERIAL — image fills everything. Text is a thin whisper at the bottom. The image does ALL the heavy lifting. Less than 20% text area.',
    intent: {
      composition: 'full-bleed-image', background: 'image-dimmed', mood: 'warm',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: 'full-bleed', color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 0.35 },
        { type: 'text', role: 'title', content: 'הם לא מחכים לכם — הם כבר בדרך', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'דור שגדל על תוכן אותנטי', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE SIDEBAR (Asymmetric tension) ───────────────
  {
    description: 'TENSION — sidebar creates asymmetry. Main content vs side panel with contrasting stat. Two worlds on one slide.',
    intent: {
      composition: 'editorial-sidebar', background: 'solid-dark', mood: 'minimal',
      elements: [
        { type: 'text', role: 'title', content: 'למה עכשיו?', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'השוק הישראלי עובר שינוי מבני', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'stat', content: '+42%', size: 'hero', weight: 'prominent', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'label', content: 'גידול בביקוש', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE QUOTE (Minimalism) ─────────────────────────
  {
    description: 'MINIMALISM — one centered thought, giant quote mark, aurora glow. Nothing else. The slide breathes.',
    intent: {
      composition: 'quote-center', background: 'aurora', mood: 'elegant',
      elements: [
        { type: 'text', role: 'quote', content: 'כשהבית הופך לסנקטואריה — הטכנולוגיה חייבת להרגיש בלתי נראית', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'caption', content: 'מחקר שוק 2025', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE TIMELINE (Rhythm) ──────────────────────────
  {
    description: 'RHYTHM — horizontal flow with glowing nodes. Step numbers as decorative anchors. Progressive reading left to right.',
    intent: {
      composition: 'timeline-horizontal', background: 'gradient-subtle', mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: 'לוח זמנים — 90 יום', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שלב 1', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'אפיון ומחקר', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שלב 2', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'פיתוח ויישום', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שלב 3', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'השקה ואופטימיזציה', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE SPLIT RIGHT (Partner) ──────────────────────
  {
    description: 'PARTNER — content and image share the stage equally. Image bleeds off right edge. Vertical accent blade separates worlds.',
    intent: {
      composition: 'split-image-right', background: 'solid-dark', mood: 'warm',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: null, color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 1 },
        { type: 'text', role: 'title', content: 'הקהל שכבר מעצב הכול', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'אורבני, מתוחכם, חובבי בית חכם', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE PROCESS (Structured drama) ─────────────────
  {
    description: 'RHYTHM — 3 steps with glass cards, big decorative numbers, and progressive reveal. Structure with personality.',
    intent: {
      composition: 'process-3-step', background: 'solid-dark', mood: 'energetic',
      elements: [
        { type: 'text', role: 'title', content: 'כך האטמוספירה הופכת לתוכן', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מיפוי', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'זיהוי רגעי שימוש מפתח', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'יצירה', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'תוכן שמדבר בשפת החוויה', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'הפצה', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'מיקוד בפלטפורמות הנכונות', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── THE CLOSING (Dramatic exit) ────────────────────
  {
    description: 'SCALE SHOCK for closing — hero title with glow. The last slide needs to LAND. One sentence, maximum presence.',
    intent: {
      composition: 'closing-cta', background: 'gradient-dramatic', mood: 'dramatic',
      elements: [
        { type: 'text', role: 'title', content: 'בואו נתחיל', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'cta', content: 'Leaders × Brand', size: 'subtitle', weight: 'supporting', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },
]

export function sampleFewShot(count: number = 4): FewShotExample[] {
  const shuffled = [...FEW_SHOT_BANK].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
