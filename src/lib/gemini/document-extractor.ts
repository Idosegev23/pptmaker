/**
 * AI Document Extractor
 * Uses Gemini to extract structured proposal data from client brief + kickoff documents
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { parseGeminiJson } from '../utils/json-cleanup'
import type { ExtractedBriefData } from '@/types/brief'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3.1-pro-preview'

/**
 * Extract structured data from uploaded documents
 */
export async function extractFromDocuments(
  clientBriefText: string,
  kickoffText?: string
): Promise<ExtractedBriefData> {
  const extractorId = `extractor-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n[${extractorId}] 🧠 DOCUMENT EXTRACTOR - START`)
  console.log(`[${extractorId}] 📄 Client brief: ${clientBriefText.length} chars`)
  if (kickoffText) {
    console.log(`[${extractorId}] 📄 Kickoff doc: ${kickoffText.length} chars`)
  } else {
    console.log(`[${extractorId}] 📄 Kickoff doc: not provided`)
  }

  const prompt = buildExtractionPrompt(clientBriefText, kickoffText)
  console.log(`[${extractorId}] 📝 Prompt length: ${prompt.length} chars`)

  // Validate inputs
  if (!clientBriefText || clientBriefText.trim().length < 20) {
    console.error(`[${extractorId}] ❌ Brief text too short: ${clientBriefText?.trim().length || 0} chars (min 20)`)
    throw new Error('טקסט הבריף קצר מדי לניתוח. ודא שהמסמך נקרא בהצלחה.')
  }

  try {
    console.log(`[${extractorId}] 🔄 Calling ${MODEL} with JSON mime type + HIGH thinking...`)
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
    console.log(`[${extractorId}] ✅ Gemini responded in ${geminiTime}ms`)
    console.log(`[${extractorId}] 📊 Response size: ${text.length} chars`)
    console.log(`[${extractorId}] 📝 Response preview: ${text.slice(0, 300).replace(/\n/g, ' ')}`)

    if (!text) {
      console.error(`[${extractorId}] ❌ Gemini returned empty response`)
      throw new Error('Gemini returned empty response')
    }

    console.log(`[${extractorId}] 🔄 Parsing JSON response...`)
    const parseStart = Date.now()
    const extracted = parseGeminiJson<ExtractedBriefData>(text)
    console.log(`[${extractorId}] ✅ JSON parsed in ${Date.now() - parseStart}ms`)

    // Log extracted data summary
    console.log(`[${extractorId}] 📊 Extracted data summary:`)
    console.log(`[${extractorId}]   Brand: ${extracted.brand?.name || 'NOT FOUND'}`)
    console.log(`[${extractorId}]   Official name: ${extracted.brand?.officialName || 'N/A'}`)
    console.log(`[${extractorId}]   Industry: ${extracted.brand?.industry || 'N/A'}`)
    console.log(`[${extractorId}]   Background: ${extracted.brand?.background?.slice(0, 100) || 'N/A'}`)
    console.log(`[${extractorId}]   Budget: ${extracted.budget?.amount || 0} ${extracted.budget?.currency || '₪'}`)
    console.log(`[${extractorId}]   Goals: [${extracted.campaignGoals?.join(', ') || 'none'}]`)
    console.log(`[${extractorId}]   Target: ${extracted.targetAudience?.primary?.gender || 'N/A'} ${extracted.targetAudience?.primary?.ageRange || ''}`)
    console.log(`[${extractorId}]   Key insight: ${extracted.keyInsight?.slice(0, 80) || 'none'}`)
    console.log(`[${extractorId}]   Strategy: ${extracted.strategyDirection?.slice(0, 80) || 'none'}`)
    console.log(`[${extractorId}]   Creative: ${extracted.creativeDirection?.slice(0, 80) || 'none'}`)
    console.log(`[${extractorId}]   Deliverables: ${extracted.deliverables?.length || 0}`)
    console.log(`[${extractorId}]   Influencer prefs: ${extracted.influencerPreferences?.types?.join(', ') || 'none'}`)
    console.log(`[${extractorId}]   Timeline: ${extracted.timeline?.duration || 'N/A'}`)

    // Validate and set defaults
    console.log(`[${extractorId}] 🔄 Validating and normalizing...`)
    const result = validateAndNormalize(extracted, !!kickoffText)
    console.log(`[${extractorId}] ✅ Validation complete`)
    console.log(`[${extractorId}]   Confidence: ${result._meta?.confidence}`)
    console.log(`[${extractorId}]   Warnings: [${result._meta?.warnings?.join(', ') || 'none'}]`)
    console.log(`[${extractorId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)

    return result
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const elapsed = Date.now() - startTime
    console.error(`[${extractorId}] ❌ Extraction failed after ${elapsed}ms:`, errMsg)

    // Don't retry if input validation failed
    if (errMsg.includes('קצר מדי')) {
      throw error
    }

    // Try with less strict settings (no JSON mime type constraint)
    try {
      console.log(`[${extractorId}] 🔄 RETRY - calling ${MODEL} without responseMimeType constraint...`)
      const retryStart = Date.now()
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {},
      })

      const retryTime = Date.now() - retryStart
      const text = response.text || ''
      console.log(`[${extractorId}] ✅ Retry Gemini responded in ${retryTime}ms`)
      console.log(`[${extractorId}] 📊 Retry response size: ${text.length} chars`)
      console.log(`[${extractorId}] 📝 Retry response preview: ${text.slice(0, 300).replace(/\n/g, ' ')}`)

      if (!text) {
        console.error(`[${extractorId}] ❌ Retry: Gemini returned empty response`)
        throw new Error('Gemini returned empty response on retry')
      }

      console.log(`[${extractorId}] 🔄 Parsing retry JSON response...`)
      const extracted = parseGeminiJson<ExtractedBriefData>(text)
      const result = validateAndNormalize(extracted, !!kickoffText)
      console.log(`[${extractorId}] ✅ Retry succeeded`)
      console.log(`[${extractorId}]   Brand: ${result.brand?.name || 'NOT FOUND'}`)
      console.log(`[${extractorId}]   Confidence: ${result._meta?.confidence}`)
      console.log(`[${extractorId}] ⏱️ TOTAL TIME (with retry): ${Date.now() - startTime}ms`)
      return result
    } catch (retryError) {
      const retryMsg = retryError instanceof Error ? retryError.message : String(retryError)
      console.error(`[${extractorId}] ❌ Retry also failed:`, retryMsg)
      console.error(`[${extractorId}] ❌ Stack:`, retryError instanceof Error ? retryError.stack : 'N/A')
      console.error(`[${extractorId}] ⏱️ TOTAL TIME (failed): ${Date.now() - startTime}ms`)
      throw new Error(`שגיאה בחילוץ מידע מהמסמכים: ${retryMsg}`)
    }
  }
}

function buildExtractionPrompt(clientBriefText: string, kickoffText?: string): string {
  return `
אתה מומחה אסטרטגי בכיר בסוכנות שיווק משפיענים מובילה. קיבלת מסמכים לניתוח:

## מסמך 1: בריף לקוח (Client Brief)
${clientBriefText}

${kickoffText ? `## מסמך 2: מסמך התנעה פנימי (Kickoff Notes)
${kickoffText}` : '(לא סופק מסמך התנעה)'}

## המשימה שלך:
נתח את המסמכים וחלץ מידע מובנה לצורך בניית הצעת מחיר לקמפיין משפיענים.

## כללים חשובים:
1. חלץ רק מידע שמופיע במסמכים - אל תמציא נתונים
2. אם מידע חסר, השאר שדה ריק (מחרוזת ריקה), null, או מערך ריק
3. תקציב: חייב להיות מספר. אם כתוב "50K" תרגם ל-50000. אם כתוב "50 אלף" תרגם ל-50000
4. מטרות: חלץ את המטרות כפי שכתובות. אם מתאימות, תרגם לקטגוריות: מודעות, חינוך שוק, נוכחות דיגיטלית, נחשקות ו-FOMO, הנעה למכר, השקת מוצר, חיזוק נאמנות
5. קהל יעד: חלץ דמוגרפיה ספציפית אם קיימת
6. אם יש מידע סותר בין המסמכים - מסמך ההתנעה גובר (כי הוא מאוחר יותר)
7. תובנה (keyInsight): חלץ רק אם מופיעה במפורש תובנה אסטרטגית מבוססת מחקר
8. כיוון אסטרטגי: חלץ כיוון אסטרטגי שנדון אם קיים
9. כיוון קריאייטיבי: חלץ כיוון קריאייטיבי שנדון אם קיים

## פורמט הפלט (JSON):
{
  "brand": {
    "name": "שם המותג",
    "officialName": "שם רשמי באנגלית אם ידוע, אחרת null",
    "background": "תיאור/רקע המותג - מה שכתוב במסמכים. פסקה אחת עד שתיים",
    "industry": "תעשייה/קטגוריה",
    "subIndustry": "תת-קטגוריה אם רלוונטי, אחרת null",
    "website": "כתובת אתר אם מופיעה, אחרת null",
    "tagline": "סלוגן אם מופיע, אחרת null"
  },
  "budget": {
    "amount": 0,
    "currency": "₪",
    "breakdown": "פירוט תקציב אם קיים, אחרת null"
  },
  "campaignGoals": ["מטרה 1", "מטרה 2"],
  "targetAudience": {
    "primary": {
      "gender": "נשים/גברים/שניהם",
      "ageRange": "25-34",
      "socioeconomic": "בינוני-גבוה, או null אם לא צוין",
      "lifestyle": "תיאור אורח חיים, או null",
      "interests": ["תחום 1", "תחום 2"],
      "painPoints": ["כאב/צורך 1", "כאב/צורך 2"]
    },
    "secondary": null,
    "behavior": "תיאור התנהגות צרכנית, או null אם לא צוין"
  },
  "keyInsight": "התובנה המרכזית אם קיימת, אחרת null",
  "insightSource": "מקור התובנה (מחקר, סקר, נתון) אם צוין, אחרת null",
  "strategyDirection": "כיוון אסטרטגי שנדון, או null",
  "creativeDirection": "כיוון קריאייטיבי שנדון, או null",
  "deliverables": [
    { "type": "סוג תוצר (רילז/סטוריז/טיקטוק/פוסט)", "quantity": null, "description": "תיאור אם צוין" }
  ],
  "influencerPreferences": {
    "types": ["מיקרו", "מאקרו"],
    "specificNames": ["שם ספציפי שהוזכר"],
    "criteria": ["קריטריון בחירה"],
    "verticals": ["אופנה", "לייפסטייל"]
  },
  "timeline": {
    "startDate": "תאריך אם צוין, אחרת null",
    "endDate": "תאריך אם צוין, אחרת null",
    "duration": "משך הקמפיין אם צוין (למשל: 3 חודשים), אחרת null",
    "milestones": ["שלב 1", "שלב 2"]
  },
  "additionalNotes": ["הערה חשובה שלא נכנסת לקטגוריות אחרות"],
  "_meta": {
    "confidence": "high/medium/low",
    "clientBriefProcessed": true,
    "kickoffDocProcessed": true,
    "warnings": ["רשימת אזהרות - למשל: תקציב לא נמצא במסמכים"],
    "extractionNotes": "הערות על איכות החילוץ"
  }
}
`
}

function validateAndNormalize(
  data: ExtractedBriefData,
  hasKickoff: boolean
): ExtractedBriefData {
  const warnings: string[] = data._meta?.warnings || []

  // Ensure brand exists
  if (!data.brand?.name) {
    warnings.push('שם המותג לא נמצא במסמכים - נדרש קלט ידני')
    data.brand = {
      name: '',
      background: data.brand?.background || '',
      industry: data.brand?.industry || '',
    }
  }

  // Validate budget
  if (!data.budget?.amount || data.budget.amount <= 0) {
    warnings.push('תקציב לא נמצא במסמכים - נדרש קלט ידני')
    data.budget = {
      amount: 0,
      currency: data.budget?.currency || '₪',
      breakdown: data.budget?.breakdown,
    }
  }

  // Ensure arrays exist
  data.campaignGoals = data.campaignGoals || []
  data.additionalNotes = data.additionalNotes || []

  // Ensure target audience structure
  if (!data.targetAudience?.primary) {
    warnings.push('קהל יעד לא נמצא במסמכים - נדרש קלט ידני')
    data.targetAudience = {
      primary: {
        gender: '',
        ageRange: '',
        interests: [],
        painPoints: [],
      },
    }
  }

  // Ensure deliverables array
  data.deliverables = data.deliverables || []

  // Ensure influencer preferences
  data.influencerPreferences = data.influencerPreferences || {}

  // Ensure timeline
  data.timeline = data.timeline || {}

  // Set meta
  data._meta = {
    confidence: data._meta?.confidence || 'medium',
    clientBriefProcessed: true,
    kickoffDocProcessed: hasKickoff,
    warnings,
    extractionNotes: data._meta?.extractionNotes,
  }

  return data
}
