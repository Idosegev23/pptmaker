import { NextRequest, NextResponse } from 'next/server'
import { generateProposal } from '@/lib/gemini/proposal-agent'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const requestId = `process-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n${'='.repeat(60)}`)
  console.log(`[${requestId}] 🤖 PROCESS PROPOSAL - START`)
  console.log(`${'='.repeat(60)}`)

  try {
    const { clientBriefText, kickoffText } = await request.json()

    if (!clientBriefText || typeof clientBriefText !== 'string') {
      console.log(`[${requestId}] ❌ Missing clientBriefText`)
      return NextResponse.json({ error: 'clientBriefText is required' }, { status: 400 })
    }

    if (clientBriefText.trim().length < 20) {
      console.log(`[${requestId}] ❌ Brief too short: ${clientBriefText.trim().length} chars`)
      return NextResponse.json({ error: 'טקסט הבריף קצר מדי' }, { status: 400 })
    }

    console.log(`[${requestId}] 📄 Brief: ${clientBriefText.length} chars`)
    console.log(`[${requestId}] 📄 Kickoff: ${kickoffText ? `${kickoffText.length} chars` : 'not provided'}`)
    console.log(`[${requestId}] 📊 Total text: ${(clientBriefText.length + (kickoffText?.length || 0)).toLocaleString()} chars`)

    const result = await generateProposal(clientBriefText, kickoffText || undefined)

    const elapsed = Date.now() - startTime
    console.log(`[${requestId}] ✅ Proposal generated in ${elapsed}ms`)
    console.log(`[${requestId}]   Brand: ${result.extracted.brand?.name || 'N/A'}`)
    console.log(`[${requestId}]   Steps with data: ${Object.keys(result.stepData).length}`)
    console.log(`${'='.repeat(60)}\n`)

    return NextResponse.json({
      success: true,
      extracted: result.extracted,
      stepData: result.stepData,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : 'N/A')

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'שגיאה בעיבוד המסמכים' },
      { status: 500 }
    )
  }
}
