/**
 * Gemini Deep Brand Research Service
 * Multi-Agent approach: Targeted Google Searches -> Context Synthesis -> JSON Output
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { parseGeminiJson } from '../utils/json-cleanup'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Only gemini-3.1-pro-preview — never use other model families
const AGENT_MODEL = 'gemini-3.1-pro-preview'
const SYNTHESIS_MODEL = 'gemini-3.1-pro-preview'

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
  companyDescription: string
  historyHighlights: string[]
  businessModel: string
  
  // Market Position
  marketPosition: string
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
  brandPersonality: string[]
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

  // Competitive Campaign Intelligence (new)
  competitorCampaigns: {
    competitorName: string
    campaignDescription: string
    influencersUsed?: string[]
    whatWorked?: string
    opportunityForBrand?: string
  }[]
  competitiveGap?: string  // מה המותג "פספס" לעומת מתחריו

  // Brand Safety & Israeli Market (new)
  brandSafetyFlags: string[]       // הגבלות רגולטוריות (אם יש)
  dominantPlatformInIsrael?: string // אינסטגרם/טיקטוק/פייסבוק לקהל הספציפי
  whyNowTrigger?: string           // הרגע העסקי שמניע את הקמפיין
  israeliMarketContext?: string    // הקשר שוק ישראלי ספציפי

  // Sources
  sources: { title: string; url: string }[]

  // Confidence
  confidence: 'high' | 'medium' | 'low'
  researchNotes?: string
}

export interface ScrapedWebsite {
  url: string
  title: string
  description: string
  headings: string[]
  paragraphs: string[]
  socialLinks: string[]
}

export interface ResearchAngle {
  name: string
  description: string
  label: string // Hebrew label for UI
}

/**
 * Research angles — exported so client can show per-angle progress labels
 */
export function getResearchAngles(brandName: string): ResearchAngle[] {
  return [
    {
      name: "History and Business Profile",
      label: "היסטוריה ופרופיל עסקי",
      description: "היסטוריה של המותג, שנת הקמה, מיקום מטה, מייסדים, חזון, מודל עסקי ומוצרים/שירותים מרכזיים."
    },
    {
      name: "Market and Competitors",
      label: "שוק ומתחרים",
      description: "מתחרים ישירים ועקיפים, פוזיציה בשוק (האם הם פרימיום/תקציב?), יתרונות תחרותיים (USP) ונתח שוק."
    },
    {
      name: "Target Audience",
      label: "קהל יעד",
      description: "מי קהל היעד? דמוגרפיה (גיל, מגדר), רמה סוציואקונומית, תחומי עניין, כאבים שהמותג פותר והתנהגות צרכנים."
    },
    {
      name: "Digital and Marketing",
      label: "דיגיטל ושיווק",
      description: "נוכחות בדיגיטל וברשתות חברתיות (אינסטגרם, פייסבוק, טיקטוק - הערכת עוקבים ומעורבות), קמפיינים קודמים, שימוש במשפיענים ומוניטין ציבורי."
    },
    {
      name: "Industry Trends",
      label: "מגמות תעשייה",
      description: "מגמות וטרנדים בתעשייה שבה המותג פועל, עונתיות ותאריכי מפתח שיווקיים רלוונטיים."
    },
    {
      name: "Competitive Campaign Intelligence",
      label: "קמפיינים תחרותיים",
      description: `מה מתחרי המותג "${brandName}" עשו בקמפיינים שיווקיים ובמיוחד קמפיינים עם משפיענים ב-6-12 חודשים האחרונים? עם אילו משפיענים עבדו? אילו מסרים הובילו? מה נראה שעבד ומה לא? מה הרגעים השיווקיים שהמותג "פספס" לעומת מתחריו?`
    },
    {
      name: "Brand Safety and Israeli Market Fit",
      label: "בטיחות ושוק ישראלי",
      description: `האם המותג "${brandName}" פועל בתחום מוסדר בישראל? (פארמה, אלכוהול, מוצרי ילדים, פיננסים, מזון עם טענות בריאות). מהן ההגבלות הספציפיות? באיזו פלטפורמה הקהל הספציפי בישראל הכי פעיל? האם יש "רגע" עסקי מיוחד עכשיו?`
    }
  ]
}

/**
 * Run a single research agent — exported for per-angle client orchestration
 */
export async function runSingleAgent(
  brandName: string,
  angleName: string,
  angleDescription: string
): Promise<{ angle: string; data: string }> {
  console.log(`[Research Agent] Starting search for angle: ${angleName}`)

  const prompt = `
אתה חוקר מידע עסקי בכיר. בצע חיפוש עמוק ועדכני ב-Google על המותג "${brandName}", והתמקד **אך ורק** בנושא הבא:
${angleDescription}

הנחיות:
1. בצע חיפושים ממוקדים כדי למצוא נתונים עדכניים, כתבות, סקירות ודוחות.
2. סכם את כל המידע שמצאת בצורה מפורטת מאוד (לפחות 3-4 פסקאות).
3. כלול נתונים מספריים, שמות ספציפיים וציטוטים אם מצאת.
4. ציין את המקורות (URLs) עליהם התבססת בסוף הסיכום.
5. אם לא מצאת מידע כלל על נושא מסוים, ציין במפורש "לא מצאתי מידע על כך ברשת".
  `

  // No internal timeout — each agent runs in its own Lambda with maxDuration=600
  try {
    const response = await ai.models.generateContent({
      model: AGENT_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })
    return { angle: angleName, data: response.text || `לא נאסף מידע עבור: ${angleName}` }
  } catch (error) {
    console.error(`[Research Agent Error] Failed to gather data for angle: ${angleName}`, error)
    return { angle: angleName, data: `שגיאה באיסוף מידע.` }
  }
}

/**
 * Synthesize gathered agent data into a structured BrandResearch object.
 * Exported for use in /api/research/synthesize route.
 */
export async function synthesizeResearch(
  brandName: string,
  gatheredData: { angle: string; data: string }[],
  websiteData?: ScrapedWebsite
): Promise<BrandResearch> {
  console.log(`[Gemini Deep Research] Synthesizing ${gatheredData.length} agent results for: ${brandName}`)

  let rawLogsContent = ''
  gatheredData.forEach(result => {
    // Limit each agent result to 1200 chars to keep total prompt manageable and avoid Gemini 499 cancellation
    const truncated = result.data.length > 1200 ? result.data.slice(0, 1200) + '...[קוצר]' : result.data
    rawLogsContent += `\n--- ANGLE: ${result.angle} ---\n${truncated}\n`
  })

  const websiteContext = websiteData ? `
## מידע שחולץ מהאתר הרשמי:
- כתובת: ${websiteData.url}
- כותרת: ${websiteData.title}
- תיאור: ${websiteData.description}
- רשתות חברתיות שנמצאו: ${websiteData.socialLinks.join(', ')}
- תוכן מהאתר:
${websiteData.paragraphs.slice(0, 15).join('\n')}
` : ''

  const synthesisPrompt = `
אתה אסטרטג מותגים וחוקר שוק בכיר. המשימה שלך היא לבנות דוח מחקר עומק מקיף וקפדני על המותג "${brandName}".

להלן כל המידע הגולמי שנאסף על ידי סוכני המחקר שלנו מרחבי הרשת:
${rawLogsContent}

${websiteContext}

## הנחיות לסינתזה:
1. התבסס **אך ורק** על המידע הגולמי שסופק לך למעלה (ומהאתר הרשמי אם יש).
2. הצלב את הנתונים וצור תמונה עסקית מלאה, הגיונית ומעמיקה.
3. כתוב פסקאות מלאות ועשירות, במיוחד בתיאור החברה, קהל היעד והצעת הערך.
4. **אמינות היא מעל הכל!** אל תמציא מידע. אם נתון מסוים חסר לחלוטין במידע שנאסף, כתוב "לא נמצא מידע בסריקה".
5. אסוף את כל המקורות (URLs) שהסוכנים ציינו במידע הגולמי והכנס אותם לשדה ה-sources.

החזר JSON מפורט בלבד, לפי המבנה המדויק הבא:
\`\`\`json
{
  "brandName": "שם המותג בעברית",
  "officialName": "השם הרשמי באנגלית",
  "tagline": "הסלוגן של המותג (אם נמצא)",
  "industry": "תעשייה ראשית",
  "subIndustry": "תת-תעשייה",
  "founded": "שנת הקמה",
  "headquarters": "מיקום המטה",
  "website": "כתובת האתר",
  "companyDescription": "תיאור מקיף של החברה ב-3-5 פסקאות...",
  "historyHighlights": ["אירוע 1", "אירוע 2"],
  "businessModel": "תיאור המודל העסקי",
  "marketPosition": "פסקה מפורטת על הפוזיציה בשוק...",
  "marketShare": "נתח שוק אם ידוע",
  "competitors": [{ "name": "שם מתחרה", "description": "תיאור", "differentiator": "מה מבדיל" }],
  "uniqueSellingPoints": ["יתרון 1", "יתרון 2"],
  "competitiveAdvantages": ["יתרון תחרותי 1"],
  "mainProducts": [{ "name": "שם מוצר", "description": "תיאור", "targetMarket": "קהל יעד למוצר" }],
  "pricePositioning": "budget/mid-range/premium/luxury",
  "targetDemographics": {
    "primaryAudience": {
      "gender": "פירוט מגדר",
      "ageRange": "טווח גילאים",
      "socioeconomic": "רמה סוציו-אקונומית",
      "lifestyle": "תיאור אורח החיים",
      "interests": ["עניין 1"],
      "painPoints": ["כאב 1"],
      "aspirations": ["שאיפה 1"]
    },
    "behavior": "תיאור התנהגות צרכנים",
    "purchaseDrivers": ["מניע 1"]
  },
  "brandPersonality": ["תכונה 1"],
  "brandValues": ["ערך 1"],
  "brandPromise": "הבטחת המותג",
  "toneOfVoice": "תיאור הטון",
  "visualIdentity": { "primaryColors": ["#XXXXXX"], "style": "תיאור הסגנון", "moodKeywords": ["מילה 1"] },
  "socialPresence": {
    "instagram": { "handle": "", "followers": "", "engagement": "", "contentStyle": "" },
    "tiktok": { "handle": "", "followers": "", "contentStyle": "" }
  },
  "websiteTraffic": "הערכה אם קיימת",
  "onlineReputation": "תיאור המוניטין",
  "previousCampaigns": [{ "name": "שם קמפיין", "description": "תיאור", "results": "תוצאות" }],
  "influencerTypes": ["סוג 1"],
  "contentThemes": ["נושא 1"],
  "suggestedApproach": "פסקה מפורטת על אסטרטגיה",
  "recommendedGoals": ["מטרה 1"],
  "potentialChallenges": ["אתגר 1"],
  "industryTrends": ["טרנד 1"],
  "seasonality": "תיאור עונתיות",
  "keyDates": ["תאריך 1"],
  "competitorCampaigns": [
    {
      "competitorName": "שם מתחרה",
      "campaignDescription": "תיאור הקמפיין שעשו",
      "influencersUsed": ["@handle1"],
      "whatWorked": "מה עבד להם",
      "opportunityForBrand": "איך המותג שלנו יכול לנצח אותם בדיוק בנקודה הזו"
    }
  ],
  "competitiveGap": "פסקה: מה המותג מפסיד לעומת מתחריו בזירת הדיגיטל/משפיענים — ומה ההזדמנות",
  "brandSafetyFlags": ["הגבלה 1 אם קיימת"],
  "dominantPlatformInIsrael": "אינסטגרם / טיקטוק / פייסבוק — עם הסבר קצר",
  "whyNowTrigger": "מה הרגע העסקי שמניע את הצורך בקמפיין עכשיו",
  "israeliMarketContext": "הקשר ייחודי של השוק הישראלי לתחום המותג",
  "sources": [{ "title": "תיאור המקור", "url": "URL" }],
  "confidence": "high/medium/low",
  "researchNotes": "הערות על איכות המידע שנאסף"
}
\`\`\`
`

  try {
    const response = await ai.models.generateContent({
      model: SYNTHESIS_MODEL,
      contents: synthesisPrompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 8000,
      }
    })

    const text = response.text || ''
    console.log('[Gemini Deep Research] Parsing final generated JSON...')

    const research = parseGeminiJson<BrandResearch>(text)
    console.log(`[Gemini Deep Research] Complete. Confidence: ${research.confidence}`)
    console.log(`[Gemini Deep Research] Found ${research.competitors?.length || 0} competitors, ${research.sources?.length || 0} sources`)

    return research
  } catch (error) {
    console.error('[Gemini Deep Research] Error during synthesis:', error)
    return getMinimalResearch(brandName, websiteData)
  }
}

/**
 * Deep research a brand using multi-phase Google Search grounding.
 * Convenience wrapper that runs all agents + synthesis in one call.
 * For Vercel-safe usage, use runSingleAgent() + synthesizeResearch() separately from the client.
 */
export async function researchBrand(
  brandName: string,
  websiteData?: ScrapedWebsite
): Promise<BrandResearch> {
  console.log(`[Gemini Deep Research] Starting comprehensive multi-phase research for: ${brandName}`)

  const researchAngles = getResearchAngles(brandName)
  console.log(`[Gemini Deep Research] Executing ${researchAngles.length} targeted search agents in parallel...`);
  
  const gatheredData = await Promise.all(
    researchAngles.map((angle: ResearchAngle) => runSingleAgent(brandName, angle.name, angle.description))
  )

  // Log raw results
  console.log(`\n========== RAW RESEARCH LOGS FOR: ${brandName} ==========`)
  gatheredData.forEach((result: { angle: string; data: string }) => {
    console.log(`\n--- ANGLE: ${result.angle} ---\n${result.data}\n`)
  })
  console.log(`=========================================================\n`)

  console.log(`[Gemini Deep Research] Data gathering complete. Synthesizing...`)
  return synthesizeResearch(brandName, gatheredData, websiteData)
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
    
    companyDescription: `${brandName} הוא מותג. נדרש מחקר נוסף לקבלת מידע מפורט יותר.`,
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

    competitorCampaigns: [],
    brandSafetyFlags: [],

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
      model: AGENT_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
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
      description: `${brandName} הוא מותג`,
      industry: 'לא ידוע',
      targetAudience: 'צרכנים',
      toneOfVoice: 'מקצועי',
    }
  }
}