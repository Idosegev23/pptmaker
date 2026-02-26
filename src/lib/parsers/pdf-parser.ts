import { GoogleGenAI } from '@google/genai'
import type { ParsedDocument } from '@/types/brief'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3.1-pro-preview'

/**
 * Parse PDF document using Gemini Vision (native PDF support).
 * pdf-parse was removed — it fails on Vercel serverless (DOMMatrix not defined)
 * and Gemini handles Hebrew PDFs better anyway.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const parserId = `pdf-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${parserId}] 📄 PDF PARSER (Gemini Vision) - START`)
  console.log(`[${parserId}] 📄 Buffer size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)}KB)`)

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'חלץ את כל תוכן הטקסט מהמסמך הזה. שמור על מבנה הכותרות, פסקאות, רשימות וטבלאות. המסמך עשוי להיות בעברית. החזר את הטקסט הגולמי בלבד, ללא הערות.',
          },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ],
    config: {},
  })

  const text = response.text || ''
  const isHebrew = (text.match(/[\u0590-\u05FF]/g) || []).length > 10
  const elapsed = Date.now() - startTime

  console.log(`[${parserId}] ✅ Extracted ${text.length} chars in ${elapsed}ms (${isHebrew ? 'Hebrew' : 'English'})`)

  return {
    text,
    metadata: {
      format: 'pdf',
      language: isHebrew ? 'he' : 'en',
      hasImages: true,
      hasTables: true,
    },
  }
}
