/**
 * Gemini AI Slide Designer
 * Generates unique presentation designs from scratch for each brand.
 *
 * 2-Step process:
 * 1. generateDesignSystem() → Unique CSS for the brand
 * 2. generateSlidesBatch() → HTML slides using that CSS
 *
 * Fallback: premium-proposal-template.tsx if AI fails
 */

import { GoogleGenAI } from '@google/genai'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import type {
  Presentation,
  Slide,
  DesignSystem,
  SlideType,
} from '@/types/presentation'
// AST-to-HTML conversion available via: import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'

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

  const prompt = `אתה מעצב מצגות ברמה עולמית. עליך ליצור מערכת עיצוב CSS ייחודית למותג "${brand.brandName}".

מידע על המותג:
- תעשייה: ${brand.industry || 'לא ידוע'}
- אישיות: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
- צבע ראשי: ${brand.brandColors.primary}
- צבע משני: ${brand.brandColors.secondary}
- צבע הדגשה: ${brand.brandColors.accent}
- סגנון: ${brand.brandColors.style || 'corporate'}
- אווירה: ${brand.brandColors.mood || 'מקצועי'}
- קהל יעד: ${brand.targetAudience || 'מבוגרים 25-45'}

צור מערכת עיצוב CSS מלאה ויחודית. כל מותג חייב לקבל עיצוב שונה לחלוטין.

דרישות טכניות קשיחות:
- גודל שקף: 1920px × 1080px
- כיוון: RTL (עברית)
- פונט: Heebo (כבר מיובא)
- כל טקסט חייב להיות קריא - ניגודיות מספקת
- אסור שטקסט ייחתך - overflow: hidden רק עם min-height מתאים
- אסור להשתמש ב-box-shadow - נראה רע בייצוא PDF. השתמש ב-border, outline, gradient borders במקום
- אסור backdrop-filter (glassmorphism) - לא עובד בייצוא PDF. השתמש ב-background עם opacity במקום

## Safe Zone (חובה):
כל טקסט ותוכן חייב להישאר בתוך safe-zone של 80px מכל כיוון.
אלמנטים דקורטיביים (gradients, shapes, watermarks) יכולים לחרוג.
ה-CSS חייב לכלול:
\`\`\`css
.safe-zone {
  position: absolute;
  top: 80px; right: 80px; bottom: 80px; left: 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
\`\`\`

החזר JSON:
\`\`\`json
{
  "designDirection": "תיאור קצר של כיוון העיצוב (2-3 משפטים)",
  "css": "כל ה-CSS כמחרוזת אחת"
}
\`\`\`

ה-CSS חייב לכלול:
1. **:root** עם custom properties (--primary, --secondary, --accent, --bg, --text, --card-bg, --card-border, --card-shadow)
2. **body, .slide** - רקע ייחודי (לא רק צבע אחיד - גרדיאנט, pattern, texture)
3. **.slide-content** - padding, flex layout
4. **h1** - כותרת ראשית (48-64px, bold)
5. **h2** - כותרת משנית (36-48px)
6. **h3** - כותרת שלישונית (24-32px)
7. **.body-text** - טקסט גוף (20-24px)
8. **.card** - קלף עם עיצוב ייחודי (לא רק border-radius - תחשוב על outlined, gradient borders, cutout corners, border-image, colored borders, double borders)
9. **.metric-box** - תיבת מספר/מדד עם עיצוב מרשים
10. **.metric-value** - ערך מספרי גדול ובולט
11. **.accent-decoration** - אלמנט דקורטיבי ייחודי (shapes, lines, dots, waves - משהו שמזהה את המצגת הזו)
12. **.slide-cover** - עיצוב שקף שער (hero, dramatic)
13. **.cover-title** - כותרת שער ענקית (80-120px)
14. **.influencer-card** - כרטיס משפיען עם תמונה עגולה
15. **.influencer-image** - תמונת פרופיל עגולה עם מסגרת ייחודית
16. **.tag** - תגית/badge קטנה
17. **.grid-2, .grid-3, .grid-4** - grids עם gap
18. **.logo-footer** - פוטר לוגואים
19. **.brand-watermark** - סימן מים
20. **.slide::before** - פס צבע תחתון (או אלמנט דקורטיבי אחר)

דגשים חשובים:
- אל תשתמש בעיצוב גנרי "עוד מצגת"
- תהיה יצירתי - כל מותג צריך להרגיש שונה
- תשתמש בטכניקות CSS מתקדמות: clip-path, mix-blend-mode, gradients מורכבים, border-image, outline
- הצבעים חייבים להתבסס על צבעי המותג אבל עם וריאציות יצירתיות
- חשוב על rhythm ויזואלי - לא כל שקף צריך להיראות אותו דבר`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 10000 },
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
${slide.imageUrl ? `תמונה זמינה: ${slide.imageUrl}` : 'אין תמונה'}
תוכן:
\`\`\`json
${contentJson}
\`\`\`
`
  }).join('\n')

  const prompt = `אתה מעצב מצגות מקצועי. צור HTML לשקפים הבאים של "${brandName}".

## מערכת העיצוב (CSS) - כבר מוכנה:
\`\`\`css
${designCSS}
\`\`\`

## לוגואים:
${logoUrl ? `- לוגו לקוח: ${logoUrl}` : '- אין לוגו לקוח'}
${leadersLogoUrl ? `- לוגו Leaders: ${leadersLogoUrl}` : ''}

## שקפים ליצירה:
${slidesDescription}

## הוראות קריטיות:

1. כל שקף הוא דף HTML עצמאי מלא:
\`\`\`html
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: 1920px 1080px; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Heebo', sans-serif; direction: rtl; -webkit-print-color-adjust: exact; }
    ${'{CSS_FROM_DESIGN_SYSTEM}'}
  </style>
</head>
<body>
  <div class="slide">
    <div class="slide-content">
      <!-- תוכן השקף -->
    </div>
  </div>
</body>
</html>
\`\`\`

2. **Safe Zone חובה**: כל טקסט ותוכן חייב לשבת בתוך \`.safe-zone\` (80px margins מכל כיוון). אלמנטים דקורטיביים יכולים לחרוג.
3. כל השקפים בגודל 1920x1080 בדיוק
4. כל הטקסט בעברית, RTL
5. חובה לכלול את כל שדות התוכן - אסור לדלג על מידע
5. מספרים ואחוזים: הצג ב-LTR עם direction: ltr; unicode-bidi: isolate
6. עיצוב layout ייחודי לכל שקף - אל תשתמש באותו layout חוזר
7. ${logoUrl ? `הוסף לוגו לקוח בפוטר: <img src="${logoUrl}" style="height:40px;object-fit:contain">` : 'אין לוגו לקוח'}
8. ${leadersLogoUrl ? `הוסף לוגו Leaders בפוטר: <img src="${leadersLogoUrl}" style="height:35px;object-fit:contain">` : ''}
9. תמונות: אם יש URL תמונה, השתמש בה עם object-fit: cover ועיצוב מרשים (clip-path, overlay, etc.)
10. אם אין תמונה, השתמש ברקע גרדיאנט או pattern במקום
11. למשפיענים ללא תמונת פרופיל: הצג עיגול צבעוני עם האות הראשונה של השם
12. אסור box-shadow - השתמש ב-border בלבד

## כללי Layout לפי סוג שקף:
- **cover**: רקע full-bleed (תמונה או גרדיאנט דרמטי). שם המותג בטייפ ענק (80-120px). כותרת משנית מתחת. לוגואים בפינות. ללא כרטיסים.
- **brief**: חלוקה 60/40. צד אחד: כותרת + טקסט. צד שני: תמונה או אייקונים.
- **goals**: 3-4 כרטיסים ב-grid. כל כרטיס: אזור אייקון, כותרת bold, תיאור.
- **audience**: כרטיס פרסונה מרכזי עם נתונים סביבו, או layout אופקי עם תמונה בצד.
- **strategy**: 3 עמודים שווים לכל pillar עם אלמנט ויזואלי מחבר.
- **metrics**: 4 תיבות מספרים בשורה עם מספרים גדולים. מתחת: טקסט הסבר.
- **influencers**: grid של 3-6 כרטיסים עם תמונות עגולות, שם, handle, סטטיסטיקות.
- **closing**: כותרת ממורכזת, טייפ גדול, עיצוב מינימלי. לוגואים בפוטר.

## Anti-patterns (אסור):
- אסור טקסט קטן מ-18px
- אסור יותר מ-3 צבעים בשקף בודד
- אסור שטח ריק גדול ללא תוכן
- אסור לערום יותר מ-6 אלמנטים אנכית
- אסור box-shadow או backdrop-filter

החזר JSON - מערך של מחרוזות HTML, אחת לכל שקף:
\`\`\`json
{
  "slides": [
    "<!DOCTYPE html>...",
    "<!DOCTYPE html>..."
  ]
}
\`\`\``

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 3000 },
      },
    })

    const text = response.text || ''
    const parsed = parseGeminiJson<{ slides: string[] }>(text)

    if (parsed?.slides?.length > 0) {
      console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} slides`)

      // Validate each slide
      const validSlides = parsed.slides.map((html, i) => {
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
body { font-family: 'Heebo', sans-serif; direction: rtl; -webkit-print-color-adjust: exact; -webkit-font-smoothing: antialiased; color-adjust: exact; text-rendering: optimizeLegibility; }
.slide { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
.safe-zone { position: absolute; top: 80px; right: 80px; bottom: 80px; left: 80px; display: flex; flex-direction: column; overflow: hidden; }
${css}
</style>
</head>
<body>
<div class="slide">
<div class="slide-content">
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

// ═══════════════════════════════════════════════════════════
// AST-BASED PRESENTATION GENERATION (New Architecture)
// ═══════════════════════════════════════════════════════════

/**
 * Generate design system as structured DesignSystem object
 */
async function generateDesignSystemAST(
  brand: BrandDesignInput
): Promise<DesignSystem> {
  const requestId = `ds-ast-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Generating AST design system for: ${brand.brandName}`)

  const prompt = `אתה מעצב מצגות ברמת Apple Keynote / Pitch.com. צור ערכת עיצוב פרימיום למותג "${brand.brandName}".

מידע על המותג:
- תעשייה: ${brand.industry || 'לא ידוע'}
- אישיות: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
- צבע ראשי: ${brand.brandColors.primary}
- צבע משני: ${brand.brandColors.secondary}
- צבע הדגשה: ${brand.brandColors.accent}
- סגנון: ${brand.brandColors.style || 'corporate'}
- אווירה: ${brand.brandColors.mood || 'מקצועי'}
- קהל יעד: ${brand.targetAudience || 'מבוגרים 25-45'}

צור ערכת צבעים עשירה שמרגישה פרימיום ומקצועית. הצבעים חייבים לעבוד יחד ליצירת contrast מרשים.
חשוב על: רקע כהה ועמוק, accent צבע חזק שבולט, גבולות עדינים שיוצרים עומק.

החזר JSON:
{
  "colors": {
    "primary": "#hex - הצבע הראשי של המותג (saturated, rich)",
    "secondary": "#hex - צבע משני לרקעים ואזורים כהים",
    "accent": "#hex - צבע הדגשה חזק שבולט על הרקע",
    "background": "#hex - רקע ברירת מחדל לשקפים (כהה, עמוק)",
    "text": "#hex - צבע טקסט ברירת מחדל (ניגודיות גבוהה)",
    "cardBg": "#hex - רקע כרטיסים (מעט בהיר מהרקע הראשי)",
    "cardBorder": "#hex - גבול כרטיסים (עדין, semi-transparent)"
  },
  "fonts": {
    "heading": "Heebo",
    "body": "Heebo"
  },
  "direction": "rtl"
}`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const text = response.text || ''
    const parsed = parseGeminiJson<DesignSystem>(text)

    if (parsed?.colors?.primary) {
      console.log(`[SlideDesigner][${requestId}] AST design system generated`)
      return {
        colors: parsed.colors,
        fonts: parsed.fonts || { heading: 'Heebo', body: 'Heebo' },
        direction: parsed.direction || 'rtl',
      }
    }

    throw new Error('Invalid design system response')
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] AST design system failed:`, error)
    // Fallback to brand colors
    return {
      colors: {
        primary: brand.brandColors.primary,
        secondary: brand.brandColors.secondary,
        accent: brand.brandColors.accent,
        background: brand.brandColors.background || '#0f0f1e',
        text: brand.brandColors.text || '#ffffff',
        cardBg: brand.brandColors.background || '#1a1a2e',
        cardBorder: brand.brandColors.primary + '30',
      },
      fonts: { heading: 'Heebo', body: 'Heebo' },
      direction: 'rtl',
    }
  }
}

/**
 * Generate slides as JSON AST (array of Slide objects)
 */
async function generateSlidesBatchAST(
  designSystem: DesignSystem,
  slides: SlideContentInput[],
  batchIndex: number,
  brandName: string,
  logoUrl?: string,
  leadersLogoUrl?: string,
): Promise<Slide[]> {
  const requestId = `sb-ast-${batchIndex}-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Generating AST batch ${batchIndex + 1}: ${slides.map(s => s.slideType).join(', ')}`)

  const slidesDescription = slides.map((slide, i) => {
    const contentJson = JSON.stringify(slide.content, null, 2)
    return `
### שקף ${i + 1}: ${slide.title} (סוג: ${slide.slideType})
${slide.imageUrl ? `תמונה זמינה: ${slide.imageUrl}` : 'אין תמונה'}
תוכן:
\`\`\`json
${contentJson}
\`\`\``
  }).join('\n')

  const colors = designSystem.colors
  const prompt = `אתה מעצב מצגות ברמת Apple Keynote / Pitch.com / McKinsey. אתה יוצר עיצובים שגורמים לאנשים לומר "וואו".
צור שקפים כ-JSON עבור "${brandName}".

## ערכת עיצוב:
- צבע ראשי: ${colors.primary}
- צבע משני: ${colors.secondary}
- צבע הדגשה: ${colors.accent}
- רקע: ${colors.background}
- טקסט: ${colors.text}
- רקע כרטיס: ${colors.cardBg}
- גבול כרטיס: ${colors.cardBorder}
- פונט: Heebo
- כיוון: RTL (עברית)

## לוגואים:
${logoUrl ? `- לוגו לקוח: ${logoUrl}` : '- אין לוגו לקוח'}
${leadersLogoUrl ? `- לוגו Leaders: ${leadersLogoUrl}` : ''}

## שקפים ליצירה:
${slidesDescription}

## פילוסופיית עיצוב וארט דיירקשן אקסטרים (Awwwards Winning Level):

אתה ארט-דיירקטור גאון ופרובוקטיבי בסוכנות עיצוב עלית. המטרה שלך היא אחת: שמיטת לסתות (WOW Effect). אתה לא בונה מצגות, אתה יוצר יצירות אמנות אבסטרקטיות, אולטרה-מודרניות, שמעבירות מסר עסקי חותך.

### ארבעת חוקי הברזל של ה"וואו":
1. **Z-Axis Overlap (חפיפת אקסטרים):** אלמנטים לעולם לא יושבים "לבד" בקופסה שלהם. תמונה חייבת לחתוך צורה גיאומטרית, וטקסט ענק חייב לעלות גם על התמונה וגם על הרקע בו זמנית. שחק באגרסיביות עם ה-zIndex (טקסט מעל תמונה מעל צורה מעל רקע).
2. **Mesh / Aurora Gradients (זוהר צפוני):** אל תשתמש ברקעים חלקים או בגרדיאנט רגיל. צור אפקט "Aurora" מטורף על ידי שימוש ב-shape שתופס את כל המסך עם הפורמט הבא:
   \`radial-gradient(circle at 20% 30%, \${colors.primary}60 0%, transparent 50%), radial-gradient(circle at 80% 80%, \${colors.accent}60 0%, transparent 50%), radial-gradient(circle at 50% 50%, \${colors.secondary}80 0%, transparent 50%)\`
3. **טקסט קו-מתאר (Hollow/Stroke Typography):** לשקפי שער וסטטיסטיקות ענק, השתמש בטקסט שקוף עם קו מתאר. העבר ל-CSS של הטקסט: \`color: transparent; -webkit-text-stroke: 2px \${colors.accent};\`. השתמש בזה למספרים ענקיים (300px+) ברקע.
4. **קווים אדריכליים (Architectural Grid):** הוסף shapes שהם בעצם קווים דקים (גובה או רוחב של 1px) שחוצים את כל המסך (width: 1920 או height: 1080) מחוץ ל-Safe zone, כדי לייצר תחושה של שרטוט אדריכלי וגריד חשוף.

### מאסטרים של Layout (בחר אחד לכל שקף כדי לשבור שגרה):

1. **The Bento Box (טרנד ה-Tech העולמי):**
   - שימוש: שקפי Goals, Metrics, Deliverables.
   - חזות: חלוקת המסך ל-4-5 מלבנים/ריבועים צפופים (gap של 20px ביניהם), כל אחד עם רקע חצי-שקוף (\`\${colors.cardBg}\` עם opacity 0.8), גבול דק ופינות מעוגלות מאוד (borderRadius: 32). זה יוצר מראה של UI הייטקי יוקרתי.

2. **The Editorial Bleed (מגזין אופנה):**
   - שימוש: שקפי Brief, Audience, Big Idea.
   - חזות: תמונה ענקית שתופסת 60% מהמסך (חותכת את הקצוות), אבל עם clip-path דרמטי (למשל צורת קפסולה ענקית \`borderRadius: 500px\`). טקסט דחוס ומינימליסטי בצד, ומספר ענק (01, 02) ב-Hollow Typography שחופף על התמונה.

3. **The Typographic Brutalism (ברוטליזם עיצובי):**
   - שימוש: Cover, Insight, Closing.
   - חזות: בלי תמונות בכלל. רק טייפוגרפיה פסיכית. מילה אחת ענקית (fontSize: 250-400px) שחותכת את גבולות המסך ב-45 מעלות (\`transform: rotate(-15deg)\`), בצבע חלש מאוד ברקע. מעליה ב-contrast אגרסיבי, המשפט המרכזי בגודל 96px.

4. **The Split Screen Asymmetry (חצוי ואגרסיבי):**
   - שימוש: Strategy, Approach.
   - חזות: המסך חתוך בצורה חדה. צד ימין (width: 700) רקע כהה עם טקסט בהיר. צד שמאל (width: 1220) מכיל תמונה או גרדיאנט דרמטי עליו יושבים כרטיסים צפים (floating cards) שחותכים את קו התפר בין שני החצאים.

## הוראות טכניות:

1. קנבס: 1920×1080 פיקסלים. כל אלמנט ממוקם באופן אבסולוטי עם x, y, width, height.
2. Safe Zone: טקסט ותוכן חייבים להישאר בתוך 80px margins (x >= 80, y >= 80, x+width <= 1840, y+height <= 1000).
3. אלמנטים דקורטיביים (shapes) חייבים לחרוג מ-Safe Zone - הם מכסים את כל הקנבס או חלקים גדולים ממנו.
4. כל הטקסט בעברית, textAlign: "right" (RTL).
5. מספרים ואחוזים: textAlign: "left" עם כיוון LTR.
6. חובה לכלול את כל שדות התוכן - אסור לדלג על מידע.
7. כותרות: fontSize 56-96, fontWeight 700-900. צבע שונה מגוף הטקסט.
8. גוף: fontSize 20-28, fontWeight 400-500.
9. מספרים/מדדים: fontSize 56-96, fontWeight 800-900, color accent.
10. תמונות: objectFit "cover", borderRadius 16-32.
11. **חובה minimum 3 shapes דקורטיביים בכל שקף** - Aurora gradients, architectural lines, fake-3D shadows, geometric forms.

## חוקי CSS למניעת קריסות הדפסה ב-PDF:
- אסור בהחלט: box-shadow, filter: drop-shadow, backdrop-filter: blur.
- החלופה (Fake 3D & Depth): צור עומק על ידי ציור shape שחור (opacity: 0.2) שממוקם ב- x: +15, y: +15 מתחת לכרטיס (z-index אחד פחות) כדי לדמות צל נקי. השתמש במסגרות (borders) בצבעי פסטל זוהרים.
- טקסט קטן מ-18px אסור
- שקף בלי שום shape דקורטיבי - אסור שקף "שטוח"
- layout זהה בין שני שקפים - כל שקף חייב layout שונה
- zIndex בלי הגיון (רקע=0-5, תוכן=10-50, overlay=60+)
- shapes שחוסמים טקסט חשוב (shapes דקורטיביים חייבים להיות מתחת לתוכן ב-zIndex)

## שדות JSON נתמכים:

### Shape element:
{ "id": "el-X", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0,
  "shapeType": "decorative", "fill": "linear-gradient(...) or radial-gradient(...) or #color",
  "clipPath": "polygon(...)", "borderRadius": 0, "opacity": 0.5, "rotation": 0,
  "border": "1px solid rgba(255,255,255,0.1)", "mixBlendMode": "screen" }

### Text element:
{ "id": "el-X", "type": "text", "x": 80, "y": 120, "width": 800, "height": 80, "zIndex": 10,
  "content": "טקסט", "fontSize": 64, "fontWeight": 800, "color": "#fff", "textAlign": "right",
  "role": "title", "lineHeight": 1.1, "letterSpacing": -2, "opacity": 1, "rotation": 0,
  "textTransform": "uppercase",
  "textStroke": { "width": 2, "color": "${colors.accent}" },
  "gradientFill": "linear-gradient(135deg, ${colors.primary}, ${colors.accent})",
  "mixBlendMode": "normal",
  "backgroundColor": "rgba(0,0,0,0.5)", "borderRadius": 16, "padding": 20 }

### Image element:
{ "id": "el-X", "type": "image", "x": 960, "y": 0, "width": 960, "height": 1080, "zIndex": 5,
  "src": "URL", "objectFit": "cover", "borderRadius": 500, "clipPath": "...", "alt": "תיאור" }

## דוגמאות קונקרטיות לכל סגנון Layout:

### דוגמה 1: Typographic Brutalism (Cover/Insight/Closing):
{
  "id": "slide-0", "slideType": "cover", "label": "שער",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "el-aurora", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0,
      "shapeType": "decorative", "fill": "radial-gradient(circle at 20% 30%, ${colors.primary}60 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${colors.accent}60 0%, transparent 50%), radial-gradient(circle at 50% 50%, ${colors.secondary}80 0%, transparent 50%)" },
    { "id": "el-grid1", "type": "shape", "x": 400, "y": 0, "width": 1, "height": 1080, "zIndex": 1,
      "shapeType": "line", "fill": "rgba(255,255,255,0.06)" },
    { "id": "el-grid2", "type": "shape", "x": 0, "y": 700, "width": 1920, "height": 1, "zIndex": 1,
      "shapeType": "line", "fill": "rgba(255,255,255,0.06)" },
    { "id": "el-bigtext", "type": "text", "x": -100, "y": 150, "width": 2200, "height": 500, "zIndex": 2,
      "content": "BRAND", "fontSize": 350, "fontWeight": 900, "color": "transparent",
      "textAlign": "center", "rotation": -12, "opacity": 0.15,
      "textStroke": { "width": 2, "color": "${colors.accent}" }, "textTransform": "uppercase" },
    { "id": "el-title", "type": "text", "x": 100, "y": 350, "width": 1000, "height": 120, "zIndex": 20,
      "content": "הצעת שיתוף פעולה", "fontSize": 96, "fontWeight": 800, "color": "${colors.text}",
      "textAlign": "right", "role": "title", "lineHeight": 1.0, "letterSpacing": -2 },
    { "id": "el-sub", "type": "text", "x": 100, "y": 490, "width": 700, "height": 60, "zIndex": 20,
      "content": "משפט משנה קצר וחותך", "fontSize": 28, "fontWeight": 400, "color": "${colors.accent}",
      "textAlign": "right", "role": "subtitle", "textTransform": "uppercase", "letterSpacing": 4 },
    { "id": "el-accent", "type": "shape", "x": 100, "y": 470, "width": 120, "height": 4, "zIndex": 15,
      "shapeType": "decorative", "fill": "${colors.accent}" }
  ]
}

### דוגמה 2: Bento Box (Goals/Metrics/Deliverables):
{
  "id": "slide-3", "slideType": "goals", "label": "יעדים",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "el-aurora", "type": "shape", "x": 0, "y": 0, "width": 1920, "height": 1080, "zIndex": 0,
      "shapeType": "decorative", "fill": "radial-gradient(circle at 30% 20%, ${colors.primary}30 0%, transparent 60%), radial-gradient(circle at 80% 70%, ${colors.accent}20 0%, transparent 50%)" },
    { "id": "el-title", "type": "text", "x": 80, "y": 60, "width": 600, "height": 70, "zIndex": 20,
      "content": "יעדי הפרויקט", "fontSize": 56, "fontWeight": 800, "color": "${colors.text}",
      "textAlign": "right", "role": "title" },
    { "id": "el-card1-shadow", "type": "shape", "x": 95, "y": 185, "width": 860, "height": 370, "zIndex": 3,
      "shapeType": "decorative", "fill": "#000000", "borderRadius": 32, "opacity": 0.15 },
    { "id": "el-card1", "type": "shape", "x": 80, "y": 170, "width": 860, "height": 370, "zIndex": 4,
      "shapeType": "decorative", "fill": "${colors.cardBg}", "borderRadius": 32, "opacity": 0.85,
      "border": "1px solid ${colors.cardBorder}" },
    { "id": "el-card1-num", "type": "text", "x": 780, "y": 190, "width": 140, "height": 120, "zIndex": 10,
      "content": "01", "fontSize": 96, "fontWeight": 900, "color": "transparent",
      "textAlign": "left", "textStroke": { "width": 2, "color": "${colors.accent}" } },
    { "id": "el-card1-title", "type": "text", "x": 120, "y": 210, "width": 600, "height": 50, "zIndex": 10,
      "content": "כותרת יעד", "fontSize": 32, "fontWeight": 700, "color": "${colors.text}",
      "textAlign": "right" },
    { "id": "el-card1-body", "type": "text", "x": 120, "y": 270, "width": 600, "height": 200, "zIndex": 10,
      "content": "תיאור היעד", "fontSize": 22, "fontWeight": 400, "color": "${colors.text}",
      "textAlign": "right", "opacity": 0.7, "lineHeight": 1.5 }
  ]
}

### דוגמה 3: Split Screen Asymmetry (Strategy/Approach):
{
  "id": "slide-6", "slideType": "strategy", "label": "אסטרטגיה",
  "background": { "type": "solid", "value": "${colors.background}" },
  "elements": [
    { "id": "el-left", "type": "shape", "x": 0, "y": 0, "width": 700, "height": 1080, "zIndex": 0,
      "shapeType": "decorative", "fill": "${colors.secondary}" },
    { "id": "el-right-glow", "type": "shape", "x": 700, "y": 0, "width": 1220, "height": 1080, "zIndex": 0,
      "shapeType": "decorative", "fill": "radial-gradient(circle at 50% 50%, ${colors.primary}40 0%, transparent 70%)" },
    { "id": "el-divider", "type": "shape", "x": 698, "y": 0, "width": 3, "height": 1080, "zIndex": 5,
      "shapeType": "line", "fill": "${colors.accent}", "opacity": 0.5 },
    { "id": "el-section-title", "type": "text", "x": 100, "y": 80, "width": 500, "height": 80, "zIndex": 10,
      "content": "אסטרטגיה", "fontSize": 64, "fontWeight": 800, "color": "#ffffff",
      "textAlign": "right", "role": "title" },
    { "id": "el-float-card-shadow", "type": "shape", "x": 565, "y": 215, "width": 740, "height": 260, "zIndex": 8,
      "shapeType": "decorative", "fill": "#000000", "borderRadius": 24, "opacity": 0.2 },
    { "id": "el-float-card", "type": "shape", "x": 550, "y": 200, "width": 740, "height": 260, "zIndex": 9,
      "shapeType": "decorative", "fill": "${colors.cardBg}", "borderRadius": 24, "opacity": 0.95,
      "border": "1px solid ${colors.cardBorder}" }
  ]
}

### מאפייני טקסט חדשים - חובה להשתמש:
- **textStroke**: {"width": 2, "color": "..."} - לטקסט חלול/מתאר. חובה לשימוש במספרים רקע (01, 02, 03) ובמילים דקורטיביות ענקיות
- **textTransform**: "uppercase" - לכותרות משנה, tags, labels
- **gradientFill**: "linear-gradient(135deg, color1, color2)" - לכותרות ראשיות מרכזיות. כשמשתמשים ב-gradientFill, צבע color חייב להיות "transparent"
- **mixBlendMode**: "screen" או "overlay" - ל-shapes דקורטיביים כדי ליצור שכבות צבע מורכבות
- **rotation**: עד -15 עד 15 מעלות למילים דקורטיביות ברקע

### חובות לכל שקף:
1. **Aurora/Mesh background shape** כשכבה ראשונה (zIndex: 0) עם radial-gradient מרובה
2. **לפחות 1 קו אדריכלי** (shape רזה 1px) לכל שקף
3. **מספר Hollow** (textStroke) כ-watermark ענק (fontSize 150-350, opacity 0.1-0.2)
4. **Fake shadow** (shape שחור offset +15px) מתחת לכל כרטיס/card
5. **סה"כ minimum 4-6 shapes + 2-4 text elements בכל שקף**

החזר JSON:
{
  "slides": [ {slide1}, {slide2}, ... ]
}`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 10000 },
      },
    })

    const text = response.text || ''
    const parsed = parseGeminiJson<{ slides: Slide[] }>(text)

    if (parsed?.slides?.length > 0) {
      console.log(`[SlideDesigner][${requestId}] Generated ${parsed.slides.length} AST slides`)

      // Validate and fix slide data
      const validSlides = parsed.slides.map((slide, i) => ({
        id: slide.id || `slide-${batchIndex * 5 + i}`,
        slideType: (slide.slideType || slides[i]?.slideType || 'closing') as SlideType,
        label: slide.label || slides[i]?.title || `שקף ${batchIndex * 5 + i + 1}`,
        background: slide.background || { type: 'solid' as const, value: colors.background },
        elements: (slide.elements || []).map((el, j) => ({
          ...el,
          id: el.id || `el-${batchIndex * 5 + i}-${j}`,
        })),
      }))

      return validSlides
    }

    throw new Error('No slides in AST response')
  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] AST batch generation failed:`, error)
    throw error
  }
}

/**
 * Main entry point for AST-based presentation generation.
 * Returns a complete Presentation object.
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
  } = {}
): Promise<Presentation> {
  const requestId = `ai-pres-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Starting AST presentation generation for: ${data.brandName}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const leadersLogo = config.leadersLogoUrl || `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const clientLogo = config.clientLogoUrl || data._scraped?.logoUrl || config.brandLogoUrl || ''

  try {
    // Step 1: Generate Design System
    const brandColors = data._brandColors || {
      primary: config.accentColor || '#E94560',
      secondary: '#1A1A2E',
      accent: config.accentColor || '#E94560',
      style: 'corporate',
      mood: 'מקצועי',
    }

    const designSystem = await generateDesignSystemAST({
      brandName: data.brandName || 'Unknown',
      industry: data._brandResearch?.industry || '',
      brandPersonality: data._brandResearch?.brandPersonality || [],
      brandColors,
      logoUrl: clientLogo || undefined,
      coverImageUrl: config.images?.coverImage || undefined,
      targetAudience: data.targetDescription || '',
    })

    // Step 2: Build slide content batches (same logic as HTML version)
    const formatNum = (n?: number) => {
      if (!n) return '0'
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
      if (n >= 1000) return `${Math.round(n / 1000)}K`
      return n.toString()
    }

    const currency = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : '₪'

    // Same batch building as generateAISlides...
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

    // Step 3: Generate all batches in parallel
    console.log(`[SlideDesigner][${requestId}] Generating 3 AST batches in parallel`)

    const [result1, result2, result3] = await Promise.allSettled([
      generateSlidesBatchAST(designSystem, batch1, 0, data.brandName || '', clientLogo, leadersLogo),
      generateSlidesBatchAST(designSystem, batch2, 1, data.brandName || '', clientLogo, leadersLogo),
      generateSlidesBatchAST(designSystem, batch3, 2, data.brandName || '', clientLogo, leadersLogo),
    ])

    const allSlides: Slide[] = []
    let failedBatches = 0

    const batchResults = [result1, result2, result3]
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i]
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allSlides.push(...result.value)
      } else {
        failedBatches++
        console.error(`[SlideDesigner][${requestId}] AST Batch ${i + 1} failed:`, result.status === 'rejected' ? result.reason : 'empty')
      }
    }

    if (allSlides.length === 0) {
      throw new Error('All AST batches failed - no slides generated')
    }

    const presentation: Presentation = {
      id: `pres-${Date.now()}`,
      title: data.brandName || 'הצעת מחיר',
      designSystem,
      slides: allSlides,
      metadata: {
        brandName: data.brandName,
        createdAt: new Date().toISOString(),
        version: 1,
      },
    }

    console.log(`[SlideDesigner][${requestId}] AST presentation generated: ${allSlides.length} slides (${failedBatches} batches failed)`)
    return presentation

  } catch (error) {
    console.error(`[SlideDesigner][${requestId}] AST presentation generation failed:`, error)
    throw error
  }
}

/**
 * Generate a single slide AST using the existing design system.
 * Used for regenerating individual slides in the editor.
 */
export async function regenerateSingleSlide(
  designSystem: DesignSystem,
  slideContent: SlideContentInput,
  brandName: string,
  instruction?: string,
  logoUrl?: string,
  leadersLogoUrl?: string,
): Promise<Slide> {
  const requestId = `regen-${Date.now()}`
  console.log(`[SlideDesigner][${requestId}] Regenerating single slide: ${slideContent.slideType}`)

  const extraInstruction = instruction ? `\n\nהנחיה נוספת מהמשתמש: ${instruction}` : ''

  const slides = await generateSlidesBatchAST(
    designSystem,
    [{ ...slideContent, title: slideContent.title + extraInstruction }],
    0,
    brandName,
    logoUrl,
    leadersLogoUrl,
  )

  if (slides.length === 0) {
    throw new Error('Failed to regenerate slide')
  }

  return slides[0]
}
