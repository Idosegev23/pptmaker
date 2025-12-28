/**
 * Smart Prompt Generator
 * AI generates optimized JSON prompts for image generation
 * Based on the image strategy, creates specific, creative prompts
 */

import { GoogleGenAI } from '@google/genai'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'
import type { ImageStrategy, ImagePlan } from './image-strategist'
import { parseGeminiJson } from '../utils/json-cleanup'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const TEXT_MODEL = 'gemini-3-pro-preview'

export interface SmartImagePrompt {
  imageId: string
  placement: string
  prompt: {
    subject: string
    scene: string
    mood: string
    colors: string[]
    composition: string
    lighting: string
    style: string
    israeliElements: string
    noText: boolean
  }
  aspectRatio: '16:9' | '1:1' | '4:5'
  priority: 'essential' | 'recommended' | 'optional'
}

export interface GeneratedPrompts {
  prompts: SmartImagePrompt[]
  styleGuide: string
}

/**
 * Generate smart prompts for all planned images
 */
export async function generateSmartPrompts(
  strategy: ImageStrategy,
  brandResearch: BrandResearch,
  brandColors: BrandColors
): Promise<GeneratedPrompts> {
  console.log(`[Smart Prompts] Generating prompts for ${strategy.images.length} images`)
  
  const imagePlans = strategy.images.map((img, i) => 
    `${i + 1}. ID: ${img.id}
   Purpose: ${img.purpose}
   Placement: ${img.placement}
   Rationale: ${img.rationale}`
  ).join('\n\n')

  const prompt = `אתה מומחה ל-Prompt Engineering עבור Gemini Nano Banana Pro (מודל יצירת תמונות).
המשימה: לכתוב פרומפטים מקצועיים ומדויקים עבור כל תמונה באסטרטגיה.

## המותג
- שם: ${brandResearch.brandName}
- תעשייה: ${brandResearch.industry || 'כללי'}
- אישיות: ${brandResearch.brandPersonality?.join(', ') || 'מקצועי ומודרני'}
- קהל יעד: ${brandResearch.targetDemographics?.primaryAudience?.ageRange || '25-45'} שנים

## צבעי המותג
- ראשי: ${brandColors.primary}
- משני: ${brandColors.secondary || brandColors.accent}
- נוסף: ${brandColors.accent}

## הכיוון הויזואלי
${strategy.conceptSummary}
${strategy.visualDirection}

## התמונות לייצר
${imagePlans}

## כללי כתיבת פרומפט ל-Nano Banana Pro

1. **מבנה JSON**: הפרומפט צריך להיות מובנה ומפורט
2. **ספציפיות**: פרטים מדויקים > תיאורים כלליים
3. **ישראליות**: אלמנטים ספציפיים לישראל (לא אמריקה/אירופה)
4. **NO TEXT**: קריטי! אין טקסט, אותיות, מילים, לוגואים
5. **תאורה**: תאורה ים-תיכונית חמה
6. **קומפוזיציה**: מקום לטקסט בצד ימין (RTL)

## דוגמה לפרומפט טוב

{
  "subject": "בקבוק מי עדן 1.5 ליטר, עיצוב פרימיום עם טיפות מים",
  "scene": "שולחן פיקניק מעץ בפארק הירקון, משפחה מטושטשת ברקע",
  "mood": "רענן, טבעי, משפחתי, חיובי",
  "colors": ["#29468F", "#FFDA63", "ירוקים טבעיים", "שמיים כחולים"],
  "composition": "בקבוק בקדמת התמונה צד שמאל, רקע מטושטש בעומק שדה, 70% שמיים",
  "lighting": "שעת זהב אחה\"צ, קרני שמש חמות, צללים רכים",
  "style": "צילום מסחרי פרימיום, איכות פרסומת, פוטוריאליסטי",
  "israeliElements": "פארק ישראלי, אקליפטוסים, משפחות טיפוסיות ישראליות",
  "noText": true
}

## מבנה התשובה

החזר JSON בלבד:

{
  "styleGuide": "משפט אחד על הסגנון האחיד לכל התמונות",
  "prompts": [
    {
      "imageId": "המזהה מהאסטרטגיה",
      "placement": "cover/brand/audience/activity/product/lifestyle/closing/custom",
      "prompt": {
        "subject": "נושא מרכזי מפורט",
        "scene": "תיאור הסצנה והסביבה",
        "mood": "תחושות ואווירה",
        "colors": ["צבעים ספציפיים"],
        "composition": "מיקום אלמנטים בפריים",
        "lighting": "סוג התאורה",
        "style": "סגנון צילום/עיצוב",
        "israeliElements": "אלמנטים ישראליים ספציפיים",
        "noText": true
      },
      "aspectRatio": "16:9",
      "priority": "essential/recommended/optional"
    }
  ]
}`

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const text = response.text || ''
    const result = parseGeminiJson<GeneratedPrompts>(text)
    
    if (result && result.prompts && result.prompts.length > 0) {
      console.log(`[Smart Prompts] Generated ${result.prompts.length} prompts`)
      console.log(`[Smart Prompts] Style guide: ${result.styleGuide}`)
      return result
    }
    
    throw new Error('Invalid prompts response')
  } catch (error) {
    console.error('[Smart Prompts] Error:', error)
    
    // Fallback prompts
    return getDefaultPrompts(strategy, brandResearch, brandColors)
  }
}

/**
 * Convert SmartImagePrompt to a text prompt for Nano Banana Pro
 */
export function smartPromptToText(smartPrompt: SmartImagePrompt): string {
  const p = smartPrompt.prompt
  
  return `Create a professional commercial photograph.

SUBJECT: ${p.subject}

SCENE: ${p.scene}

MOOD & ATMOSPHERE: ${p.mood}

COLORS: ${p.colors.join(', ')}

COMPOSITION: ${p.composition}

LIGHTING: ${p.lighting}

STYLE: ${p.style}

ISRAELI ELEMENTS: ${p.israeliElements}

CRITICAL REQUIREMENTS:
- Generate ONLY a visual/photographic image
- Do NOT include ANY text, letters, words, logos, typography, or brand names
- The image must be purely visual - no writing of any kind
- High resolution, commercial quality
- Aspect ratio: ${smartPrompt.aspectRatio}
- Photorealistic, high-end advertising quality

AVOID: generic stock photo feel, American/European aesthetics, cold lighting, text of any kind`
}

/**
 * Default prompts as fallback
 */
function getDefaultPrompts(
  strategy: ImageStrategy,
  brandResearch: BrandResearch,
  brandColors: BrandColors
): GeneratedPrompts {
  const prompts: SmartImagePrompt[] = strategy.images.map(img => ({
    imageId: img.id,
    placement: img.placement,
    prompt: {
      subject: `${brandResearch.brandName} - ${img.purpose}`,
      scene: img.rationale,
      mood: brandResearch.brandPersonality?.join(', ') || 'מקצועי, מודרני, מזמין',
      colors: [brandColors.primary, brandColors.secondary || brandColors.accent, brandColors.accent],
      composition: 'מרכז עם מקום לטקסט בצד ימין',
      lighting: 'תאורה טבעית ים-תיכונית, שעת זהב',
      style: 'צילום מסחרי פרימיום, פוטוריאליסטי',
      israeliElements: 'אווירה ישראלית אותנטית, אור ים תיכוני',
      noText: true,
    },
    aspectRatio: '16:9',
    priority: img.priority,
  }))

  return {
    styleGuide: 'סגנון מודרני וישראלי עם תאורה חמה ואווירה מזמינה',
    prompts,
  }
}

export { getDefaultPrompts }

