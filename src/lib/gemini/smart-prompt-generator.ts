/**
 * Smart Prompt Generator
 * AI generates optimized JSON prompts for image generation
 * Based on the image strategy, creates specific, creative prompts
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'
import type { ImageStrategy, ImagePlan } from './image-strategist'
import { parseGeminiJson } from '../utils/json-cleanup'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const TEXT_MODEL = 'gemini-3.1-pro-preview'

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
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
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
 * Convert SmartImagePrompt to a narrative-style text prompt for Nano Banana Pro
 *
 * Uses narrative descriptions instead of tag lists, following Gemini image
 * generation best practices:
 * - Descriptive sentences > keyword tags
 * - Photographic vocabulary (aperture, focal length, lighting setup)
 * - Specific composition instructions
 * - Semantic negatives woven into the description
 */
export function smartPromptToText(smartPrompt: SmartImagePrompt): string {
  const p = smartPrompt.prompt

  // Build a cohesive narrative prompt
  const colorMention = p.colors.slice(0, 3).join(', ')

  return `A premium commercial photograph of ${p.subject}, set in ${p.scene}. The atmosphere is ${p.mood}, with a color palette dominated by ${colorMention}. ${p.israeliElements}.

Shot with a professional DSLR camera, ${p.lighting}. The composition features ${p.composition}. The overall style is ${p.style} — sharp focus on the main subject with a shallow depth of field creating a soft bokeh background. High-end advertising quality at ${smartPrompt.aspectRatio} aspect ratio.

The image is purely photographic with absolutely no text, no letters, no words, no logos, no watermarks, and no typography of any kind. No generic stock photo aesthetics — instead, authentic and specific, avoiding cold or sterile lighting.`
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


