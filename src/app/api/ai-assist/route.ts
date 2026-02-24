import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'

export const maxDuration = 60

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
// Use flash model for speed - these are small, focused tasks (<3s response)
const FAST_MODEL = 'gemini-2.0-flash'

type AiAssistAction =
  | 'generate_goal_description'
  | 'generate_audience_insights'
  | 'refine_insight'
  | 'generate_strategy_flow'
  | 'suggest_content_formats'
  | 'find_brand_logo'

export async function POST(request: NextRequest) {
  const requestId = `ai-assist-${Date.now()}`
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { action, ...params } = body as { action: AiAssistAction; [key: string]: unknown }

    console.log(`[${requestId}] AI Assist: ${action}`)

    const useGrounding = ['generate_audience_insights', 'refine_insight', 'find_brand_logo'].includes(action)

    let prompt: string

    switch (action) {
      case 'generate_goal_description':
        prompt = buildGoalDescriptionPrompt(params)
        break
      case 'generate_audience_insights':
        prompt = buildAudienceInsightsPrompt(params)
        break
      case 'refine_insight':
        prompt = buildRefineInsightPrompt(params)
        break
      case 'generate_strategy_flow':
        prompt = buildStrategyFlowPrompt(params)
        break
      case 'suggest_content_formats':
        prompt = buildContentFormatsPrompt(params)
        break
      case 'find_brand_logo':
        prompt = buildFindLogoPrompt(params)
        break
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: prompt,
      config: {
        // Gemini doesn't allow responseMimeType with googleSearch tool
        ...(useGrounding
          ? { tools: [{ googleSearch: {} }] }
          : { responseMimeType: 'application/json' }),
      },
    })

    const text = response.text || '{}'
    const elapsed = Date.now() - startTime
    console.log(`[${requestId}] Completed in ${elapsed}ms`)

    const parsed = parseGeminiJson<Record<string, unknown>>(text)
    return NextResponse.json({ success: true, ...(parsed || {}) })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] Error after ${elapsed}ms:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI assist failed' },
      { status: 500 }
    )
  }
}

// --- Prompt Builders ---

function buildGoalDescriptionPrompt(params: Record<string, unknown>): string {
  const goalTitle = params.goalTitle as string || ''
  const briefContext = params.briefContext as string || ''

  return `אתה אסטרטג שיווק ישראלי מנוסה. כתוב תיאור קצר (2-3 משפטים) למטרה הבאה בהקשר של בריף הקמפיין.

מטרה: ${goalTitle}
הקשר הבריף: ${briefContext}

החזר JSON:
{ "description": "תיאור המטרה ב-2-3 משפטים שמסביר מה רוצים להשיג ואיך" }`
}

function buildAudienceInsightsPrompt(params: Record<string, unknown>): string {
  const gender = params.gender as string || ''
  const ageRange = params.ageRange as string || ''
  const description = params.description as string || ''
  const brandName = params.brandName as string || ''
  const industry = params.industry as string || ''

  return `אתה חוקר שוק מקצועי. חפש תובנות אמיתיות ומבוססות מחקר על קהל היעד הבא.

קהל יעד: ${gender}, גילאי ${ageRange}
תיאור: ${description}
מותג: ${brandName} (${industry})

חפש נתונים אמיתיים - מחקרים, סקרים, סטטיסטיקות מ-2024-2026.
התמקד בהרגלי צריכה, התנהגות דיגיטלית, ערכים ומוטיבציות רלוונטיים לתעשייה.

החזר JSON:
{
  "insights": [
    {
      "text": "תובנה מפורטת ב-1-2 משפטים",
      "source": "שם המחקר/סקר/מקור",
      "sourceUrl": "URL אם זמין",
      "dataPoint": "נתון מספרי בולט (לדוגמה: 72% מהנשים 25-34...)",
      "confidence": "high/medium/low"
    }
  ]
}

חזור עם 3-5 תובנות. תן עדיפות לנתונים ישראליים כשזמינים.`
}

function buildRefineInsightPrompt(params: Record<string, unknown>): string {
  const currentInsight = params.currentInsight as string || ''
  const briefContext = params.briefContext as string || ''
  const audienceContext = params.audienceContext as string || ''

  return `אתה פלנר אסטרטגי בכיר בסוכנות פרסום ישראלית.

המשימה: לחדד את התובנה המרכזית (Key Insight) כך שתהיה:
1. חדה ומפתיעה
2. מגובה בנתונים אמיתיים
3. מובילה באופן לוגי לגישה קריאייטיבית

תובנה נוכחית: ${currentInsight}
הקשר הבריף: ${briefContext}
קהל יעד: ${audienceContext}

חפש נתוני שוק אמיתיים שתומכים בתובנה או מחזקים אותה.

החזר JSON:
{
  "keyInsight": "תובנה מחודדת ב-1-2 משפטים",
  "insightSource": "מקור ראשי של התובנה",
  "supportingResearch": [
    {
      "statistic": "נתון סטטיסטי",
      "source": "שם המקור",
      "year": "שנה",
      "url": "URL אם זמין"
    }
  ]
}`
}

function buildStrategyFlowPrompt(params: Record<string, unknown>): string {
  const headline = params.strategyHeadline as string || ''
  const pillars = params.strategyPillars as string || ''
  const briefContext = params.briefContext as string || ''

  return `אתה אסטרטג קמפיינים בכיר. צור תהליך עבודה (Strategy Flow) של 3-5 שלבים מעשיים.

כותרת אסטרטגיה: ${headline}
עמודי תווך: ${pillars}
הקשר: ${briefContext}

כל שלב צריך שם קצר, תיאור של משפט אחד, ואייקון אימוג'י מתאים.

החזר JSON:
{
  "steps": [
    { "label": "שם השלב", "description": "תיאור קצר", "icon": "emoji" }
  ]
}`
}

function buildContentFormatsPrompt(params: Record<string, unknown>): string {
  const briefContext = params.briefContext as string || ''
  const creative = params.creative as string || ''

  return `אתה מנהל קריאייטיב בסוכנות דיגיטל. המלץ על חלוקת פורמטים של תוכן.

הקשר הבריף: ${briefContext}
כיוון קריאייטיבי: ${creative}

הפורמטים האפשריים: production (הפקה), ugc (תוכן גולשים), influencer_selfshot (צילום עצמי משפיען), studio (סטודיו), animation (אנימציה)

החזר JSON:
{
  "formats": [
    {
      "format": "production/ugc/influencer_selfshot/studio/animation",
      "label": "שם בעברית",
      "description": "למה הפורמט הזה מתאים - משפט אחד",
      "percentage": 30
    }
  ]
}

בחר 2-4 פורמטים רלוונטיים. האחוזים חייבים לסכום ל-100.`
}

function buildFindLogoPrompt(params: Record<string, unknown>): string {
  const brandName = params.brandName as string || ''

  return `Find the official logo URL for the brand: "${brandName}".
Search for their official website and look for the logo image URL.
Common patterns: /logo.png, /images/logo.svg, favicon, Open Graph image.

Return JSON:
{
  "logoUrl": "direct URL to the logo image, or empty string if not found",
  "websiteUrl": "the official website URL",
  "alternatives": ["other potential logo URLs found"]
}

If you can't find the logo, return logoUrl as empty string.`
}
