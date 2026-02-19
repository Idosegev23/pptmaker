import { GoogleGenAI } from '@google/genai'
import type { ParsedDocument } from '@/types/brief'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-2.0-flash-exp'

/**
 * Parse document images (screenshots, photos of docs) using Gemini Vision OCR
 */
export async function parseImage(buffer: Buffer, mimeType: string): Promise<ParsedDocument> {
  console.log(`[Image Parser] Using Gemini Vision OCR (${mimeType})...`)

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'חלץ את כל הטקסט מתמונת המסמך הזו. שמור על מבנה הכותרות, פסקאות, רשימות וטבלאות. המסמך עשוי להיות בעברית. החזר את הטקסט הגולמי בלבד, ללא הערות.',
          },
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ],
    config: { temperature: 0.1 },
  })

  const text = response.text || ''
  console.log(`[Image Parser] OCR extracted: ${text.length} chars`)

  if (!text || text.length < 10) {
    throw new Error('Could not extract text from image. Try a higher quality image.')
  }

  return {
    text,
    metadata: {
      format: 'image-ocr',
      language: detectHebrew(text) ? 'he' : 'en',
      hasImages: true,
      hasTables: false,
    },
  }
}

function detectHebrew(text: string): boolean {
  return (text.match(/[\u0590-\u05FF]/g) || []).length > 10
}
