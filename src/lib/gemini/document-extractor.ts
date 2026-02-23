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
  console.log('[Document Extractor] Starting extraction...')
  console.log(`[Document Extractor] Client brief: ${clientBriefText.length} chars`)
  if (kickoffText) {
    console.log(`[Document Extractor] Kickoff doc: ${kickoffText.length} chars`)
  }

  const prompt = buildExtractionPrompt(clientBriefText, kickoffText)

  // Validate inputs
  if (!clientBriefText || clientBriefText.trim().length < 20) {
    throw new Error('טקסט הבריף קצר מדי לניתוח. ודא שהמסמך נקרא בהצלחה.')
  }

  try {
    console.log(`[Document Extractor] Calling ${MODEL}...`)
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    })

    const text = response.text || ''
    console.log(`[Document Extractor] Response: ${text.length} chars`)

    if (!text) {
      throw new Error('Gemini returned empty response')
    }

    const extracted = parseGeminiJson<ExtractedBriefData>(text)

    // Validate and set defaults
    return validateAndNormalize(extracted, !!kickoffText)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Document Extractor] Extraction failed:', errMsg)

    // Don't retry if input validation failed
    if (errMsg.includes('קצר מדי')) {
      throw error
    }

    // Try with less strict settings (no JSON mime type constraint)
    try {
      console.log('[Document Extractor] Retrying without responseMimeType constraint...')
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {},
      })

      const text = response.text || ''
      console.log(`[Document Extractor] Retry response: ${text.length} chars`)

      if (!text) {
        throw new Error('Gemini returned empty response on retry')
      }

      const extracted = parseGeminiJson<ExtractedBriefData>(text)
      return validateAndNormalize(extracted, !!kickoffText)
    } catch (retryError) {
      const retryMsg = retryError instanceof Error ? retryError.message : String(retryError)
      console.error('[Document Extractor] Retry also failed:', retryMsg)
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
