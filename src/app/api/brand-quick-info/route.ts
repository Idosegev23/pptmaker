import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

export async function POST(request: NextRequest) {
  try {
    const { brandName } = await request.json()

    if (!brandName) {
      return NextResponse.json({ facts: [] })
    }

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

    const text = response.text || '{}'
    try {
      const data = JSON.parse(text)
      return NextResponse.json({ facts: data.facts || [] })
    } catch {
      return NextResponse.json({ facts: [] })
    }
  } catch (error) {
    console.error('[Brand Quick Info] Error:', error)
    return NextResponse.json({ facts: [] })
  }
}
