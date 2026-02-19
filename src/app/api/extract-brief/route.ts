import { NextRequest, NextResponse } from 'next/server'
import { extractFromDocuments } from '@/lib/gemini/document-extractor'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientBriefText, kickoffText } = body

    if (!clientBriefText) {
      return NextResponse.json(
        { error: 'Missing clientBriefText - at least one document is required' },
        { status: 400 }
      )
    }

    console.log('[Extract Brief] Starting AI extraction...')
    console.log(`[Extract Brief] Brief: ${clientBriefText.length} chars`)
    if (kickoffText) {
      console.log(`[Extract Brief] Kickoff: ${kickoffText.length} chars`)
    }

    const extracted = await extractFromDocuments(clientBriefText, kickoffText || undefined)

    console.log(`[Extract Brief] Done. Brand: ${extracted.brand?.name}, Confidence: ${extracted._meta?.confidence}`)
    console.log(`[Extract Brief] Warnings: ${extracted._meta?.warnings?.join(', ') || 'none'}`)

    return NextResponse.json({
      success: true,
      data: extracted,
    })
  } catch (error) {
    console.error('[Extract Brief] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to extract data from documents'

    // Return 400 for input validation errors, 500 for API/server errors
    const isInputError = message.includes('קצר מדי') || message.includes('Missing')
    const status = isInputError ? 400 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
