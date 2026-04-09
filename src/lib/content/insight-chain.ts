/**
 * Insight Chain — 3-stage pipeline for generating sharp, punching insights.
 *
 * Stage 1: Contrarian Hypothesis — "What doesn't the audience know about themselves?"
 * Stage 2: Tension Finder — "What behavioral tension exists?"
 * Stage 3: Insight Crystallization — "One razor-sharp sentence"
 *
 * Uses Claude Opus 4.6 for maximum creative quality.
 * Each stage builds on the previous one's output.
 */

export interface InsightChainInput {
  brandName: string
  industry: string
  targetAudience: string
  brandBrief: string
  painPoints: string[]
  researchData?: string // Additional brand research context
}

export interface InsightChainOutput {
  hypothesis: string    // Stage 1 output
  tension: string       // Stage 2 output
  insight: string       // Stage 3 output — THE final insight
  dataPoint: string     // Supporting data/stat
  source: string        // Where the data comes from
}

/**
 * Run the full 3-stage insight chain.
 * Returns a sharp, data-backed insight that leads directly to strategy.
 */
export async function generateInsight(input: InsightChainInput): Promise<InsightChainOutput> {
  const requestId = `insight-${Date.now()}`
  console.log(`[InsightChain][${requestId}] Starting for "${input.brandName}"`)

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const context = `
מותג: ${input.brandName}
תעשייה: ${input.industry}
קהל יעד: ${input.targetAudience}
בריף: ${input.brandBrief}
נקודות כאב: ${input.painPoints.join(', ')}
${input.researchData ? `מחקר: ${input.researchData}` : ''}
`.trim()

  // ── Stage 1: Contrarian Hypothesis ──
  console.log(`[InsightChain][${requestId}] Stage 1: Contrarian Hypothesis`)
  const stage1 = await anthropic.messages.create({
    model: 'claude-opus-4-6-20250514',
    max_tokens: 1024,
    system: [{
      type: 'text' as const,
      text: `אתה אסטרטג שיווקי שמוצא את מה שאף אחד לא רואה. המשימה: מצא השערה מנוגדת לאינטואיציה על קהל היעד.

לא "הקהל רוצה X" אלא "הקהל חושב שהוא רוצה X, אבל בעצם הוא מונע מ-Y".

דוגמאות של השערות מנוגדות טובות:
- "אנשים שקונים רכבי יוקרה לא מחפשים סטטוס — הם מחפשים שקט. השקט של החלטה שלא צריך להצדיק."
- "הורים שקונים מוצרי פרימיום לתינוקות לא דואגים לאיכות — הם דואגים למה שהורים אחרים יחשבו עליהם."
- "אנשים שעוקבים אחרי משפיענים לא מחפשים השראה — הם מחפשים אישור להחלטה שכבר קיבלו."

החזר רק את ההשערה — משפט אחד בעברית. חד, מפתיע, אמיתי.`,
      cache_control: { type: 'ephemeral' as const },
    }],
    messages: [{ role: 'user', content: context }],
  })
  const hypothesis = stage1.content.filter(c => c.type === 'text').map(c => c.text).join('').trim()
  console.log(`[InsightChain][${requestId}] Hypothesis: "${hypothesis.slice(0, 80)}..."`)

  // ── Stage 2: Tension Finder ──
  console.log(`[InsightChain][${requestId}] Stage 2: Tension Finder`)
  const stage2 = await anthropic.messages.create({
    model: 'claude-opus-4-6-20250514',
    max_tokens: 1024,
    system: [{
      type: 'text' as const,
      text: `אתה מוצא מתחים התנהגותיים — פערים בין מה שאנשים אומרים לבין מה שהם עושים.

בהינתן השערה מנוגדת, מצא את המתח הספציפי:
- "הם אומרים X, אבל עושים Y"
- "הם מחפשים X, אבל בורחים מ-Y"
- "הם מאמינים ב-X, אבל קונים Y"

חייב לכלול נתון כמותי אמיתי (אחוז, מספר, מחקר). אם אין לך נתון ספציפי — השתמש בנתון הגיוני עם מקור מוערך.

פורמט:
מתח: [המתח]
נתון: [X% / מספר]
מקור: [שם המחקר / הסקר / הפלטפורמה]`,
      cache_control: { type: 'ephemeral' as const },
    }],
    messages: [{ role: 'user', content: `${context}\n\nהשערה מנוגדת:\n${hypothesis}` }],
  })
  const tensionRaw = stage2.content.filter(c => c.type === 'text').map(c => c.text).join('').trim()
  console.log(`[InsightChain][${requestId}] Tension: "${tensionRaw.slice(0, 80)}..."`)

  // Parse tension, data, source
  const tensionMatch = tensionRaw.match(/מתח:\s*(.+)/)?.[1]?.trim() || tensionRaw.split('\n')[0]
  const dataMatch = tensionRaw.match(/נתון:\s*(.+)/)?.[1]?.trim() || ''
  const sourceMatch = tensionRaw.match(/מקור:\s*(.+)/)?.[1]?.trim() || ''

  // ── Stage 3: Insight Crystallization ──
  console.log(`[InsightChain][${requestId}] Stage 3: Crystallization`)
  const stage3 = await anthropic.messages.create({
    model: 'claude-opus-4-6-20250514',
    max_tokens: 512,
    system: [{
      type: 'text' as const,
      text: `אתה מגבש תובנה אסטרטגית למצגת.

קח את ההשערה והמתח וצור משפט תובנה אחד שעונה על שני קריטריונים:
1. מפתיע — הקורא אומר "וואו, לא חשבתי על זה ככה"
2. מחבר לפעולה — ברור מה צריך לעשות

דוגמאות תובנות טובות:
- "73% מהקונים מחליטים לפי המלצת חבר — לא לפי פרסום. המותג שלכם צריך חברים, לא קמפיינים."
- "דור ה-Z לא בורח מפרסומות — הוא בורח מהעמדת פנים. הפרסום שהוא מחפש נראה כמו תוכן, לא כמו מכירה."

החזר רק את משפט התובנה — בעברית. חד כתער.`,
      cache_control: { type: 'ephemeral' as const },
    }],
    messages: [{ role: 'user', content: `${context}\n\nהשערה: ${hypothesis}\n\nמתח: ${tensionMatch}\nנתון: ${dataMatch}\nמקור: ${sourceMatch}` }],
  })
  const insight = stage3.content.filter(c => c.type === 'text').map(c => c.text).join('').trim()
  console.log(`[InsightChain][${requestId}] ✅ Insight: "${insight}"`)

  return {
    hypothesis,
    tension: tensionMatch,
    insight,
    dataPoint: dataMatch,
    source: sourceMatch,
  }
}
