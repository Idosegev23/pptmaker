/**
 * Gemini AI Premium Slide Designer
 * Generates premium, structured presentation designs with rigid grid composition.
 * Heavily optimized for high-end PDF export (No shadows/blur, YES to clip-paths/gradients).
 *
 * 2-Step process:
 * 1. generateDesignSystem() → Unique CSS for the brand (includes grid + safe-zone)
 * 2. generateSlidesBatch() → HTML slides using that CSS (strict layout rules)
 */

import { GoogleGenAI } from '@google/genai'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3.1-pro-preview'

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

interface DesignSystemResult {
  css: string
  designDirection: string
}

// ─── Step 1: Generate Design System ─────────────────────

async function generateDesignSystem(
  brand: BrandDesignInput
): Promise<DesignSystemResult> {
  const requestId = `ds-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Generating design system for: ${brand.brandName}`)

  const prompt = `אתה Art Director ומנהל קריאייטיב ראשי בסוכנות מיתוג עולמית (בסגנון Apple, McKinsey, Pentagram).
עליך ליצור מערכת עיצוב CSS למצגת פרימיום מקצועית - יוקרתית, מסודרת, עם קומפוזיציה מושלמת - עבור המותג "${brand.brandName}".
המצגת תיוצא ל-PDF, ולכן עליה להיראות כמו מצגת אסטרטגית של סוכנות מובילה.

מידע על המותג:
- תעשייה: ${brand.industry || 'לא ידוע'}
- אישיות: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
- צבע ראשי: ${brand.brandColors.primary}
- צבע משני: ${brand.brandColors.secondary}
- צבע הדגשה: ${brand.brandColors.accent}
- אווירה: ${brand.brandColors.mood || 'יוקרתי ומקצועי'}

## דרישות טכניות קשיחות (חובה ל-PDF!):
- קנבס: 1920px × 1080px
- RTL מובנה
- פונט: Heebo
- 🚫 איסור מוחלט על box-shadow (קורס ב-PDF). צור עומק עם borders כפולות, gradients, offset borders.
- 🚫 איסור מוחלט על backdrop-filter (לא נתמך). השתמש ב-rgba עם gradient.

## ⚠️ חובה: מערכת גריד קשיחה עם שוליים (RIGID GRID SYSTEM)

זהו הכלל הכי חשוב: **כל תוכן חייב לשבת בתוך Safe Zone קשיח.**

\`\`\`
Canvas: 1920 × 1080
Margins: 80px מכל ארבעת הכיוונים (top, right, bottom, left)
Safe content area: 1760 × 920 (ממורכז)
Logo footer zone: 60px תחתון (שמור ללוגואים)
\`\`\`

ה-CSS **חייב** לכלול את המחלקות הבאות (בדיוק כמו שהן):

\`\`\`css
/* === MANDATORY: Safe Zone + Grid System === */
.safe-zone {
  position: absolute;
  top: 80px; right: 80px; bottom: 80px; left: 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-grid {
  display: grid;
  gap: 30px;
  flex: 1;
  align-content: start;
}

.content-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
.content-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.content-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }

.section-label {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 3px;
  margin-bottom: 8px;
}

.slide-title {
  font-size: 52px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 32px;
}

.card {
  padding: 28px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.slide-footer {
  margin-top: auto;
  padding-top: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slide-footer img { height: 32px; width: auto; }
\`\`\`

## מה ה-CSS **נוסף** חייב לכלול (מעבר למחלקות החובה):

1. **טיפוגרפיה פרימיום:** מחלקות לכותרות, תתי-כותרות, body text. גדלים: כותרת 48-56px, תת-כותרת 28-32px, body 18-20px. השתמש ב-letter-spacing ו-line-height מדויקים.
2. **רקעים יוקרתיים:** linear-gradient ו-radial-gradient עדינים, לא צבע אחיד. שמור על נקיות - gradient עדין, לא אגרסיבי.
3. **כרטיסיות (Cards):** \`.premium-card\` עם border עדין (1px solid), רקע gradient קל, padding פנימי של 24-28px מינימום. כל הכרטיסיות באותו גובה בשורה.
4. **Watermark עדין:** \`.massive-watermark\` לטקסט רקע עם opacity 3-5%.
5. **אלמנטים דקורטיביים:** קווים דקים (1px solid), עיגולי accent, אבל **בתוך ה-safe-zone בלבד**.
6. **תגיות ומדדים:** \`.badge\`, \`.metric-value\` (מספר גדול בולט), \`.metric-label\` (הסבר קטן מתחת).
7. **תמונות מעוגלות:** \`.avatar-circle\` עם border-radius: 50% ו-overflow: hidden.
8. **כפתורי CTA:** \`.cta-button\` מסוגנן.

**חשוב: אל תוסיף CSS שיגרום לאלמנטים לצאת מה-safe-zone. אין position: absolute על תוכן (רק על watermarks דקורטיביים).**

החזר JSON בלבד:
\`\`\`json
{
  "designDirection": "פסקה קצרה על הקונספט הויזואלי",
  "css": "ה-CSS השלם כאן (כולל המחלקות החובה למעלה + התוספות שלך)"
}
\`\`\``

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 8000 },
      },
    })

    const text = response.text || ''
    const parsed = parseGeminiJson<{ designDirection: string; css: string }>(text)

    if (parsed?.css) {
      console.log(`[SlideDesigner][${requestId}] Design system generated: ${parsed.designDirection?.slice(0, 80)}...`)
      return {
        css: parsed.css,
        designDirection: parsed.designDirection || '',
      }
    }

    throw new Error('No CSS in design system response')
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Design system generation failed:`, error)
    throw error
  }
}

// ─── Step 2: Generate Slide HTML ─────────────────────────

async function generateSlidesBatch(
  designCSS: string,
  slides: SlideContentInput[],
  batchIndex: number,
  brandName: string,
  logoUrl?: string,
  leadersLogoUrl?: string,
): Promise<string[]> {
  const requestId = `sb-${batchIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Generating batch ${batchIndex + 1}: ${slides.map(s => s.slideType).join(', ')}`)

  const slidesDescription = slides.map((slide, i) => {
    const contentJson = JSON.stringify(slide.content, null, 2)
    return `
### שקף ${i + 1}: ${slide.title} (סוג: ${slide.slideType})
${slide.imageUrl ? `תמונה זמינה: ${slide.imageUrl}` : 'אין תמונה - השתמש בטיפוגרפיה חזקה ורקעי CSS gradient'}
תוכן (JSON):
\`\`\`json
${contentJson}
\`\`\`
`
  }).join('\n')

  const prompt = `אתה מעצב מצגות בכיר. המשימה: לייצר קוד HTML למצגת PDF של המותג "${brandName}" עם קומפוזיציה מסודרת ומקצועית.

## ה-CSS שלך (כבר מוטמע ב-HEAD):
\`\`\`css
${designCSS}
\`\`\`

## לוגואים זמינים:
${logoUrl ? `- לוגו לקוח: ${logoUrl}` : '- אין לוגו לקוח'}
${leadersLogoUrl ? `- לוגו סוכנות (Leaders): ${leadersLogoUrl}` : ''}

## מידע לשקפים:
${slidesDescription}

## ⚠️ חוקי ברזל - קומפוזיציה קשיחה (MANDATORY):

### 1. שוליים קשיחים (Sacred Margins):
- **כל תוכן** חייב לשבת בתוך \`.safe-zone\` (80px margins מכל כיוון).
- **חריגה יחידה**: תמונת רקע full-bleed בשקף שער בלבד.
- אסור לשום טקסט או אלמנט תוכני לגעת בקצוות השקף.

### 2. מבנה HTML קפדני - כל שקף חייב להיות:
\`\`\`html
<div class="slide" style="background:...">
  <!-- Watermark decorative only -->
  <div class="massive-watermark">BRAND</div>

  <!-- All content inside safe-zone -->
  <div class="safe-zone">
    <div class="section-label">סוג השקף</div>
    <h2 class="slide-title">כותרת</h2>

    <div class="content-grid cols-N">
      <!-- Cards/content here -->
    </div>

    <div class="slide-footer">
      <!-- logos -->
    </div>
  </div>
</div>
\`\`\`

### 3. השתמש ב-CSS Grid לכל לייאאוט כרטיסיות:
- \`content-grid cols-2\` לשני עמודות
- \`content-grid cols-3\` לשלוש עמודות
- \`content-grid cols-4\` לארבע עמודות
- **אסור** למקם כרטיסיות עם position: absolute. רק CSS Grid.

### 4. היררכיה אנכית קבועה (כל שקף):
section-label (קטן, uppercase) → slide-title (גדול) → content-grid → slide-footer
תמיד בסדר הזה, תמיד מלמעלה למטה.

### 5. כרטיסיות שוות:
- בכל שורה של כרטיסיות, **כולן באותו גובה** (CSS Grid דואג לזה).
- padding פנימי מינימלי: 24px.
- אין טקסט שנוגע בקצוות כרטיסייה.

### 6. יישור טקסט:
- כל הטקסט ב-RTL מיושר לימין (ברירת מחדל).
- טקסט ממורכז רק עבור: מספרי מדדים, כותרות שקף שער, CTA.

### 7. מקסימום תוכן:
- **לא יותר מ-6 כרטיסיות** בשקף אחד. אם יש יותר, פצל לשקפים.
- **לא יותר מ-4 שורות טקסט** בתוך כרטיסייה בודדת.

### 8. אסור position: absolute על תוכן:
- position: absolute מותר **רק** ל-watermarks דקורטיביים.
- כל שאר התוכן: flex/grid flow רגיל בתוך .safe-zone.

### 9. לוגואים:
- הצב לוגואים ב-\`.slide-footer\` בתחתית ה-safe-zone.
- לוגו לקוח בצד ימין, לוגו Leaders בצד שמאל.
- גובה לוגו: 28-36px.

### 10. לייאאוט לפי סוג שקף:
| סוג | Grid | הערות |
|-----|------|-------|
| cover | ללא grid, flexbox ממורכז | תמונת רקע full-bleed + overlay gradient + כותרת מרכזית |
| brief | cols-2 | טקסט ימין, תמונה שמאל (או עמודה אחת אם אין תמונה) |
| goals | cols-3 או cols-4 | כרטיסיית מטרה לכל מטרה |
| audience | cols-2 | שני סגמנטים זה לצד זה |
| insight | עמודה אחת מרכזית | טקסט גדול ממורכז, ללא grid |
| strategy | cols-3 | כרטיסיית עמוד תווך |
| bigIdea | cols-2 | קונספט + תמונה |
| approach | cols-2 או cols-3 | כרטיסיית גישה |
| deliverables | cols-3 או cols-4 | כרטיסיית תוצר |
| metrics | cols-4 | 4 תיבות מדדים בשורה |
| influencers | cols-3 | כרטיסיית משפיען עם תמונה עגולה |
| influencerStrategy | cols-2 | אסטרטגיה + קריטריונים |
| closing | ללא grid, flexbox ממורכז | CTA גדול ממורכז |

### 11. HTML תקין:
- RTL, lang="he"
- אסור לדלג על שום מידע תוכן מה-JSON
- כותרות ומספרים בולטים, פסקאות נקיות

## פורמט הפלט:
החזר אך ורק JSON - מערך של מחרוזות HTML:
\`\`\`json
{
  "slides": [
    "<!DOCTYPE html>\\n<html dir=\\"rtl\\" lang=\\"he\\">\\n<head>...</head>\\n<body><div class=\\"slide\\">...</div></body>\\n</html>",
    "<!DOCTYPE html>... (שקף 2)"
  ]
}
\`\`\`
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4000 }, // Increased for complex layout logic
      },
    })

    const text = response.text || ''
    const parsed = parseGeminiJson<{ slides: string[] }>(text)

    if (parsed?.slides?.length > 0) {
      console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} slides`)

      // Validate each slide
      const validSlides = parsed.slides.map((html) => {
        if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
          // Wrap partial HTML
          return wrapSlideHtml(html, designCSS)
        }
        return html
      })

      return validSlides
    }

    throw new Error('No slides in response')
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] Batch generation failed:`, error)
    throw error
  }
}

function wrapSlideHtml(body: string, css: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
@page { size: 1920px 1080px; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Heebo', sans-serif;
  direction: rtl;
  -webkit-print-color-adjust: exact;
  color-adjust: exact;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  background-color: #ffffff;
}
/* Base Slide */
.slide { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
.absolute-fill { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.bg-cover { background-size: cover; background-position: center; background-repeat: no-repeat; }

/* === Rigid Grid System (Fallback - always present) === */
.safe-zone {
  position: absolute;
  top: 80px; right: 80px; bottom: 80px; left: 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.content-grid {
  display: grid;
  gap: 30px;
  flex: 1;
  align-content: start;
}
.content-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
.content-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.content-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
.section-label {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 3px;
  margin-bottom: 8px;
}
.slide-title {
  font-size: 52px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 32px;
}
.card {
  padding: 28px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.slide-footer {
  margin-top: auto;
  padding-top: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.slide-footer img { height: 32px; width: auto; }

/* Brand Design System */
${css}
</style>
</head>
<body>
<div class="slide">
<div class="safe-zone">
${body}
</div>
</div>
</body>
</html>`
}

// ─── Main Entry Point ────────────────────────────────────

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

export async function generateAISlides(
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
): Promise<string[]> {
  const requestId = `ai-slides-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Starting AI slide generation for: ${data.brandName}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const leadersLogo = config.leadersLogoUrl || `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const clientLogo = config.clientLogoUrl || data._scraped?.logoUrl || config.brandLogoUrl || ''

  try {
    // ─── Step 1: Generate Design System ───
    const brandColors = data._brandColors || {
      primary: config.accentColor || '#E94560',
      secondary: '#1A1A2E',
      accent: config.accentColor || '#E94560',
      style: 'corporate',
      mood: 'מקצועי',
    }

    const designSystem = await generateDesignSystem({
      brandName: data.brandName || 'Unknown',
      industry: data._brandResearch?.industry || '',
      brandPersonality: data._brandResearch?.brandPersonality || [],
      brandColors,
      logoUrl: clientLogo || undefined,
      coverImageUrl: config.images?.coverImage || undefined,
      targetAudience: data.targetDescription || '',
    })

    // ─── Step 2: Build slide content batches ───
    const formatNum = (n?: number) => {
      if (!n) return '0'
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
      if (n >= 1000) return `${Math.round(n / 1000)}K`
      return n.toString()
    }

    const currency = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : '₪'

    // Batch 1: Cover → Insight
    const batch1: SlideContentInput[] = [
      {
        slideType: 'cover',
        title: 'שער',
        content: {
          brandName: data.brandName,
          campaignSubtitle: data.campaignSubtitle || data.strategyHeadline || 'הצעת שיתוף פעולה',
          issueDate: data.issueDate || new Date().toLocaleDateString('he-IL'),
        },
        imageUrl: config.images?.coverImage,
      },
      {
        slideType: 'brief',
        title: 'למה התכנסנו?',
        content: {
          headline: 'למה התכנסנו?',
          brandBrief: data.brandBrief || '',
          painPoints: data.brandPainPoints || [],
          objective: data.brandObjective || '',
        },
        imageUrl: config.images?.brandImage,
      },
      {
        slideType: 'goals',
        title: 'מטרות הקמפיין',
        content: {
          headline: 'מטרות הקמפיין',
          goals: data.goalsDetailed || (data.goals || []).map(g => ({ title: g, description: '' })),
        },
      },
      {
        slideType: 'audience',
        title: 'קהל היעד',
        content: {
          headline: 'קהל היעד',
          gender: data.targetGender || '',
          ageRange: data.targetAgeRange || '',
          description: data.targetDescription || '',
          behavior: data.targetBehavior || '',
          insights: data.targetInsights || [],
        },
        imageUrl: config.images?.audienceImage,
      },
      {
        slideType: 'insight',
        title: 'התובנה המרכזית',
        content: {
          headline: 'התובנה המרכזית',
          keyInsight: data.keyInsight || '',
          source: data.insightSource || '',
          data: data.insightData || '',
        },
      },
    ]

    // Batch 2: Strategy → Deliverables
    const batch2: SlideContentInput[] = [
      {
        slideType: 'strategy',
        title: 'האסטרטגיה',
        content: {
          headline: 'האסטרטגיה',
          strategyHeadline: data.strategyHeadline || '',
          description: data.strategyDescription || '',
          pillars: data.strategyPillars || [],
        },
      },
      {
        slideType: 'bigIdea',
        title: 'הרעיון המרכזי',
        content: {
          headline: data.activityTitle || 'הרעיון המרכזי',
          concept: data.activityConcept || '',
          description: data.activityDescription || '',
        },
        imageUrl: config.images?.activityImage || config.images?.brandImage,
      },
      {
        slideType: 'approach',
        title: 'הגישה שלנו',
        content: {
          headline: 'הגישה שלנו',
          approaches: data.activityApproach || [],
          differentiator: data.activityDifferentiator || '',
        },
      },
      {
        slideType: 'deliverables',
        title: 'תוצרים',
        content: {
          headline: 'תוצרים',
          deliverables: data.deliverablesDetailed || (data.deliverables || []).map(d => ({ type: d, quantity: 1, description: '' })),
          summary: data.deliverablesSummary || '',
        },
      },
      {
        slideType: 'metrics',
        title: 'יעדים ומדדים',
        content: {
          headline: 'יעדים ומדדים',
          budget: data.budget ? `${currency}${formatNum(data.budget)}` : '',
          reach: formatNum(data.potentialReach),
          engagement: formatNum(data.potentialEngagement),
          impressions: formatNum(data.estimatedImpressions),
          cpe: data.cpe ? `${currency}${data.cpe.toFixed(1)}` : '',
          explanation: data.metricsExplanation || '',
        },
      },
    ]

    // Batch 3: Influencers → Closing
    const influencers = data.enhancedInfluencers || data.scrapedInfluencers?.map(i => ({
      name: i.name || i.username || '',
      username: i.username || '',
      profilePicUrl: i.profilePicUrl || '',
      categories: [] as string[],
      followers: i.followers || 0,
      engagementRate: i.engagementRate || 0,
    })) || []

    const aiRecs = data.influencerResearch?.recommendations || []

    const batch3: SlideContentInput[] = [
      {
        slideType: 'influencerStrategy',
        title: 'אסטרטגיית משפיענים',
        content: {
          headline: 'אסטרטגיית משפיענים',
          strategy: data.influencerStrategy || '',
          criteria: data.influencerCriteria || [],
          guidelines: data.contentGuidelines || [],
        },
      },
    ]

    // Add influencer cards slide if we have influencers
    if (influencers.length > 0 || aiRecs.length > 0) {
      batch3.push({
        slideType: 'influencers',
        title: 'משפיענים מומלצים',
        content: {
          headline: 'משפיענים מומלצים',
          influencers: influencers.slice(0, 6).map(inf => ({
            name: inf.name,
            username: inf.username,
            profilePicUrl: inf.profilePicUrl,
            followers: formatNum(inf.followers),
            engagementRate: `${inf.engagementRate?.toFixed(1) || '0'}%`,
            categories: inf.categories?.join(', ') || '',
          })),
          aiRecommendations: aiRecs.slice(0, 6).map((rec: { name?: string; handle?: string; followers?: string; engagement?: string; whyRelevant?: string; profilePicUrl?: string }) => ({
            name: rec.name || '',
            handle: rec.handle || '',
            followers: rec.followers || '',
            engagement: rec.engagement || '',
            reason: rec.whyRelevant || '',
            profilePicUrl: rec.profilePicUrl || '',
          })),
        },
      })
    }

    // Closing slide
    batch3.push({
      slideType: 'closing',
      title: 'סיום',
      content: {
        brandName: data.brandName || '',
        headline: "LET'S CREATE TOGETHER",
        subheadline: `נשמח להתחיל לעבוד עם ${data.brandName}`,
      },
    })

    // ─── Step 3: Generate all batches in parallel ───
    console.log(`[SlideDesigner][${requestId}] Generating 3 batches in parallel (${batch1.length + batch2.length + batch3.length} total slides)`)

    const [result1, result2, result3] = await Promise.allSettled([
      generateSlidesBatch(designSystem.css, batch1, 0, data.brandName || '', clientLogo, leadersLogo),
      generateSlidesBatch(designSystem.css, batch2, 1, data.brandName || '', clientLogo, leadersLogo),
      generateSlidesBatch(designSystem.css, batch3, 2, data.brandName || '', clientLogo, leadersLogo),
    ])

    // Collect results
    const allSlides: string[] = []
    let failedBatches = 0

    const batchResults = [result1, result2, result3]
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i]
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allSlides.push(...result.value)
      } else {
        failedBatches++
        console.error(`[SlideDesigner][${requestId}] Batch ${i + 1} failed:`, result.status === 'rejected' ? result.reason : 'empty')
      }
    }

    if (allSlides.length === 0) {
      throw new Error('All batches failed - no slides generated')
    }

    console.log(`[SlideDesigner][${requestId}] AI generated ${allSlides.length} slides (${failedBatches} batches failed)`)
    return allSlides

  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] AI slide generation failed entirely:`, error)
    throw error
  }
}