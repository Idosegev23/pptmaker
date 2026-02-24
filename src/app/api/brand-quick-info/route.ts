import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export const maxDuration = 600

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

export async function POST(request: NextRequest) {
  const requestId = `brand-info-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n[${requestId}] 🏷️ BRAND QUICK INFO - START`)

  try {
    const { brandName } = await request.json()

    if (!brandName) {
      console.log(`[${requestId}] ⚠️ No brand name provided, returning empty`)
      return NextResponse.json({ facts: [] })
    }

    console.log(`[${requestId}] 🔍 Brand: "${brandName}"`)
    console.log(`[${requestId}] 🔄 Calling Gemini for brand facts...`)
    const geminiStart = Date.now()

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: `אתה חוקר מותגים. ספק 5 עובדות מעניינות וקצרות על המותג "${brandName}".
כל עובדה צריכה להיות משפט אחד בעברית.
התמקד ב: היסטוריה, הישגים, קהל יעד, נוכחות דיגיטלית, קמפיינים בולטים.
אם אתה לא מכיר את המותג, כתוב עובדות כלליות על התעשייה.

החזר JSON בפורמט: { "facts": ["עובדה 1", "עובדה 2", ...] }`,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const geminiTime = Date.now() - geminiStart
    const text = response.text || '{}'
    console.log(`[${requestId}] ✅ Gemini responded in ${geminiTime}ms (${text.length} chars)`)

    try {
      const data = JSON.parse(text)
      const factsCount = data.facts?.length || 0
      console.log(`[${requestId}] 📊 Parsed ${factsCount} facts`)
      if (data.facts?.length) {
        data.facts.forEach((fact: string, i: number) => {
          console.log(`[${requestId}]   ${i + 1}. ${fact.slice(0, 100)}`)
        })
      }
      console.log(`[${requestId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
      return NextResponse.json({ facts: data.facts || [] })
    } catch (parseErr) {
      console.error(`[${requestId}] ⚠️ JSON parse failed:`, parseErr)
      console.log(`[${requestId}] 📝 Raw response: ${text.slice(0, 500)}`)
      return NextResponse.json({ facts: [] })
    }
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : 'N/A')
    return NextResponse.json({ facts: [] })
  }
}
