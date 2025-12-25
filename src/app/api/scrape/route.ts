import { NextRequest, NextResponse } from 'next/server'
import { enhancedScrape } from '@/lib/apify/enhanced-scraper'
import { scrapeWebsite, quickScrape } from '@/lib/apify/website-scraper'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, quick = false, enhanced = true } = body
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }
    
    console.log(`[API Scrape] Scraping ${url}, enhanced=${enhanced}, quick=${quick}`)
    
    // Use enhanced scraper for auto-proposal flow
    if (enhanced) {
      const scrapedData = await enhancedScrape(url)
      console.log(`[API Scrape] Enhanced - extracted screenshot, ${scrapedData.allImages.length} images, ${scrapedData.colorPalette.length} colors`)
      
      return NextResponse.json({
        success: true,
        data: scrapedData,
        enhanced: true,
      })
    }
    
    // Fallback to original scraper
    const scrapedData = quick 
      ? await quickScrape(url)
      : await scrapeWebsite(url)
    
    console.log(`[API Scrape] Legacy - extracted ${scrapedData.images.length} images, ${scrapedData.cssColors.length} colors`)
    
    return NextResponse.json({
      success: true,
      data: scrapedData,
    })
  } catch (error) {
    console.error('[API Scrape] Error:', error)
    console.log('[API Scrape] Returning empty result - research will continue')
    
    // Return empty result instead of error - research can continue without scrape
    return NextResponse.json({
      success: true,
      data: {
        url: '',
        title: '',
        description: '',
        screenshot: null,
        logoUrl: null,
        logoAlternatives: [],
        favicon: null,
        ogImage: null,
        heroImages: [],
        productImages: [],
        lifestyleImages: [],
        allImages: [],
        primaryColor: null,
        secondaryColor: null,
        accentColor: null,
        colorPalette: [],
        headings: { h1: [], h2: [], h3: [] },
        paragraphs: [],
        tagline: null,
        aboutText: null,
        socialLinks: {},
        emails: [],
        phones: [],
        address: null,
        metaKeywords: [],
        metaDescription: '',
      },
      enhanced: true,
      scraperBlocked: true, // Flag to indicate scraping failed
    })
  }
}

