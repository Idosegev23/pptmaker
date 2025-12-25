/**
 * Apify Website Scraper Service - Enhanced
 * Uses website-content-crawler to extract content, images, colors, and logos
 */

import { ApifyClient } from 'apify-client'

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
})

export interface ScrapedWebsite {
  url: string
  title: string
  description: string
  
  // Visual assets - Enhanced
  logos: {
    primary: string | null     // Best logo found
    alternatives: string[]     // Other logo candidates
    favicon: string | null
    ogImage: string | null
  }
  
  // All images for analysis
  images: string[]
  heroImages: string[]         // Large hero/banner images
  
  // Colors extracted from CSS
  cssColors: string[]
  dominantColors: string[]     // Most frequently used colors
  
  // Content - Enhanced
  headings: {
    h1: string[]
    h2: string[]
    h3: string[]
  }
  paragraphs: string[]
  keyPhrases: string[]         // Important phrases/taglines
  
  // Meta
  socialLinks: {
    instagram?: string
    facebook?: string
    twitter?: string
    linkedin?: string
    youtube?: string
    tiktok?: string
  }
  contactInfo: {
    emails: string[]
    phones: string[]
    address?: string
  }
  
  // SEO Meta
  metaKeywords: string[]
  ogTitle?: string
  ogDescription?: string
  
  // Raw HTML for further processing
  rawHtml?: string
}

interface CrawlerResult {
  url: string
  loadedUrl?: string
  title?: string
  description?: string
  text?: string
  html?: string
  metadata?: {
    title?: string
    description?: string
    image?: string
    favicon?: string
    keywords?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Enhanced color extraction from CSS/HTML
 */
function extractColorsFromHtml(html: string): { all: string[]; dominant: string[] } {
  const colorCounts = new Map<string, number>()
  
  // Match hex colors
  const hexPattern = /#([0-9A-Fa-f]{3,6})\b/g
  let match
  while ((match = hexPattern.exec(html)) !== null) {
    let hex = match[0].toLowerCase()
    // Normalize 3-char hex to 6-char
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    }
    // Filter out common non-brand colors
    if (!isCommonNonBrandColor(hex)) {
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1)
    }
  }
  
  // Match rgb/rgba colors
  const rgbPattern = /rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g
  while ((match = rgbPattern.exec(html)) !== null) {
    const r = parseInt(match[1])
    const g = parseInt(match[2])
    const b = parseInt(match[3])
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    if (!isCommonNonBrandColor(hex)) {
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1)
    }
  }
  
  // Sort by frequency
  const sorted = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
  
  return {
    all: sorted.map(([color]) => color).slice(0, 25),
    dominant: sorted.slice(0, 5).map(([color]) => color),
  }
}

/**
 * Check if color is a common non-brand color (white, black, grays)
 */
function isCommonNonBrandColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  
  // Pure white, black
  if ((r === 255 && g === 255 && b === 255) || (r === 0 && g === 0 && b === 0)) {
    return true
  }
  
  // Grays (where R, G, B are very close)
  const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15
  // Very light grays (backgrounds) or very dark grays (text)
  if (isGray && (r > 240 || r < 40)) {
    return true
  }
  
  return false
}

/**
 * Enhanced logo extraction
 */
function extractLogos(html: string, baseUrl: string): { primary: string | null; alternatives: string[] } {
  const candidates: { url: string; score: number }[] = []
  
  // Priority patterns for logo detection
  const patterns = [
    // Direct logo patterns (highest priority)
    { pattern: /<img[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/gi, score: 100 },
    { pattern: /<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id)=["'][^"']*logo[^"']*["']/gi, score: 100 },
    { pattern: /<a[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi, score: 95 },
    
    // Logo in filename
    { pattern: /<img[^>]+src=["']([^"']*logo[^"']+)["']/gi, score: 90 },
    
    // Header images (likely logos)
    { pattern: /<header[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi, score: 80 },
    { pattern: /<nav[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi, score: 75 },
    
    // Brand/company class
    { pattern: /<img[^>]+(?:class|id)=["'][^"']*(?:brand|company|site-logo)[^"']*["'][^>]+src=["']([^"']+)["']/gi, score: 85 },
    
    // SVG logos
    { pattern: /<a[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]*>[\s\S]*?<svg/gi, score: 70 },
  ]
  
  for (const { pattern, score } of patterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const src = match[1]
      if (src && !src.startsWith('data:') && !src.includes('placeholder')) {
        try {
          const absoluteUrl = new URL(src, baseUrl).href
          // Check if it's an image file
          if (/\.(png|jpg|jpeg|svg|webp|gif)(\?|$)/i.test(absoluteUrl)) {
            candidates.push({ url: absoluteUrl, score })
          }
        } catch {
          // Invalid URL
        }
      }
    }
  }
  
  // Sort by score and dedupe
  const seen = new Set<string>()
  const sorted = candidates
    .sort((a, b) => b.score - a.score)
    .filter(c => {
      if (seen.has(c.url)) return false
      seen.add(c.url)
      return true
    })
  
  return {
    primary: sorted[0]?.url || null,
    alternatives: sorted.slice(1, 5).map(c => c.url),
  }
}

/**
 * Extract hero/banner images
 */
function extractHeroImages(html: string, baseUrl: string): string[] {
  const heroes: string[] = []
  
  // Patterns for hero images
  const patterns = [
    /<(?:div|section)[^>]+(?:class|id)=["'][^"']*(?:hero|banner|slider|carousel)[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi,
    /background-image:\s*url\(["']?([^"')]+)["']?\)/gi,
    /<img[^>]+(?:class|id)=["'][^"']*(?:hero|banner|featured)[^"']*["'][^>]+src=["']([^"']+)["']/gi,
  ]
  
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const src = match[1]
      if (src && !src.startsWith('data:')) {
        try {
          const absoluteUrl = new URL(src, baseUrl).href
          if (!heroes.includes(absoluteUrl)) {
            heroes.push(absoluteUrl)
          }
        } catch {
          // Invalid URL
        }
      }
    }
  }
  
  return heroes.slice(0, 10)
}

/**
 * Extract headings by level
 */
function extractHeadings(html: string): { h1: string[]; h2: string[]; h3: string[] } {
  const result = { h1: [] as string[], h2: [] as string[], h3: [] as string[] }
  
  for (const level of ['h1', 'h2', 'h3'] as const) {
    const pattern = new RegExp(`<${level}[^>]*>([^<]+)</${level}>`, 'gi')
    let match
    while ((match = pattern.exec(html)) !== null) {
      const text = match[1].trim()
      if (text && text.length > 2 && text.length < 200) {
        result[level].push(text)
      }
    }
  }
  
  return {
    h1: result.h1.slice(0, 5),
    h2: result.h2.slice(0, 10),
    h3: result.h3.slice(0, 15),
  }
}

/**
 * Extract key phrases (taglines, slogans)
 */
function extractKeyPhrases(html: string): string[] {
  const phrases: string[] = []
  
  // Look for tagline/slogan elements
  const patterns = [
    /<(?:p|span|div)[^>]+(?:class|id)=["'][^"']*(?:tagline|slogan|subtitle|description)[^"']*["'][^>]*>([^<]+)</gi,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/gi,
  ]
  
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const text = match[1].trim()
      if (text && text.length > 10 && text.length < 300) {
        phrases.push(text)
      }
    }
  }
  
  return phrases.slice(0, 10)
}

/**
 * Extract social links with platform detection
 */
function extractSocialLinks(html: string): ScrapedWebsite['socialLinks'] {
  const links: ScrapedWebsite['socialLinks'] = {}
  
  const patterns: { platform: keyof ScrapedWebsite['socialLinks']; pattern: RegExp }[] = [
    { platform: 'instagram', pattern: /https?:\/\/(?:www\.)?instagram\.com\/([^\/\s"'<>]+)/gi },
    { platform: 'facebook', pattern: /https?:\/\/(?:www\.)?facebook\.com\/([^\/\s"'<>]+)/gi },
    { platform: 'twitter', pattern: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([^\/\s"'<>]+)/gi },
    { platform: 'linkedin', pattern: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([^\/\s"'<>]+)/gi },
    { platform: 'youtube', pattern: /https?:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|@)?([^\/\s"'<>]+)/gi },
    { platform: 'tiktok', pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@?([^\/\s"'<>]+)/gi },
  ]
  
  for (const { platform, pattern } of patterns) {
    const match = pattern.exec(html)
    if (match) {
      links[platform] = match[0].replace(/['"]/g, '')
    }
  }
  
  return links
}

/**
 * Enhanced contact info extraction
 */
function extractContactInfo(html: string): ScrapedWebsite['contactInfo'] {
  const emails = new Set<string>()
  const phones = new Set<string>()
  let address: string | undefined
  
  // Email
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  let match
  while ((match = emailPattern.exec(html)) !== null) {
    const email = match[0].toLowerCase()
    if (!email.includes('example') && !email.includes('test')) {
      emails.add(email)
    }
  }
  
  // Phone (Israeli and international)
  const phonePatterns = [
    /(?:\+972|0)[-\s]?(?:\d[-\s]?){8,10}/g,
    /\d{2,3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ]
  for (const pattern of phonePatterns) {
    while ((match = pattern.exec(html)) !== null) {
      phones.add(match[0].trim())
    }
  }
  
  // Address
  const addressPattern = /<address[^>]*>([^<]+(?:<[^>]+>[^<]+)*)<\/address>/gi
  const addressMatch = addressPattern.exec(html)
  if (addressMatch) {
    address = addressMatch[1].replace(/<[^>]+>/g, ' ').trim()
  }
  
  return {
    emails: Array.from(emails).slice(0, 5),
    phones: Array.from(phones).slice(0, 5),
    address,
  }
}

/**
 * Main scrape function - Enhanced
 */
export async function scrapeWebsite(url: string): Promise<ScrapedWebsite> {
  console.log(`[Apify] Starting enhanced scrape of ${url}`)
  
  if (!url.startsWith('http')) {
    url = `https://${url}`
  }
  
  try {
    const run = await client.actor('apify/website-content-crawler').call({
      startUrls: [{ url }],
      maxCrawlPages: 8,
      maxCrawlDepth: 2,
      crawlerType: 'cheerio',
      includeUrlGlobs: [],
      excludeUrlGlobs: [
        '*/wp-admin/*',
        '*/login*',
        '*/cart*',
        '*/checkout*',
        '*/account*',
        '*/*.pdf',
        '*/*.zip',
      ],
      saveHtml: true,
      saveMarkdown: false,
      saveScreenshots: false,
    })
    
    console.log(`[Apify] Crawl completed, run ID: ${run.defaultDatasetId}`)
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    const results = items as CrawlerResult[]
    
    if (results.length === 0) {
      throw new Error('No pages crawled')
    }
    
    const mainPage = results[0]
    const html = mainPage.html || ''
    const allHtml = results.map(r => r.html || '').join('\n')
    const allText = results.map(r => r.text || '').join('\n')
    
    const logos = extractLogos(html, url)
    const colors = extractColorsFromHtml(allHtml)
    
    const scraped: ScrapedWebsite = {
      url: mainPage.loadedUrl || url,
      title: mainPage.metadata?.title || mainPage.title || '',
      description: mainPage.metadata?.description || mainPage.description || '',
      
      logos: {
        primary: logos.primary,
        alternatives: logos.alternatives,
        favicon: mainPage.metadata?.favicon || null,
        ogImage: mainPage.metadata?.image || null,
      },
      
      images: extractAllImages(allHtml, url),
      heroImages: extractHeroImages(html, url),
      
      cssColors: colors.all,
      dominantColors: colors.dominant,
      
      headings: extractHeadings(allHtml),
      paragraphs: allText.split('\n').filter(p => p.length > 50 && p.length < 1000).slice(0, 30),
      keyPhrases: extractKeyPhrases(html),
      
      socialLinks: extractSocialLinks(allHtml),
      contactInfo: extractContactInfo(allHtml),
      
      metaKeywords: (mainPage.metadata?.keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean),
      ogTitle: mainPage.metadata?.title,
      ogDescription: mainPage.metadata?.description,
      
      rawHtml: html.slice(0, 150000),
    }
    
    console.log(`[Apify] Extracted: logo=${!!scraped.logos.primary}, ${scraped.images.length} images, ${scraped.cssColors.length} colors`)
    
    return scraped
  } catch (error) {
    console.error('[Apify] Error:', error)
    throw new Error(`Failed to scrape website: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Extract all images
 */
function extractAllImages(html: string, baseUrl: string): string[] {
  const images = new Set<string>()
  
  const imgPattern = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgPattern.exec(html)) !== null) {
    const src = match[1]
    if (src && !src.startsWith('data:') && !src.includes('placeholder') && !src.includes('tracking')) {
      try {
        const absoluteUrl = new URL(src, baseUrl).href
        images.add(absoluteUrl)
      } catch {
        // Invalid URL
      }
    }
  }
  
  return Array.from(images).slice(0, 50)
}

/**
 * Quick scrape - homepage only
 */
export async function quickScrape(url: string): Promise<ScrapedWebsite> {
  console.log(`[Apify] Quick scrape of ${url}`)
  
  if (!url.startsWith('http')) {
    url = `https://${url}`
  }
  
  try {
    const run = await client.actor('apify/website-content-crawler').call({
      startUrls: [{ url }],
      maxCrawlPages: 1,
      maxCrawlDepth: 0,
      crawlerType: 'cheerio',
      saveHtml: true,
    })
    
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    const results = items as CrawlerResult[]
    
    if (results.length === 0) {
      throw new Error('Failed to fetch page')
    }
    
    const page = results[0]
    const html = page.html || ''
    const logos = extractLogos(html, url)
    const colors = extractColorsFromHtml(html)
    
    return {
      url: page.loadedUrl || url,
      title: page.metadata?.title || page.title || '',
      description: page.metadata?.description || page.description || '',
      logos: {
        primary: logos.primary,
        alternatives: logos.alternatives,
        favicon: page.metadata?.favicon || null,
        ogImage: page.metadata?.image || null,
      },
      images: extractAllImages(html, url),
      heroImages: extractHeroImages(html, url),
      cssColors: colors.all,
      dominantColors: colors.dominant,
      headings: extractHeadings(html),
      paragraphs: (page.text || '').split('\n').filter(p => p.length > 50).slice(0, 15),
      keyPhrases: extractKeyPhrases(html),
      socialLinks: extractSocialLinks(html),
      contactInfo: extractContactInfo(html),
      metaKeywords: [],
      rawHtml: html.slice(0, 80000),
    }
  } catch (error) {
    console.error('[Apify] Quick scrape error:', error)
    throw error
  }
}
