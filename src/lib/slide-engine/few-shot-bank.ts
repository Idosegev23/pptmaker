/**
 * Few-Shot Example Bank — 15 examples of good SlideIntent output.
 * GPT sees these to understand the expected output format and quality.
 *
 * Slide Engine v5
 */

import type { SlideIntent } from './semantic-tokens'

export interface FewShotExample {
  description: string
  intent: SlideIntent
}

export const FEW_SHOT_BANK: FewShotExample[] = [
  // ─── Cover ──────────────────────────────────────────
  {
    description: 'Cover — dramatic hero with full-bleed image',
    intent: {
      composition: 'hero-center',
      background: 'gradient-dramatic',
      mood: 'dramatic',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: 'full-bleed', color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 0.3 },
        { type: 'text', role: 'title', content: 'שם המותג — המהפכה מתחילה כאן', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'הצעת קריאטיב לקמפיין דיגיטלי', size: 'subtitle', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },
  {
    description: 'Cover — bottom-aligned with background image',
    intent: {
      composition: 'hero-bottom',
      background: 'image-dimmed',
      mood: 'elegant',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: 'full-bleed', color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 0.25 },
        { type: 'text', role: 'title', content: 'הסטנדרט החדש של יוקרה חכמה', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'Leaders × Brand', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Data / Stats ───────────────────────────────────
  {
    description: 'Big stat — single number dominates',
    intent: {
      composition: 'big-number-center',
      background: 'solid-dark',
      mood: 'dramatic',
      elements: [
        { type: 'text', role: 'stat', content: '73%', size: 'hero', weight: 'dominant', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'label', content: 'מהקמפיינים עוברים את היעד', size: 'subtitle', weight: 'supporting', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'title', content: 'מדדי הצלחה', size: 'title', weight: 'prominent', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
      ],
    },
  },
  {
    description: 'Side stat — number left, explanation right',
    intent: {
      composition: 'big-number-side',
      background: 'gradient-subtle',
      mood: 'professional',
      elements: [
        { type: 'text', role: 'stat', content: '₪850K', size: 'hero', weight: 'dominant', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'label', content: 'תקציב מוצע שנתי', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'title', content: 'ההשקעה שתחזיר את עצמה', size: 'headline', weight: 'prominent', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'תמהיל תקציבי המבוסס על ביצועי Q3 עם פוקוס על ROI', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Split / Image ──────────────────────────────────
  {
    description: 'Split — image left, content right',
    intent: {
      composition: 'split-image-left',
      background: 'solid-dark',
      mood: 'professional',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: null, color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 1 },
        { type: 'text', role: 'title', content: 'אסטרטגיה דיגיטלית', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'נבנה נוכחות דיגיטלית שמייצרת ערך אמיתי ומדיד', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },
  {
    description: 'Split — content left, image right',
    intent: {
      composition: 'split-image-right',
      background: 'solid-dark',
      mood: 'warm',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: null, color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 1 },
        { type: 'text', role: 'title', content: 'הקהל שלנו', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'דור Y ו-Z, עירוני, מושקע בחוויה', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Grid / Cards ───────────────────────────────────
  {
    description: '3-column card grid — goals',
    intent: {
      composition: 'data-grid-3',
      background: 'solid-dark',
      mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: '3 יעדים שישנו את פני המותג', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מודעות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'חשיפה של 2M אנשים בקהל היעד', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מכירות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'גידול של 35% בהמרות ישירות', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'נאמנות', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'שיפור retention ב-20%', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },
  {
    description: '2x2 card grid — competitive',
    intent: {
      composition: 'data-grid-4',
      background: 'gradient-subtle',
      mood: 'minimal',
      elements: [
        { type: 'text', role: 'title', content: 'הנוף התחרותי', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מתחרה א׳', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'פוקוס על מחיר, חלש בברנדינג', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מתחרה ב׳', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'נוכחות ברשתות חזקה, אין דיגיטל', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'מתחרה ג׳', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'פרימיום, אבל לא דיגיטל', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'אנחנו', size: null, weight: null, position: null, color: 'primary', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'דיגיטל + ברנדינג + חוויה', size: null, weight: null, position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Quote ──────────────────────────────────────────
  {
    description: 'Quote center — insight or big idea',
    intent: {
      composition: 'quote-center',
      background: 'aurora',
      mood: 'elegant',
      elements: [
        { type: 'text', role: 'quote', content: 'כשהבית הופך לסנקטואריה — הטכנולוגיה חייבת להרגיש בלתי נראית', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'caption', content: 'מחקר שוק Q4 2025', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Editorial ──────────────────────────────────────
  {
    description: 'Editorial stack — strategy with bullets',
    intent: {
      composition: 'editorial-stack',
      background: 'solid-dark',
      mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: 'האסטרטגיה: נוכחות אותנטית', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'שלושה עקרונות מנחים', size: 'subtitle', weight: 'prominent', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'נבנה נרטיב אותנטי שמחבר בין ערכי המותג לחיי היום-יום של הקהל', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },
  {
    description: 'Editorial sidebar — content with side stat',
    intent: {
      composition: 'editorial-sidebar',
      background: 'solid-dark',
      mood: 'minimal',
      elements: [
        { type: 'text', role: 'title', content: 'למה עכשיו?', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'body', content: 'השוק הישראלי עובר שינוי מבני. הצרכנים מחפשים מותגים שמדברים אליהם בגובה העיניים', size: 'body', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'stat', content: '+42%', size: 'headline', weight: 'prominent', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'label', content: 'גידול בביקוש', size: 'caption', weight: 'subtle', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Timeline ───────────────────────────────────────
  {
    description: 'Timeline — horizontal phases',
    intent: {
      composition: 'timeline-horizontal',
      background: 'gradient-subtle',
      mood: 'professional',
      elements: [
        { type: 'text', role: 'title', content: 'לוח זמנים — 90 יום', size: 'headline', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שבועות 1-2', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'אפיון ומחקר שוק', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שבועות 3-6', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'פיתוח ויישום', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-title', content: 'שבועות 7-12', size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'card-body', content: 'השקה ואופטימיזציה', size: null, weight: null, position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Full-bleed image ───────────────────────────────
  {
    description: 'Full-bleed — dramatic image with text overlay',
    intent: {
      composition: 'full-bleed-image',
      background: 'image-dimmed',
      mood: 'dramatic',
      elements: [
        { type: 'image', role: 'decorative', content: null, size: null, weight: null, position: 'full-bleed', color: null, imageUrl: 'PLACEHOLDER', imageOpacity: 0.4 },
        { type: 'text', role: 'title', content: 'הרעיון הגדול', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'subtitle', content: 'מותג שמשנה את כללי המשחק', size: 'subtitle', weight: 'supporting', position: null, color: 'muted', imageUrl: null, imageOpacity: null },
      ],
    },
  },

  // ─── Closing ────────────────────────────────────────
  {
    description: 'Closing — CTA with accent line',
    intent: {
      composition: 'closing-cta',
      background: 'gradient-dramatic',
      mood: 'energetic',
      elements: [
        { type: 'text', role: 'title', content: 'בואו נתחיל', size: 'hero', weight: 'dominant', position: null, color: 'on-dark', imageUrl: null, imageOpacity: null },
        { type: 'text', role: 'cta', content: 'Leaders × Brand', size: 'subtitle', weight: 'supporting', position: null, color: 'accent', imageUrl: null, imageOpacity: null },
        { type: 'shape', role: 'decorative', content: null, size: null, weight: null, position: null, color: 'accent', imageUrl: null, imageOpacity: null },
      ],
    },
  },
]

// ─── Random Sampler ───────────────────────────────────

export function sampleFewShot(count: number = 4): FewShotExample[] {
  const shuffled = [...FEW_SHOT_BANK].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
