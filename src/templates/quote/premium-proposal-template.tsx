/**
 * Premium Proposal Template - Extended Version
 * 12-15 slides with branded design
 * Canvas: 16:9 (1920x1080)
 * 
 * Features:
 * - Brand logo watermark
 * - Custom accent colors
 * - Dynamic shapes
 * - Rich content sections
 * - Israeli market focus
 */

import type { InfluencerStrategy } from '@/lib/gemini/influencer-research'

interface PremiumProposalData {
  // Meta
  brandName?: string
  issueDate?: string
  campaignName?: string
  campaignSubtitle?: string
  
  // Goals - Rich
  goals?: string[]
  goalsDetailed?: { title: string; description: string }[]
  
  // Target Audience - Detailed
  targetGender?: string
  targetAgeRange?: string
  targetDescription?: string
  targetBehavior?: string
  targetInsights?: string[]
  
  // Brand - Rich
  brandDescription?: string
  brandHighlights?: string[]
  brandOpportunity?: string
  brandValues?: string[]
  brandPersonality?: string[]
  
  // Activity - Detailed
  activityTitle?: string
  activityConcept?: string
  activityDescription?: string
  activityApproach?: { title: string; description: string }[]
  activityDifferentiator?: string
  
  // Deliverables
  deliverables?: string[]
  deliverablesDetailed?: { type: string; quantity: number; description: string; purpose: string }[]
  deliverablesSummary?: string
  
  // Metrics
  budget?: number
  currency?: string
  potentialReach?: number
  potentialEngagement?: number
  cpe?: number
  cpm?: number
  estimatedImpressions?: number
  metricsExplanation?: string
  
  // Influencer Strategy
  influencerStrategy?: string
  influencerCriteria?: string[]
  contentGuidelines?: string[]
  influencerResearch?: InfluencerStrategy
  
  // Scraped influencers with real profile data
  scrapedInfluencers?: {
    name?: string
    username?: string
    profilePicUrl?: string
    followers?: number
    engagementRate?: number
  }[]
  
  // Influencer Data (manual)
  influencerData?: {
    name: string
    imageUrl?: string
    followers: number
    avgLikes?: number
    avgComments?: number
    engagementRate?: number
  }[]
  influencerNote?: string
  
  // Closing
  closingHeadline?: string
  nextSteps?: string[]
  
  // Visual Assets
  _brandColors?: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
    palette: string[]
    style: string
    mood: string
  }
  _brandResearch?: {
    brandName?: string
    tagline?: string
    industry?: string
    marketPosition?: string
    visualIdentity?: {
      primaryColors: string[]
      style: string
      moodKeywords: string[]
    }
  }
  _scraped?: {
    logoUrl?: string
    screenshot?: string
    heroImages?: string[]
    productImages?: string[]
    lifestyleImages?: string[]
  }
  
  [key: string]: unknown
}

interface TemplateConfig {
  accentColor?: string
  brandLogoUrl?: string
  leadersLogoUrl?: string
  clientLogoUrl?: string
  images?: {
    brandImage?: string
    audienceImage?: string
    coverImage?: string
    activityImage?: string
  }
}

// Helper functions
function clean(arr?: unknown): string[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.filter(v => {
    if (!v || v === '__skipped__' || v === '') return false
    // Handle objects - skip them
    if (typeof v === 'object') return false
    return true
  }).map(String)
}

function formatNumber(num?: number): string {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return Math.round(num / 1000) + 'K'
  return num.toLocaleString()
}

function formatHebrewDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`
  } catch {
    return dateStr
  }
}

function getCurrency(data: PremiumProposalData): string {
  if (data.currency?.includes('ILS') || data.currency?.includes('₪')) return '₪'
  if (data.currency?.includes('USD') || data.currency?.includes('$')) return '$'
  return '₪'
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.min(255, Math.max(0, (num >> 16) + amt))
  const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt))
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt))
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`
}

/**
 * Generate Premium Proposal HTML slides
 */
export function generatePremiumProposalSlides(
  data: PremiumProposalData,
  config: TemplateConfig = {}
): string[] {
  const slides: string[] = []
  
  // Extract brand colors
  const brandColors = data._brandColors
  const accent = config.accentColor || brandColors?.primary || '#E94560'
  const accentLight = adjustColor(accent, 40)
  const accentDark = adjustColor(accent, -20)
  
  // Logo URLs
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const defaultLeadersLogo = `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const leadersLogo = config.leadersLogoUrl || defaultLeadersLogo
  const clientLogo = config.clientLogoUrl || data._scraped?.logoUrl || ''
  
  // Currency
  const currency = getCurrency(data)
  
  // Base styles with brand customization
  const baseStyles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
      
      :root {
        --accent: ${accent};
        --accent-light: ${accentLight};
        --accent-dark: ${accentDark};
        --text: #111111;
        --text-light: #666666;
        --muted: #999999;
        --light: #F8F9FA;
        --line: #E5E7EB;
        --white: #FFFFFF;
        
        --h1: 72px;
        --h2: 48px;
        --h3: 36px;
        --body: 24px;
        --small: 18px;
        --tiny: 14px;
      }
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Heebo', sans-serif;
        background: var(--white);
        color: var(--text);
        direction: rtl;
      }
      
      /* Fix brackets in RTL */
      .ltr-nums {
        direction: ltr;
        unicode-bidi: isolate;
        display: inline-block;
      }
      
      /* Numbers and punctuation should stay LTR */
      .metric-value, .stat-number, .price, .percentage {
        direction: ltr;
        unicode-bidi: embed;
      }
      
      .slide {
        width: 1920px;
        height: 1080px;
        position: relative;
        overflow: hidden;
        page-break-after: always;
      }
      
      .slide-content {
        padding: 80px;
        height: 100%;
        display: flex;
        flex-direction: column;
        position: relative;
        z-index: 10;
      }
      
      /* Brand watermark */
      .brand-watermark {
        position: absolute;
        bottom: 40px;
        left: 40px;
        opacity: 0.08;
        max-width: 300px;
        max-height: 150px;
        z-index: 1;
      }
      
      /* Accent shape decorations */
      .accent-shape {
        position: absolute;
        z-index: 1;
      }
      
      .accent-shape.corner-top-right {
        top: -100px;
        right: -100px;
        width: 400px;
        height: 400px;
        background: var(--accent);
        border-radius: 50%;
        opacity: 0.1;
      }
      
      .accent-shape.corner-bottom-left {
        bottom: -150px;
        left: -150px;
        width: 500px;
        height: 500px;
        background: var(--accent);
        border-radius: 50%;
        opacity: 0.05;
      }
      
      .accent-shape.stripe {
        top: 0;
        right: 0;
        width: 15px;
        height: 100%;
        background: var(--accent);
      }
      
      /* Logo header */
      .logo-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 40px;
      }
      
      .logo-header img {
        height: 50px;
        object-fit: contain;
      }
      
      .logo-header .client-logo {
        height: 60px;
      }
      
      /* Typography */
      .h1 { font-size: var(--h1); font-weight: 800; line-height: 1.1; color: var(--text); }
      .h2 { font-size: var(--h2); font-weight: 700; line-height: 1.2; color: var(--text); }
      .h3 { font-size: var(--h3); font-weight: 600; line-height: 1.3; color: var(--text); }
      .body { font-size: var(--body); font-weight: 400; line-height: 1.6; color: var(--text-light); }
      .small { font-size: var(--small); color: var(--muted); }
      
      .accent-text { color: var(--accent); }
      .accent-bg { background: var(--accent); color: white; }
      
      /* Cards */
      .card {
        background: var(--light);
        border-radius: 24px;
        padding: 40px;
      }
      
      .card-accent {
        background: var(--accent);
        color: white;
        border-radius: 24px;
        padding: 40px;
      }
      
      /* Grid */
      .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; }
      .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
      .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 30px; }
      
      /* Metrics */
      .metric-box {
        background: var(--light);
        padding: 40px;
        border-radius: 20px;
        text-align: center;
      }
      
      .metric-value {
        font-size: 56px;
        font-weight: 800;
        color: var(--accent);
        line-height: 1;
      }
      
      .metric-label {
        font-size: var(--small);
        color: var(--muted);
        margin-top: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      /* Bullet lists */
      .bullet-list {
        list-style: none;
        padding: 0;
      }
      
      .bullet-list li {
        font-size: var(--body);
        padding: 16px 0;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: flex-start;
        gap: 16px;
      }
      
      .bullet-list li:last-child {
        border-bottom: none;
      }
      
      .bullet-marker {
        width: 12px;
        height: 12px;
        background: var(--accent);
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 8px;
      }
      
      /* Image containers */
      .image-container {
        border-radius: 24px;
        overflow: hidden;
        background: var(--light);
      }
      
      .image-container img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .image-mask-circle {
        border-radius: 50%;
        overflow: hidden;
      }
      
      .image-mask-blob {
        clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
        overflow: hidden;
      }
      
      /* Footer */
      .slide-footer {
        position: absolute;
        bottom: 40px;
        left: 80px;
        right: 80px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--tiny);
        color: var(--muted);
        z-index: 20;
      }
      
      /* Influencer grid */
      .influencer-card {
        background: var(--white);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 30px;
        text-align: center;
      }
      
      .influencer-image {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        margin: 0 auto 20px;
        overflow: hidden;
        background: var(--light);
        border: 4px solid var(--accent);
      }
      
      .influencer-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    </style>
  `

  // ========================================
  // SLIDE 1: COVER
  // ========================================
  const coverImage = config.images?.coverImage || data._scraped?.heroImages?.[0] || ''
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-cover {
      background: ${coverImage ? `linear-gradient(to left, rgba(0,0,0,0.7), rgba(0,0,0,0.5)), url('${coverImage}')` : 'linear-gradient(135deg, #111 0%, #333 100%)'};
      background-size: cover;
      background-position: center;
    }
    .slide-cover .slide-content {
      justify-content: space-between;
    }
    .slide-cover .main-title {
      font-size: 96px;
      font-weight: 900;
      color: white;
      max-width: 900px;
      line-height: 1.05;
    }
    .slide-cover .subtitle {
      font-size: 32px;
      color: rgba(255,255,255,0.8);
      margin-top: 24px;
    }
    .slide-cover .meta {
      display: flex;
      gap: 60px;
      color: rgba(255,255,255,0.6);
      font-size: 20px;
    }
    .slide-cover .meta-item {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .slide-cover .logos {
      display: flex;
      gap: 40px;
      align-items: center;
    }
    .slide-cover .logos img {
      height: 50px;
      filter: brightness(0) invert(1);
    }
    .slide-cover .client-logo-large {
      height: 80px !important;
    }
    .slide-cover .accent-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 8px;
      background: var(--accent);
    }
  </style>
</head>
<body>
  <div class="slide slide-cover">
    <div class="slide-content">
      <div class="logos">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo-large">` : ''}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div>
        <h1 class="main-title">${data.campaignName || data.brandName || 'הצעת מחיר'}</h1>
        ${data.campaignSubtitle ? `<p class="subtitle">${data.campaignSubtitle}</p>` : ''}
      </div>
      
      <div class="meta">
        <div class="meta-item">${formatHebrewDate(data.issueDate)}</div>
        ${data.brandName ? `<div class="meta-item">${data.brandName}</div>` : ''}
      </div>
    </div>
    <div class="accent-bar"></div>
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 2: ABOUT LEADERS
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-about-leaders .main-content {
      flex: 1;
      display: flex;
      gap: 80px;
      align-items: center;
    }
    .slide-about-leaders .text-side {
      flex: 1;
    }
    .slide-about-leaders .visual-side {
      flex: 1;
      display: flex;
      justify-content: center;
    }
    .slide-about-leaders .leaders-logo-large {
      max-width: 400px;
    }
    .slide-about-leaders .description {
      font-size: 28px;
      line-height: 1.8;
      color: var(--text-light);
      margin-top: 40px;
    }
    .slide-about-leaders .stats-row {
      display: flex;
      gap: 60px;
      margin-top: 60px;
    }
    .slide-about-leaders .stat {
      text-align: center;
    }
    .slide-about-leaders .stat-value {
      font-size: 48px;
      font-weight: 800;
      color: var(--accent);
    }
    .slide-about-leaders .stat-label {
      font-size: 18px;
      color: var(--muted);
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="slide slide-about-leaders">
    <div class="accent-shape corner-top-right"></div>
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <div class="text-side">
          <h1 class="h1">מי אנחנו</h1>
          <p class="description">
            Leaders היא סוכנות שיווק משפיענים מובילה בישראל.
            אנחנו מחברים בין מותגים לקהלים דרך תוכן אותנטי ומשפיענים מדויקים.
            עם ניסיון של שנים ומאות קמפיינים מוצלחים, אנחנו יודעים להביא תוצאות.
          </p>
          <div class="stats-row">
            <div class="stat">
              <div class="stat-value">500+</div>
              <div class="stat-label">קמפיינים</div>
            </div>
            <div class="stat">
              <div class="stat-value">1,000+</div>
              <div class="stat-label">משפיענים</div>
            </div>
            <div class="stat">
              <div class="stat-value">50M+</div>
              <div class="stat-label">חשיפות</div>
            </div>
          </div>
        </div>
        <div class="visual-side">
          <img src="${leadersLogo}" alt="Leaders" class="leaders-logo-large">
        </div>
      </div>
    </div>
    ${clientLogo ? `<img src="${clientLogo}" class="brand-watermark" alt="">` : ''}
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 3: GOALS
  // ========================================
  const goals = clean(data.goals)
  const goalsDetailed = data.goalsDetailed || []
  
  if (goals.length > 0 || goalsDetailed.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-goals .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-goals .goals-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(goals.length || goalsDetailed.length, 3)}, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-goals .goal-card {
      background: var(--light);
      padding: 50px 40px;
      border-radius: 24px;
      text-align: center;
      border-top: 5px solid var(--accent);
    }
    .slide-goals .goal-number {
      width: 60px;
      height: 60px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      margin: 0 auto 24px;
    }
    .slide-goals .goal-title {
      font-size: 32px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 16px;
    }
    .slide-goals .goal-desc {
      font-size: 20px;
      color: var(--text-light);
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="slide slide-goals">
    <div class="accent-shape stripe"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">מטרות הקמפיין</h1>
        <div class="goals-grid">
          ${(goalsDetailed.length > 0 ? goalsDetailed : goals.map(g => ({ title: g, description: '' }))).slice(0, 4).map((g, i) => `
          <div class="goal-card">
            <div class="goal-number">${i + 1}</div>
            <div class="goal-title">${typeof g === 'string' ? g : g.title}</div>
            ${typeof g !== 'string' && g.description ? `<div class="goal-desc">${g.description}</div>` : ''}
          </div>
          `).join('')}
        </div>
      </div>
    </div>
    ${clientLogo ? `<img src="${clientLogo}" class="brand-watermark" alt="">` : ''}
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 4: TARGET AUDIENCE
  // ========================================
  const audienceImage = config.images?.audienceImage || data._scraped?.lifestyleImages?.[0] || ''
  
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-audience .main-content {
      flex: 1;
      display: flex;
      gap: 80px;
      align-items: center;
    }
    .slide-audience .text-side {
      flex: 1.2;
    }
    .slide-audience .visual-side {
      flex: 0.8;
    }
    .slide-audience .audience-image {
      width: 100%;
      height: 600px;
      border-radius: 30px;
      overflow: hidden;
      background: var(--light);
      clip-path: polygon(10% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 10%);
    }
    .slide-audience .audience-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slide-audience .audience-main {
      display: flex;
      gap: 40px;
      margin-top: 40px;
    }
    .slide-audience .audience-card {
      background: var(--light);
      padding: 30px;
      border-radius: 20px;
      flex: 1;
    }
    .slide-audience .audience-label {
      font-size: 16px;
      color: var(--muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .slide-audience .audience-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
    }
    .slide-audience .behavior-text {
      font-size: 24px;
      line-height: 1.7;
      color: var(--text-light);
      margin-top: 40px;
    }
    .slide-audience .insights-list {
      margin-top: 40px;
    }
    .slide-audience .insight-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
      font-size: 22px;
      color: var(--text);
    }
    .slide-audience .insight-bullet {
      width: 10px;
      height: 10px;
      background: var(--accent);
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="slide slide-audience">
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <div class="text-side">
          <h1 class="h1">קהל היעד</h1>
          
          <div class="audience-main">
            <div class="audience-card">
              <div class="audience-label">מגדר</div>
              <div class="audience-value">${data.targetGender || 'נשים וגברים'}</div>
            </div>
            <div class="audience-card">
              <div class="audience-label">גיל</div>
              <div class="audience-value">${data.targetAgeRange || '25-45'}</div>
            </div>
          </div>
          
          ${data.targetDescription ? `
          <p class="behavior-text">${data.targetDescription}</p>
          ` : ''}
          
          ${data.targetInsights && data.targetInsights.length > 0 ? `
          <div class="insights-list">
            ${data.targetInsights.slice(0, 4).map(insight => `
            <div class="insight-item">
              <span class="insight-bullet"></span>
              <span>${insight}</span>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="visual-side">
          <div class="audience-image">
            ${audienceImage ? `<img src="${audienceImage}" alt="Target Audience">` : ''}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 5: ABOUT THE BRAND
  // ========================================
  const brandImage = config.images?.brandImage || data._scraped?.heroImages?.[1] || ''
  
  if (data.brandDescription) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-brand .main-content {
      flex: 1;
      display: flex;
      gap: 80px;
    }
    .slide-brand .text-side {
      flex: 1.5;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-brand .visual-side {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-brand .brand-text {
      font-size: 26px;
      line-height: 1.8;
      color: var(--text-light);
      margin-top: 40px;
    }
    .slide-brand .brand-highlights {
      margin-top: 50px;
    }
    .slide-brand .highlight-item {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 20px;
    }
    .slide-brand .highlight-icon {
      width: 32px;
      height: 32px;
      background: var(--accent);
      border-radius: 8px;
      flex-shrink: 0;
    }
    .slide-brand .highlight-text {
      font-size: 22px;
      color: var(--text);
    }
    .slide-brand .brand-image-container {
      width: 100%;
      height: 500px;
      border-radius: 30px;
      overflow: hidden;
      background: var(--light);
    }
    .slide-brand .brand-image-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slide-brand .client-logo-display {
      margin-top: 40px;
      text-align: center;
    }
    .slide-brand .client-logo-display img {
      max-height: 80px;
    }
  </style>
</head>
<body>
  <div class="slide slide-brand">
    <div class="accent-shape stripe"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <div class="text-side">
          <h1 class="h1">על המותג</h1>
          <div class="brand-text">
            ${data.brandDescription?.slice(0, 800)}
          </div>
          
          ${data.brandHighlights && data.brandHighlights.length > 0 ? `
          <div class="brand-highlights">
            ${data.brandHighlights.slice(0, 4).map(h => `
            <div class="highlight-item">
              <div class="highlight-icon"></div>
              <div class="highlight-text">${h}</div>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="visual-side">
          <div class="brand-image-container">
            ${brandImage ? `<img src="${brandImage}" alt="Brand">` : ''}
          </div>
          ${clientLogo ? `
          <div class="client-logo-display">
            <img src="${clientLogo}" alt="${data.brandName}">
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 6: THE OPPORTUNITY
  // ========================================
  if (data.brandOpportunity) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-opportunity .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 0 150px;
    }
    .slide-opportunity .opportunity-text {
      font-size: 40px;
      line-height: 1.6;
      font-weight: 500;
      color: var(--text);
      max-width: 1200px;
    }
    .slide-opportunity .quote-mark {
      font-size: 120px;
      color: var(--accent);
      opacity: 0.3;
      line-height: 0.5;
    }
    .slide-opportunity .brand-values {
      display: flex;
      gap: 20px;
      margin-top: 60px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .slide-opportunity .value-tag {
      background: var(--light);
      padding: 16px 32px;
      border-radius: 100px;
      font-size: 20px;
      color: var(--text);
      border: 2px solid var(--line);
    }
  </style>
</head>
<body>
  <div class="slide slide-opportunity">
    <div class="accent-shape corner-top-right"></div>
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <div class="quote-mark">"</div>
        <p class="opportunity-text">${data.brandOpportunity}</p>
        
        ${data.brandValues && data.brandValues.length > 0 ? `
        <div class="brand-values">
          ${data.brandValues.slice(0, 5).map(v => `
          <span class="value-tag">${v}</span>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 7: THE BIG IDEA (Activity)
  // ========================================
  const activityImage = config.images?.activityImage || data._scraped?.lifestyleImages?.[1] || ''
  
  if (data.activityTitle || data.activityConcept) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-big-idea {
      background: var(--text);
      color: white;
    }
    .slide-big-idea .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-big-idea h1 {
      color: white;
      font-size: 80px;
    }
    .slide-big-idea .concept-text {
      font-size: 36px;
      line-height: 1.6;
      color: rgba(255,255,255,0.8);
      margin-top: 40px;
      max-width: 1200px;
    }
    .slide-big-idea .logo-header img {
      filter: brightness(0) invert(1);
    }
    .slide-big-idea .accent-line {
      width: 150px;
      height: 6px;
      background: var(--accent);
      margin-top: 40px;
    }
    .slide-big-idea .activity-desc {
      font-size: 24px;
      line-height: 1.8;
      color: rgba(255,255,255,0.7);
      margin-top: 40px;
      max-width: 1000px;
    }
  </style>
</head>
<body>
  <div class="slide slide-big-idea">
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1>${data.activityTitle || 'הרעיון המרכזי'}</h1>
        <div class="accent-line"></div>
        ${data.activityConcept ? `<p class="concept-text">${data.activityConcept}</p>` : ''}
        ${data.activityDescription ? `<p class="activity-desc">${data.activityDescription}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 8: ACTIVITY APPROACH
  // ========================================
  if (data.activityApproach && data.activityApproach.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-approach .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-approach .approach-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(data.activityApproach.length, 3)}, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-approach .approach-card {
      background: var(--light);
      padding: 50px 40px;
      border-radius: 24px;
      border-right: 5px solid var(--accent);
    }
    .slide-approach .approach-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 20px;
    }
    .slide-approach .approach-desc {
      font-size: 20px;
      line-height: 1.7;
      color: var(--text-light);
    }
    .slide-approach .differentiator {
      background: var(--accent);
      color: white;
      padding: 40px;
      border-radius: 20px;
      margin-top: 50px;
      font-size: 24px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="slide slide-approach">
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">הגישה שלנו</h1>
        
        <div class="approach-grid">
          ${data.activityApproach.slice(0, 3).map(a => `
          <div class="approach-card">
            <div class="approach-title">${a.title}</div>
            <div class="approach-desc">${a.description}</div>
          </div>
          `).join('')}
        </div>
        
        ${data.activityDifferentiator ? `
        <div class="differentiator">
          ${data.activityDifferentiator}
        </div>
        ` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 9: DELIVERABLES
  // ========================================
  const deliverables = data.deliverablesDetailed || []
  const deliverableStrings = clean(data.deliverables)
  
  if (deliverables.length > 0 || deliverableStrings.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-deliverables .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-deliverables .deliverables-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(deliverables.length || deliverableStrings.length, 3)}, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-deliverables .deliverable-card {
      background: var(--light);
      padding: 50px;
      border-radius: 24px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .slide-deliverables .deliverable-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--accent);
    }
    .slide-deliverables .deliverable-qty {
      font-size: 72px;
      font-weight: 900;
      color: var(--accent);
      line-height: 1;
    }
    .slide-deliverables .deliverable-type {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-top: 16px;
    }
    .slide-deliverables .deliverable-desc {
      font-size: 18px;
      color: var(--muted);
      margin-top: 12px;
    }
    .slide-deliverables .summary {
      text-align: center;
      font-size: 24px;
      color: var(--text-light);
      margin-top: 50px;
    }
  </style>
</head>
<body>
  <div class="slide slide-deliverables">
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">תוצרים</h1>
        
        <div class="deliverables-grid">
          ${deliverables.length > 0 
            ? deliverables.slice(0, 6).map(d => `
              <div class="deliverable-card">
                <div class="deliverable-qty">${d.quantity}</div>
                <div class="deliverable-type">${d.type}</div>
                <div class="deliverable-desc">${d.description || ''}</div>
              </div>
              `).join('')
            : deliverableStrings.slice(0, 6).map(d => `
              <div class="deliverable-card">
                <div class="deliverable-type">${d}</div>
              </div>
              `).join('')
          }
        </div>
        
        ${data.deliverablesSummary ? `<p class="summary">${data.deliverablesSummary}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 10: METRICS & KPIs
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-metrics .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-metrics .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-metrics .metric-card {
      background: var(--light);
      padding: 50px 30px;
      border-radius: 24px;
      text-align: center;
    }
    .slide-metrics .metric-card.primary {
      background: var(--accent);
      color: white;
    }
    .slide-metrics .metric-card.primary .metric-value {
      color: white;
    }
    .slide-metrics .metric-card.primary .metric-label {
      color: rgba(255,255,255,0.8);
    }
    .slide-metrics .metric-value {
      font-size: 52px;
      font-weight: 800;
      color: var(--accent);
      line-height: 1;
    }
    .slide-metrics .metric-label {
      font-size: 18px;
      color: var(--muted);
      margin-top: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .slide-metrics .explanation {
      margin-top: 50px;
      padding: 40px;
      background: var(--light);
      border-radius: 20px;
      font-size: 22px;
      line-height: 1.7;
      color: var(--text-light);
    }
  </style>
</head>
<body>
  <div class="slide slide-metrics">
    <div class="accent-shape stripe"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">יעדים ומדדים</h1>
        
        <div class="metrics-grid">
          <div class="metric-card primary">
            <div class="metric-value">${currency}${formatNumber(data.budget)}</div>
            <div class="metric-label">תקציב</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${formatNumber(data.potentialReach || data.potentialEngagement ? (data.potentialEngagement || 0) * 3 : 0)}</div>
            <div class="metric-label">Reach</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${formatNumber(data.potentialEngagement)}</div>
            <div class="metric-label">Engagement</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${currency}${data.cpe || '2.5'}</div>
            <div class="metric-label">CPE</div>
          </div>
        </div>
        
        ${data.metricsExplanation ? `
        <div class="explanation">${data.metricsExplanation}</div>
        ` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 11: INFLUENCER STRATEGY
  // ========================================
  if (data.influencerStrategy || data.influencerCriteria?.length) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-inf-strategy .main-content {
      flex: 1;
      display: flex;
      gap: 80px;
    }
    .slide-inf-strategy .text-side {
      flex: 1.2;
    }
    .slide-inf-strategy .criteria-side {
      flex: 0.8;
    }
    .slide-inf-strategy .strategy-text {
      font-size: 26px;
      line-height: 1.8;
      color: var(--text-light);
      margin-top: 40px;
    }
    .slide-inf-strategy .criteria-box {
      background: var(--light);
      padding: 50px;
      border-radius: 24px;
      margin-top: 60px;
    }
    .slide-inf-strategy .criteria-title {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 30px;
    }
    .slide-inf-strategy .criteria-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
      font-size: 20px;
    }
    .slide-inf-strategy .criteria-item:last-child {
      border-bottom: none;
    }
    .slide-inf-strategy .criteria-check {
      color: var(--accent);
      font-weight: bold;
    }
    .slide-inf-strategy .content-guidelines {
      background: var(--accent);
      color: white;
      padding: 40px;
      border-radius: 24px;
      margin-top: 40px;
    }
    .slide-inf-strategy .content-guidelines h3 {
      color: white;
      margin-bottom: 20px;
    }
    .slide-inf-strategy .guideline-item {
      padding: 12px 0;
      font-size: 20px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="slide slide-inf-strategy">
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <div class="text-side">
          <h1 class="h1">אסטרטגיית משפיענים</h1>
          ${data.influencerStrategy ? `<p class="strategy-text">${data.influencerStrategy}</p>` : ''}
          
          ${data.contentGuidelines && data.contentGuidelines.length > 0 ? `
          <div class="content-guidelines">
            <h3 class="h3">הנחיות לתוכן</h3>
            ${data.contentGuidelines.slice(0, 4).map(g => `
            <div class="guideline-item">• ${g}</div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="criteria-side">
          ${data.influencerCriteria && data.influencerCriteria.length > 0 ? `
          <div class="criteria-box">
            <div class="criteria-title">קריטריונים לבחירה</div>
            ${data.influencerCriteria.slice(0, 6).map(c => `
            <div class="criteria-item">
              <span class="criteria-check">✓</span>
              <span>${c}</span>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 12: RECOMMENDED INFLUENCERS (AI + Scraped with photos)
  // ========================================
  const aiRecommendations = data.influencerResearch?.recommendations || []
  const scrapedInfluencers = (data.scrapedInfluencers as Array<{
    name?: string
    username?: string
    profilePicUrl?: string
    followers?: number
    engagementRate?: number
  }>) || []
  
  // Merge: prefer scraped (has photos) over AI recommendations
  const mergedInfluencers = [
    // First add scraped influencers (they have real photos)
    ...scrapedInfluencers.map(inf => ({
      name: inf.name || inf.username || 'משפיען',
      handle: inf.username ? `@${inf.username}` : '',
      followers: inf.followers ? formatNumber(inf.followers) : '10K+',
      engagement: inf.engagementRate ? `${inf.engagementRate.toFixed(1)}%` : '3%+',
      whyRelevant: 'משפיען מתאים לקהל היעד של המותג',
      profilePicUrl: inf.profilePicUrl || '',
    })),
    // Then add AI recommendations (no photos, use initials)
    ...aiRecommendations.map(inf => ({
      name: inf.name,
      handle: inf.handle,
      followers: inf.followers,
      engagement: inf.engagement,
      whyRelevant: inf.whyRelevant,
      profilePicUrl: '', // AI doesn't have photos
    })),
  ].slice(0, 6) // Max 6 influencers
  
  if (mergedInfluencers.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-recommendations .main-content {
      flex: 1;
    }
    .slide-recommendations .influencers-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 30px;
      margin-top: 50px;
    }
    .slide-recommendations .influencer-card {
      background: var(--white);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 30px;
      text-align: center;
    }
    .slide-recommendations .influencer-avatar {
      width: 100px;
      height: 100px;
      background: linear-gradient(135deg, var(--accent), var(--accent-light, #ff6b8a));
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 36px;
      font-weight: 700;
      overflow: hidden;
      border: 3px solid var(--accent);
    }
    .slide-recommendations .influencer-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slide-recommendations .influencer-name {
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
    }
    .slide-recommendations .influencer-handle {
      font-size: 16px;
      color: var(--accent);
      margin-top: 4px;
    }
    .slide-recommendations .influencer-stats {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 20px;
    }
    .slide-recommendations .stat {
      text-align: center;
    }
    .slide-recommendations .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
    }
    .slide-recommendations .stat-label {
      font-size: 12px;
      color: var(--muted);
    }
    .slide-recommendations .influencer-reason {
      font-size: 14px;
      color: var(--text-light);
      margin-top: 16px;
      line-height: 1.5;
    }
    .slide-recommendations .note {
      text-align: center;
      font-size: 16px;
      color: var(--muted);
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="slide slide-recommendations">
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">משפיענים מומלצים</h1>
        
        <div class="influencers-grid">
          ${mergedInfluencers.map(inf => `
          <div class="influencer-card">
            <div class="influencer-avatar">
              ${inf.profilePicUrl 
                ? `<img src="${inf.profilePicUrl}" alt="${inf.name}" onerror="this.style.display='none';this.parentElement.textContent='${inf.name.charAt(0)}';">`
                : inf.name.charAt(0)
              }
            </div>
            <div class="influencer-name">${inf.name}</div>
            <div class="influencer-handle">${inf.handle}</div>
            <div class="influencer-stats">
              <div class="stat">
                <div class="stat-value">${inf.followers}</div>
                <div class="stat-label">עוקבים</div>
              </div>
              <div class="stat">
                <div class="stat-value">${inf.engagement}</div>
                <div class="stat-label">מעורבות</div>
              </div>
            </div>
            <div class="influencer-reason">${(inf.whyRelevant || '').slice(0, 80)}${inf.whyRelevant && inf.whyRelevant.length > 80 ? '...' : ''}</div>
          </div>
          `).join('')}
        </div>
        
        <div class="note">* רשימה ראשונית - הבחירה הסופית תיעשה בשיתוף הלקוח</div>
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 13: MANUAL INFLUENCERS (if provided)
  // ========================================
  const manualInfluencers = data.influencerData || []
  if (manualInfluencers.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-manual-inf .main-content {
      flex: 1;
    }
    .slide-manual-inf .influencers-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 40px;
      margin-top: 50px;
      flex: 1;
    }
    .slide-manual-inf .influencer-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .slide-manual-inf .influencer-image {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      overflow: hidden;
      background: var(--light);
      border: 5px solid var(--accent);
    }
    .slide-manual-inf .influencer-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slide-manual-inf .influencer-name {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      margin-top: 20px;
    }
    .slide-manual-inf .influencer-followers {
      font-size: 18px;
      color: var(--accent);
      font-weight: 600;
    }
    .slide-manual-inf .note {
      text-align: center;
      font-size: 18px;
      color: var(--muted);
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="slide slide-manual-inf">
    <div class="accent-shape corner-top-right"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">משפיענים</h1>
        
        <div class="influencers-grid">
          ${manualInfluencers.slice(0, 6).map(inf => `
          <div class="influencer-item">
            <div class="influencer-image">
              ${inf.imageUrl ? `<img src="${inf.imageUrl}" alt="${inf.name}">` : ''}
            </div>
            <div class="influencer-name">${inf.name}</div>
            <div class="influencer-followers">${formatNumber(inf.followers)} עוקבים</div>
          </div>
          `).join('')}
        </div>
        
        ${data.influencerNote ? `<div class="note">${data.influencerNote}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 14: TIMELINE (if available)
  // ========================================
  const timeline = data.influencerResearch?.suggestedTimeline || []
  if (timeline.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-timeline .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-timeline .timeline-container {
      display: flex;
      gap: 40px;
      margin-top: 60px;
      position: relative;
    }
    .slide-timeline .timeline-container::before {
      content: '';
      position: absolute;
      top: 60px;
      left: 100px;
      right: 100px;
      height: 4px;
      background: var(--line);
    }
    .slide-timeline .phase-card {
      flex: 1;
      background: var(--white);
      border: 2px solid var(--line);
      border-radius: 24px;
      padding: 40px;
      text-align: center;
      position: relative;
    }
    .slide-timeline .phase-number {
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 60px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
    }
    .slide-timeline .phase-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-top: 30px;
    }
    .slide-timeline .phase-duration {
      font-size: 18px;
      color: var(--accent);
      font-weight: 600;
      margin-top: 8px;
    }
    .slide-timeline .phase-activities {
      margin-top: 24px;
      text-align: right;
    }
    .slide-timeline .activity-item {
      font-size: 18px;
      color: var(--text-light);
      padding: 8px 0;
    }
  </style>
</head>
<body>
  <div class="slide slide-timeline">
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">לוח זמנים</h1>
        
        <div class="timeline-container">
          ${timeline.slice(0, 4).map((phase, i) => `
          <div class="phase-card">
            <div class="phase-number">${i + 1}</div>
            <div class="phase-title">${phase.phase}</div>
            <div class="phase-duration">${phase.duration}</div>
            <div class="phase-activities">
              ${phase.activities.slice(0, 3).map(a => `
              <div class="activity-item">• ${a}</div>
              `).join('')}
            </div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 15: NEXT STEPS
  // ========================================
  if (data.nextSteps && data.nextSteps.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-next-steps .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-next-steps .steps-list {
      margin-top: 60px;
      max-width: 1000px;
    }
    .slide-next-steps .step-item {
      display: flex;
      align-items: flex-start;
      gap: 30px;
      padding: 40px 0;
      border-bottom: 1px solid var(--line);
    }
    .slide-next-steps .step-item:last-child {
      border-bottom: none;
    }
    .slide-next-steps .step-number {
      width: 60px;
      height: 60px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .slide-next-steps .step-text {
      font-size: 28px;
      color: var(--text);
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="slide slide-next-steps">
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="logo-header">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">השלבים הבאים</h1>
        
        <div class="steps-list">
          ${data.nextSteps.slice(0, 5).map((step, i) => `
          <div class="step-item">
            <div class="step-number">${i + 1}</div>
            <div class="step-text">${step}</div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE FINAL: CLOSING
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-closing {
      background: linear-gradient(135deg, var(--text) 0%, #333 100%);
    }
    .slide-closing .slide-content {
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .slide-closing .closing-headline {
      font-size: 72px;
      font-weight: 900;
      color: white;
      line-height: 1.2;
      margin-bottom: 60px;
      max-width: 1400px;
      text-wrap: balance;
    }
    .slide-closing .logos-row {
      display: flex;
      gap: 80px;
      align-items: center;
    }
    .slide-closing .logos-row img {
      height: 60px;
      filter: brightness(0) invert(1);
    }
    .slide-closing .client-logo-big {
      height: 100px !important;
    }
    .slide-closing .accent-line {
      width: 200px;
      height: 6px;
      background: var(--accent);
      margin: 0 auto 60px;
    }
  </style>
</head>
<body>
  <div class="slide slide-closing">
    <div class="slide-content">
      <div class="accent-line"></div>
      <h1 class="closing-headline">${data.closingHeadline || "LET'S CREATE"}</h1>
      
      <div class="logos-row">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo-big">` : ''}
        <span style="color: rgba(255,255,255,0.3); font-size: 48px;">×</span>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
    </div>
  </div>
</body>
</html>
`)

  console.log(`[Premium Template] Generated ${slides.length} slides`)
  return slides
}

