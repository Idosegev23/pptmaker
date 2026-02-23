import { GoogleGenAI } from '@google/genai'
import type { ParsedDocument } from '@/types/brief'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3.1-pro-preview'

/**
 * Parse PDF document - extract text with fallback to Gemini Vision for scanned PDFs
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const parserId = `pdf-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${parserId}] 📄 PDF PARSER - START`)
  console.log(`[${parserId}] 📄 Buffer size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)}KB)`)

  try {
    // Dynamic import to avoid bundling issues
    console.log(`[${parserId}] 🔄 Loading pdf-parse module...`)
    const moduleStart = Date.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any
    const pdfParse = pdfParseModule.default || pdfParseModule
    console.log(`[${parserId}] ✅ Module loaded in ${Date.now() - moduleStart}ms`)

    console.log(`[${parserId}] 🔄 Extracting text with pdf-parse...`)
    const extractStart = Date.now()
    const result = await pdfParse(buffer) as { text: string; numpages: number }
    const extractTime = Date.now() - extractStart

    const cleanText = result.text?.trim() || ''
    const textLength = cleanText.replace(/\s/g, '').length
    const hebrewChars = (cleanText.match(/[\u0590-\u05FF]/g) || []).length
    const latinChars = (cleanText.match(/[a-zA-Z]/g) || []).length

    console.log(`[${parserId}] 📊 pdf-parse result in ${extractTime}ms:`)
    console.log(`[${parserId}]   Pages: ${result.numpages}`)
    console.log(`[${parserId}]   Raw text length: ${cleanText.length} chars`)
    console.log(`[${parserId}]   Non-whitespace: ${textLength} chars`)
    console.log(`[${parserId}]   Hebrew chars: ${hebrewChars}`)
    console.log(`[${parserId}]   Latin chars: ${latinChars}`)
    console.log(`[${parserId}]   First 200 chars: ${cleanText.slice(0, 200).replace(/\n/g, ' ')}`)

    const garbled = isGarbledText(cleanText)
    console.log(`[${parserId}]   Is garbled: ${garbled}`)

    // If meaningful text extracted and not garbled
    if (textLength > 100 && !garbled) {
      const hasTables = cleanText.includes('\t') || /\d+\s+\d+\s+\d+/.test(cleanText)
      const isHebrew = detectHebrew(cleanText)
      console.log(`[${parserId}] ✅ Good text quality - using pdf-parse result`)
      console.log(`[${parserId}]   Language: ${isHebrew ? 'Hebrew' : 'English'}`)
      console.log(`[${parserId}]   Has tables: ${hasTables}`)
      console.log(`[${parserId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)

      return {
        text: cleanText,
        metadata: {
          pageCount: result.numpages,
          format: 'pdf',
          language: isHebrew ? 'he' : 'en',
          hasImages: false,
          hasTables,
        },
      }
    }

    // Scanned PDF or garbled text - fall back to Gemini Vision
    console.log(`[${parserId}] ⚠️ Low text quality (length=${textLength}, garbled=${garbled}), falling back to Gemini Vision OCR...`)
    const visionResult = await parsePdfWithVision(buffer, parserId)
    console.log(`[${parserId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
    return visionResult
  } catch (error) {
    console.error(`[${parserId}] ❌ pdf-parse failed:`, error instanceof Error ? error.message : error)
    console.log(`[${parserId}] 🔄 Falling back to Gemini Vision...`)
    const visionResult = await parsePdfWithVision(buffer, parserId)
    console.log(`[${parserId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
    return visionResult
  }
}

/**
 * Use Gemini Vision to extract text from scanned/image PDFs
 */
async function parsePdfWithVision(buffer: Buffer, parserId: string): Promise<ParsedDocument> {
  console.log(`[${parserId}] 🔮 Gemini Vision OCR - START`)
  console.log(`[${parserId}]   Sending ${(buffer.length / 1024).toFixed(1)}KB PDF to ${MODEL}...`)
  const visionStart = Date.now()

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
  const visionTime = Date.now() - visionStart
  const isHebrew = detectHebrew(text)

  console.log(`[${parserId}] ✅ Vision OCR completed in ${visionTime}ms`)
  console.log(`[${parserId}]   Extracted: ${text.length} chars`)
  console.log(`[${parserId}]   Language: ${isHebrew ? 'Hebrew' : 'English'}`)
  console.log(`[${parserId}]   First 200 chars: ${text.slice(0, 200).replace(/\n/g, ' ')}`)

  return {
    text,
    metadata: {
      format: 'pdf-vision',
      language: isHebrew ? 'he' : 'en',
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
