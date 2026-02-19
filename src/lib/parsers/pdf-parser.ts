import { GoogleGenAI } from '@google/genai'
import type { ParsedDocument } from '@/types/brief'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-2.0-flash-exp'

/**
 * Parse PDF document - extract text with fallback to Gemini Vision for scanned PDFs
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  console.log('[PDF Parser] Starting text extraction...')

  try {
    // Dynamic import to avoid bundling issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any
    const pdfParse = pdfParseModule.default || pdfParseModule
    const result = await pdfParse(buffer) as { text: string; numpages: number }

    const cleanText = result.text?.trim() || ''
    const textLength = cleanText.replace(/\s/g, '').length

    // If meaningful text extracted and not garbled
    if (textLength > 100 && !isGarbledText(cleanText)) {
      console.log(`[PDF Parser] Text extracted: ${textLength} chars, ${result.numpages} pages`)
      return {
        text: cleanText,
        metadata: {
          pageCount: result.numpages,
          format: 'pdf',
          language: detectHebrew(cleanText) ? 'he' : 'en',
          hasImages: false,
          hasTables: cleanText.includes('\t') || /\d+\s+\d+\s+\d+/.test(cleanText),
        },
      }
    }

    // Scanned PDF or garbled text - fall back to Gemini Vision
    console.log('[PDF Parser] Low text quality, falling back to Gemini Vision OCR...')
    return parsePdfWithVision(buffer)
  } catch (error) {
    console.error('[PDF Parser] pdf-parse failed, trying Gemini Vision:', error)
    return parsePdfWithVision(buffer)
  }
}

/**
 * Use Gemini Vision to extract text from scanned/image PDFs
 */
async function parsePdfWithVision(buffer: Buffer): Promise<ParsedDocument> {
  console.log('[PDF Parser] Using Gemini Vision for PDF OCR...')

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
    config: { temperature: 0.1 },
  })

  const text = response.text || ''
  console.log(`[PDF Parser] Vision OCR extracted: ${text.length} chars`)

  return {
    text,
    metadata: {
      format: 'pdf-vision',
      language: detectHebrew(text) ? 'he' : 'en',
      hasImages: true,
      hasTables: true,
    },
  }
}

/**
 * Detect garbled text (common with Hebrew PDF encoding issues)
 */
function isGarbledText(text: string): boolean {
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length
  const totalChars = text.replace(/\s/g, '').length

  if (totalChars < 50) return false

  // If we have almost no Hebrew and no Latin, it's probably garbled
  if (hebrewChars === 0 && latinChars < totalChars * 0.3) {
    return true
  }

  // High ratio of replacement/special characters
  const specialChars = (text.match(/[\uFFFD\uFEFF]/g) || []).length
  if (specialChars > totalChars * 0.1) {
    return true
  }

  return false
}

/**
 * Detect Hebrew content
 */
function detectHebrew(text: string): boolean {
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length
  return hebrewChars > 10
}
