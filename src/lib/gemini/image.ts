import { GoogleGenAI } from '@google/genai'

// Initialize the Google GenAI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Model: Gemini 2.0 Flash Image Generation (Nano Banana Pro)
const MODEL = 'gemini-2.0-flash-preview-image-generation'

export interface GeneratedImage {
  base64: string
  mimeType: string
  prompt: string
}

export interface ImageGenerationOptions {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  imageSize?: '2K' | '4K'
  useGoogleSearch?: boolean
}

/**
 * Generate an image using Gemini 3 Pro Image Preview
 * Features: 4K resolution, grounded generation with Google Search
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const { 
    aspectRatio = '16:9', 
    imageSize = '4K',
    useGoogleSearch = false 
  } = options

  try {
    const config: Record<string, unknown> = {
      imageConfig: {
        aspectRatio,
        imageSize,
      },
    }

    // Add Google Search grounding for real-time data
    if (useGoogleSearch) {
      config.tools = [{ googleSearch: {} }]
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `צור תמונה מקצועית ואיכותית: ${prompt}`,
      config,
    })

    // Extract image from response
    const candidates = response.candidates || []
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || []
      for (const part of parts) {
        if (part.inlineData) {
          return {
            base64: part.inlineData.data || '',
            mimeType: part.inlineData.mimeType || 'image/png',
            prompt,
          }
        }
      }
    }

    return null
  } catch (error) {
    console.error('Error generating image with Gemini 3 Pro:', error)
    return null
  }
}

/**
 * Generate image with Google Search grounding (for real-time data like weather, charts)
 */
export async function generateGroundedImage(prompt: string): Promise<GeneratedImage | null> {
  return generateImage(prompt, {
    aspectRatio: '16:9',
    imageSize: '4K',
    useGoogleSearch: true,
  })
}

/**
 * Generate multiple images in parallel
 */
export async function generateImages(
  prompts: string[],
  options: ImageGenerationOptions = {}
): Promise<(GeneratedImage | null)[]> {
  const results = await Promise.all(
    prompts.map(prompt => generateImage(prompt, options))
  )
  return results
}

/**
 * Generate image prompts for deck slides
 */
export function generateSlideImagePrompts(
  deckTitle: string, 
  slides: Array<{ type: string; headline?: string; content?: string }>
): string[] {
  return slides
    .filter(slide => ['title', 'image_focus', 'big_idea'].includes(slide.type))
    .map(slide => {
      switch (slide.type) {
        case 'title':
          return `תמונת רקע מרשימה ומקצועית לשקופית פתיחה של מצגת בנושא: ${deckTitle}. סגנון עסקי מודרני, צבעים חמים, ללא טקסט.`
        case 'image_focus':
          return `תמונה איכותית המייצגת את הנושא: ${slide.headline || deckTitle}. סגנון צילומי, מקצועי, מרכז ויזואלי חזק.`
        case 'big_idea':
          return `תמונה מעוררת השראה שמייצגת את הרעיון: ${slide.headline || slide.content || 'רעיון חדשני'}. סגנון אמנותי, ייחודי.`
        default:
          return `תמונה מקצועית לנושא: ${slide.headline || deckTitle}`
      }
    })
}
