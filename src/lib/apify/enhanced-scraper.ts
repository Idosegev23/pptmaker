/**
 * Enhanced Apify Scraper
 * Uses multiple actors for comprehensive visual and content extraction
 */

import { ApifyClient } from 'apify-client'

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
})

export interface EnhancedScrapeResult {
  url: string
  title: string
  description: string
  
  // Visual Assets - Premium
  screenshot: string | null          // Full page screenshot
  logoUrl: string | null             // Extracted logo
  logoAlternatives: string[]         // Other logo candidates
  favicon: string | null
  ogImage: string | null
  
  // Images categorized
  heroImages: string[]               // Large banner images
  productImages: string[]            // Product photos
  lifestyleImages: string[]          // Lifestyle/brand images
  allImages: string[]
  
  // Brand Colors
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  colorPalette: string[]
  
  // Content
  headings: {
    h1: string[]
    h2: string[]
    h3: string[]
  }
  paragraphs: string[]
  tagline: string | null
  aboutText: string | null
  
  // Social
  socialLinks: {
    instagram?: string
    facebook?: string
    twitter?: string
    linkedin?: string
    youtube?: string
    tiktok?: string
  }
  
  // Contact
  emails: string[]
  phones: string[]
  address: string | null
  
  // SEO
  metaKeywords: string[]
  metaDescription: string
}

/**
 * Take a screenshot of the website
 */
async function takeScreenshot(url: string): Promise<string | null> {
  console.log(`[Apify Screenshot] Taking screenshot of ${url}`)
  
  try {
    const run = await client.actor('apify/screenshot-url').call({
      urls: [{ url }],
      viewportWidth: 1920,
      viewportHeight: 1080,
      fullPage: false,
      waitUntil: 'networkidle2',
      delay: 2000,
    }, {
      timeout: 45, // 45 seconds max
    })
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    if (items.length > 0 && items[0].screenshotUrl) {
      console.log('[Apify Screenshot] Screenshot captured')
      return items[0].screenshotUrl as string
    }
    return null
  } catch (error) {
    console.error('[Apify Screenshot] Error:', error)
    return null
  }
}

/**
 * Extract logo using dedicated logo scraper
 */
async function extractLogo(url: string): Promise<{ logo: string | null; alternatives: string[] }> {
  console.log(`[Apify Logo] Extracting logo from ${url}`)
  
  try {
    // Try web-scraper with specific logo selectors
    const run = await client.actor('apify/web-scraper').call({
      startUrls: [{ url }],
      pageFunction: async function pageFunction(context: { 
        request: { url: string }; 
        jQuery: (selector: string) => { 
          map: (fn: (i: number, el: Element) => string | undefined) => { get: () => string[] };
          first: () => { attr: (name: string) => string | undefined };
        } 
      }) {
        const $ = context.jQuery
        const logos: string[] = []
        
        // Common logo selectors
        const selectors = [
          'img[class*="logo"]',
          'img[id*="logo"]',
          'a[class*="logo"] img',
          'header img',
          '.site-logo img',
          '.brand-logo img',
          '[class*="brand"] img',
        ]
        
        selectors.forEach(sel => {
          $(sel).map((_i: number, el: Element) => {
            const src = $(el as unknown as string).first().attr('src')
            if (src && !src.startsWith('data:')) {
              logos.push(new URL(src, context.request.url).href)
            }
            return undefined
          })
        })
        
        return { logos: Array.from(new Set(logos)) }
      },
      maxRequestsPerCrawl: 1,
    }, {
      timeout: 30, // 30 seconds max
    })
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    const logos = (items[0]?.logos || []) as string[]
    
    return {
      logo: logos[0] || null,
      alternatives: logos.slice(1, 5),
    }
  } catch (error) {
    console.error('[Apify Logo] Error:', error)
    return { logo: null, alternatives: [] }
  }
}

/**
 * Extract colors from website CSS
 */
function extractColorsFromHTML(html: string): {
  primary: string | null
  secondary: string | null
  accent: string | null
  palette: string[]
} {
  const colorCounts = new Map<string, number>()
  
  // Hex colors
  const hexPattern = /#([0-9A-Fa-f]{3,6})\b/g
  let match
  while ((match = hexPattern.exec(html)) !== null) {
    let hex = match[0].toLowerCase()
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    if (!isBoringColor(hex)) {
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1)
    }
  }
  
  // RGB colors
  const rgbPattern = /rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g
  while ((match = rgbPattern.exec(html)) !== null) {
    const r = parseInt(match[1])
    const g = parseInt(match[2])
    const b = parseInt(match[3])
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    if (!isBoringColor(hex)) {
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1)
    }
  }
  
  const sorted = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)
  
  return {
    primary: sorted[0] || null,
    secondary: sorted[1] || null,
    accent: sorted[2] || null,
    palette: sorted.slice(0, 10),
  }
}

function isBoringColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  
  // Pure white/black
  if ((r === 255 && g === 255 && b === 255) || (r === 0 && g === 0 && b === 0)) return true
  
  // Very light or very dark grays
  const isGray = Math.abs(r - g) < 20 && Math.abs(g - b) < 20
  if (isGray && (r > 235 || r < 25)) return true
  
  return false
}

/**
 * Categorize images by type
 */
function categorizeImages(images: string[], html: string): {
  hero: string[]
  product: string[]
  lifestyle: string[]
} {
  const hero: string[] = []
  const product: string[] = []
  const lifestyle: string[] = []
  
  for (const img of images) {
    const imgLower = img.toLowerCase()
    
    // Hero/banner detection
    if (imgLower.includes('hero') || imgLower.includes('banner') || imgLower.includes('slider')) {
      hero.push(img)
    }
    // Product detection
    else if (imgLower.includes('product') || imgLower.includes('item') || imgLower.includes('shop')) {
      product.push(img)
    }
    // Lifestyle/brand
    else if (imgLower.includes('lifestyle') || imgLower.includes('about') || imgLower.includes('team')) {
      lifestyle.push(img)
    }
    // Check context in HTML
    else {
      const imgInHero = html.includes(`hero`) && html.includes(img.split('/').pop() || '')
      if (imgInHero) hero.push(img)
      else lifestyle.push(img) // Default to lifestyle
    }
  }
  
  return {
    hero: hero.slice(0, 10),
    product: product.slice(0, 20),
    lifestyle: lifestyle.slice(0, 15),
  }
}

/**
 * Extract tagline/slogan
 */
function extractTagline(html: string): string | null {
  const patterns = [
    /<(?:p|span|div)[^>]+class=["'][^"']*(?:tagline|slogan|subtitle|hero-text)[^"']*["'][^>]*>([^<]+)</gi,
    /<h2[^>]*>([^<]{10,100})<\/h2>/gi,
  ]
  
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match && match[1]) {
      const text = match[1].trim()
      if (text.length > 10 && text.length < 150) {
        return text
      }
    }
  }
  
  return null
}

/**
 * Extract about text
 */
function extractAboutText(html: string, paragraphs: string[]): string | null {
  // Look for about section
  const aboutPattern = /<(?:div|section)[^>]+(?:class|id)=["'][^"']*about[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi
  const match = aboutPattern.exec(html)
  
  if (match) {
    // Extract text from about section
    const aboutHtml = match[1]
    const textPattern = /<p[^>]*>([^<]+)<\/p>/gi
    const texts: string[] = []
    let pMatch
    while ((pMatch = textPattern.exec(aboutHtml)) !== null) {
      if (pMatch[1].trim().length > 30) {
        texts.push(pMatch[1].trim())
      }
    }
    if (texts.length > 0) {
      return texts.slice(0, 3).join(' ')
    }
  }
  
  // Fallback to longest paragraphs
  const sorted = paragraphs
    .filter(p => p.length > 100 && p.length < 1000)
    .sort((a, b) => b.length - a.length)
  
  return sorted[0] || null
}

/**
 * Main enhanced scrape function
 */
export async function enhancedScrape(url: string): Promise<EnhancedScrapeResult> {
  console.log(`[Enhanced Scraper] Starting comprehensive scrape of ${url}`)
  
  if (!url.startsWith('http')) {
    url = `https://${url}`
  }
  
  // Run scraping tasks in parallel with error handling
  const [screenshotResult, logoResult, contentResult] = await Promise.all([
    takeScreenshot(url).catch(err => {
      console.error('[Enhanced Scraper] Screenshot failed:', err)
      return null
    }),
    extractLogo(url).catch(err => {
      console.error('[Enhanced Scraper] Logo extraction failed:', err)
      return { logo: null, alternatives: [] }
    }),
    scrapeContent(url),
  ])
  
  const colors = extractColorsFromHTML(contentResult.html)
  const categorized = categorizeImages(contentResult.images, contentResult.html)
  const tagline = extractTagline(contentResult.html)
  const aboutText = extractAboutText(contentResult.html, contentResult.paragraphs)
  
  return {
    url: contentResult.url,
    title: contentResult.title,
    description: contentResult.description,
    
    screenshot: screenshotResult,
    logoUrl: logoResult.logo || contentResult.logoUrl,
    logoAlternatives: logoResult.alternatives,
    favicon: contentResult.favicon,
    ogImage: contentResult.ogImage,
    
    heroImages: categorized.hero,
    productImages: categorized.product,
    lifestyleImages: categorized.lifestyle,
    allImages: contentResult.images,
    
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    accentColor: colors.accent,
    colorPalette: colors.palette,
    
    headings: contentResult.headings,
    paragraphs: contentResult.paragraphs,
    tagline,
    aboutText,
    
    socialLinks: contentResult.socialLinks,
    
    emails: contentResult.emails,
    phones: contentResult.phones,
    address: contentResult.address,
    
    metaKeywords: contentResult.metaKeywords,
    metaDescription: contentResult.description,
  }
}

/**
 * Scrape main content
 */
async function scrapeContent(url: string): Promise<{
  url: string
  title: string
  description: string
  html: string
  images: string[]
  logoUrl: string | null
  favicon: string | null
  ogImage: string | null
  headings: { h1: string[]; h2: string[]; h3: string[] }
  paragraphs: string[]
  socialLinks: EnhancedScrapeResult['socialLinks']
  emails: string[]
  phones: string[]
  address: string | null
  metaKeywords: string[]
}> {
  // Default empty result for fallback
  const emptyResult = {
    url,
    title: '',
    description: '',
    html: '',
    images: [],
    logoUrl: null,
    favicon: null,
    ogImage: null,
    headings: { h1: [], h2: [], h3: [] },
    paragraphs: [],
    socialLinks: {},
    emails: [],
    phones: [],
    address: null,
    metaKeywords: [],
  }
  
  try {
    const run = await client.actor('apify/website-content-crawler').call({
      startUrls: [{ url }],
      maxCrawlPages: 5,
      maxCrawlDepth: 1,
      crawlerType: 'cheerio',
      saveHtml: true,
    }, {
      timeout: 45, // 45 seconds max
    })
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    
    if (items.length === 0) {
      console.log('[Content Scraper] No pages crawled - site may be blocked, returning empty result')
      return emptyResult
    }
    
    const mainPage = items[0] as {
      loadedUrl?: string
      title?: string
      description?: string
      html?: string
      text?: string
      metadata?: {
        title?: string
        description?: string
        image?: string
        favicon?: string
        keywords?: string
      }
    }
    const html = mainPage.html || ''
    const allHtml = items.map(i => (i as { html?: string }).html || '').join('\n')
    
    // Extract images
    const images: string[] = []
    const imgPattern = /<img[^>]+src=["']([^"']+)["']/gi
    let match
    while ((match = imgPattern.exec(allHtml)) !== null) {
      const src = match[1]
      if (src && !src.startsWith('data:') && !src.includes('placeholder')) {
        try {
          images.push(new URL(src, url).href)
        } catch {
          // Invalid URL
        }
      }
    }
    
    // Extract logo
    let logoUrl: string | null = null
    const logoPatterns = [
      /<img[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i,
      /<img[^>]+src=["']([^"']*logo[^"']+)["']/i,
    ]
    for (const pattern of logoPatterns) {
      const logoMatch = pattern.exec(html)
      if (logoMatch && logoMatch[1]) {
        try {
          logoUrl = new URL(logoMatch[1], url).href
          break
        } catch {
          // Invalid URL
        }
      }
    }
    
    // Extract headings
    const headings = { h1: [] as string[], h2: [] as string[], h3: [] as string[] }
    for (const level of ['h1', 'h2', 'h3'] as const) {
      const pattern = new RegExp(`<${level}[^>]*>([^<]+)</${level}>`, 'gi')
      while ((match = pattern.exec(allHtml)) !== null) {
        const text = match[1].trim()
        if (text.length > 2) headings[level].push(text)
      }
    }
    
    // Extract paragraphs
    const paragraphs: string[] = []
    const pPattern = /<p[^>]*>([^<]+)<\/p>/gi
    while ((match = pPattern.exec(allHtml)) !== null) {
      const text = match[1].trim()
      if (text.length > 50) paragraphs.push(text)
    }
    
    // Extract social links
    const socialLinks: EnhancedScrapeResult['socialLinks'] = {}
    const socialPatterns: { platform: keyof EnhancedScrapeResult['socialLinks']; pattern: RegExp }[] = [
      { platform: 'instagram', pattern: /https?:\/\/(?:www\.)?instagram\.com\/([^\/\s"'<>]+)/i },
      { platform: 'facebook', pattern: /https?:\/\/(?:www\.)?facebook\.com\/([^\/\s"'<>]+)/i },
      { platform: 'twitter', pattern: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([^\/\s"'<>]+)/i },
      { platform: 'linkedin', pattern: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([^\/\s"'<>]+)/i },
      { platform: 'youtube', pattern: /https?:\/\/(?:www\.)?youtube\.com\/([^\/\s"'<>]+)/i },
      { platform: 'tiktok', pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@?([^\/\s"'<>]+)/i },
    ]
    for (const { platform, pattern } of socialPatterns) {
      const socialMatch = pattern.exec(allHtml)
      if (socialMatch) socialLinks[platform] = socialMatch[0]
    }
    
    // Extract contact info
    const emails: string[] = []
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    while ((match = emailPattern.exec(allHtml)) !== null) {
      if (!match[0].includes('example')) emails.push(match[0])
    }
    
    const phones: string[] = []
    const phonePattern = /(?:\+972|0)[-\s]?(?:\d[-\s]?){8,10}/g
    while ((match = phonePattern.exec(allHtml)) !== null) {
      phones.push(match[0].trim())
    }
    
    // Extract address
    let address: string | null = null
    const addressPattern = /<address[^>]*>([^<]+)<\/address>/i
    const addressMatch = addressPattern.exec(html)
    if (addressMatch) address = addressMatch[1].trim()
    
    return {
      url: mainPage.loadedUrl || url,
      title: mainPage.metadata?.title || mainPage.title || '',
      description: mainPage.metadata?.description || mainPage.description || '',
      html,
      images: Array.from(new Set(images)).slice(0, 50),
      logoUrl,
      favicon: mainPage.metadata?.favicon || null,
      ogImage: mainPage.metadata?.image || null,
      headings: {
        h1: headings.h1.slice(0, 5),
        h2: headings.h2.slice(0, 10),
        h3: headings.h3.slice(0, 15),
      },
      paragraphs: paragraphs.slice(0, 30),
      socialLinks,
      emails: Array.from(new Set(emails)).slice(0, 5),
      phones: Array.from(new Set(phones)).slice(0, 5),
      address,
      metaKeywords: (mainPage.metadata?.keywords || '').split(',').map(k => k.trim()).filter(Boolean),
    }
  } catch (error) {
    console.error('[Content Scraper] Error:', error)
    console.log('[Content Scraper] Returning empty result - research will continue without scrape data')
    return {
      url,
      title: '',
      description: '',
      html: '',
      images: [],
      logoUrl: null,
      favicon: null,
      ogImage: null,
      headings: { h1: [], h2: [], h3: [] },
      paragraphs: [],
      socialLinks: {},
      emails: [],
      phones: [],
      address: null,
      metaKeywords: [],
    }
  }
}

