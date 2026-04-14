/**
 * Gamma-model prototype — structured slide generation.
 *
 * Gemini picks a layout archetype per slide and fills typed slots.
 * The renderer owns all styling (CSS arsenal) — no free HTML from model.
 *
 * Output: StructuredPresentation { brandName, designSystem, slides[] }
 */

import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type {
  StructuredPresentation,
  StructuredSlide,
  DesignSystem,
  LayoutId,
} from './types'

// ─── JSON schema for Gemini structured output ─────────────

const DESIGN_SYSTEM_SCHEMA = {
  type: 'object',
  properties: {
    colors: {
      type: 'object',
      properties: {
        primary: { type: 'string' },
        secondary: { type: 'string' },
        accent: { type: 'string' },
        background: { type: 'string' },
        text: { type: 'string' },
        muted: { type: 'string' },
        cardBg: { type: 'string' },
      },
      required: ['primary', 'secondary', 'accent', 'background', 'text', 'muted', 'cardBg'],
    },
    fonts: {
      type: 'object',
      properties: {
        heading: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['heading', 'body'],
    },
    creativeDirection: {
      type: 'object',
      properties: {
        visualMetaphor: { type: 'string' },
        oneRule: { type: 'string' },
      },
    },
  },
  required: ['colors', 'fonts'],
}

const SLIDE_SCHEMA = {
  type: 'object',
  properties: {
    slideType: { type: 'string' },
    layout: {
      type: 'string',
      enum: [
        'hero-cover',
        'full-bleed-image-text',
        'split-image-text',
        'centered-insight',
        'three-pillars-grid',
        'numbered-stats',
        'influencer-grid',
        'closing-cta',
      ],
    },
    slots: { type: 'object' },
  },
  required: ['slideType', 'layout', 'slots'],
}

const PRESENTATION_SCHEMA = {
  type: 'object',
  properties: {
    brandName: { type: 'string' },
    designSystem: DESIGN_SYSTEM_SCHEMA,
    slides: { type: 'array', items: SLIDE_SCHEMA },
  },
  required: ['brandName', 'designSystem', 'slides'],
}

// ─── Prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `את/ה איש/אשת פרסום, שיווק, קריאייטיב ואסטרטגיה בכיר/ה שמתמחה בפעילות תוכן דיגיטלית ומהלכי סושיאל.
את/ה מפצח/ת בריפים שיווקיים דרך מבנה קבוע של מצגת קריאייטיב — לסוכנות Leaders AI שמציעה שיתופי פעולה עם משפיענים.
הפלט: מצגת עברית RTL, 1920×1080, כ-StructuredPresentation JSON. אסור HTML.

## 7 שלבים קבועים של פיצוח בריף — כל מצגת חייבת לכלול אותם בסדר הזה:

1. **על המותג** — מי הם, מה הם מוכרים, מה ה-value proposition. נתונים עסקיים אם יש.
2. **מטרות** — מטרות עסקיות/שיווקיות ספציפיות ומדידות. KPI אם אפשר.
3. **קהלי יעד** — פרסונה חדה: דמוגרפיה + פסיכוגרפיה + מה מניע אותם.
4. **תובנה מבוססת מחקר** — לא דעה. נתון/סטטיסטיקה/מחקר עם ציון מקור מפורש (Nielsen / eMarketer / Ipsos / YouGov / MOA / סטודיו דאטה-מקומי וכו'). חובה source.
5. **אסטרטגיה** — עומק: קו פעולה מנומק, למה זה יעבוד, אילו מנופים (behavioral / cultural / category shift). יכול להתפרש על 2-3 שקפים.
6. **קריאייטיב** — מפותח ומפורט: תיאור מהלך, נראות, סיפור מרכזי, ערוצים. כולל רפרנסים לקמפיינים מהעולם ("Dove Real Beauty 2004", "Spotify Wrapped", "Nike Dream Crazy" וכו').
7. **תוצרים** — deliverables מוחשיים: מספר רילסים/סטוריז, הפקות, משפיענים, timeline, תקציב אם מוצהר.

## כללי איכות:

- חדות, מקצועיות, רהיטות. לא חוזר/ת על עצמך. לא מבזבז/ת מילים.
- ערך אמיתי בכל שקף — לא מילוי.
- תובנות תמיד עם source מפורש ב-slot "source" (לא להמציא מחקרים).
- קריאייטיב כולל רפרנס לקמפיין-עולם ב-body/bodyText.
- גם אם חסר מידע — משלים/מציע כיוונים רלוונטיים ולא משאיר ריק.

## שלד חובה — המצגת חייבת לכלול **לפחות 14 שקפים** בסדר הזה (לא פחות!):

| # | slideType | layout | תפקיד |
|---|-----------|--------|-------|
| 1 | cover | hero-cover | פתיחה — שם מותג × Leaders, קיקר קמפיין |
| 2 | brand-intro | full-bleed-image-text | על המותג — הקשר ותמצית |
| 3 | brand-context | split-image-text | פוזיציה בשוק / נתון מותג |
| 4 | goals | three-pillars-grid | מטרות הקמפיין (3 עמודים) |
| 5 | audience | split-image-text | קהל יעד — פרסונה |
| 6 | audience-insight | centered-insight | תובנה מבוססת מחקר + **source חובה** |
| 7 | strategy-headline | full-bleed-image-text | כותרת אסטרטגיה + why |
| 8 | strategy-pillars | three-pillars-grid | 3 עמודי אסטרטגיה |
| 9 | creative-concept | full-bleed-image-text | הרעיון הגדול + רפרנס-עולם |
| 10 | creative-execution | split-image-text | איך זה ייראה בפועל — 3-5 bullets |
| 11 | influencers | influencer-grid | 4-6 משפיענים מומלצים |
| 12 | kpi | numbered-stats | 3-4 יעדי ביצוע (reach/engagement/CPE) |
| 13 | deliverables | three-pillars-grid | מה נמסר (posts/reels/stories) |
| 14 | closing | closing-cta | Leaders × {brand} — קריאה לפעולה |

### כללי הרחבה:

- אם האסטרטגיה מורכבת → הוסף שקף strategy-deep (split) בין 8 ל-9.
- אם יש timeline ברור → הוסף שקף timeline (three-pillars) לפני closing.
- אם יש 2+ פרסונות → שכפל שקף 5 (audience) לכל פרסונה.
- תובנה (insight): **אסור להשאיר בלי source**. אם אין במחקר — חפש נתון אמיתי מהתעשייה.
- קריאייטיב: חובה לכלול בראש ה-body רפרנס לקמפיין מהעולם (שם + שנה).

המינימום: 14 שקפים. אל תייצר פחות.

## 8 ארכיטיפים של פריסה — בחר/י אחד לכל שקף:

1. **hero-cover** — שקף פתיחה: כותרת ענקית + רקע תמונה/גרדיאנט
   slots: { brandName, title, subtitle?, tagline?, backgroundImage?, eyebrowLabel? }

2. **full-bleed-image-text** — תמונה ממלאת + טקסט על גבי אוברליי
   slots: { image, eyebrowLabel?, title, subtitle?, body? }

3. **split-image-text** — 60/40: תמונה בצד אחד, טקסט בשני
   slots: { image, imageSide: 'left'|'right', eyebrowLabel?, title, bodyText?, bullets? }

4. **centered-insight** — תובנה גדולה במרכז + נתון סטטיסטי
   slots: { eyebrowLabel?, title, dataPoint?, dataLabel?, source? }

5. **three-pillars-grid** — 3 עמודות שוות (מטרות/אסטרטגיה/ערכים)
   slots: { eyebrowLabel?, title, pillars: [{number, title, description}×3] }

6. **numbered-stats** — נתונים גדולים בולטים (יעדי KPI, מטריקות)
   slots: { eyebrowLabel?, title, stats: [{value, label, accent?}] }

7. **influencer-grid** — גריד משפיענים עם פרופיל
   slots: { eyebrowLabel?, title, subtitle?, influencers: [{name, handle, followers, engagement, profilePicUrl?, isVerified?}] }

8. **closing-cta** — שקף סיום עם CTA
   slots: { brandName, title, tagline?, backgroundImage? }

## DesignSystem — חובה:

- colors.background — כהה (bg כהה מרגיש פרימיום). לדוגמה: #0C0C10, #0A0B14.
- colors.primary / accent — מתוך זהות המותג (אם יש).
- colors.text — בהיר (#F5F5F7).
- fonts.heading / body — שניהם 'Heebo' אלא אם יש כוונה אחרת.
- creativeDirection.visualMetaphor — רעיון מרכזי במשפט (לא חובה).
- creativeDirection.oneRule — כלל אחד שמתווה את כל ההחלטות (לא חובה).

## כללי תוכן:

- כל הטקסטים בעברית, קצרים וחדים. לא מילולי, לא buzzwords ריקים.
- eyebrowLabel: תווית קטנה באנגלית או מספר ("01 // BRAND", "STRATEGIC SHIFT", "INSIGHT").
- title: כותרת ראשית, 3-8 מילים. חדה, ממוקדת.
- subtitle/body: 1-3 משפטים מקסימום. כל משפט נושא ערך.
- bullets: 3-5 פריטים לכל היותר — action-oriented.
- stats.value: מספר + יחידה ("1.5M", "₪150K", "3.2%").
- influencers: לפחות 4 אם קיימים במחקר.
- **insight**: dataPoint = נתון ספציפי (לא "רוב הצעירים" אלא "73%"), dataLabel = ההקשר, **source = מקור אמיתי ומפורש**.
- **creative**: כלול רפרנס ספציפי לקמפיין מהעולם ב-body (שם קמפיין + שנה + מהלך בשורה).

## פורמט פלט — JSON בדיוק כך:

\`\`\`json
{
  "brandName": "...",
  "designSystem": {
    "colors": { "primary": "#...", "secondary": "#...", "accent": "#...", "background": "#0C0C10", "text": "#F5F5F7", "muted": "#8B8D98", "cardBg": "rgba(255,255,255,0.04)" },
    "fonts": { "heading": "Heebo", "body": "Heebo" },
    "creativeDirection": { "visualMetaphor": "...", "oneRule": "..." }
  },
  "slides": [
    { "slideType": "cover", "layout": "hero-cover", "slots": { "brandName": "...", "title": "...", "subtitle": "...", "tagline": "...", "eyebrowLabel": "01" } },
    { "slideType": "brief", "layout": "full-bleed-image-text", "slots": { "image": "https://...", "eyebrowLabel": "BRIEF // 02", "title": "...", "subtitle": "...", "body": "..." } },
    { "slideType": "audience", "layout": "split-image-text", "slots": { "image": "https://...", "imageSide": "left", "eyebrowLabel": "AUDIENCE", "title": "...", "bodyText": "...", "bullets": ["...", "..."] } },
    { "slideType": "insight", "layout": "centered-insight", "slots": { "eyebrowLabel": "INSIGHT // 04", "title": "...", "dataPoint": "73%", "dataLabel": "...", "source": "Nielsen Trust in Advertising 2023" } },
    { "slideType": "goals", "layout": "three-pillars-grid", "slots": { "eyebrowLabel": "GOALS", "title": "...", "pillars": [{"number":"01","title":"...","description":"..."},{"number":"02","title":"...","description":"..."},{"number":"03","title":"...","description":"..."}] } },
    { "slideType": "stats", "layout": "numbered-stats", "slots": { "eyebrowLabel": "KPI", "title": "...", "stats": [{"value":"1.5M","label":"..."},{"value":"₪150K","label":"..."},{"value":"3.2%","label":"..."}] } },
    { "slideType": "influencers", "layout": "influencer-grid", "slots": { "eyebrowLabel": "TALENT", "title": "...", "influencers": [{"name":"...","handle":"...","followers":"250K","engagement":"3.5%"}] } },
    { "slideType": "closing", "layout": "closing-cta", "slots": { "brandName":"...", "title":"בואו נתחיל", "tagline":"Leaders × ..." } }
  ]
}
\`\`\`

חובה: כל slot חייב להכיל את כל השדות שלו. אסור slots ריקים. החזר JSON בלבד.`

// ─── Main entry ───────────────────────────────────────────

export interface GenerateStructuredInput {
  brandName: string
  brief: string
  research?: string
  influencers?: Array<{
    name: string
    handle: string
    followers: string
    engagement: string
    profilePicUrl?: string
    isVerified?: boolean
  }>
  brandColors?: { primary?: string; secondary?: string; accent?: string }
  images?: { cover?: string; brand?: string; audience?: string; activity?: string }
}

export async function generateStructuredPresentation(
  input: GenerateStructuredInput,
): Promise<StructuredPresentation> {
  const userPrompt = buildUserPrompt(input)

  const result = await callAI({
    model: 'gemini-3-pro-preview',
    prompt: userPrompt,
    callerId: 'gamma-proto',
    maxOutputTokens: 32000,
    geminiConfig: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
  })

  console.log('[gamma-proto] raw response length:', result.text.length, 'first 500 chars:', result.text.slice(0, 500))
  const parsed = parseGeminiJson<StructuredPresentation>(result.text)
  console.log('[gamma-proto] parsed slides:', parsed?.slides?.length, 'first slot keys:', Object.keys(parsed?.slides?.[0]?.slots || {}))
  return normalizePresentation(parsed, input)
}

function buildUserPrompt(input: GenerateStructuredInput): string {
  const lines: string[] = []
  lines.push(`# מותג: ${input.brandName}`)
  lines.push(`\n## הבריף:\n${input.brief}`)

  if (input.research) {
    lines.push(`\n## מחקר:\n${input.research}`)
  }

  if (input.brandColors?.primary) {
    lines.push(`\n## צבעי מותג:`)
    lines.push(`- primary: ${input.brandColors.primary}`)
    if (input.brandColors.secondary) lines.push(`- secondary: ${input.brandColors.secondary}`)
    if (input.brandColors.accent) lines.push(`- accent: ${input.brandColors.accent}`)
  }

  if (input.influencers?.length) {
    lines.push(`\n## משפיענים זמינים (השתמש/י בשקף influencer-grid):`)
    input.influencers.forEach((inf) => {
      lines.push(
        `- ${inf.name} (@${inf.handle}) — ${inf.followers} עוקבים, ${inf.engagement} מעורבות${
          inf.isVerified ? ' ✓' : ''
        }${inf.profilePicUrl ? ` | pic: ${inf.profilePicUrl}` : ''}`,
      )
    })
  }

  if (input.images) {
    lines.push(`\n## תמונות זמינות (השתמש/י ב-backgroundImage/image בשקפים המתאימים):`)
    if (input.images.cover) lines.push(`- cover: ${input.images.cover}`)
    if (input.images.brand) lines.push(`- brand: ${input.images.brand}`)
    if (input.images.audience) lines.push(`- audience: ${input.images.audience}`)
    if (input.images.activity) lines.push(`- activity: ${input.images.activity}`)
  }

  lines.push(
    `\n## פלט: JSON מובנה של StructuredPresentation — **14 שקפים מינימום** לפי השלד החובה. insight עם source אמיתי. creative עם רפרנס-עולם (שם קמפיין + שנה). JSON בלבד.`,
  )

  return lines.join('\n')
}

// ─── Normalization / safety ───────────────────────────────

const ALLOWED_LAYOUTS: LayoutId[] = [
  'hero-cover',
  'full-bleed-image-text',
  'split-image-text',
  'centered-insight',
  'three-pillars-grid',
  'numbered-stats',
  'influencer-grid',
  'closing-cta',
]

function normalizePresentation(
  pres: StructuredPresentation,
  input: GenerateStructuredInput,
): StructuredPresentation {
  const ds: DesignSystem = {
    colors: {
      primary: pres.designSystem?.colors?.primary || input.brandColors?.primary || '#E94560',
      secondary: pres.designSystem?.colors?.secondary || '#16213E',
      accent: pres.designSystem?.colors?.accent || input.brandColors?.accent || '#F39C12',
      background: pres.designSystem?.colors?.background || '#0C0C10',
      text: pres.designSystem?.colors?.text || '#F5F5F7',
      muted: pres.designSystem?.colors?.muted || '#8B8D98',
      cardBg: pres.designSystem?.colors?.cardBg || 'rgba(255,255,255,0.04)',
    },
    fonts: {
      heading: pres.designSystem?.fonts?.heading || 'Heebo',
      body: pres.designSystem?.fonts?.body || 'Heebo',
    },
    creativeDirection: pres.designSystem?.creativeDirection,
  }

  const slides: StructuredSlide[] = (pres.slides || [])
    .filter((s) => ALLOWED_LAYOUTS.includes(s.layout as LayoutId))
    .map((s, i) => ({ ...s, slideNumber: i + 1 }))

  return {
    brandName: pres.brandName || input.brandName,
    designSystem: ds,
    slides,
  }
}

// ─── Render helper ────────────────────────────────────────

export async function generateAndRender(
  input: GenerateStructuredInput,
): Promise<{ presentation: StructuredPresentation; htmlSlides: string[] }> {
  const { renderStructuredSlide } = await import('./renderer')
  const presentation = await generateStructuredPresentation(input)
  const htmlSlides = presentation.slides.map((s) =>
    renderStructuredSlide(s, presentation.designSystem),
  )
  return { presentation, htmlSlides }
}
