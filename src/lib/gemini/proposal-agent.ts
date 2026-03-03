/**
 * Proposal Agent
 * Takes raw document texts (client brief + kickoff) and generates
 * a complete proposal with all 10 wizard steps pre-filled.
 *
 * This is the core AI engine that cross-references the documents,
 * extracts facts, and GENERATES strategic content (insight, strategy,
 * creative, deliverables, quantities, media targets, influencer profiles).
 */

import { parseGeminiJson } from '../utils/json-cleanup'
import { getConfig } from '@/lib/config/admin-config'
import { MODEL_DEFAULTS } from '@/lib/config/defaults'
import { callAI, resolveModels } from '@/lib/ai-provider'
import type { ExtractedBriefData } from '@/types/brief'
import type { WizardStepDataMap } from '@/types/wizard'

async function getProposalModels() {
  return resolveModels(
    'proposal_agent.primary_model',
    'proposal_agent.fallback_model',
    MODEL_DEFAULTS['proposal_agent.primary_model'].value as string,
    MODEL_DEFAULTS['proposal_agent.fallback_model'].value as string,
  )
}

export interface ProposalOutput {
  extracted: ExtractedBriefData
  stepData: Partial<WizardStepDataMap>
}

/**
 * Generate a complete proposal from uploaded documents
 */
/**
 * Quick extraction — only pulls facts from documents, no strategy/creative generation.
 * Used in process-proposal before the popup so it returns fast (~15s).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extractFromBrief(clientBriefText: string, kickoffText?: string): Promise<any> {
  const agentId = `extract-${Date.now()}`
  console.log(`[${agentId}] 🔍 EXTRACT FROM BRIEF - START`)

  const prompt = `חלץ מידע עסקי בסיסי מהמסמכים הבאים. אל תייצר אסטרטגיה או קריאייטיב — רק חלץ עובדות.
נאמנות לבריף: כל מטרה, מדד הצלחה, דרישה ספציפית ואזכור מתחרים שהלקוח הזכיר חייבים להופיע — ציטוט מדויק מהבריף.
- שים לב גם למה שהלקוח *לא* אומר: אם אין אזכור של מדדים כמותיים, אם התקציב לא ברור, אם אין קהל מוגדר — ציין זאת ב-gaps.

## בריף לקוח:
${clientBriefText}

${kickoffText ? `## מסמך התנעה:\n${kickoffText}` : '(לא סופק מסמך התנעה)'}

החזר JSON עם המבנה הבא בלבד:
{
  "brand": { "name": "שם המותג", "officialName": null, "industry": "תעשייה", "subIndustry": null, "website": null, "tagline": null, "background": "תיאור קצר מה שרשום בבריף" },
  "budget": { "amount": 0, "currency": "₪", "breakdown": null },
  "campaignGoals": ["מטרה 1 כפי שנכתבה בבריף"],
  "targetAudience": {
    "primary": { "gender": "נשים/גברים/שניהם", "ageRange": "XX-XX", "interests": ["תחום"], "painPoints": ["כאב"], "lifestyle": "כפי שנכתב בבריף", "socioeconomic": null },
    "secondary": null,
    "behavior": "כפי שנכתב בבריף"
  },
  "keyInsight": null,
  "insightSource": null,
  "deliverables": [{ "type": "סוג", "quantity": null, "description": "כפי שנכתב" }],
  "influencerPreferences": { "types": [], "specificNames": [], "criteria": [], "verticals": [] },
  "timeline": { "startDate": null, "endDate": null, "duration": null, "milestones": [] },
  "additionalNotes": [],
  "successMetrics": ["מדד הצלחה 1 — ציטוט מדויק מהבריף", "KPI שהלקוח ציין"],
  "clientSpecificRequests": ["דרישה ספציפית שהלקוח ביקש", "הגבלה או דגש מיוחד"],
  "competitorMentions": ["מתחרה שהוזכר בבריף"],
  "brandTone": "תאר בשני משפטים את הטון שעולה מהבריף — רשמי? צעיר? מקצועי? חם?",
  "gaps": ["מה חסר בבריף — תקציב לא ברור / קהל לא מוגדר / מדדים חסרים"],
  "_meta": { "confidence": "high", "warnings": [], "hasKickoff": ${!!kickoffText} }
}`

  const models = await getProposalModels()
  let lastError = ''
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      const result = await callAI({
        model,
        prompt,
        systemPrompt: 'אתה מחלץ מידע עסקי ממסמכים. החזר JSON בלבד.',
        thinkingLevel: 'LOW',
        maxOutputTokens: 32000,
        callerId: agentId,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extracted = parseGeminiJson<any>(result.text || '{}')
      console.log(`[${agentId}] ✅ Extraction done (${result.provider}/${result.model}). Brand: ${extracted?.brand?.name || 'N/A'}`)
      if (result.switched) {
        console.warn(`[${agentId}] 🔄 Switched to Claude during extraction`)
      }
      return extracted
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      lastError = errMsg
      console.error(`[${agentId}] ❌ Attempt ${attempt + 1}/${models.length} failed (${model}): ${errMsg}`)
      if (attempt < models.length - 1) {
        console.log(`[${agentId}] ⚡ Retrying with ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  console.error(`[${agentId}] ❌ All extraction attempts failed`)
  throw new Error(`Extraction failed: ${lastError}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateProposal(
  clientBriefText: string,
  kickoffText?: string,
  brandResearch?: Record<string, unknown>,
  influencerStrategy?: Record<string, unknown>
): Promise<ProposalOutput> {
  const agentId = `proposal-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n[${agentId}] 🤖 PROPOSAL AGENT - START`)
  console.log(`[${agentId}] 📄 Client brief: ${clientBriefText.length} chars`)
  if (kickoffText) {
    console.log(`[${agentId}] 📄 Kickoff doc: ${kickoffText.length} chars`)
  } else {
    console.log(`[${agentId}] 📄 Kickoff doc: not provided`)
  }

  if (!clientBriefText || clientBriefText.trim().length < 20) {
    console.error(`[${agentId}] ❌ Brief too short: ${clientBriefText?.trim().length || 0} chars`)
    throw new Error('טקסט הבריף קצר מדי לניתוח. ודא שהמסמך נקרא בהצלחה.')
  }

  const prompt = await buildProposalPrompt(clientBriefText, kickoffText, brandResearch, influencerStrategy)
  console.log(`[${agentId}] 📝 Prompt length: ${prompt.length} chars, hasResearch=${!!brandResearch}`)

  // Primary model first, fallback second (configurable via admin)
  const models = await getProposalModels()
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      console.log(`[${agentId}] 🔄 Calling ${model} (attempt ${attempt + 1}/${models.length})...`)
      const callStart = Date.now()

      const aiResult = await callAI({
        model,
        prompt,
        systemPrompt: 'אתה מנהל קריאייטיב ואסטרטג ראשי. החזר JSON בלבד.',
        geminiConfig: { responseMimeType: 'application/json' },
        thinkingLevel: 'MEDIUM',
        maxOutputTokens: 32000,
        callerId: agentId,
      })

      const text = aiResult.text || ''
      console.log(`[${agentId}] ✅ ${aiResult.provider} responded in ${Date.now() - callStart}ms (${aiResult.model})`)
      console.log(`[${agentId}] 📊 Response size: ${text.length} chars`)
      if (aiResult.switched) console.warn(`[${agentId}] 🔄 Switched to Claude during proposal generation`)

      if (!text) throw new Error('AI returned empty response')

      const raw = parseGeminiJson<RawProposalResponse>(text)
      const result = normalizeResponse(raw, !!kickoffText, agentId)

      console.log(`[${agentId}] ✅ Proposal generated successfully`)
      if (attempt > 0) console.log(`[${agentId}] ✅ Succeeded with fallback model (${model})`)
      logProposalSummary(result, agentId)
      console.log(`[${agentId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)

      return result
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error(`[${agentId}] ❌ Attempt ${attempt + 1}/${models.length} failed (${model}): ${errMsg}`)

      if (errMsg.includes('קצר מדי')) throw error

      if (attempt < models.length - 1) {
        console.log(`[${agentId}] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000))
      } else {
        console.error(`[${agentId}] ⏱️ TOTAL TIME (all failed): ${Date.now() - startTime}ms`)
        throw new Error(`שגיאה בעיבוד המסמכים: ${errMsg}`)
      }
    }
  }
  throw new Error('שגיאה בעיבוד המסמכים')
}

// ============================================================
// Internal types for the raw Gemini response
// ============================================================

interface RawProposalResponse {
  extracted: {
    brand: { name: string; officialName?: string; background: string; industry: string; subIndustry?: string; website?: string; tagline?: string }
    budget: { amount: number; currency: string; breakdown?: string }
    campaignGoals: string[]
    targetAudience: {
      primary: { gender: string; ageRange: string; socioeconomic?: string; lifestyle?: string; interests: string[]; painPoints: string[] }
      secondary?: { gender: string; ageRange: string; description: string }
      behavior?: string
    }
    keyInsight?: string
    insightSource?: string
    deliverables?: { type: string; quantity?: number; description?: string }[]
    influencerPreferences?: { types?: string[]; specificNames?: string[]; criteria?: string[]; verticals?: string[] }
    timeline?: { startDate?: string; endDate?: string; duration?: string; milestones?: string[] }
    additionalNotes?: string[]
    successMetrics?: string[]
    clientSpecificRequests?: string[]
    competitorMentions?: string[]
  }
  stepData: {
    brief: { brandName: string; brandBrief: string; brandPainPoints: string[]; brandObjective: string; successMetrics?: string[]; clientSpecificRequests?: string[] }
    goals: { goals: { title: string; description: string }[]; customGoals: string[] }
    target_audience: { targetGender: string; targetAgeRange: string; targetDescription: string; targetBehavior: string; targetInsights: string[]; targetSecondary?: { gender: string; ageRange: string; description: string } }
    key_insight: { keyInsight: string; insightSource: string; insightData?: string }
    strategy: { strategyHeadline: string; strategyDescription?: string; strategyPillars: { title: string; description: string }[] }
    creative: { activityTitle: string; activityConcept: string; activityDescription: string; activityApproach: { title: string; description: string }[]; activityDifferentiator?: string }
    deliverables: { deliverables: { type: string; quantity: number; description: string; purpose: string }[]; deliverablesSummary?: string }
    quantities: { influencerCount: number; contentTypes: { type: string; quantityPerInfluencer: number; totalQuantity: number }[]; campaignDurationMonths: number; totalDeliverables: number; formula?: string }
    media_targets: { budget: number; currency: string; potentialReach: number; potentialEngagement: number; cpe: number; cpm?: number; estimatedImpressions?: number; metricsExplanation?: string }
    influencers: { influencers: { name: string; username: string; categories: string[]; followers: number; engagementRate: number; bio?: string; profileUrl: string; profilePicUrl: string }[]; influencerStrategy?: string; influencerCriteria?: string[] }
  }
}

// ============================================================
// Prompt builder - HEAVILY OPTIMIZED FOR "WOW" PDF OUTPUT
// ============================================================

async function buildProposalPrompt(
  clientBriefText: string,
  kickoffText?: string,
  brandResearch?: Record<string, unknown>,
  influencerStrategy?: Record<string, unknown>
): Promise<string> {
  // Build a rich research context — formatted as readable text, not raw JSON dumps
  const r = brandResearch || {}

  const formatList = (arr: unknown[] | undefined, fallback = 'לא נמצא') => {
    if (!arr || arr.length === 0) return fallback
    return arr.map((item, i) => {
      if (typeof item === 'string') return `  ${i + 1}. ${item}`
      if (typeof item === 'object' && item) {
        const o = item as Record<string, unknown>
        const name = o.name || o.title || o.competitorName || ''
        const desc = o.description || o.differentiator || o.campaignDescription || ''
        return `  ${i + 1}. **${name}** — ${desc}`
      }
      return `  ${i + 1}. ${String(item)}`
    }).join('\n')
  }

  const td = (r.targetDemographics as Record<string, unknown>) || {}
  const pa = (td.primaryAudience as Record<string, unknown>) || {}

  // Pre-format optional new research fields for injection
  const tensionsArr = (r as Record<string, unknown>).tensions as string[] | undefined
  const tensionsSection = tensionsArr?.length
    ? `\n### מתחים שזוהו (חומר גלם ל-Insight!):\n${tensionsArr.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
    : ''
  const bvg = (r as Record<string, unknown>).brandVoiceGuide as Record<string, unknown> | undefined
  const brandVoiceSection = bvg
    ? `- **מדריך קול מותג:** ${JSON.stringify(bvg)}\n⚠️ כתוב את כל ההצעה בטון שמתאים למותג הזה — לא בטון גנרי.`
    : ''

  const researchSection = brandResearch ? `
## מחקר אסטרטגי מעמיק שנאסף על המותג:
**חובה להשתמש בנתונים האלה כדי לכתוב תוכן ספציפי ומבוסס — לא גנרי!**

### מיקום בשוק ותחרות:
${(r.marketPosition as string) || 'לא נמצא'}

**מתחרים:**
${formatList(r.competitors as unknown[])}

**יתרונות תחרותיים:**
${formatList(r.competitiveAdvantages as unknown[])}

**USP — יתרונות ייחודיים:**
${formatList(r.uniqueSellingPoints as unknown[])}

**פער תחרותי (הזדמנות!):**
${(r.competitiveGap as string) || 'לא זוהה'}

### טרנדים, הקשר וטריגר:
**טרנדים בתעשייה:**
${formatList(r.industryTrends as unknown[])}

- **למה עכשיו:** ${(r.whyNowTrigger as string) || 'לא נמצא'}
- **הקשר ישראלי:** ${(r.israeliMarketContext as string) || 'לא נמצא'}
- **פלטפורמה דומיננטית בישראל:** ${(r.dominantPlatformInIsrael as string) || 'לא נמצא'}
- **עונתיות:** ${(r.seasonality as string) || 'לא נמצא'}

### זהות המותג (קובע את טון הכתיבה!):
- **אישיות:** ${((r.brandPersonality as string[]) || []).join(', ') || 'לא נמצא'}
- **ערכים:** ${((r.brandValues as string[]) || []).join(', ') || 'לא נמצא'}
- **הבטחת מותג:** ${(r.brandPromise as string) || 'לא נמצא'}
- **טון דיבור:** ${(r.toneOfVoice as string) || 'לא נמצא'}
${brandVoiceSection}
${tensionsSection}

### קהל יעד מהמחקר:
- **מגדר:** ${pa.gender || 'לא צוין'}
- **גיל:** ${pa.ageRange || 'לא צוין'}
- **סוציו-אקונומי:** ${pa.socioeconomic || 'לא צוין'}
- **אורח חיים:** ${pa.lifestyle || 'לא צוין'}
- **תחומי עניין:** ${((pa.interests as string[]) || []).join(', ') || 'לא צוין'}
- **כאבים:** ${((pa.painPoints as string[]) || []).join(', ') || 'לא צוין'}
- **התנהגות צרכנית:** ${td.behavior || 'לא צוין'}

### קמפיינים קודמים ותחרותיים:
**של המותג:**
${formatList((r.previousCampaigns as unknown[])?.slice(0, 4))}

**של מתחרים:**
${formatList((r.competitorCampaigns as unknown[])?.slice(0, 4))}

### נוכחות דיגיטלית:
- **נושאי תוכן מומלצים:** ${((r.contentThemes as string[]) || []).join(', ') || 'לא נמצא'}
- **גישה מומלצת:** ${(r.suggestedApproach as string) || 'לא נמצא'}
- **סוגי משפיענים מומלצים:** ${((r.influencerTypes as string[]) || []).join(', ') || 'לא נמצא'}
${influencerStrategy ? `
### אסטרטגיית משפיענים (מחקר שוק אמיתי):
${JSON.stringify(influencerStrategy, null, 1).slice(0, 4000)}` : ''}
` : ''

  // Admin-configurable system prompt and writing rules
  const systemPrompt = await getConfig('ai_prompts', 'proposal_agent.system_prompt', `אתה ראש אסטרטגיה בסוכנות שיווק משפיענים מובילה בישראל.
אתה כותב הצעה שמשדרת דבר אחד: "אנחנו מבינים אתכם יותר טוב ממה שאתם מבינים את עצמכם".

ההצעה היא לא מסמך — היא כלי מכירה. כל פסקה צריכה לגרום ללקוח לחשוב:
- "הם עשו שיעורי בית"
- "הם חושבים אחרת"
- "אני רוצה לעבוד איתם"

התוצר יעוצב כ-PDF מגזיני. כל משפט ייקרא על רקע עיצובי.
אם המשפט לא עובד כשורה בודדת על שקף — הוא ארוך מדי.`)

  const writingRules = await getConfig('ai_prompts', 'proposal_agent.writing_rules', `## חוקי כתיבה:

### טון ושפה:
- עברית נקייה ומדויקת. לא "נלברג את הקמפיין" אלא "נבנה קמפיין שמשנה שיחה". לא "נמנף את הפלטפורמה" אלא "נפעיל דרך".
- מינימום מילים לועזיות. "חשיפה" לא "אקספוז'ר". "מעורבות" לא "אנגייג'מנט". "תוכן שנוצר ע"י משתמשים" לא "UGC" (חריגים: KPI, ROI — מונחים שאין להם תחליף עברי מקובל).
- ביטחון שקט: עובדות, לא תשבוחות.
  טוב: "6 קמפיינים בקטגוריה ב-12 חודשים האחרונים"
  רע: "ניסיון עשיר ורב-שנתי בתחום"
- אסור סופרלטיבים ריקים. המילים הבאות אסורות בלי נתון תומך: "מוביל", "פורץ דרך", "חדשני", "ייחודי", "מהפכני", "פרימיום", "הכי טוב", "ללא תחרות".

### מבנה:
- משפט עד 15 מילים. אם יותר — שבור לשניים.
- פסקה עד 3 משפטים. ההצעה לא מאמר אקדמי.
- כל פסקה: claim ← proof. פותחת בטענה, נסגרת בנתון.
  דוגמה: "הקהל שלכם חי בסטוריז. 72% צפייה יומית, מחקר גלובס 2025."
- כותרות: מקסימום 5 מילים. ללא נקודתיים. קו מחשבה (—) אם צריך חיבור.
  טוב: "הפיד שמשנה כללים"
  רע: "אסטרטגיית תוכן — גישה חדשנית ופורצת דרך"
- **סתירות:** מסמך ההתנעה תמיד גובר על הבריף.

### אנטי-פטרנים — דברים שמסגירים שטקסט נכתב ע"י AI:
(אם אתה מוצא את עצמך כותב משפט כזה — מחק ונסח מחדש)

- "בעידן הדיגיטלי של היום" — כולם יודעים. מיותר.
- "ניצור באזז ברשתות" — באזז על מה? איך? כמה?
- "נחבר בין המותג לקהל היעד" — זה מה שכל קמפיין עושה. מה המהלך?
- "חוויה ייחודית ומרתקת" — שני שמות תואר שלא אומרים כלום.
- "תוכן איכותי ומעורר השראה" — מה הופך אותו לאיכותי? תתאר.
- "נמנף את הפלטפורמה" — עברית.
- "מהלך משולב ורב-ערוצי" — תפרט: אילו ערוצים, מה בכל אחד.
- "נגביר מודעות ונחזק את הקשר" — שני פעלים ריקים. מה קורה בפועל?
- "נספר את הסיפור של המותג" — איזה סיפור? תספר אותו.
- "בצורה אותנטית וטבעית" — אם צריך להגיד שזה אותנטי, זה לא.

דוגמה: במקום "ניצור תוכן מעורר השראה שיגביר מודעות" —
"10 יוצרות מצלמות סרטוני בוקר אמיתיים עם המוצר. בלי תסריט. הפיד ייראה כמו המלצה מחברה — כי זה בדיוק מה שזה."

דוגמה: במקום "נפעיל קמפיין רב-ערוצי שיחבר בין המותג לקהל" —
"Instagram לחשיפה ראשונית: 3 Reels בשבוע. TikTok להמרה: קוד הנחה ייעודי לכל משפיענית. סטוריז לשימור: Q&A חי פעם בשבועיים."

### Key Insight — הלב של ההצעה:

תובנה = הרגע שהלקוח אומר "וואו, אף אחד לא ניסח לי את זה ככה".

תובנה נולדת מהפגשה בין שני דברים:
(א) אמת אנושית — משהו שהקהל מרגיש/עושה/חושב אבל לא מנסח
(ב) מתח מותגי — הפער בין מה שהמותג מציע למה שהקהל באמת צריך

הנוסחה: [קהל] + [התנהגות/רגש אמיתי] + [הפער] = תובנה
ואז: המותג = הגשר שסוגר את הפער.

דוגמה 1 (קוסמטיקה, נשים 28-38):
  אמת: הן קונות לילדים בלי לחשוב, אבל מרגישות אשמה על רכישה לעצמן.
  מתח: המותג מדבר על "פינוק" — אבל הקהל לא מרשה לעצמו פינוק.
  תובנה: "הבנות שקונות הכל לכולם שוכחות לקנות לעצמן."
  גשר: המותג = ה-permission לעצור רגע.

דוגמה 2 (מזון בריא, צעירים 22-30):
  אמת: הם רוצים לאכול בריא אבל לא מוכנים לוותר על טעם.
  מתח: מותגי "בריא" מדברים על חיים ארוכים — אבל ב-22 אף אחד לא חושב על חיים ארוכים.
  תובנה: "דור שלא מוותר — גם לא על הבריאות שלו."
  גשר: המותג = בריא שלא מתפשר על טעם.

דוגמה 3 (פינטק, גברים 30-45):
  אמת: הם מרגישים שהם צריכים "להבין" בהשקעות אבל מתביישים שלא.
  מתח: המותג מדבר על "פשטות" — אבל הקהל שומע "פשוט = לילדים".
  תובנה: "כולם מעמידים פנים שהם מבינים. אף אחד לא באמת מבין."
  גשר: המותג = ההרשאה להודות שזה מבלבל + הפתרון.

דוגמאות חלשות (אסור!):
- "נשים אוהבות טיפוח ורוצות להיראות טוב" — לא תובנה, עובדה.
- "הקהל פעיל ברשתות" — נכון על כל קהל. לא ספציפי.
- "אנשים מחפשים מוצרים איכותיים" — ברור. מה החדש?
- "הצרכן הישראלי אוהב מבצעים" — סטריאוטיפ, לא תובנה.

מבחן התובנה:
1. מפתיעה? — גורמת לרגע של "רגע, נכון!"?
2. מגובה? — יש נתון, מחקר, או התנהגות נצפית שתומכים?
3. ספציפית? — אם מחליפים את שם המותג ומשהו לא נשבר — לא ספציפית מספיק.
4. פעילה? — אפשר לבנות עליה קמפיין? אם לא — היא תובנה אקדמית.

השתמש ב-tensions מהמחקר כחומר גלם לתובנה.

### קריאייטיב — הקונספט:

הקונספט חייב לפתור את המתח שזוהה ב-Key Insight.
Insight אומר "X" — הקונספט מראה "איך המותג פותר X בצורה שאף אחד לא חשב עליה".

מה מפריד קונספט טוב מבינוני:
1. MECHANIC — לא רק רעיון, אלא מנגנון. לא "מה הקהל רואה" אלא "מה הקהל עושה". קמפיין שגורם לאנשים לפעול > קמפיין שגורם לאנשים לצפות.
2. TENSION — משהו לא צפוי. לא "משפיענים יספרו על המוצר" אלא "משפיענים יגלו שהם טעו לגבי X".
3. TALK VALUE — אנשים ירצו לספר. המבחן: "שמעת מה X עשו?" אם אי אפשר לסכם את הקונספט במשפט אחד שמישהו ישלח לחבר — זה לא מספיק.

מבנה הקונספט:
1. שם הקמפיין: 2-4 מילים שמכילות את הרעיון.
   טוב: "הבוקר של עצמי" / "הכל על השולחן"
   רע: "קמפיין אביב 2026" / "מותג X — קמפיין דיגיטלי"
2. Hook — משפט אחד שמסביר למה מישהו יעצור לצפות.
3. Mechanic — מה קורה בפועל, שלב אחרי שלב. לא "משפיענים ישתפו תוכן" — אלא:
   "שלב 1: 5 יוצרות מקבלות בקופסא את המוצר + אתגר אישי.
    שלב 2: כל אחת מצלמת את הניסיון הראשון — unscripted.
    שלב 3: הקהל מצביע מי ניצחה.
    שלב 4: המנצחת עושה שידור חי של..."
4. תפקיד המשפיען — לא "יפרסם את המוצר" אלא מה הסיפור שלו בקמפיין.
5. הרגע הוויראלי — מה הדבר הספציפי שישותף. לא "התוכן ישותף" אלא "הרגע שהיא פותחת את הקופסה ומגלה ש-..."

גנרי: "נשתף פעולה עם 5 משפיענות לייפסטייל ליצירת תוכן אותנטי ומעורר השראה שיציג את המוצר בשגרת היומיום שלהן."

ספציפי:
שם: "הבוקר שלי, באמת"
Hook: "מה עושות המשפיענות שאת הכי עוקבת אחריהן ב-6:30 בבוקר? לפני הפילטרים, לפני הסטיילינג?"
Mechanic:
  1. 5 יוצרות מקבלות מצלמה חד-פעמית (לא טלפון) ל-48 שעות
  2. מצלמות את הבוקר האמיתי — כולל הבלגן, הקפה, הילדים
  3. בתוך הבוקר — שימוש אמיתי במוצר, ללא הנחיית צילום
  4. התמונות עולות raw — בלי עריכה, בלי פילטר
  5. הקהל מצביע: "באיזה בוקר הייתם רוצים להתעורר?"
Talk Value: "ראית את הסטוריז של X? היא צילמה בלי פילטר הכל..."

### מבנה נרטיבי של ההצעה:

ההצעה מספרת סיפור ב-4 פרקים. כל שלב בוויזארד שייך לפרק. כשאתה כותב שלב — תחשוב מה התפקיד שלו בסיפור.

פרק 1 — "אנחנו מבינים אתכם" (brief + goals + audience)
  נפתח בשיקוף מדויק של המותג. הלקוח קורא ומרגיש "הם עשו שיעורי בית רציניים". שימוש מרבי בנתוני מחקר. מראים שהבנו את האתגר שלהם — לא מלמדים אותם מה הם עושים.

פרק 2 — "יש לנו תובנה שתשנה את המבט" (insight + strategy)
  הרגע הכי חשוב. ה-insight מפתיע, ה-strategy גורמת ללקוח לומר "למה לא חשבנו על זה?". כאן ההצעה מפסיקה לתאר ומתחילה להוביל. מהלך מנטלי מ-"הם מבינים" ל-"הם יודעים משהו שאנחנו לא".

פרק 3 — "ככה זה ייראה בפועל" (creative + deliverables + influencers)
  הלקוח *רואה* את הקמפיין קורה. שמות, מספרים, פורמטים, לו"ז. לא "נעשה תוכן" — אלא "3 סרטוני Reels בסגנון behind-the-scenes עם ליאור סושרד בשבוע 2-3, הפצה אורגנית + בוסט של 5K".

פרק 4 — "התוצאות מדברות" (metrics + closing)
  ביטחון. מספרים צפויים, השוואה ל-benchmarks בקטגוריה. סיום שמשאיר טעם של "אני רוצה להתחיל מחר".

### כיול טון למותג הספציפי:

לפני שאתה כותב מילה — הבן את אישיות המותג מהמחקר. קרא את brandVoiceGuide, toneOfVoice, brandPersonality ותתאם.

| אופי המותג | טון הכתיבה | דוגמה |
|------------|-----------|-------|
| פיננסי/מוסדי | רציני, מקצועי, data-first. ללא סלנג/הומור. | "תשואה של 12.4% בשלוש שנים" |
| אופנה/לייפסטייל | קליל, תרבותי, חוצפן. | "הפיד שלהן הוא מודבורד חי" |
| מזון/FMCG | חם, משפחתי, חושי. | "הריח של שישי בצהריים" |
| טכנולוגיה/SaaS | חד, בהיר, יעיל. | "47% פחות זמן טיפול" |
| ילדים/הורים | אמפתי, מרגיע, אופטימי. | "כי הם גדלים מהר מדי" |
| בריאות/ביוטי | מעצים, אישי, פוזיטיבי. | "העור שלך כבר יודע — תני לו" |
| ספורט/אקטיבי | אנרגטי, ישיר, מאתגר. | "אין תירוצים. יש תוצאות." |

ההצעה כולה צריכה להישמע כאילו היא כבר חלק מהמותג. אל תכתוב בטון "סוכנות" גנרי לכל מותג.`)

  return `${systemPrompt}

## מסמך 1: בריף לקוח (Client Brief)
${clientBriefText}

${kickoffText ? `## מסמך 2: מסמך התנעה פנימי (Kickoff Notes)
${kickoffText}` : '(לא סופק מסמך התנעה)'}
${researchSection}

${writingRules}

## פורמט הפלט (JSON):
{
  "extracted": {
    "brand": {
      "name": "שם המותג",
      "officialName": "שם באנגלית או null",
      "background": "רקע המותג - חילוץ מדויק",
      "industry": "תעשייה",
      "subIndustry": "תת-תעשייה או null",
      "website": "כתובת אתר או null",
      "tagline": "סלוגן או null"
    },
    "budget": {
      "amount": 0,
      "currency": "₪",
      "breakdown": "פירוט או null"
    },
    "campaignGoals": ["מטרה 1", "מטרה 2"],
    "targetAudience": {
      "primary": {
        "gender": "נשים/גברים/שניהם",
        "ageRange": "25-34",
        "socioeconomic": "רמה סוציו או null",
        "lifestyle": "אורח חיים",
        "interests": ["תחום 1", "תחום 2"],
        "painPoints": ["כאב 1", "כאב 2"]
      },
      "secondary": null,
      "behavior": "התנהגות צרכנית"
    },
    "keyInsight": "תובנה או null",
    "insightSource": "מקור או null",
    "deliverables": [
      { "type": "סוג", "quantity": null, "description": "תיאור" }
    ],
    "influencerPreferences": {
      "types": ["מיקרו", "מאקרו"],
      "specificNames": ["שם"],
      "criteria": ["קריטריון"],
      "verticals": ["תחום"]
    },
    "timeline": {
      "startDate": null,
      "endDate": null,
      "duration": "משך או null",
      "milestones": []
    },
    "additionalNotes": ["הערה חשובה"],
    "successMetrics": ["מדד הצלחה 1 שהלקוח ציין", "מדד 2 — ציטוט מדויק מהבריף"],
    "clientSpecificRequests": ["דרישה ספציפית שהלקוח ביקש", "הגבלה או דגש מיוחד"],
    "competitorMentions": ["מתחרה 1 שהוזכר בבריף", "מתחרה 2"]
  },
  "stepData": {
    "brief": {
      "brandName": "שם המותג",
      "brandBrief": "3-4 משפטים. תקציר שמשקף את המותג כפי שהלקוח רואה אותו. לא 'חברת X היא מותג מוביל' — אלא 'X בונים מוצרי טיפוח לנשים שאין להן 45 דקות שגרה — אבל לא מוכנות לוותר.'",
      "brandPainPoints": ["אתגר עסקי ספציפי 1 (לא 'תחרות גוברת בשוק' — אלא '3 מתחרים חדשים נכנסו לקטגוריה ב-2025')", "אתגר 2"],
      "brandObjective": "משפט אחד ברור. מה הלקוח רוצה שיקרה.",
      "successMetrics": ["מדד הצלחה 1 — ציטוט מדויק מהבריף", "מדד 2"],
      "clientSpecificRequests": ["דרישה ספציפית"]
    },
    "goals": {
      "goals": [
        { "title": "עד 5 מילים. פאנצ'י אבל ברור. לא 'הגברת המודעות' — אלא 'שכל אמא תכיר אותנו'", "description": "2 משפטים. מה + איך + מדד." },
        { "title": "מטרה 2", "description": "2 משפטים. מה + איך + מדד." }
      ],
      "customGoals": []
    },
    "target_audience": {
      "targetGender": "המגדר המדויק",
      "targetAgeRange": "טווח גילי",
      "targetDescription": "תאר בן אדם, לא סגמנט. למשל: 'נועה, 29, גרה בתל אביב, עובדת בהייטק, גוללת אינסטגרם בדרך לעבודה. קונה באסוס כי אין לה כוח לקניון. יודעת בדיוק מה היא רוצה אבל צריכה שמישהי שהיא סומכת עליה תגיד לה קניתי את זה, שווה.'",
      "targetBehavior": "איך הם באמת מתנהגים — לא 'צורכים תוכן דיגיטלי' אלא 'גוללים טיקטוק 40 דקות לפני השינה, שומרים פוסטים שנראים כמו מהחיים ולא כמו פרסומת'.",
      "targetInsights": ["תובנה התנהגותית ספציפית 1 עם משמעות לקמפיין", "תובנה 2"],
      "targetSecondary": null
    },
    "key_insight": {
      "keyInsight": "עקוב אחרי הנחיות ה-Key Insight למעלה. תובנה שנולדת מהפגשה בין אמת אנושית למתח מותגי. חייבת לעבור את מבחן 4 השלבים: מפתיעה, מגובה, ספציפית, פעילה.",
      "insightSource": "מאיפה התובנה — מחקר / נתון / התנהגות נצפית. חייב להיות ספציפי.",
      "insightData": "הנתון התומך. ספציפי ומגובה."
    },
    "strategy": {
      "strategyHeadline": "משפט אחד שמסכם את כל האסטרטגיה. לא 'אסטרטגיה דיגיטלית משולבת' — אלא 'נהפוך 500 לקוחות לשגרירות'.",
      "strategyDescription": "פסקה אחת שמסבירה את הפיצוח האסטרטגי.",
      "strategyPillars": [
        { "title": "כותרת חדה 1", "description": "2-3 משפטים. מה עושים בפועל ולמה זה עובד." },
        { "title": "כותרת חדה 2", "description": "2-3 משפטים. פעולה קונקרטית." }
      ]
    },
    "creative": {
      "activityTitle": "שם הקמפיין: 2-4 מילים שמכילות את הרעיון. לא 'קמפיין אביב 2026'. כן: 'הבוקר של עצמי'.",
      "activityConcept": "עקוב אחרי הנחיות הקריאייטיב למעלה. Hook — משפט אחד שמסביר למה מישהו יעצור לצפות.",
      "activityDescription": "Mechanic — מה קורה בפועל, שלב אחרי שלב. לא 'משפיענים ישתפו תוכן' אלא תיאור כל שלב בנפרד.",
      "activityApproach": [
        { "title": "גישה 1", "description": "מנגנון ספציפי, לא רעיון עמום. מה הקהל עושה, לא רק מה הוא רואה." },
        { "title": "גישה 2", "description": "מנגנון ספציפי שני — כל גישה חייבת לתאר פעולה." }
      ],
      "activityDifferentiator": "Talk Value — מה הדבר שאנשים ישלחו לחבר? 'שמעת מה X עשו?'"
    },
    "deliverables": {
      "deliverables": [
        { "type": "12 פוסטי Instagram (4 Reels + 4 Carousels + 4 Stories)", "quantity": 12, "description": "Reels לחשיפה, Carousels לעומק, Stories להמרה", "purpose": "מטרה ברורה לכל סוג" }
      ],
      "deliverablesSummary": "משפט מסכם על תמהיל התוכן."
    },
    "quantities": {
      "influencerCount": 5,
      "contentTypes": [
        { "type": "רילז", "quantityPerInfluencer": 1, "totalQuantity": 5 }
      ],
      "campaignDurationMonths": 1,
      "totalDeliverables": 25,
      "formula": "X משפיענים × Y תכנים = Z חשיפות. הסבר משכנע — למה דווקא המספרים האלה?"
    },
    "media_targets": {
      "budget": 50000,
      "currency": "₪",
      "potentialReach": 500000,
      "potentialEngagement": 25000,
      "cpe": 2.0,
      "cpm": 100,
      "estimatedImpressions": 500000,
      "metricsExplanation": "כל מדד + benchmark בקטגוריה להשוואה. 'CPE צפוי: 4.2 שח (ממוצע בקטגוריה: 6.1 שח)'. הסבר קצר למה המספרים ריאליסטיים."
    },
    "influencers": {
      "influencers": [
        {
          "name": "שם אותנטי",
          "username": "@handle",
          "categories": ["קטגוריה"],
          "followers": 75000,
          "engagementRate": 4.2,
          "bio": "מה הסיפור שלו בקמפיין? לא 'תפרסם את המוצר' — אלא 'תצלם סרטון של הבוקר שלה עם X'. מה הפורמט שלו?",
          "profileUrl": "",
          "profilePicUrl": ""
        }
      ],
      "influencerStrategy": "פסקה שמסבירה את ליהוק הנבחרת — למה דווקא השילוב הזה.",
      "influencerCriteria": ["אותנטיות בקטגוריה", "התאמת קהל", "פורמט תוכן מתאים"]
    }
  }
}
`
}

// ============================================================
// Post-processors
// ============================================================

/** Replace colons in title fields with em-dash. Handles Hebrew and English. */
function stripColonsFromTitles(stepData: Partial<WizardStepDataMap>): void {
  const fix = (s: string | undefined | null): string =>
    s ? s.replace(/\s*:\s*/g, ' — ').replace(/^—\s*/, '') : s || ''

  // Goals
  if (stepData.goals?.goals) {
    for (const g of stepData.goals.goals) {
      g.title = fix(g.title)
    }
  }
  if (stepData.goals?.customGoals) {
    for (const g of stepData.goals.customGoals) {
      if (typeof g === 'object' && g && 'title' in g) {
        (g as { title: string }).title = fix((g as { title: string }).title)
      }
    }
  }

  // Strategy
  if (stepData.strategy) {
    stepData.strategy.strategyHeadline = fix(stepData.strategy.strategyHeadline)
    if (stepData.strategy.strategyPillars) {
      for (const p of stepData.strategy.strategyPillars) {
        p.title = fix(p.title)
      }
    }
  }

  // Creative
  if (stepData.creative) {
    stepData.creative.activityTitle = fix(stepData.creative.activityTitle)
    if (stepData.creative.activityApproach) {
      for (const a of stepData.creative.activityApproach) {
        a.title = fix(a.title)
      }
    }
  }
}

// ============================================================
// Response normalization
// ============================================================

function normalizeResponse(
  raw: RawProposalResponse,
  hasKickoff: boolean,
  agentId: string
): ProposalOutput {
  console.log(`[${agentId}] 🔄 Normalizing response...`)

  // Normalize extracted data
  const extracted: ExtractedBriefData = {
    brand: {
      name: raw.extracted?.brand?.name || '',
      officialName: raw.extracted?.brand?.officialName,
      background: raw.extracted?.brand?.background || '',
      industry: raw.extracted?.brand?.industry || '',
      subIndustry: raw.extracted?.brand?.subIndustry,
      website: raw.extracted?.brand?.website,
      tagline: raw.extracted?.brand?.tagline,
    },
    budget: {
      amount: raw.extracted?.budget?.amount || 0,
      currency: raw.extracted?.budget?.currency || '₪',
      breakdown: raw.extracted?.budget?.breakdown,
    },
    campaignGoals: raw.extracted?.campaignGoals || [],
    targetAudience: {
      primary: {
        gender: raw.extracted?.targetAudience?.primary?.gender || '',
        ageRange: raw.extracted?.targetAudience?.primary?.ageRange || '',
        socioeconomic: raw.extracted?.targetAudience?.primary?.socioeconomic,
        lifestyle: raw.extracted?.targetAudience?.primary?.lifestyle,
        interests: raw.extracted?.targetAudience?.primary?.interests || [],
        painPoints: raw.extracted?.targetAudience?.primary?.painPoints || [],
      },
      secondary: raw.extracted?.targetAudience?.secondary,
      behavior: raw.extracted?.targetAudience?.behavior,
    },
    keyInsight: raw.extracted?.keyInsight,
    insightSource: raw.extracted?.insightSource,
    deliverables: raw.extracted?.deliverables || [],
    influencerPreferences: raw.extracted?.influencerPreferences || {},
    timeline: raw.extracted?.timeline || {},
    additionalNotes: raw.extracted?.additionalNotes || [],
    successMetrics: raw.extracted?.successMetrics || [],
    clientSpecificRequests: raw.extracted?.clientSpecificRequests || [],
    competitorMentions: raw.extracted?.competitorMentions || [],
    _meta: {
      confidence: raw.extracted?.brand?.name ? 'high' : 'medium',
      clientBriefProcessed: true,
      kickoffDocProcessed: hasKickoff,
      warnings: [],
    },
  }

  // Add warnings
  if (!extracted.brand.name) extracted._meta.warnings.push('שם המותג לא נמצא')
  if (!extracted.budget.amount) extracted._meta.warnings.push('תקציב לא נמצא')

  // Normalize step data with safe defaults
  const sd = raw.stepData || {} as RawProposalResponse['stepData']

  const stepData: Partial<WizardStepDataMap> = {
    brief: {
      brandName: sd.brief?.brandName || extracted.brand.name || '',
      brandBrief: sd.brief?.brandBrief || extracted.brand.background || '',
      brandPainPoints: sd.brief?.brandPainPoints || [],
      brandObjective: sd.brief?.brandObjective || extracted.campaignGoals?.[0] || '',
      successMetrics: sd.brief?.successMetrics || extracted.successMetrics || [],
      clientSpecificRequests: sd.brief?.clientSpecificRequests || extracted.clientSpecificRequests || [],
    },
    goals: {
      goals: sd.goals?.goals?.length ? sd.goals.goals : (extracted.campaignGoals || []).map(g => ({ title: g, description: '' })),
      customGoals: sd.goals?.customGoals || [],
    },
    target_audience: {
      targetGender: sd.target_audience?.targetGender || extracted.targetAudience?.primary?.gender || '',
      targetAgeRange: sd.target_audience?.targetAgeRange || extracted.targetAudience?.primary?.ageRange || '',
      targetDescription: sd.target_audience?.targetDescription || extracted.targetAudience?.primary?.lifestyle || '',
      targetBehavior: sd.target_audience?.targetBehavior || extracted.targetAudience?.behavior || '',
      targetInsights: sd.target_audience?.targetInsights || extracted.targetAudience?.primary?.interests || [],
      targetSecondary: sd.target_audience?.targetSecondary || extracted.targetAudience?.secondary,
    },
    key_insight: {
      keyInsight: sd.key_insight?.keyInsight || '',
      insightSource: sd.key_insight?.insightSource || '',
      insightData: sd.key_insight?.insightData,
    },
    strategy: {
      strategyHeadline: sd.strategy?.strategyHeadline || '',
      strategyDescription: sd.strategy?.strategyDescription,
      strategyPillars: sd.strategy?.strategyPillars || [],
    },
    creative: {
      activityTitle: sd.creative?.activityTitle || '',
      activityConcept: sd.creative?.activityConcept || '',
      activityDescription: sd.creative?.activityDescription || '',
      activityApproach: sd.creative?.activityApproach || [],
      activityDifferentiator: sd.creative?.activityDifferentiator,
      referenceImages: [],
    },
    deliverables: {
      deliverables: sd.deliverables?.deliverables?.length
        ? sd.deliverables.deliverables.map(d => ({
            type: d.type || '',
            quantity: d.quantity || 1,
            description: d.description || '',
            purpose: d.purpose || '',
          }))
        : (extracted.deliverables || []).map(d => ({
            type: d.type,
            quantity: d.quantity || 1,
            description: d.description || '',
            purpose: '',
          })),
      deliverablesSummary: sd.deliverables?.deliverablesSummary,
      referenceImages: [],
    },
    quantities: {
      influencerCount: sd.quantities?.influencerCount || 5,
      contentTypes: sd.quantities?.contentTypes || [],
      campaignDurationMonths: sd.quantities?.campaignDurationMonths || 1,
      totalDeliverables: sd.quantities?.totalDeliverables || 0,
      formula: sd.quantities?.formula,
    },
    media_targets: {
      budget: sd.media_targets?.budget || extracted.budget?.amount || 0,
      currency: sd.media_targets?.currency || extracted.budget?.currency || '₪',
      potentialReach: sd.media_targets?.potentialReach || 0,
      potentialEngagement: sd.media_targets?.potentialEngagement || 0,
      cpe: sd.media_targets?.cpe || 0,
      cpm: sd.media_targets?.cpm,
      estimatedImpressions: sd.media_targets?.estimatedImpressions,
      metricsExplanation: sd.media_targets?.metricsExplanation,
    },
    influencers: {
      influencers: (sd.influencers?.influencers || []).map(inf => ({
        name: inf.name || '',
        username: inf.username || '',
        profileUrl: inf.profileUrl || '',
        profilePicUrl: inf.profilePicUrl || '',
        categories: inf.categories || [],
        followers: inf.followers || 0,
        engagementRate: inf.engagementRate || 0,
        bio: inf.bio,
      })),
      influencerStrategy: sd.influencers?.influencerStrategy,
      influencerCriteria: sd.influencers?.influencerCriteria || [],
    },
  }

  // Post-process: strip colons from all title fields
  stripColonsFromTitles(stepData)

  return { extracted, stepData }
}

// ============================================================
// Logging
// ============================================================

function logProposalSummary(result: ProposalOutput, agentId: string) {
  const { extracted, stepData } = result
  console.log(`[${agentId}] 📊 PROPOSAL SUMMARY:`)
  console.log(`[${agentId}]   Brand: ${extracted.brand?.name || 'N/A'}`)
  console.log(`[${agentId}]   Budget: ${extracted.budget?.currency}${extracted.budget?.amount?.toLocaleString() || 0}`)
  console.log(`[${agentId}]   Goals: ${stepData.goals?.goals?.length || 0}`)
  console.log(`[${agentId}]   Insight: ${stepData.key_insight?.keyInsight?.slice(0, 80) || 'N/A'}`)
  console.log(`[${agentId}]   Strategy: ${stepData.strategy?.strategyHeadline?.slice(0, 80) || 'N/A'}`)
  console.log(`[${agentId}]   Pillars: ${stepData.strategy?.strategyPillars?.length || 0}`)
  console.log(`[${agentId}]   Creative: ${stepData.creative?.activityTitle || 'N/A'}`)
  console.log(`[${agentId}]   Deliverables: ${stepData.deliverables?.deliverables?.length || 0}`)
  console.log(`[${agentId}]   Influencer count: ${stepData.quantities?.influencerCount || 0}`)
  console.log(`[${agentId}]   Total deliverables: ${stepData.quantities?.totalDeliverables || 0}`)
  console.log(`[${agentId}]   Reach: ${stepData.media_targets?.potentialReach?.toLocaleString() || 0}`)
  console.log(`[${agentId}]   CPE: ${stepData.media_targets?.cpe || 0}`)
  console.log(`[${agentId}]   Suggested influencers: ${stepData.influencers?.influencers?.length || 0}`)
  console.log(`[${agentId}]   Confidence: ${extracted._meta?.confidence}`)
  if (extracted._meta?.warnings?.length) {
    console.log(`[${agentId}]   Warnings: ${extracted._meta.warnings.join(', ')}`)
  }
}