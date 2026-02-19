import type { ParsedDocument } from '@/types/brief'

/**
 * Parse Word (DOCX) documents using mammoth
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  console.log('[DOCX Parser] Starting extraction...')

  const mammoth = await import('mammoth')

  // Extract raw text (preserves structure)
  const textResult = await mammoth.extractRawText({ buffer })
  const text = textResult.value?.trim() || ''

  // Also get HTML to detect tables and images
  const htmlResult = await mammoth.convertToHtml({ buffer })
  const html = htmlResult.value || ''

  const hasTables = html.includes('<table')
  const hasImages = html.includes('<img')

  console.log(`[DOCX Parser] Extracted: ${text.length} chars, tables: ${hasTables}, images: ${hasImages}`)

  if (!text || text.length < 10) {
    throw new Error('DOCX file contains no readable text')
  }

  return {
    text,
    metadata: {
      format: 'docx',
      language: detectHebrew(text) ? 'he' : 'en',
      hasImages,
      hasTables,
    },
  }
}

function detectHebrew(text: string): boolean {
  return (text.match(/[\u0590-\u05FF]/g) || []).length > 10
}
