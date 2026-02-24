import { NextRequest, NextResponse } from 'next/server'
import { fetchScrape } from '@/lib/apify/fetch-scraper'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    console.log(`[API Scrape] Scraping ${url}`)

    try {
      const scrapedData = await fetchScrape(url)
      console.log(`[API Scrape] Done - logo=${!!scrapedData.logoUrl}, ${scrapedData.allImages.length} images, ${scrapedData.colorPalette.length} colors`)

      return NextResponse.json({
        success: true,
        data: scrapedData,
        enhanced: true,
      })
    } catch (fetchError) {
      console.error('[API Scrape] Fetch scraper failed:', fetchError)
    }

    // Scraper failed → return empty
    return emptyResponse(url)
  } catch (error) {
    console.error('[API Scrape] Error:', error)
    return emptyResponse('')
  }
}

function emptyResponse(url: string) {
  console.log('[API Scrape] Returning empty result')
  return NextResponse.json({
    success: true,
    data: {
      url: url || '',
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
    scraperBlocked: true,
  })
}
