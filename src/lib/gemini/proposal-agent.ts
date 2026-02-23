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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3.1-pro-preview'

export interface ProposalOutput {
  extracted: ExtractedBriefData
  stepData: Partial<WizardStepDataMap>
}

/**
 * Generate a complete proposal from uploaded documents
 */
export async function generateProposal(
  clientBriefText: string,
  kickoffText?: string
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

  const prompt = buildProposalPrompt(clientBriefText, kickoffText)
  console.log(`[${agentId}] 📝 Prompt length: ${prompt.length} chars`)

  try {
    console.log(`[${agentId}] 🔄 Calling ${MODEL} with HIGH thinking + JSON...`)
    const geminiStart = Date.now()

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
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
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
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
      console.error(`[${agentId}] ⏱️ TOTAL TIME (failed): ${Date.now() - startTime}ms`)
      throw new Error(`שגיאה בעיבוד המסמכים: ${retryMsg}`)
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
// Prompt builder
// ============================================================

function buildProposalPrompt(clientBriefText: string, kickoffText?: string): string {
  return `אתה אסטרטג בכיר בסוכנות שיווק משפיענים מובילה בישראל (Leaders / LDRS Group).
קיבלת מסמכים מלקוח לצורך בניית הצעת מחיר מקיפה לקמפיין משפיענים.

## מסמך 1: בריף לקוח (Client Brief)
${clientBriefText}

${kickoffText ? `## מסמך 2: מסמך התנעה פנימי (Kickoff Notes)
${kickoffText}` : '(לא סופק מסמך התנעה)'}

## המשימה שלך:
עליך לבצע שתי פעולות:
1. **חילוץ עובדות** - חלץ את כל הנתונים העובדתיים מהמסמכים (שם מותג, תקציב, מטרות, קהל יעד, תוצרים, לוח זמנים)
2. **ייצור תוכן** - ייצר תוכן אסטרטגי איכותי ומקצועי עבור הצעת המחיר, כולל: תובנה מרכזית, אסטרטגיה עם עמודים, כיוון קריאייטיבי, חישובי כמויות ויעדי מדיה, והצעות משפיענים

## כללים קריטיים:
1. **עובדות רק מהמסמכים**: שם מותג, תקציב, מטרות, קהל יעד, תוצרים - חלץ רק ממה שכתוב
2. **תוכן אסטרטגי - ייצר**: תובנה, אסטרטגיה, קריאייטיב, חישובי מדיה - ייצר על סמך ניתוח המסמכים + ידע מקצועי
3. **סתירות**: מסמך ההתנעה גובר על הבריף
4. **תקציב**: המר "50K" ל-50000, "50 אלף" ל-50000
5. **שפה**: כל התוכן בעברית
6. **איכות**: תובנה חייבת להיות חדה ומבוססת, אסטרטגיה חייבת להיות ישימה, קריאייטיב חייב להיות מקורי
7. **חישובי מדיה**: חשב CPE, Reach, Engagement על סמך תקציב וסוג התעשייה (אם תקציב לא ידוע, השתמש בהערכה סבירה)

## פורמט הפלט (JSON):
{
  "extracted": {
    "brand": {
      "name": "שם המותג",
      "officialName": "שם באנגלית או null",
      "background": "רקע המותג מהמסמכים - פסקה מלאה",
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
        "socioeconomic": "בינוני-גבוה או null",
        "lifestyle": "אורח חיים או null",
        "interests": ["תחום 1", "תחום 2"],
        "painPoints": ["כאב 1", "כאב 2"]
      },
      "secondary": null,
      "behavior": "התנהגות צרכנית או null"
    },
    "keyInsight": "תובנה שנמצאה במסמכים או null",
    "insightSource": "מקור או null",
    "deliverables": [
      { "type": "סוג (רילז/סטוריז/טיקטוק/פוסט)", "quantity": null, "description": "תיאור" }
    ],
    "influencerPreferences": {
      "types": ["מיקרו", "מאקרו"],
      "specificNames": ["שם שהוזכר"],
      "criteria": ["קריטריון"],
      "verticals": ["אופנה", "לייפסטייל"]
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
      "brandBrief": "רקע מפורט על המותג - פסקה או שתיים עשירות. כלול: מה המותג, מה הוא עושה, מה ייחודי בו, מה האתגר הנוכחי",
      "brandPainPoints": ["נקודת כאב 1 שהקמפיין יפתור", "נקודת כאב 2", "נקודת כאב 3"],
      "brandObjective": "המטרה המרכזית של ההצעה - משפט אחד ברור"
    },
    "goals": {
      "goals": [
        { "title": "מטרה 1", "description": "הסבר מפורט למה המטרה חשובה ואיך נשיג אותה" },
        { "title": "מטרה 2", "description": "הסבר מפורט" },
        { "title": "מטרה 3", "description": "הסבר מפורט" }
      ],
      "customGoals": []
    },
    "target_audience": {
      "targetGender": "נשים/גברים/שניהם",
      "targetAgeRange": "25-34",
      "targetDescription": "תיאור מפורט של קהל היעד - אורח חיים, תחומי עניין, איפה הם נמצאים",
      "targetBehavior": "תיאור התנהגות צרכנית - איך מחפשים, מה משפיע על החלטות, איפה קונים",
      "targetInsights": ["תובנה 1 על הקהל", "תובנה 2", "תובנה 3"],
      "targetSecondary": null
    },
    "key_insight": {
      "keyInsight": "תובנה אסטרטגית חדה ומבוססת. צריכה להיות מפתיעה אבל נכונה, ולחבר בין המותג לקהל היעד בצורה שמניעה לפעולה. למשל: 'צרכנים בגילאי 25-34 מחפשים אותנטיות ושקיפות, אבל רוב המותגים בתעשייה מדברים בשפה תאגידית - יש פער שמשפיענים יכולים לגשר עליו'. חייבת להיות ספציפית למותג ולקמפיין.",
      "insightSource": "הסבר מאיפה התובנה נובעת - ניתוח המסמכים, מגמות בתעשייה, הבנת קהל היעד",
      "insightData": "נתון תומך אם קיים - מספר, סטטיסטיקה, או ציטוט מהמסמכים"
    },
    "strategy": {
      "strategyHeadline": "כותרת אסטרטגיה - משפט אחד חד וברור שמסכם את הגישה",
      "strategyDescription": "פסקה שמסבירה את ההיגיון האסטרטגי - למה הגישה הזו, מה היא משיגה, ואיך היא עובדת",
      "strategyPillars": [
        { "title": "עמוד 1", "description": "תיאור מפורט של העמוד הראשון - מה עושים, למה, ואיך" },
        { "title": "עמוד 2", "description": "תיאור מפורט של העמוד השני" },
        { "title": "עמוד 3", "description": "תיאור מפורט של העמוד השלישי" }
      ]
    },
    "creative": {
      "activityTitle": "שם הפעילות/הקמפיין - קצר ומגניב",
      "activityConcept": "הרעיון המרכזי - משפט או שניים שמסבירים את ליבת הקריאייטיב",
      "activityDescription": "תיאור מפורט של הפעילות - מה המשפיענים יעשו, מה הטון, מה המסר, מה הפורמט",
      "activityApproach": [
        { "title": "גישה 1", "description": "תיאור גישת תוכן ראשונה - סוג, פורמט, מסר" },
        { "title": "גישה 2", "description": "תיאור גישת תוכן שנייה" }
      ],
      "activityDifferentiator": "מה מייחד את הפעילות הזו ולמה היא תעבוד"
    },
    "deliverables": {
      "deliverables": [
        { "type": "רילז אינסטגרם", "quantity": 1, "description": "תיאור התוצר", "purpose": "המטרה של התוצר" },
        { "type": "סטוריז אינסטגרם", "quantity": 3, "description": "תיאור", "purpose": "מטרה" },
        { "type": "פוסט אינסטגרם", "quantity": 1, "description": "תיאור", "purpose": "מטרה" }
      ],
      "deliverablesSummary": "סיכום קצר של מכלול התוצרים"
    },
    "quantities": {
      "influencerCount": 5,
      "contentTypes": [
        { "type": "רילז", "quantityPerInfluencer": 1, "totalQuantity": 5 },
        { "type": "סטוריז", "quantityPerInfluencer": 3, "totalQuantity": 15 },
        { "type": "פוסט", "quantityPerInfluencer": 1, "totalQuantity": 5 }
      ],
      "campaignDurationMonths": 1,
      "totalDeliverables": 25,
      "formula": "5 משפיענים × (1 רילז + 3 סטוריז + 1 פוסט) = 25 תוצרים"
    },
    "media_targets": {
      "budget": 50000,
      "currency": "₪",
      "potentialReach": 500000,
      "potentialEngagement": 25000,
      "cpe": 2.0,
      "cpm": 100,
      "estimatedImpressions": 500000,
      "metricsExplanation": "הסבר מפורט: CPE ממוצע בתעשיית X הוא Y ש\"ח. עם תקציב של Z, אנחנו מצפים ל-... (הסבר כל מספר)"
    },
    "influencers": {
      "influencers": [
        {
          "name": "שם משפיען מוצע 1",
          "username": "@username1",
          "categories": ["קטגוריה 1", "קטגוריה 2"],
          "followers": 50000,
          "engagementRate": 3.5,
          "bio": "תיאור קצר - למה מתאים למותג",
          "profileUrl": "",
          "profilePicUrl": ""
        },
        {
          "name": "שם משפיען מוצע 2",
          "username": "@username2",
          "categories": ["קטגוריה"],
          "followers": 100000,
          "engagementRate": 2.8,
          "bio": "תיאור קצר",
          "profileUrl": "",
          "profilePicUrl": ""
        },
        {
          "name": "שם משפיען מוצע 3",
          "username": "@username3",
          "categories": ["קטגוריה"],
          "followers": 25000,
          "engagementRate": 5.0,
          "bio": "תיאור קצר",
          "profileUrl": "",
          "profilePicUrl": ""
        }
      ],
      "influencerStrategy": "הסבר לאסטרטגיית בחירת המשפיענים - מיקס של מאקרו/מיקרו, למה הקטגוריות האלה, מה הציפיות",
      "influencerCriteria": ["מעורבות מינימלית 2%", "קהל ישראלי 60%+", "התאמה לערכי המותג", "ניסיון בתוכן ספונסרי"]
    }
  }
}

## חשוב מאוד:
- כל שדה חייב להיות מלא ועשיר - לא משפטים קצרים חסרי תוכן
- התובנה חייבת להיות חדה, ספציפית למותג, ולא גנרית
- האסטרטגיה חייבת להיות ישימה ולא "עוד אסטרטגיית משפיענים"
- הקריאייטיב חייב להיות מקורי ומותאם למותג
- חישובי המדיה חייבים להיות הגיוניים ומבוססים על תקציב אמיתי
- המשפיענים המוצעים צריכים להיות סוגי פרופילים רלוונטיים (לא חייבים להיות אנשים אמיתיים)
- אם תקציב לא ידוע - העריך לפי סוג הקמפיין והתעשייה
- אם מטרות לא צוינו - הציע מטרות מתאימות לפי התעשייה והמותג
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
