/**
 * Gemini Deep Brand Research Service
 * Comprehensive brand research with Google Search grounding
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { parseGeminiJson } from '../utils/json-cleanup'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Use Gemini 3.1 Pro for best research quality
const MODEL = 'gemini-3.1-pro-preview'

export interface BrandResearch {
  // Basic Info
  brandName: string
  officialName: string
  tagline?: string
  industry: string
  subIndustry?: string
  founded: string
  headquarters: string
  website: string
  
  // Company Overview
  companyDescription: string // 3-5 paragraphs
  historyHighlights: string[] // Key milestones
  businessModel: string
  
  // Market Position
  marketPosition: string // Detailed paragraph
  marketShare?: string
  competitors: {
    name: string
    description: string
    differentiator: string
  }[]
  uniqueSellingPoints: string[]
  competitiveAdvantages: string[]
  
  // Products/Services
  mainProducts: {
    name: string
    description: string
    targetMarket?: string
  }[]
  pricePositioning: 'budget' | 'mid-range' | 'premium' | 'luxury'
  
  // Target Audience - Detailed
  targetDemographics: {
    primaryAudience: {
      gender: string
      ageRange: string
      socioeconomic: string
      lifestyle: string
      interests: string[]
      painPoints: string[]
      aspirations: string[]
    }
    secondaryAudience?: {
      gender: string
      ageRange: string
      description: string
    }
    behavior: string
    purchaseDrivers: string[]
  }
  
  // Brand Identity
  brandPersonality: string[] // 5-7 traits
  brandValues: string[]
  brandPromise: string
  toneOfVoice: string
  visualIdentity: {
    primaryColors: string[]
    style: string
    moodKeywords: string[]
  }
  
  // Digital Presence
  socialPresence: {
    instagram?: { handle?: string; followers?: string; engagement?: string; contentStyle?: string }
    facebook?: { followers?: string; engagement?: string }
    tiktok?: { handle?: string; followers?: string; contentStyle?: string }
    youtube?: { subscribers?: string; contentType?: string }
    linkedin?: { followers?: string }
  }
  websiteTraffic?: string
  onlineReputation?: string
  
  // Influencer Marketing Context
  previousCampaigns: {
    name: string
    description: string
    results?: string
  }[]
  influencerTypes: string[]
  contentThemes: string[]
  suggestedApproach: string
  recommendedGoals: string[]
  potentialChallenges: string[]
  
  // Industry Insights
  industryTrends: string[]
  seasonality?: string
  keyDates?: string[]
  
  // Sources
  sources: { title: string; url: string }[]
  
  // Confidence
  confidence: 'high' | 'medium' | 'low'
  researchNotes?: string
}

interface ScrapedWebsite {
  url: string
  title: string
  description: string
  headings: string[]
  paragraphs: string[]
  socialLinks: string[]
}

/**
 * Deep research a brand using Gemini with Google Search grounding
 */
export async function researchBrand(
  brandName: string,
  websiteData?: ScrapedWebsite
): Promise<BrandResearch> {
  console.log(`[Gemini Deep Research] Starting comprehensive research for: ${brandName}`)
  
  const websiteContext = websiteData ? `
## מידע שחולץ מהאתר הרשמי:
- כתובת: ${websiteData.url}
- כותרת: ${websiteData.title}
- תיאור: ${websiteData.description}
- כותרות מהאתר: ${websiteData.headings.slice(0, 15).join(' | ')}
- רשתות חברתיות שנמצאו: ${websiteData.socialLinks.join(', ')}
- תוכן מהאתר: 
${websiteData.paragraphs.slice(0, 10).join('\n')}
` : ''

  const researchPrompt = `
אתה חוקר מותגים בכיר עם 20 שנות ניסיון. בצע מחקר מעמיק ומקיף על המותג "${brandName}".

${websiteContext}

## הנחיות למחקר:
1. חפש מידע עדכני ומדויק ב-Google
2. בדוק את הנוכחות ברשתות החברתיות
3. חפש כתבות, ראיונות, ופרסומים על המותג
4. נתח את הפוזיציה בשוק לעומת מתחרים
5. הבן את קהל היעד לעומק
6. זהה קמפיינים קודמים עם משפיענים

## חשוב מאוד:
- כתוב פסקאות מלאות ומפורטות, לא רק נקודות
- ספק ניתוח מעמיק, לא רק עובדות יבשות
- התבסס על מקורות אמיתיים
- אם אין מידע, ציין "לא נמצא מידע" ולא להמציא

## החזר JSON מפורט בפורמט הבא:
\`\`\`json
{
  "brandName": "שם המותג בעברית",
  "officialName": "השם הרשמי באנגלית",
  "tagline": "הסלוגן של המותג",
  "industry": "תעשייה ראשית",
  "subIndustry": "תת-תעשייה",
  "founded": "שנת הקמה",
  "headquarters": "מיקום המטה",
  "website": "כתובת האתר",
  
  "companyDescription": "תיאור מקיף של החברה ב-3-5 פסקאות. כלול את ההיסטוריה, מה החברה עושה, מה מייחד אותה, ומה החזון שלה. זה צריך להיות תיאור עשיר שנותן תמונה מלאה על המותג.",
  
  "historyHighlights": [
    "אירוע משמעותי 1 עם שנה",
    "אירוע משמעותי 2 עם שנה",
    "אירוע משמעותי 3 עם שנה"
  ],
  
  "businessModel": "תיאור המודל העסקי - B2B, B2C, DTC, קמעונאות וכו'",
  
  "marketPosition": "פסקה מפורטת על הפוזיציה בשוק. איפה המותג עומד ביחס למתחרים? מה נתח השוק? מה הייחודיות? מה החוזקות והחולשות?",
  
  "marketShare": "נתח שוק אם ידוע (למשל: 15% משוק הקוסמטיקה בישראל)",
  
  "competitors": [
    {
      "name": "שם מתחרה 1",
      "description": "תיאור קצר של המתחרה",
      "differentiator": "מה מבדיל אותו מהמותג שלנו"
    },
    {
      "name": "שם מתחרה 2",
      "description": "תיאור קצר",
      "differentiator": "מה מבדיל אותו"
    },
    {
      "name": "שם מתחרה 3",
      "description": "תיאור קצר",
      "differentiator": "מה מבדיל אותו"
    }
  ],
  
  "uniqueSellingPoints": [
    "יתרון ייחודי 1 - עם הסבר",
    "יתרון ייחודי 2 - עם הסבר",
    "יתרון ייחודי 3 - עם הסבר"
  ],
  
  "competitiveAdvantages": [
    "יתרון תחרותי 1",
    "יתרון תחרותי 2"
  ],
  
  "mainProducts": [
    {
      "name": "שם מוצר/שירות 1",
      "description": "תיאור מפורט",
      "targetMarket": "לאיזה קהל מיועד"
    },
    {
      "name": "שם מוצר/שירות 2",
      "description": "תיאור מפורט",
      "targetMarket": "לאיזה קהל מיועד"
    }
  ],
  
  "pricePositioning": "budget/mid-range/premium/luxury",
  
  "targetDemographics": {
    "primaryAudience": {
      "gender": "נשים/גברים/שניהם - עם פירוט",
      "ageRange": "טווח גילאים מדויק",
      "socioeconomic": "רמה סוציו-אקונומית מפורטת",
      "lifestyle": "תיאור אורח החיים - עבודה, משפחה, פנאי",
      "interests": ["תחום עניין 1", "תחום עניין 2", "תחום עניין 3", "תחום עניין 4"],
      "painPoints": ["כאב 1 שהמותג פותר", "כאב 2", "כאב 3"],
      "aspirations": ["שאיפה 1", "שאיפה 2"]
    },
    "secondaryAudience": {
      "gender": "מגדר",
      "ageRange": "טווח גילאים",
      "description": "תיאור קהל משני"
    },
    "behavior": "תיאור מפורט של התנהגות הצרכנים - איך הם מחפשים, איפה קונים, מה משפיע על ההחלטה שלהם",
    "purchaseDrivers": ["גורם 1 שמניע לרכישה", "גורם 2", "גורם 3"]
  },
  
  "brandPersonality": ["תכונה 1", "תכונה 2", "תכונה 3", "תכונה 4", "תכונה 5"],
  
  "brandValues": ["ערך 1", "ערך 2", "ערך 3", "ערך 4"],
  
  "brandPromise": "מה המותג מבטיח ללקוחות שלו - משפט או שניים",
  
  "toneOfVoice": "תיאור מפורט של הטון - רשמי/צעיר/מקצועי/ידידותי/פרימיום וכו', עם דוגמאות",
  
  "visualIdentity": {
    "primaryColors": ["#XXXXXX", "#XXXXXX"],
    "style": "תיאור הסגנון הויזואלי - מינימליסטי, צבעוני, קלאסי וכו'",
    "moodKeywords": ["מילת מפתח 1", "מילת מפתח 2", "מילת מפתח 3"]
  },
  
  "socialPresence": {
    "instagram": {
      "handle": "@username",
      "followers": "מספר עוקבים",
      "engagement": "אחוז מעורבות משוער",
      "contentStyle": "תיאור סגנון התוכן"
    },
    "facebook": {
      "followers": "מספר עוקבים",
      "engagement": "סוג התוכן והמעורבות"
    },
    "tiktok": {
      "handle": "@username",
      "followers": "מספר עוקבים",
      "contentStyle": "סגנון התוכן"
    }
  },
  
  "websiteTraffic": "הערכת כמות תנועה חודשית אם זמין",
  "onlineReputation": "תיאור המוניטין הדיגיטלי - ביקורות, דירוגים, תפיסה ציבורית",
  
  "previousCampaigns": [
    {
      "name": "שם קמפיין קודם",
      "description": "תיאור הקמפיין ומשפיענים שהשתתפו",
      "results": "תוצאות אם ידועות"
    }
  ],
  
  "influencerTypes": [
    "סוג משפיען מומלץ 1 עם הסבר למה",
    "סוג משפיען מומלץ 2 עם הסבר"
  ],
  
  "contentThemes": [
    "נושא תוכן מומלץ 1",
    "נושא תוכן מומלץ 2",
    "נושא תוכן מומלץ 3"
  ],
  
  "suggestedApproach": "פסקה מפורטת עם הצעה אסטרטגית לגישה השיווקית עם משפיענים. מה הכיוון? מה הטון? מה סוג התוכן?",
  
  "recommendedGoals": [
    "מטרה מומלצת 1 - עם הסבר",
    "מטרה מומלצת 2 - עם הסבר",
    "מטרה מומלצת 3 - עם הסבר"
  ],
  
  "potentialChallenges": [
    "אתגר פוטנציאלי 1 שיש לקחת בחשבון",
    "אתגר פוטנציאלי 2"
  ],
  
  "industryTrends": [
    "טרנד 1 בתעשייה שרלוונטי למותג",
    "טרנד 2",
    "טרנד 3"
  ],
  
  "seasonality": "האם יש עונתיות? מתי התקופות החזקות/חלשות?",
  
  "keyDates": ["תאריך חשוב 1", "תאריך חשוב 2"],
  
  "sources": [
    { "title": "שם המקור 1", "url": "כתובת 1" },
    { "title": "שם המקור 2", "url": "כתובת 2" }
  ],
  
  "confidence": "high/medium/low",
  "researchNotes": "הערות נוספות על המחקר - מה היה קשה למצוא, מה דורש אימות נוסף"
}
\`\`\`
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: researchPrompt,
      config: {
        tools: [{ googleSearch: {} }, { urlContext: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      }
    })

    const text = response.text || ''
    console.log('[Gemini Deep Research] Response received, parsing...')
    
    // Use JSON cleanup utility for robust parsing
    const research = parseGeminiJson<BrandResearch>(text)
    console.log(`[Gemini Deep Research] Complete. Confidence: ${research.confidence}`)
    console.log(`[Gemini Deep Research] Found ${research.competitors?.length || 0} competitors, ${research.sources?.length || 0} sources`)
    
    return research
  } catch (error) {
    console.error('[Gemini Deep Research] Error:', error)
    
    // Return minimal research on error
    return getMinimalResearch(brandName, websiteData)
  }
}

/**
 * Get minimal research as fallback
 */
function getMinimalResearch(brandName: string, websiteData?: ScrapedWebsite): BrandResearch {
  return {
    brandName: brandName,
    officialName: brandName,
    industry: 'לא ידוע',
    founded: 'לא ידוע',
    headquarters: 'ישראל',
    website: websiteData?.url || '',
    
    companyDescription: `${brandName} הוא מותג ישראלי. נדרש מחקר נוסף לקבלת מידע מפורט יותר.`,
    historyHighlights: [],
    businessModel: 'לא ידוע',
    
    marketPosition: 'נדרש מחקר נוסף',
    competitors: [],
    uniqueSellingPoints: [],
    competitiveAdvantages: [],
    
    mainProducts: [],
    pricePositioning: 'mid-range',
    
    targetDemographics: {
      primaryAudience: {
        gender: 'נשים וגברים',
        ageRange: '25-45',
        socioeconomic: 'בינוני-גבוה',
        lifestyle: 'לא ידוע',
        interests: [],
        painPoints: [],
        aspirations: [],
      },
      behavior: 'לא ידוע',
      purchaseDrivers: [],
    },
    
    brandPersonality: [],
    brandValues: [],
    brandPromise: '',
    toneOfVoice: 'מקצועי',
    visualIdentity: {
      primaryColors: [],
      style: 'לא ידוע',
      moodKeywords: [],
    },
    
    socialPresence: {},
    
    previousCampaigns: [],
    influencerTypes: ['לייפסטייל', 'מומחים בתחום'],
    contentThemes: [],
    suggestedApproach: 'שיתוף פעולה עם משפיענים רלוונטיים לקהל היעד',
    recommendedGoals: ['מודעות', 'חשיפה', 'אמינות'],
    potentialChallenges: [],
    
    industryTrends: [],
    
    sources: [],
    confidence: 'low',
    researchNotes: 'המחקר האוטומטי לא הצליח לאסוף מידע מספק. מומלץ לבצע מחקר ידני נוסף.',
  }
}

/**
 * Quick brand summary (for initial validation)
 */
export async function quickBrandSummary(brandName: string): Promise<{
  description: string
  industry: string
  targetAudience: string
  toneOfVoice: string
}> {
  const prompt = `
ספק סיכום קצר על המותג "${brandName}" בפורמט JSON:
\`\`\`json
{
  "description": "תיאור קצר של המותג (2-3 משפטים)",
  "industry": "תעשייה/קטגוריה",
  "targetAudience": "תיאור קהל היעד",
  "toneOfVoice": "סגנון התקשורת של המותג"
}
\`\`\`
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }, { urlContext: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      }
    })

    const text = response.text || ''
    return parseGeminiJson<{
      description: string
      industry: string
      targetAudience: string
      toneOfVoice: string
    }>(text)
  } catch (error) {
    console.error('[Gemini] Quick summary error:', error)
    return {
      description: `${brandName} הוא מותג ישראלי`,
      industry: 'לא ידוע',
      targetAudience: 'צרכנים ישראליים',
      toneOfVoice: 'מקצועי',
    }
  }
}
