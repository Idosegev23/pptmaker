import { NextRequest, NextResponse } from 'next/server'
import { extractFromBrief } from '@/lib/gemini/proposal-agent'

export const maxDuration = 60 // extraction only — should finish in ~15s

export async function POST(request: NextRequest) {
  const requestId = `process-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${requestId}] 🔍 PROCESS PROPOSAL (extract only) - START`)

  try {
    const { clientBriefText, kickoffText } = await request.json()

    if (!clientBriefText || typeof clientBriefText !== 'string') {
      return NextResponse.json({ error: 'clientBriefText is required' }, { status: 400 })
    }
    if (clientBriefText.trim().length < 20) {
      return NextResponse.json({ error: 'טקסט הבריף קצר מדי' }, { status: 400 })
    }

    console.log(`[${requestId}] 📄 Brief: ${clientBriefText.length} chars, Kickoff: ${kickoffText ? kickoffText.length + ' chars' : 'none'}`)

    const extracted = await extractFromBrief(clientBriefText, kickoffText || undefined)

    const elapsed = Date.now() - startTime
    console.log(`[${requestId}] ✅ Extraction done in ${elapsed}ms — Brand: ${extracted?.brand?.name || 'N/A'}`)

    return NextResponse.json({ success: true, extracted })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'שגיאה בעיבוד המסמכים' },
      { status: 500 }
    )
  }
}
