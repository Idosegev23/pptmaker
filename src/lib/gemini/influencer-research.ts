/**
 * Influencer Research Service
 * Uses Gemini to recommend relevant influencers for a brand
 */

import { GoogleGenAI } from '@google/genai'
import type { BrandResearch } from './brand-research'
import { parseGeminiJson } from '../utils/json-cleanup'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Use Gemini 3 Pro for best influencer research quality
const MODEL = 'gemini-3-pro-preview'

export interface InfluencerRecommendation {
  name: string
  handle: string
  platform: 'instagram' | 'tiktok' | 'youtube'
  category: string
  followers: string
  engagement: string
  avgStoryViews?: string // Average story views
  whyRelevant: string
  contentStyle: string
  estimatedCost: string
  profileUrl: string
  profilePicUrl?: string // Added after scraping
}

export interface InfluencerStrategy {
  // Strategy Overview
  strategyTitle: string
  strategySummary: string
  
  // Influencer Tiers
  tiers: {
    name: string // Mega, Macro, Micro, Nano
    description: string
    recommendedCount: number
    budgetAllocation: string
    purpose: string
  }[]
  
  // Recommended Influencers (from research)
  recommendations: InfluencerRecommendation[]
  
  // Content Strategy
  contentThemes: {
    theme: string
    description: string
    examples: string[]
  }[]
  
  // KPIs
  expectedKPIs: {
    metric: string
    target: string
    rationale: string
  }[]
  
  // Timeline
  suggestedTimeline: {
    phase: string
    duration: string
    activities: string[]
  }[]
  
  // Risks
  potentialRisks: {
    risk: string
    mitigation: string
  }[]
}

/**
 * Research and recommend influencers for a brand
 */
export async function researchInfluencers(
  brandResearch: BrandResearch,
  budget: number,
  goals: string[]
): Promise<InfluencerStrategy> {
  console.log(`[Influencer Research] Starting research for ${brandResearch.brandName}`)
  
  const prompt = `
**IMPORTANT: Return ONLY valid JSON. No introductory text, no explanations, just the JSON object.**

אתה מומחה שיווק משפיענים בכיר עם 15 שנות ניסיון בשוק הישראלי.
בצע מחקר מעמיק והמלץ על אסטרטגיית משפיענים עבור המותג.

## פרטי המותג:
- שם: ${brandResearch.brandName}
- תעשייה: ${brandResearch.industry}
- קהל יעד: ${brandResearch.targetDemographics?.primaryAudience?.gender || 'לא ידוע'}, ${brandResearch.targetDemographics?.primaryAudience?.ageRange || '25-45'}
- תחומי עניין של הקהל: ${brandResearch.targetDemographics?.primaryAudience?.interests?.join(', ') || 'לא ידוע'}
- ערכי מותג: ${brandResearch.brandValues?.join(', ') || 'לא ידוע'}
- טון מותג: ${brandResearch.toneOfVoice}
- מתחרים: ${brandResearch.competitors?.map(c => typeof c === 'string' ? c : c.name).join(', ') || 'לא ידוע'}

## תקציב: ${budget.toLocaleString()} ש"ח
## מטרות הקמפיין: ${goals.join(', ')}

## המשימה שלך:
1. חפש משפיענים ישראליים אמיתיים שמתאימים למותג
2. הצע אסטרטגיית שכבות (Mega, Macro, Micro, Nano)
3. הצע נושאי תוכן ספציפיים
4. הגדר KPIs ריאליסטיים
5. תכנן לוח זמנים

## חשוב:
- השתמש בשמות משפיענים ישראליים אמיתיים
- התייחס לשוק הישראלי
- חשב עלויות ריאליסטיות לשוק המקומי

## החזר JSON בפורמט הבא:
\`\`\`json
{
  "strategyTitle": "כותרת האסטרטגיה - קצרה וקולעת",
  "strategySummary": "פסקה של 3-4 משפטים שמסכמת את האסטרטגיה הכללית",
  
  "tiers": [
    {
      "name": "Macro Influencers",
      "description": "משפיענים עם 100K-500K עוקבים",
      "recommendedCount": 2,
      "budgetAllocation": "40%",
      "purpose": "חשיפה רחבה ובניית אמינות"
    },
    {
      "name": "Micro Influencers",
      "description": "משפיענים עם 10K-100K עוקבים",
      "recommendedCount": 4,
      "budgetAllocation": "35%",
      "purpose": "מעורבות גבוהה והמרות"
    },
    {
      "name": "Nano Influencers",
      "description": "משפיענים עם 1K-10K עוקבים",
      "recommendedCount": 8,
      "budgetAllocation": "25%",
      "purpose": "אותנטיות וקהילתיות"
    }
  ],
  
  "recommendations": [
    {
      "name": "שם מלא של המשפיען",
      "handle": "@username",
      "platform": "instagram",
      "category": "לייפסטייל / ספורט / אופנה וכו'",
      "followers": "150K",
      "engagement": "4.5%",
      "avgStoryViews": "25K",
      "whyRelevant": "הסבר למה המשפיען מתאים למותג",
      "contentStyle": "תיאור סגנון התוכן שלו",
      "estimatedCost": "5,000-8,000 ש\"ח לפוסט",
      "profileUrl": "https://instagram.com/username"
    }
  ],
  
  "contentThemes": [
    {
      "theme": "שם הנושא",
      "description": "תיאור מפורט של נושא התוכן",
      "examples": ["דוגמה 1 לתוכן", "דוגמה 2", "דוגמה 3"]
    }
  ],
  
  "expectedKPIs": [
    {
      "metric": "Reach",
      "target": "500,000",
      "rationale": "הסבר למה זה המטרה"
    },
    {
      "metric": "Engagement",
      "target": "25,000",
      "rationale": "הסבר"
    },
    {
      "metric": "CPE",
      "target": "2.5 ש\"ח",
      "rationale": "הסבר"
    }
  ],
  
  "suggestedTimeline": [
    {
      "phase": "הכנה",
      "duration": "שבועיים",
      "activities": ["בחירת משפיענים", "משא ומתן", "בריף"]
    },
    {
      "phase": "ביצוע",
      "duration": "חודש",
      "activities": ["יצירת תוכן", "פרסום", "ניטור"]
    },
    {
      "phase": "סיכום",
      "duration": "שבוע",
      "activities": ["ניתוח תוצאות", "דוח מסכם"]
    }
  ],
  
  "potentialRisks": [
    {
      "risk": "תיאור הסיכון",
      "mitigation": "איך מתמודדים"
    }
  ]
}
\`\`\`

## הנחיות חשובות:
- המלץ על 6-10 משפיענים ספציפיים עם שמות אמיתיים
- התייחס לתקציב בחלוקת השכבות
- הצע KPIs ריאליסטיים לשוק הישראלי

**CRITICAL: Your response must be ONLY the JSON object. Do not write any text before or after the JSON.**
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.4,
      }
    })

    const text = response.text || ''
    console.log('[Influencer Research] Response received')
    
    // Use JSON cleanup utility for robust parsing
    const strategy = parseGeminiJson<InfluencerStrategy>(text)
    console.log(`[Influencer Research] Found ${strategy.recommendations?.length || 0} recommendations`)
    return strategy
  } catch (error) {
    console.error('[Influencer Research] Error:', error)
    return getDefaultStrategy(brandResearch, budget, goals)
  }
}

/**
 * Get quick influencer suggestions (less detailed)
 */
export async function getQuickInfluencerSuggestions(
  industry: string,
  targetAudience: string,
  budget: number
): Promise<InfluencerRecommendation[]> {
  const prompt = `
הצע 5 משפיענים ישראליים מתאימים לקמפיין:
- תעשייה: ${industry}
- קהל יעד: ${targetAudience}
- תקציב: ${budget.toLocaleString()} ש"ח

החזר JSON:
\`\`\`json
[
  {
    "name": "שם מלא",
    "handle": "@username",
    "platform": "instagram",
    "category": "קטגוריה",
    "followers": "100K",
    "engagement": "3.5%",
    "whyRelevant": "למה מתאים",
    "contentStyle": "סגנון",
    "estimatedCost": "X ש\"ח לפוסט",
    "profileUrl": "https://..."
  }
]
\`\`\`
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.5,
      }
    })

    const text = response.text || ''
    return parseGeminiJson<InfluencerRecommendation[]>(text)
  } catch (error) {
    console.error('[Quick Influencer] Error:', error)
    return []
  }
}

/**
 * Default strategy fallback
 */
function getDefaultStrategy(
  brandResearch: BrandResearch,
  budget: number,
  goals: string[]
): InfluencerStrategy {
  return {
    strategyTitle: `אסטרטגיית משפיענים עבור ${brandResearch.brandName}`,
    strategySummary: `אסטרטגיה משולבת הכוללת משפיענים בגדלים שונים להשגת ${goals.join(' ו-')}. 
    הקמפיין יתמקד בתוכן אותנטי שמתחבר לקהל היעד.`,
    
    tiers: [
      {
        name: 'Macro Influencers',
        description: 'משפיענים עם 100K+ עוקבים',
        recommendedCount: 2,
        budgetAllocation: '40%',
        purpose: 'חשיפה ומודעות'
      },
      {
        name: 'Micro Influencers',
        description: 'משפיענים עם 10K-100K עוקבים',
        recommendedCount: 4,
        budgetAllocation: '35%',
        purpose: 'מעורבות והמרות'
      },
      {
        name: 'Nano Influencers',
        description: 'משפיענים עם 1K-10K עוקבים',
        recommendedCount: 6,
        budgetAllocation: '25%',
        purpose: 'אותנטיות וקהילה'
      }
    ],
    
    recommendations: [],
    
    contentThemes: [
      {
        theme: 'שגרה יומית',
        description: 'שילוב המוצר בשגרת היום של המשפיען',
        examples: ['בוקר טוב עם המוצר', 'לפני/אחרי', 'השוואה']
      },
      {
        theme: 'ביקורת אמיתית',
        description: 'חוות דעת כנה על המוצר',
        examples: ['ראשונים לנסות', 'חודש עם המוצר', 'התוצאות']
      }
    ],
    
    expectedKPIs: [
      {
        metric: 'Reach',
        target: Math.round(budget * 5).toLocaleString(),
        rationale: 'לפי CPM ממוצע בשוק'
      },
      {
        metric: 'Engagement',
        target: Math.round(budget / 2.5).toLocaleString(),
        rationale: 'לפי CPE ממוצע'
      }
    ],
    
    suggestedTimeline: [
      {
        phase: 'הכנה',
        duration: '2 שבועות',
        activities: ['בחירת משפיענים', 'חוזים', 'בריף']
      },
      {
        phase: 'ביצוע',
        duration: '4 שבועות',
        activities: ['יצירה', 'פרסום', 'ניטור']
      }
    ],
    
    potentialRisks: [
      {
        risk: 'אי עמידה בדדליינים',
        mitigation: 'תיאום מראש וגמישות בלו"ז'
      }
    ]
  }
}

