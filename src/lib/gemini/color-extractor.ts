/**
 * Gemini Vision Color Extractor
 * Uses Gemini's vision capabilities to extract brand colors from logos and images
 */

import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

const MODEL = 'gemini-2.0-flash-exp' // Will be 'gemini-3-pro' when available

export interface BrandColors {
  primary: string       // Main brand color (HEX)
  secondary: string     // Secondary color (HEX)
  accent: string        // Accent/highlight color (HEX)
  background: string    // Suggested background (HEX)
  text: string          // Suggested text color (HEX)
  palette: string[]     // Full color palette (HEX)
  
  // Design style
  style: 'minimal' | 'bold' | 'elegant' | 'playful' | 'corporate'
  mood: string          // Description of the color mood
}

export interface DesignStyle {
  colorScheme: 'light' | 'dark' | 'colorful'
  typography: 'modern' | 'classic' | 'playful' | 'minimalist'
  overallStyle: string
  recommendations: string[]
}

/**
 * Extract colors from a logo image URL
 */
export async function extractColorsFromLogo(imageUrl: string): Promise<BrandColors> {
  console.log(`[Gemini Vision] Analyzing logo: ${imageUrl}`)
  
  // Skip SVG files - Gemini can't process them
  if (imageUrl.endsWith('.svg') || imageUrl.includes('.svg?')) {
    console.log('[Gemini Vision] Skipping SVG logo - not supported')
    return getDefaultColors()
  }
  
  const prompt = `
אתה מומחה עיצוב גרפי. נתח את הלוגו בתמונה וחלץ את פלטת הצבעים של המותג.

החזר JSON בפורמט הבא:
\`\`\`json
{
  "primary": "#XXXXXX",
  "secondary": "#XXXXXX",
  "accent": "#XXXXXX",
  "background": "#XXXXXX",
  "text": "#XXXXXX",
  "palette": ["#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "style": "minimal/bold/elegant/playful/corporate",
  "mood": "תיאור קצר של האווירה שהצבעים משדרים"
}
\`\`\`

חשוב:
- החזר צבעים בפורמט HEX בלבד
- primary = הצבע הדומיננטי בלוגו
- secondary = צבע משני אם קיים
- accent = צבע הדגשה (יכול להיות זהה ל-primary)
- background = צבע רקע מומלץ (לבן או כהה)
- text = צבע טקסט מומלץ
- palette = כל הצבעים שזיהית בלוגו
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { 
              inlineData: {
                mimeType: 'image/png',
                data: await fetchImageAsBase64(imageUrl)
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.2,
      }
    })

    const text = response.text || ''
    console.log('[Gemini Vision] Color analysis received')
    
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as BrandColors
    }
    
    // Try to find JSON without code blocks
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as BrandColors
    }
    
    throw new Error('No JSON in response')
  } catch (error) {
    console.error('[Gemini Vision] Color extraction error:', error)
    return getDefaultColors()
  }
}

/**
 * Extract colors from CSS color array (from scraped website)
 */
export async function analyzeColorPalette(cssColors: string[]): Promise<BrandColors> {
  if (cssColors.length === 0) {
    return getDefaultColors()
  }
  
  const prompt = `
הנה רשימת צבעים שחולצו מאתר של מותג:
${cssColors.join(', ')}

נתח את הצבעים וקבע מה הפלטה הראשית של המותג.
החזר JSON:
\`\`\`json
{
  "primary": "#XXXXXX",
  "secondary": "#XXXXXX",
  "accent": "#XXXXXX",
  "background": "#FFFFFF",
  "text": "#000000",
  "palette": ["#XXXXXX", "#XXXXXX"],
  "style": "minimal/bold/elegant/playful/corporate",
  "mood": "תיאור קצר"
}
\`\`\`
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
      }
    })

    const text = response.text || ''
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as BrandColors
    }
    
    throw new Error('No JSON in response')
  } catch (error) {
    console.error('[Gemini] Color analysis error:', error)
    
    // Fallback: use first color as primary
    const primary = cssColors[0] || '#000000'
    return {
      ...getDefaultColors(),
      primary,
      accent: primary,
      palette: cssColors.slice(0, 5),
    }
  }
}

/**
 * Analyze design style from website screenshot or logo
 */
export async function analyzeDesignStyle(imageUrl: string): Promise<DesignStyle> {
  const prompt = `
נתח את סגנון העיצוב של התמונה (צילום מסך של אתר או לוגו).

החזר JSON:
\`\`\`json
{
  "colorScheme": "light/dark/colorful",
  "typography": "modern/classic/playful/minimalist",
  "overallStyle": "תיאור קצר של הסגנון הכללי",
  "recommendations": [
    "המלצה 1 לעיצוב מצגת",
    "המלצה 2",
    "המלצה 3"
  ]
}
\`\`\`
`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: await fetchImageAsBase64(imageUrl)
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.3,
      }
    })

    const text = response.text || ''
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as DesignStyle
    }
    
    throw new Error('No JSON in response')
  } catch (error) {
    console.error('[Gemini Vision] Style analysis error:', error)
    return {
      colorScheme: 'light',
      typography: 'modern',
      overallStyle: 'מינימליסטי ומקצועי',
      recommendations: [
        'שימוש ברקע לבן',
        'טיפוגרפיה נקייה',
        'הרבה אוויר לבן'
      ]
    }
  }
}

/**
 * Fetch image and convert to base64
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch (error) {
    console.error('[Fetch] Error fetching image:', error)
    throw error
  }
}

/**
 * Get default colors for fallback
 */
function getDefaultColors(): BrandColors {
  return {
    primary: '#111111',
    secondary: '#666666',
    accent: '#E94560',
    background: '#FFFFFF',
    text: '#111111',
    palette: ['#111111', '#666666', '#E94560', '#FFFFFF'],
    style: 'minimal',
    mood: 'מודרני ומינימליסטי'
  }
}

/**
 * Adjust color brightness
 */
export function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = (num >> 8 & 0x00FF) + amt
  const B = (num & 0x0000FF) + amt
  
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1)
}

/**
 * Check if color is dark
 */
export function isColorDark(hex: string): boolean {
  const num = parseInt(hex.replace('#', ''), 16)
  const R = num >> 16
  const G = num >> 8 & 0x00FF
  const B = num & 0x0000FF
  const brightness = (R * 299 + G * 587 + B * 114) / 1000
  return brightness < 128
}

/**
 * Get contrasting text color
 */
export function getContrastingColor(hex: string): string {
  return isColorDark(hex) ? '#FFFFFF' : '#111111'
}


