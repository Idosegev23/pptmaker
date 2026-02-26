/**
 * Proposal Agent
 * Takes raw document texts (client brief + kickoff) and generates
 * a complete proposal with all 10 wizard steps pre-filled.
 *
 * This is the core AI engine that cross-references the documents,
 * extracts facts, and GENERATES strategic content (insight, strategy,
 * creative, deliverables, quantities, media targets, influencer profiles).
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { parseGeminiJson } from '../utils/json-cleanup'
import type { ExtractedBriefData } from '@/types/brief'
import type { WizardStepDataMap } from '@/types/wizard'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})
const MODEL = 'gemini-3.1-pro-preview'
const FLASH_MODEL = 'gemini-3-flash-preview' // Fallback when Pro is overloaded

export interface ProposalOutput {
  extracted: ExtractedBriefData
  stepData: Partial<WizardStepDataMap>
}

/**
 * Generate a complete proposal from uploaded documents
 */
/**
 * Quick extraction — only pulls facts from documents, no strategy/creative generation.
 * Used in process-proposal before the popup so it returns fast (~15s).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extractFromBrief(clientBriefText: string, kickoffText?: string): Promise<any> {
  const agentId = `extract-${Date.now()}`
  console.log(`[${agentId}] 🔍 EXTRACT FROM BRIEF - START`)

  const prompt = `חלץ מידע עסקי בסיסי מהמסמכים הבאים. אל תייצר אסטרטגיה או קריאייטיב — רק חלץ עובדות.

## בריף לקוח:
${clientBriefText}

${kickoffText ? `## מסמך התנעה:\n${kickoffText}` : '(לא סופק מסמך התנעה)'}

החזר JSON עם המבנה הבא בלבד:
{
  "brand": { "name": "שם המותג", "officialName": null, "industry": "תעשייה", "subIndustry": null, "website": null, "tagline": null, "background": "תיאור קצר מה שרשום בבריף" },
  "budget": { "amount": 0, "currency": "₪", "breakdown": null },
  "campaignGoals": ["מטרה 1 כפי שנכתבה בבריף"],
  "targetAudience": {
    "primary": { "gender": "נשים/גברים/שניהם", "ageRange": "XX-XX", "interests": ["תחום"], "painPoints": ["כאב"], "lifestyle": "כפי שנכתב בבריף", "socioeconomic": null },
    "secondary": null,
    "behavior": "כפי שנכתב בבריף"
  },
  "keyInsight": null,
  "insightSource": null,
  "deliverables": [{ "type": "סוג", "quantity": null, "description": "כפי שנכתב" }],
  "influencerPreferences": { "types": [], "specificNames": [], "criteria": [], "verticals": [] },
  "timeline": { "startDate": null, "endDate": null, "duration": null, "milestones": [] },
  "additionalNotes": [],
  "_meta": { "confidence": "high", "warnings": [], "hasKickoff": ${!!kickoffText} }
}`

  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: prompt,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, maxOutputTokens: 2000 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extracted = parseGeminiJson<any>(response.text || '{}')
    console.log(`[${agentId}] ✅ Extraction done (Flash). Brand: ${extracted?.brand?.name || 'N/A'}`)
    return extracted
  } catch (err) {
    console.error(`[${agentId}] ❌ Extraction failed:`, err)
    // Return minimal fallback so the flow doesn't break
    return { brand: { name: '', industry: '' }, budget: { amount: 0, currency: '₪' }, campaignGoals: [], targetAudience: { primary: { gender: '', ageRange: '', interests: [], painPoints: [] } }, _meta: { confidence: 'low', warnings: ['Extraction failed'] } }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateProposal(
  clientBriefText: string,
  kickoffText?: string,
  brandResearch?: Record<string, unknown>,
  influencerStrategy?: Record<string, unknown>
): Promise<ProposalOutput> {
  const agentId = `proposal-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n[${agentId}] 🤖 PROPOSAL AGENT - START`)
  console.log(`[${agentId}] 📄 Client brief: ${clientBriefText.length} chars`)
  if (kickoffText) {
    console.log(`[${agentId}] 📄 Kickoff doc: ${kickoffText.length} chars`)
  } else {
    console.log(`[${agentId}] 📄 Kickoff doc: not provided`)
  }

  if (!clientBriefText || clientBriefText.trim().length < 20) {
    console.error(`[${agentId}] ❌ Brief too short: ${clientBriefText?.trim().length || 0} chars`)
    throw new Error('טקסט הבריף קצר מדי לניתוח. ודא שהמסמך נקרא בהצלחה.')
  }

  const prompt = buildProposalPrompt(clientBriefText, kickoffText, brandResearch, influencerStrategy)
  console.log(`[${agentId}] 📝 Prompt length: ${prompt.length} chars, hasResearch=${!!brandResearch}`)

  try {
    console.log(`[${agentId}] 🔄 Calling ${MODEL} with LOW thinking + JSON...`)
    const geminiStart = Date.now()

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })

    const geminiTime = Date.now() - geminiStart
    const text = response.text || ''
    console.log(`[${agentId}] ✅ Gemini responded in ${geminiTime}ms`)
    console.log(`[${agentId}] 📊 Response size: ${text.length} chars`)

    if (!text) {
      throw new Error('Gemini returned empty response')
    }

    console.log(`[${agentId}] 🔄 Parsing JSON...`)
    const raw = parseGeminiJson<RawProposalResponse>(text)

    // Normalize the response into ProposalOutput
    const result = normalizeResponse(raw, !!kickoffText, agentId)

    console.log(`[${agentId}] ✅ Proposal generated successfully`)
    logProposalSummary(result, agentId)
    console.log(`[${agentId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)

    return result
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[${agentId}] ❌ First attempt failed: ${errMsg}`)

    if (errMsg.includes('קצר מדי')) throw error

    // Retry without JSON mime type constraint
    try {
      console.log(`[${agentId}] 🔄 RETRY without responseMimeType...`)
      const retryStart = Date.now()

      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      })

      const text = response.text || ''
      console.log(`[${agentId}] ✅ Retry responded in ${Date.now() - retryStart}ms (${text.length} chars)`)

      if (!text) throw new Error('Empty response on retry')

      const raw = parseGeminiJson<RawProposalResponse>(text)
      const result = normalizeResponse(raw, !!kickoffText, agentId)

      console.log(`[${agentId}] ✅ Retry succeeded`)
      logProposalSummary(result, agentId)
      console.log(`[${agentId}] ⏱️ TOTAL TIME (with retry): ${Date.now() - startTime}ms`)

      return result
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
      console.error(`[${agentId}] ❌ Retry also failed: ${retryMsg}`)

      // Last resort: try Flash model
      try {
        console.log(`[${agentId}] ⚡ Last resort: trying ${FLASH_MODEL}...`)
        const flashStart = Date.now()
        const response = await ai.models.generateContent({
          model: FLASH_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
        const text = response.text || ''
        if (!text) throw new Error('Empty Flash response')
        const raw = parseGeminiJson<RawProposalResponse>(text)
        const result = normalizeResponse(raw, !!kickoffText, agentId)
        console.log(`[${agentId}] ✅ Flash model succeeded in ${Date.now() - flashStart}ms`)
        logProposalSummary(result, agentId)
        return result
      } catch (flashErr) {
        const flashMsg = flashErr instanceof Error ? flashErr.message : String(flashErr)
        console.error(`[${agentId}] ❌ Flash also failed: ${flashMsg}`)
        console.error(`[${agentId}] ⏱️ TOTAL TIME (all failed): ${Date.now() - startTime}ms`)
        throw new Error(`שגיאה בעיבוד המסמכים: ${retryMsg}`)
      }
    }
  }
}

// ============================================================
// Internal types for the raw Gemini response
// ============================================================

interface RawProposalResponse {
  extracted: {
    brand: { name: string; officialName?: string; background: string; industry: string; subIndustry?: string; website?: string; tagline?: string }
    budget: { amount: number; currency: string; breakdown?: string }
    campaignGoals: string[]
    targetAudience: {
      primary: { gender: string; ageRange: string; socioeconomic?: string; lifestyle?: string; interests: string[]; painPoints: string[] }
      secondary?: { gender: string; ageRange: string; description: string }
      behavior?: string
    }
    keyInsight?: string
    insightSource?: string
    deliverables?: { type: string; quantity?: number; description?: string }[]
    influencerPreferences?: { types?: string[]; specificNames?: string[]; criteria?: string[]; verticals?: string[] }
    timeline?: { startDate?: string; endDate?: string; duration?: string; milestones?: string[] }
    additionalNotes?: string[]
  }
  stepData: {
    brief: { brandName: string; brandBrief: string; brandPainPoints: string[]; brandObjective: string }
    goals: { goals: { title: string; description: string }[]; customGoals: string[] }
    target_audience: { targetGender: string; targetAgeRange: string; targetDescription: string; targetBehavior: string; targetInsights: string[]; targetSecondary?: { gender: string; ageRange: string; description: string } }
    key_insight: { keyInsight: string; insightSource: string; insightData?: string }
    strategy: { strategyHeadline: string; strategyDescription?: string; strategyPillars: { title: string; description: string }[] }
    creative: { activityTitle: string; activityConcept: string; activityDescription: string; activityApproach: { title: string; description: string }[]; activityDifferentiator?: string }
    deliverables: { deliverables: { type: string; quantity: number; description: string; purpose: string }[]; deliverablesSummary?: string }
    quantities: { influencerCount: number; contentTypes: { type: string; quantityPerInfluencer: number; totalQuantity: number }[]; campaignDurationMonths: number; totalDeliverables: number; formula?: string }
    media_targets: { budget: number; currency: string; potentialReach: number; potentialEngagement: number; cpe: number; cpm?: number; estimatedImpressions?: number; metricsExplanation?: string }
    influencers: { influencers: { name: string; username: string; categories: string[]; followers: number; engagementRate: number; bio?: string; profileUrl: string; profilePicUrl: string }[]; influencerStrategy?: string; influencerCriteria?: string[] }
  }
}

// ============================================================
// Prompt builder - HEAVILY OPTIMIZED FOR "WOW" PDF OUTPUT
// ============================================================

function buildProposalPrompt(
  clientBriefText: string,
  kickoffText?: string,
  brandResearch?: Record<string, unknown>,
  influencerStrategy?: Record<string, unknown>
): string {
  // Build a rich research context from ALL available data
  const r = brandResearch || {}
  const researchSection = brandResearch ? `
## מחקר אסטרטגי מעמיק שנאסף על המותג:
**חובה להשתמש בנתונים האלה כדי לכתוב תוכן ספציפי ומבוסס — לא גנרי!**

### מיקום בשוק ותחרות:
- מיקום: ${(r.marketPosition as string) || ''}
- מתחרים: ${JSON.stringify((r.competitors as unknown[])?.slice(0, 4) || [])}
- יתרונות תחרותיים: ${JSON.stringify((r.competitiveAdvantages as unknown[]) || [])}
- יתרונות ייחודיים (USP): ${JSON.stringify((r.uniqueSellingPoints as unknown[]) || [])}
- פער תחרותי (הזדמנות!): ${(r.competitiveGap as string) || ''}

### טרנדים, הקשר וטריגר:
- טרנדים בתעשייה: ${JSON.stringify((r.industryTrends as unknown[]) || [])}
- למה עכשיו (whyNow): ${(r.whyNowTrigger as string) || ''}
- הקשר ישראלי: ${(r.israeliMarketContext as string) || ''}
- פלטפורמה דומיננטית בישראל: ${(r.dominantPlatformInIsrael as string) || ''}
- עונתיות: ${(r.seasonality as string) || ''}

### זהות המותג (השתמש לטון הכתיבה!):
- אישיות המותג: ${JSON.stringify((r.brandPersonality as unknown[]) || [])}
- ערכי מותג: ${JSON.stringify((r.brandValues as unknown[]) || [])}
- הבטחת מותג: ${(r.brandPromise as string) || ''}
- טון דיבור: ${(r.toneOfVoice as string) || ''}

### קהל יעד מהמחקר:
${JSON.stringify((r.targetDemographics as unknown) || {}, null, 1)}

### קמפיינים קודמים ותחרותיים:
- קמפיינים קודמים של המותג: ${JSON.stringify((r.previousCampaigns as unknown[])?.slice(0, 3) || [])}
- קמפיינים של מתחרים: ${JSON.stringify((r.competitorCampaigns as unknown[])?.slice(0, 3) || [])}

### נוכחות דיגיטלית:
- רשתות חברתיות: ${JSON.stringify((r.socialPresence as unknown) || {})}
- נושאי תוכן מומלצים: ${JSON.stringify((r.contentThemes as unknown[]) || [])}
- גישה מומלצת מהמחקר: ${(r.suggestedApproach as string) || ''}
- סוגי משפיענים מומלצים: ${JSON.stringify((r.influencerTypes as unknown[]) || [])}
${influencerStrategy ? `
### אסטרטגיית משפיענים (מחקר שוק אמיתי):
${JSON.stringify(influencerStrategy, null, 1).slice(0, 1500)}` : ''}
` : ''

  return `אתה מנהל קריאייטיב ואסטרטג ראשי בסוכנות פרימיום לשיווק משפיענים.
המטרה שלך היא לבנות הצעת מחיר שתגרום ללקוח להגיד "וואו!". התוצר שלך ייוצא בסופו של דבר לעיצוב PDF יוקרתי.

## מסמך 1: בריף לקוח (Client Brief)
${clientBriefText}

${kickoffText ? `## מסמך 2: מסמך התנעה פנימי (Kickoff Notes)
${kickoffText}` : '(לא סופק מסמך התנעה)'}
${researchSection}

## חוקי כתיבה קריטיים לעיצוב ה-PDF (חובה!):
1. **קופי של סוכנות בוטיק:** השתמש בשפה סוחפת, פאנצ'ית ויוקרתית. אל תכתוב כמו רובוט.
2. **Scannability (קריאות מרחבית):** הימנע מגושי טקסט ענקיים. השתמש במשפטים קצרים וממוקדים כדי שהעיצוב ב-PDF ינשום וייראה מודרני.
3. **יציאה מהקופסא בקריאייטיב:** אל תציע "משפיענים יצטלמו עם המוצר". תציע מהלכים משבשי שגרה, תרחישים מעניינים, קונספטים עם פוטנציאל ויראלי ואסתטיקה ויזואלית חזקה.
4. **תובנה קטלנית:** ה-Key Insight חייב להיות 'אסימון שנופל' ללקוח. מתח בין התנהגות קהל היעד לבין מה שהמותג מציע.
5. **סתירות:** מסמך ההתנעה תמיד גובר על הבריף.

## פורמט הפלט (JSON):
{
  "extracted": {
    "brand": {
      "name": "שם המותג",
      "officialName": "שם באנגלית או null",
      "background": "רקע המותג - חילוץ מדויק",
      "industry": "תעשייה",
      "subIndustry": "תת-תעשייה או null",
      "website": "כתובת אתר או null",
      "tagline": "סלוגן או null"
    },
    "budget": {
      "amount": 0,
      "currency": "₪",
      "breakdown": "פירוט או null"
    },
    "campaignGoals": ["מטרה 1", "מטרה 2"],
    "targetAudience": {
      "primary": {
        "gender": "נשים/גברים/שניהם",
        "ageRange": "25-34",
        "socioeconomic": "רמה סוציו או null",
        "lifestyle": "אורח חיים",
        "interests": ["תחום 1", "תחום 2"],
        "painPoints": ["כאב 1", "כאב 2"]
      },
      "secondary": null,
      "behavior": "התנהגות צרכנית"
    },
    "keyInsight": "תובנה או null",
    "insightSource": "מקור או null",
    "deliverables": [
      { "type": "סוג", "quantity": null, "description": "תיאור" }
    ],
    "influencerPreferences": {
      "types": ["מיקרו", "מאקרו"],
      "specificNames": ["שם"],
      "criteria": ["קריטריון"],
      "verticals": ["תחום"]
    },
    "timeline": {
      "startDate": null,
      "endDate": null,
      "duration": "משך או null",
      "milestones": []
    },
    "additionalNotes": ["הערה חשובה"]
  },
  "stepData": {
    "brief": {
      "brandName": "שם המותג",
      "brandBrief": "פסקה סוחפת על זהות המותג, כתובה כמו תקציר מנהלים יוקרתי למצגת. קצר, חד, ואלגנטי.",
      "brandPainPoints": ["האתגר השיווקי האמיתי 1", "החסם התפיסתי של הצרכן 2"],
      "brandObjective": "משפט מחץ אחד שמגדיר את יעד העל של הקמפיין."
    },
    "goals": {
      "goals": [
        { "title": "מודעות מתפוצצת", "description": "תיאור קצר ופאנצ'י לאיך נשיג את זה." },
        { "title": "מטרה 2", "description": "תיאור פאנצ'י" }
      ],
      "customGoals": []
    },
    "target_audience": {
      "targetGender": "המגדר המדויק",
      "targetAgeRange": "טווח גילי",
      "targetDescription": "פרופיל פסיכולוגי מרתק של הקהל - מי הם, מה מרגש אותם, מה הסטייל שלהם.",
      "targetBehavior": "איך הם צורכים תוכן וקונים (למשל: 'גוללים בטיקטוק לפני השינה, קונים מהמלצות אותנטיות בלבד').",
      "targetInsights": ["תובנה 1 על הקהל", "תובנה 2"],
      "targetSecondary": null
    },
    "key_insight": {
      "keyInsight": "משפט פאנצ'י שמייצר אפקט WOW. למשל: 'צרכנים לא מחפשים עוד מוצר, הם מחפשים זהות. בזמן שכולם מדברים על פיצ'רים, אנחנו נדבר על תחושות'.",
      "insightSource": "מאיפה הבאנו את זה (טרנד עולמי, ניתוח קהל, הבנת הבריף).",
      "insightData": "נתון חזק שתומך בזה."
    },
    "strategy": {
      "strategyHeadline": "משפט מחץ. אסטרטגיה בשתי מילים. (למשל: 'ממוצר לצריכה - לסמל סטטוס').",
      "strategyDescription": "פסקה אחת מבריקה שמסבירה את הפיצוח האסטרטגי - איך נשנה את המשחק.",
      "strategyPillars": [
        { "title": "עמוד תווך 1 קליט", "description": "2-3 משפטים. מה עושים ולמה זה עובד." },
        { "title": "עמוד תווך 2 קליט", "description": "2-3 משפטים." }
      ]
    },
    "creative": {
      "activityTitle": "שם הקמפיין / ההאשטאג הרשמי - קריאייטיבי, זכיר ומגניב",
      "activityConcept": "רעיון הזהב - קונספט 'מחוץ לקופסא' שיראה מדהים ב-PDF. מה ה-Hook?",
      "activityDescription": "הסבר מרתק על הויזואליה, ה-Vibe של התוכן, והסיפור שהמשפיענים יספרו (Art Direction).",
      "activityApproach": [
        { "title": "The Hook", "description": "איך נתפוס את תשומת הלב בשנייה הראשונה." },
        { "title": "The Story", "description": "הנרטיב של התוכן." }
      ],
      "activityDifferentiator": "ה-'X Factor' - למה הקמפיין הזה לא נראה כמו שום דבר אחר בפיד."
    },
    "deliverables": {
      "deliverables": [
        { "type": "רילז פרימיום", "quantity": 1, "description": "וידאו אותנטי, ערוך בקצב מהיר, ממוקד סטוריטלינג", "purpose": "יצירת ויראליות ומודעות" }
      ],
      "deliverablesSummary": "משפט מסכם וחזק על תמהיל התוכן שרקחנו."
    },
    "quantities": {
      "influencerCount": 5,
      "contentTypes": [
        { "type": "רילז", "quantityPerInfluencer": 1, "totalQuantity": 5 }
      ],
      "campaignDurationMonths": 1,
      "totalDeliverables": 25,
      "formula": "נוסחה פשוטה וברורה שתוצג יפה בעיצוב."
    },
    "media_targets": {
      "budget": 50000,
      "currency": "₪",
      "potentialReach": 500000,
      "potentialEngagement": 25000,
      "cpe": 2.0,
      "cpm": 100,
      "estimatedImpressions": 500000,
      "metricsExplanation": "הסבר מקצועי ואלגנטי ללקוח על איך חושבו המדדים (כתיבה בטוחה ומשכנעת)."
    },
    "influencers": {
      "influencers": [
        {
          "name": "שם אותנטי (לא חובה אמיתי, אבל שיישמע אמין)",
          "username": "@username_cool",
          "categories": ["אופנה עילית", "לייפסטייל"],
          "followers": 75000,
          "engagementRate": 4.2,
          "bio": "משפט אחד קולע - למה הוא ליהוק מושלם ל-Vibe שלנו.",
          "profileUrl": "",
          "profilePicUrl": ""
        }
      ],
      "influencerStrategy": "פסקת מחץ שמסבירה את ליהוק ה'נבחרת' שלנו - למה דווקא השילוב הזה ינצח.",
      "influencerCriteria": ["אותנטיות בלתי מתפשרת", "אסתטיקה גבוהה", "חיבור אורגני לערכי המותג"]
    }
  }
}
`
}

// ============================================================
// Response normalization
// ============================================================

function normalizeResponse(
  raw: RawProposalResponse,
  hasKickoff: boolean,
  agentId: string
): ProposalOutput {
  console.log(`[${agentId}] 🔄 Normalizing response...`)

  // Normalize extracted data
  const extracted: ExtractedBriefData = {
    brand: {
      name: raw.extracted?.brand?.name || '',
      officialName: raw.extracted?.brand?.officialName,
      background: raw.extracted?.brand?.background || '',
      industry: raw.extracted?.brand?.industry || '',
      subIndustry: raw.extracted?.brand?.subIndustry,
      website: raw.extracted?.brand?.website,
      tagline: raw.extracted?.brand?.tagline,
    },
    budget: {
      amount: raw.extracted?.budget?.amount || 0,
      currency: raw.extracted?.budget?.currency || '₪',
      breakdown: raw.extracted?.budget?.breakdown,
    },
    campaignGoals: raw.extracted?.campaignGoals || [],
    targetAudience: {
      primary: {
        gender: raw.extracted?.targetAudience?.primary?.gender || '',
        ageRange: raw.extracted?.targetAudience?.primary?.ageRange || '',
        socioeconomic: raw.extracted?.targetAudience?.primary?.socioeconomic,
        lifestyle: raw.extracted?.targetAudience?.primary?.lifestyle,
        interests: raw.extracted?.targetAudience?.primary?.interests || [],
        painPoints: raw.extracted?.targetAudience?.primary?.painPoints || [],
      },
      secondary: raw.extracted?.targetAudience?.secondary,
      behavior: raw.extracted?.targetAudience?.behavior,
    },
    keyInsight: raw.extracted?.keyInsight,
    insightSource: raw.extracted?.insightSource,
    deliverables: raw.extracted?.deliverables || [],
    influencerPreferences: raw.extracted?.influencerPreferences || {},
    timeline: raw.extracted?.timeline || {},
    additionalNotes: raw.extracted?.additionalNotes || [],
    _meta: {
      confidence: raw.extracted?.brand?.name ? 'high' : 'medium',
      clientBriefProcessed: true,
      kickoffDocProcessed: hasKickoff,
      warnings: [],
    },
  }

  // Add warnings
  if (!extracted.brand.name) extracted._meta.warnings.push('שם המותג לא נמצא')
  if (!extracted.budget.amount) extracted._meta.warnings.push('תקציב לא נמצא')

  // Normalize step data with safe defaults
  const sd = raw.stepData || {} as RawProposalResponse['stepData']

  const stepData: Partial<WizardStepDataMap> = {
    brief: {
      brandName: sd.brief?.brandName || extracted.brand.name || '',
      brandBrief: sd.brief?.brandBrief || extracted.brand.background || '',
      brandPainPoints: sd.brief?.brandPainPoints || [],
      brandObjective: sd.brief?.brandObjective || extracted.campaignGoals?.[0] || '',
    },
    goals: {
      goals: sd.goals?.goals?.length ? sd.goals.goals : (extracted.campaignGoals || []).map(g => ({ title: g, description: '' })),
      customGoals: sd.goals?.customGoals || [],
    },
    target_audience: {
      targetGender: sd.target_audience?.targetGender || extracted.targetAudience?.primary?.gender || '',
      targetAgeRange: sd.target_audience?.targetAgeRange || extracted.targetAudience?.primary?.ageRange || '',
      targetDescription: sd.target_audience?.targetDescription || extracted.targetAudience?.primary?.lifestyle || '',
      targetBehavior: sd.target_audience?.targetBehavior || extracted.targetAudience?.behavior || '',
      targetInsights: sd.target_audience?.targetInsights || extracted.targetAudience?.primary?.interests || [],
      targetSecondary: sd.target_audience?.targetSecondary || extracted.targetAudience?.secondary,
    },
    key_insight: {
      keyInsight: sd.key_insight?.keyInsight || '',
      insightSource: sd.key_insight?.insightSource || '',
      insightData: sd.key_insight?.insightData,
    },
    strategy: {
      strategyHeadline: sd.strategy?.strategyHeadline || '',
      strategyDescription: sd.strategy?.strategyDescription,
      strategyPillars: sd.strategy?.strategyPillars || [],
    },
    creative: {
      activityTitle: sd.creative?.activityTitle || '',
      activityConcept: sd.creative?.activityConcept || '',
      activityDescription: sd.creative?.activityDescription || '',
      activityApproach: sd.creative?.activityApproach || [],
      activityDifferentiator: sd.creative?.activityDifferentiator,
      referenceImages: [],
    },
    deliverables: {
      deliverables: sd.deliverables?.deliverables?.length
        ? sd.deliverables.deliverables.map(d => ({
            type: d.type || '',
            quantity: d.quantity || 1,
            description: d.description || '',
            purpose: d.purpose || '',
          }))
        : (extracted.deliverables || []).map(d => ({
            type: d.type,
            quantity: d.quantity || 1,
            description: d.description || '',
            purpose: '',
          })),
      deliverablesSummary: sd.deliverables?.deliverablesSummary,
      referenceImages: [],
    },
    quantities: {
      influencerCount: sd.quantities?.influencerCount || 5,
      contentTypes: sd.quantities?.contentTypes || [],
      campaignDurationMonths: sd.quantities?.campaignDurationMonths || 1,
      totalDeliverables: sd.quantities?.totalDeliverables || 0,
      formula: sd.quantities?.formula,
    },
    media_targets: {
      budget: sd.media_targets?.budget || extracted.budget?.amount || 0,
      currency: sd.media_targets?.currency || extracted.budget?.currency || '₪',
      potentialReach: sd.media_targets?.potentialReach || 0,
      potentialEngagement: sd.media_targets?.potentialEngagement || 0,
      cpe: sd.media_targets?.cpe || 0,
      cpm: sd.media_targets?.cpm,
      estimatedImpressions: sd.media_targets?.estimatedImpressions,
      metricsExplanation: sd.media_targets?.metricsExplanation,
    },
    influencers: {
      influencers: (sd.influencers?.influencers || []).map(inf => ({
        name: inf.name || '',
        username: inf.username || '',
        profileUrl: inf.profileUrl || '',
        profilePicUrl: inf.profilePicUrl || '',
        categories: inf.categories || [],
        followers: inf.followers || 0,
        engagementRate: inf.engagementRate || 0,
        bio: inf.bio,
      })),
      influencerStrategy: sd.influencers?.influencerStrategy,
      influencerCriteria: sd.influencers?.influencerCriteria || [],
    },
  }

  return { extracted, stepData }
}

// ============================================================
// Logging
// ============================================================

function logProposalSummary(result: ProposalOutput, agentId: string) {
  const { extracted, stepData } = result
  console.log(`[${agentId}] 📊 PROPOSAL SUMMARY:`)
  console.log(`[${agentId}]   Brand: ${extracted.brand?.name || 'N/A'}`)
  console.log(`[${agentId}]   Budget: ${extracted.budget?.currency}${extracted.budget?.amount?.toLocaleString() || 0}`)
  console.log(`[${agentId}]   Goals: ${stepData.goals?.goals?.length || 0}`)
  console.log(`[${agentId}]   Insight: ${stepData.key_insight?.keyInsight?.slice(0, 80) || 'N/A'}`)
  console.log(`[${agentId}]   Strategy: ${stepData.strategy?.strategyHeadline?.slice(0, 80) || 'N/A'}`)
  console.log(`[${agentId}]   Pillars: ${stepData.strategy?.strategyPillars?.length || 0}`)
  console.log(`[${agentId}]   Creative: ${stepData.creative?.activityTitle || 'N/A'}`)
  console.log(`[${agentId}]   Deliverables: ${stepData.deliverables?.deliverables?.length || 0}`)
  console.log(`[${agentId}]   Influencer count: ${stepData.quantities?.influencerCount || 0}`)
  console.log(`[${agentId}]   Total deliverables: ${stepData.quantities?.totalDeliverables || 0}`)
  console.log(`[${agentId}]   Reach: ${stepData.media_targets?.potentialReach?.toLocaleString() || 0}`)
  console.log(`[${agentId}]   CPE: ${stepData.media_targets?.cpe || 0}`)
  console.log(`[${agentId}]   Suggested influencers: ${stepData.influencers?.influencers?.length || 0}`)
  console.log(`[${agentId}]   Confidence: ${extracted._meta?.confidence}`)
  if (extracted._meta?.warnings?.length) {
    console.log(`[${agentId}]   Warnings: ${extracted._meta.warnings.join(', ')}`)
  }
}