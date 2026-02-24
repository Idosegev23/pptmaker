/**
 * Hybrid PPTX Generator
 * Creates pixel-perfect PowerPoint presentations by:
 * 1. Rendering HTML slides to PNG images (via Playwright)
 * 2. Using each image as slide background
 * 3. Overlaying transparent editable text boxes on key content areas
 *
 * Result: Looks exactly like the HTML/PDF, but key text is editable in PowerPoint.
 */

import PptxGenJS from 'pptxgenjs'
import { renderSlidesToImages } from '@/lib/playwright/pdf'

// ─── Constants ────────────────────────────────────────────────
// Canvas: 1920×1080px → 13.33" × 7.5"
const CANVAS = { w: 13.33, h: 7.5 }
const MARGIN = 0.56  // 80px → 0.56"
const SAFE = { x: MARGIN, y: MARGIN, w: CANVAS.w - MARGIN * 2, h: CANVAS.h - MARGIN * 2 }
const FONT = 'Arial'

// ─── Types ────────────────────────────────────────────────────

interface ProposalData {
  brandName?: string
  issueDate?: string
  campaignSubtitle?: string
  strategyHeadline?: string
  brandBrief?: string
  brandPainPoints?: string[]
  brandObjective?: string
  goals?: string[]
  goalsDetailed?: { title: string; description: string }[]
  targetGender?: string
  targetAgeRange?: string
  targetDescription?: string
  targetBehavior?: string
  targetInsights?: string[]
  keyInsight?: string
  insightSource?: string
  insightData?: string
  strategyDescription?: string
  strategyPillars?: { title: string; description: string }[]
  activityTitle?: string
  activityConcept?: string
  activityDescription?: string
  activityApproach?: { title: string; description: string }[]
  activityDifferentiator?: string
  deliverables?: string[]
  deliverablesDetailed?: { type: string; quantity: number; description: string; purpose?: string }[]
  deliverablesSummary?: string
  budget?: number
  currency?: string
  potentialReach?: number
  potentialEngagement?: number
  cpe?: number
  cpm?: number
  estimatedImpressions?: number
  metricsExplanation?: string
  influencerStrategy?: string
  influencerCriteria?: string[]
  contentGuidelines?: string[]
  enhancedInfluencers?: { name: string; username: string; profilePicUrl?: string; followers: number; engagementRate: number; categories?: string[] }[]
  scrapedInfluencers?: { name?: string; username?: string; profilePicUrl?: string; followers?: number; engagementRate?: number }[]
  _brandColors?: { primary: string; secondary: string; accent: string; background?: string; text?: string }
  [key: string]: unknown
}

// Text overlay definition: what editable text to place on top of each slide image
interface TextOverlay {
  text: string
  x: number  // inches
  y: number
  w: number
  h: number
  fontSize: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  color?: string  // transparent by default
  rtlMode?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────

function formatNum(n?: number): string {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}

// ─── Slide-type overlay builders ──────────────────────────────
// Each returns text overlays positioned to match the HTML grid layout.
// Text color is transparent so the background image shows through,
// but the text is selectable and editable when clicked.

function buildSlideOverlays(slideIndex: number, totalSlides: number, data: ProposalData): TextOverlay[] {
  // Map slide index to type based on the standard batch order from slide-designer.ts:
  // Batch 1: cover(0), brief(1), goals(2), audience(3), insight(4)
  // Batch 2: strategy(5), bigIdea(6), approach(7), deliverables(8), metrics(9)
  // Batch 3: influencerStrategy(10), influencers(11)?, closing(last)

  const slideTypes = [
    'cover', 'brief', 'goals', 'audience', 'insight',
    'strategy', 'bigIdea', 'approach', 'deliverables', 'metrics',
    'influencerStrategy', 'influencers', 'closing',
  ]

  // If more or fewer slides than expected, just do basic overlays
  const type = slideIndex < slideTypes.length ? slideTypes[slideIndex] : 'unknown'
  // Last slide is always closing
  const effectiveType = slideIndex === totalSlides - 1 ? 'closing' : type

  switch (effectiveType) {
    case 'cover':
      return buildCoverOverlays(data)
    case 'brief':
      return buildBriefOverlays(data)
    case 'goals':
      return buildGoalsOverlays(data)
    case 'audience':
      return buildAudienceOverlays(data)
    case 'insight':
      return buildInsightOverlays(data)
    case 'strategy':
      return buildStrategyOverlays(data)
    case 'bigIdea':
      return buildBigIdeaOverlays(data)
    case 'approach':
      return buildApproachOverlays(data)
    case 'deliverables':
      return buildDeliverablesOverlays(data)
    case 'metrics':
      return buildMetricsOverlays(data)
    case 'influencerStrategy':
      return buildInfluencerStrategyOverlays(data)
    case 'influencers':
      return buildInfluencersOverlays(data)
    case 'closing':
      return buildClosingOverlays(data)
    default:
      return []
  }
}

// Title area: section-label at y=0.56, title at y=0.91
const TITLE_Y = SAFE.y + 0.35
const CONTENT_Y = 1.6

function buildCoverOverlays(data: ProposalData): TextOverlay[] {
  return [
    {
      text: data.brandName || '',
      x: SAFE.x, y: 2.0, w: SAFE.w, h: 1.2,
      fontSize: 52, bold: true, align: 'center', rtlMode: true,
    },
    {
      text: data.campaignSubtitle || data.strategyHeadline || '',
      x: SAFE.x, y: 3.3, w: SAFE.w, h: 0.6,
      fontSize: 22, align: 'center', rtlMode: true,
    },
  ]
}

function buildBriefOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: 'למה התכנסנו?', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  if (data.brandBrief) {
    overlays.push({
      text: data.brandBrief,
      x: SAFE.x, y: CONTENT_Y, w: SAFE.w * 0.6, h: 1.5,
      fontSize: 14, align: 'right', rtlMode: true,
    })
  }
  if (data.brandObjective) {
    overlays.push({
      text: data.brandObjective,
      x: SAFE.x + SAFE.w * 0.65 + 0.15, y: CONTENT_Y + 0.4, w: SAFE.w * 0.35 - 0.3, h: 1.0,
      fontSize: 12, align: 'right', rtlMode: true,
    })
  }
  return overlays
}

function buildGoalsOverlays(data: ProposalData): TextOverlay[] {
  const goals = data.goalsDetailed || (data.goals || []).map(g => ({ title: g, description: '' }))
  const overlays: TextOverlay[] = [
    { text: 'מטרות הקמפיין', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  const cols = goals.length <= 3 ? 3 : 4
  const cardW = (SAFE.w - 0.21 * (cols - 1)) / cols
  goals.slice(0, 6).forEach((goal, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = SAFE.x + col * (cardW + 0.21)
    const y = CONTENT_Y + row * 2.9
    overlays.push(
      { text: goal.title, x: x + 0.15, y: y + 0.2, w: cardW - 0.3, h: 0.35, fontSize: 14, bold: true, align: 'right', rtlMode: true },
    )
    if (goal.description) {
      overlays.push(
        { text: goal.description, x: x + 0.15, y: y + 0.6, w: cardW - 0.3, h: 1.5, fontSize: 11, align: 'right', rtlMode: true },
      )
    }
  })
  return overlays
}

function buildAudienceOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: 'קהל היעד', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  const halfW = (SAFE.w - 0.21) / 2
  const demoText = [
    data.targetGender ? `מגדר: ${data.targetGender}` : '',
    data.targetAgeRange ? `גילאים: ${data.targetAgeRange}` : '',
    data.targetDescription || '',
  ].filter(Boolean).join('\n')
  if (demoText) {
    overlays.push({ text: demoText, x: SAFE.x + 0.15, y: CONTENT_Y + 0.5, w: halfW - 0.3, h: 2.5, fontSize: 12, align: 'right', rtlMode: true })
  }
  const insights = (data.targetInsights || []).slice(0, 5)
  if (insights.length) {
    overlays.push({
      text: insights.map((ins, i) => `${i + 1}. ${ins}`).join('\n'),
      x: SAFE.x + halfW + 0.21 + 0.15, y: CONTENT_Y + 0.5, w: halfW - 0.3, h: 2.5,
      fontSize: 11, align: 'right', rtlMode: true,
    })
  }
  return overlays
}

function buildInsightOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: 'התובנה המרכזית', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  if (data.keyInsight) {
    overlays.push({
      text: data.keyInsight,
      x: SAFE.x + 1, y: CONTENT_Y + 0.3, w: SAFE.w - 2, h: 1.5,
      fontSize: 24, bold: true, align: 'center', rtlMode: true,
    })
  }
  if (data.insightSource) {
    overlays.push({
      text: `מקור: ${data.insightSource}`,
      x: SAFE.x + 1, y: CONTENT_Y + 2.0, w: SAFE.w - 2, h: 0.4,
      fontSize: 11, align: 'center', rtlMode: true,
    })
  }
  return overlays
}

function buildStrategyOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: data.strategyHeadline || 'האסטרטגיה', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  const pillars = data.strategyPillars || []
  const cols = Math.min(pillars.length || 1, 3)
  const cardW = (SAFE.w - 0.21 * (cols - 1)) / cols
  let contentY = CONTENT_Y
  if (data.strategyDescription) {
    overlays.push({ text: data.strategyDescription, x: SAFE.x, y: contentY, w: SAFE.w, h: 0.8, fontSize: 13, align: 'right', rtlMode: true })
    contentY += 0.9
  }
  pillars.slice(0, 3).forEach((pillar, i) => {
    const x = SAFE.x + i * (cardW + 0.21)
    overlays.push(
      { text: pillar.title, x: x + 0.15, y: contentY + 0.2, w: cardW - 0.3, h: 0.35, fontSize: 14, bold: true, align: 'right', rtlMode: true },
    )
    if (pillar.description) {
      overlays.push(
        { text: pillar.description, x: x + 0.15, y: contentY + 0.6, w: cardW - 0.3, h: 1.5, fontSize: 11, align: 'right', rtlMode: true },
      )
    }
  })
  return overlays
}

function buildBigIdeaOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: data.activityTitle || 'הרעיון המרכזי', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  if (data.activityConcept) {
    overlays.push({ text: data.activityConcept, x: SAFE.x, y: CONTENT_Y, w: SAFE.w, h: 0.8, fontSize: 18, bold: true, align: 'right', rtlMode: true })
  }
  if (data.activityDescription) {
    overlays.push({ text: data.activityDescription, x: SAFE.x, y: CONTENT_Y + 0.9, w: SAFE.w, h: 1.5, fontSize: 13, align: 'right', rtlMode: true })
  }
  return overlays
}

function buildApproachOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: 'הגישה שלנו', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  const approaches = data.activityApproach || []
  const cols = approaches.length <= 2 ? 2 : 3
  const cardW = (SAFE.w - 0.21 * (cols - 1)) / cols
  approaches.slice(0, 3).forEach((approach, i) => {
    const x = SAFE.x + i * (cardW + 0.21)
    overlays.push(
      { text: approach.title, x: x + 0.15, y: CONTENT_Y + 0.2, w: cardW - 0.3, h: 0.35, fontSize: 14, bold: true, align: 'right', rtlMode: true },
    )
    if (approach.description) {
      overlays.push(
        { text: approach.description, x: x + 0.15, y: CONTENT_Y + 0.6, w: cardW - 0.3, h: 1.5, fontSize: 11, align: 'right', rtlMode: true },
      )
    }
  })
  return overlays
}

function buildDeliverablesOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: 'תוצרים', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  const deliverables = data.deliverablesDetailed || (data.deliverables || []).map(d => ({ type: d, quantity: 1, description: '' }))
  const cols = deliverables.length <= 3 ? 3 : 4
  const cardW = (SAFE.w - 0.21 * (cols - 1)) / cols
  deliverables.slice(0, 6).forEach((del, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = SAFE.x + col * (cardW + 0.21)
    const y = CONTENT_Y + row * 2.4
    overlays.push(
      { text: del.type, x: x + 0.15, y: y + 0.2, w: cardW - 0.3, h: 0.35, fontSize: 14, bold: true, align: 'right', rtlMode: true },
    )
    const body = [del.quantity > 1 ? `כמות: ${del.quantity}` : '', del.description].filter(Boolean).join('\n')
    if (body) {
      overlays.push({ text: body, x: x + 0.15, y: y + 0.6, w: cardW - 0.3, h: 1.2, fontSize: 11, align: 'right', rtlMode: true })
    }
  })
  return overlays
}

function buildMetricsOverlays(data: ProposalData): TextOverlay[] {
  const currency = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : '₪'
  const metrics = [
    { value: data.budget ? `${currency}${formatNum(data.budget)}` : '-', label: 'תקציב' },
    { value: formatNum(data.potentialReach), label: 'חשיפה פוטנציאלית' },
    { value: formatNum(data.potentialEngagement), label: 'אינגייג\'מנט' },
    { value: formatNum(data.estimatedImpressions), label: 'חשיפות משוערות' },
  ]
  const overlays: TextOverlay[] = [
    { text: 'יעדים ומדדים', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  const cardW = (SAFE.w - 0.21 * 3) / 4
  metrics.forEach((m, i) => {
    const x = SAFE.x + i * (cardW + 0.21)
    overlays.push(
      { text: m.value, x: x + 0.15, y: CONTENT_Y + 0.2, w: cardW - 0.3, h: 0.55, fontSize: 28, bold: true, align: 'right', rtlMode: true },
      { text: m.label, x: x + 0.15, y: CONTENT_Y + 0.8, w: cardW - 0.3, h: 0.3, fontSize: 11, align: 'right', rtlMode: true },
    )
  })
  return overlays
}

function buildInfluencerStrategyOverlays(data: ProposalData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: 'אסטרטגיית משפיענים', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  if (data.influencerStrategy) {
    const halfW = (SAFE.w - 0.21) / 2
    overlays.push({ text: data.influencerStrategy, x: SAFE.x + 0.15, y: CONTENT_Y + 0.5, w: halfW - 0.3, h: 2.5, fontSize: 12, align: 'right', rtlMode: true })
  }
  return overlays
}

function buildInfluencersOverlays(data: ProposalData): TextOverlay[] {
  const influencers = data.enhancedInfluencers || data.scrapedInfluencers?.map(i => ({
    name: i.name || i.username || '', username: i.username || '', followers: i.followers || 0, engagementRate: i.engagementRate || 0,
  })) || []
  const overlays: TextOverlay[] = [
    { text: 'משפיענים מומלצים', x: SAFE.x, y: TITLE_Y, w: SAFE.w, h: 0.7, fontSize: 32, bold: true, align: 'right', rtlMode: true },
  ]
  const cols = Math.min(influencers.length || 1, 3)
  const cardW = (SAFE.w - 0.21 * (cols - 1)) / cols
  influencers.slice(0, 6).forEach((inf, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = SAFE.x + col * (cardW + 0.21)
    const y = CONTENT_Y + row * 2.7
    overlays.push(
      { text: inf.name || inf.username, x: x + 0.15, y: y + 0.2, w: cardW - 0.3, h: 0.35, fontSize: 14, bold: true, align: 'right', rtlMode: true },
    )
    const details = [
      inf.username ? `@${inf.username}` : '',
      inf.followers ? `${formatNum(inf.followers)} עוקבים` : '',
      inf.engagementRate ? `${inf.engagementRate.toFixed(1)}% engagement` : '',
    ].filter(Boolean).join('\n')
    if (details) {
      overlays.push({ text: details, x: x + 0.15, y: y + 0.6, w: cardW - 0.3, h: 1.2, fontSize: 11, align: 'right', rtlMode: true })
    }
  })
  return overlays
}

function buildClosingOverlays(data: ProposalData): TextOverlay[] {
  return [
    { text: "LET'S CREATE\nTOGETHER", x: SAFE.x, y: 2.2, w: SAFE.w, h: 1.5, fontSize: 44, bold: true, align: 'center' },
    { text: `נשמח להתחיל לעבוד עם ${data.brandName || ''}`, x: SAFE.x, y: 4.0, w: SAFE.w, h: 0.6, fontSize: 18, align: 'center', rtlMode: true },
  ]
}

// ─── Main Entry Point ─────────────────────────────────────────

export async function generatePptx(
  data: ProposalData,
  htmlSlides: string[]
): Promise<Buffer> {
  console.log(`[PPTX] Starting hybrid generation: ${htmlSlides.length} slides`)

  // Step 1: Render all HTML slides to PNG images
  const slideImages = await renderSlidesToImages(htmlSlides)

  // Step 2: Build PPTX with image backgrounds + text overlays
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'Custom_16x9', width: CANVAS.w, height: CANVAS.h })
  pptx.layout = 'Custom_16x9'
  pptx.rtlMode = true

  for (let i = 0; i < slideImages.length; i++) {
    const slide = pptx.addSlide()

    // Background: full-slide image (pixel-perfect rendering of the HTML)
    slide.background = { data: `image/png;base64,${slideImages[i]}` }

    // Overlays: transparent editable text boxes
    const overlays = buildSlideOverlays(i, slideImages.length, data)
    for (const overlay of overlays) {
      slide.addText(overlay.text, {
        x: overlay.x,
        y: overlay.y,
        w: overlay.w,
        h: overlay.h,
        fontSize: overlay.fontSize,
        fontFace: FONT,
        color: 'FFFFFF',        // Match slide text color (usually white on dark bg)
        transparency: 100,       // Fully transparent - text is invisible but selectable
        bold: overlay.bold || false,
        align: overlay.align || 'right',
        rtlMode: overlay.rtlMode ?? true,
        lineSpacingMultiple: 1.2,
      })
    }
  }

  console.log(`[PPTX] Built ${slideImages.length} slides with text overlays`)

  // Generate buffer
  const output = await pptx.write({ outputType: 'nodebuffer' })
  return output as Buffer
}
