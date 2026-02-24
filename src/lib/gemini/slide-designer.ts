/**
 * Gemini AI Premium Slide Designer
 * Generates ultra-premium, magazine-style editorial presentation designs.
 * Heavily optimized for high-end PDF export (No shadows/blur, YES to clip-paths/gradients).
 *
 * 2-Step process:
 * 1. generateDesignSystem() → Unique CSS for the brand
 * 2. generateSlidesBatch() → HTML slides using that CSS
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
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

  const prompt = `אתה Art Director ומנהל קריאייטיב ראשי בסוכנות מיתוג עולמית (בסגנון Apple, Nike, Pentagram).
עליך ליצור מערכת עיצוב CSS למצגת שהיא ברמת מסטרפיס - "WOW effect" מוחלט - עבור המותג "${brand.brandName}".
המצגת תיוצא ל-PDF, ולכן עליה להיראות כמו מגזין אופנה / פרימיום טק (Editorial Design).

מידע על המותג ההשראה שלך:
- תעשייה: ${brand.industry || 'לא ידוע'}
- אישיות: ${brand.brandPersonality?.join(', ') || 'מקצועי'}
- צבע ראשי: ${brand.brandColors.primary}
- צבע משני: ${brand.brandColors.secondary}
- צבע הדגשה: ${brand.brandColors.accent}
- אווירה: ${brand.brandColors.mood || 'יוקרתי ומקצועי'}

דרישות טכניות קשיחות (חובה ל-PDF!):
- גודל: 1920px × 1080px (פורמט ענק).
- RTL מובנה.
- פונט: Heebo.
- 🚫 איסור מוחלט על box-shadow: זה קורס ב-PDF! צור עומק בעזרת מסגרות (borders) כפולות, צבעי רקע מדורגים (gradients), ו-offset borders מוחלטים.
- 🚫 איסור מוחלט על backdrop-filter (blur): זה לא נתמך. צור אפקט של חצי-שקיפות בעזרת rgba עם גרדיאנט.

החזר JSON בלבד:
\`\`\`json
{
  "designDirection": "פסקה מרתקת על הקונספט הויזואלי (למשל: 'עיצוב ברוטליסטי עם חיתוכים אלכסוניים וטייפוגרפיה ענקית')",
  "css": "ה-CSS השלם כאן"
}
\`\`\`

מה ה-CSS חייב לכלול כדי להיות WOW:
1. **טיפוגרפיה אדירה (Editorial Typography):** הגדר מחלקות לכותרות ענק שחותכות את המסך. השתמש ב-letter-spacing, line-height צפוף לכותרות פאנצ'יות. הגדר מחלקת \`.text-stroke\` ליצירת טקסט שקוף עם קו מתאר (webkit-text-stroke).
2. **רקעים נועזים:** אל תעשה רקעים בצבע אחיד! השתמש ב-linear-gradient, radial-gradient, רשתות (css patterns) או ענני צבע.
3. **שבירת גריד (clip-path):** צור מחלקות כמו \`.angled-section\`, \`.cutout-image\` המשתמשות ב-clip-path: polygon() כדי לשבור את הריבועים המשעממים.
4. **Watermarks ענקיים:** מחלקה \`.massive-watermark\` לטקסט רקע עצום (200px+) בזווית עם 3% אטימות (opacity).
5. **אלמנטים דקורטיביים פרימיום:** קווים דקים מפרידים (1px solid), עיגולי אקסנט צבעוניים, מסגרות אסימטריות (\`.premium-card\`).
6. **מודולריות מגזין:** .split-screen (50/50), .grid-asymmetric, .magazine-layout (תמונה גדולה עם חפיפה של קופסת טקסט).
7. **כפתורים ותגיות פאנצ'יים:** \`.badge\`, \`.metric-value\` (מספר ענק בגוון גרדיאנט - \`background-clip: text; color: transparent\`).

תהיה מטורף, תהיה א방גרד. זה חייב להיות העיצוב הכי יפה שהלקוח ראה בחיים שלו.`

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
${slide.imageUrl ? `תמונה זמינה: ${slide.imageUrl}` : 'אין תמונה - השתמש בטיפוגרפיה קיצונית ורקעי CSS'}
תוכן (JSON):
\`\`\`json
${contentJson}
\`\`\`
`
  }).join('\n')

  const prompt = `אתה מעצב Layout בכיר במגזין. המשימה שלך היא לייצר קוד HTML למצגת PDF של המותג "${brandName}".

## ה-CSS שלך (כבר מוטמע ב-HEAD):
\`\`\`css
${designCSS}
\`\`\`

## לוגואים זמינים (השתמש רק איפה שהגיוני ויוקרתי, אל תדביק סתם בפינה):
${logoUrl ? `- לוגו לקוח: ${logoUrl}` : '- אין לוגו לקוח'}
${leadersLogoUrl ? `- לוגו סוכנות (Leaders): ${leadersLogoUrl}` : ''}

## מידע לשקפים:
${slidesDescription}

## חוקי ברזל להפקת לייאאוט ברמת WOW (Editorial Design):
1. **שבור את התבנית (No boring slides):** אף שקף לא נראה כמו פאוורפוינט עם כותרת ובולטים. השתמש בלייאאוט א-סימטרי (לדוגמה: תמונה ענקית תופסת 70% מסך מצד ימין וטקסט צף מצד שמאל).
2. **טקסט כאלמנט עיצובי:** השתמש בחלקי תוכן מסוימים באותיות ענק שחותכות את השוליים. הוסף שכבות של טקסט רקע חלש מאוד כ-Watermark בכל שקף כדי לתת עומק.
3. **שילוב תמונות (Image Integration):** תמונות חייבות לקבל יחס יוקרתי - עטוף אותן בדיבים (divs), השתמש ב-overflow:hidden ובמסגרות או פילטרים דרך CSS. הוסף גרדיאנט מעל תמונות רקע כדי שהטקסט יבלוט בצורה מושלמת.
4. **משפיענים/כרטיסיות:** אל תעשה סתם "ריבועים". השתמש ב-offset borders (קווים שיוצאים מהמסגרת), רקעים מדורגים, ותמונות פרופיל במבנים מעניינים (למשל צורות אובליות לא סימטריות במקום סתם עיגול מושלם).
5. **מספרים וסטטיסטיקות:** הבלט אותם! נתון של "500K" צריך לקבל פונט מטורף בגודלו עם צבע בולט. פסקאות הטקסט שמתחת יהיו קטנות, נקיות, בסגנון מגזין אלגנטי.
6. **מבנה HTML סגור וקפדני:** הקוד חייב להיות תקין (RTL, שפה). אסור לדלג על שום מידע תוכן שנשלח אליך ב-JSON.

## פורמט הפלט:
החזר אך ורק JSON - מערך של מחרוזות HTML. תבנית בסיס לכל שקף:
\`\`\`json
{
  "slides": [
    "<!DOCTYPE html>\\n<html dir=\\"rtl\\" lang=\\"he\\">\\n<head>...</head>\\n<body><div class=\\"slide massive-layout-variant\\">...</div></body>\\n</html>",
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
  background-color: #ffffff; /* Fallback safe */
}
/* Enhanced Base Utilities for WOW effect */
.slide { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
.absolute-fill { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.bg-cover { background-size: cover; background-position: center; background-repeat: no-repeat; }
${css}
</style>
</head>
<body>
<div class="slide">
<div class="slide-content absolute-fill">
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