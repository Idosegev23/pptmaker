import { NextRequest, NextResponse } from 'next/server'
import { enhancedScrape } from '@/lib/apify/enhanced-scraper'
import { fetchScrape } from '@/lib/apify/fetch-scraper'
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
      try {
        const scrapedData = await enhancedScrape(url)

        // Check if Apify actually returned data (not empty from quota error)
        const hasData = scrapedData.allImages.length > 0 || scrapedData.logoUrl || scrapedData.colorPalette.length > 0

        if (hasData) {
          console.log(`[API Scrape] Enhanced - screenshot, ${scrapedData.allImages.length} images, ${scrapedData.colorPalette.length} colors`)
          return NextResponse.json({
            success: true,
            data: scrapedData,
            enhanced: true,
          })
        }

        // Apify returned empty (likely quota exceeded) → fall through to fetch scraper
        console.log('[API Scrape] Enhanced returned empty data, falling back to fetch scraper')
      } catch (apifyError) {
        const errMsg = apifyError instanceof Error ? apifyError.message : String(apifyError)
        console.log(`[API Scrape] Apify failed (${errMsg}), falling back to fetch scraper`)
      }

      // Fallback: plain fetch-based scraper (no Apify dependency)
      try {
        const scrapedData = await fetchScrape(url)
        const hasData = scrapedData.allImages.length > 0 || scrapedData.logoUrl || scrapedData.colorPalette.length > 0
        console.log(`[API Scrape] Fetch fallback - logo=${!!scrapedData.logoUrl}, ${scrapedData.allImages.length} images, ${scrapedData.colorPalette.length} colors`)

        return NextResponse.json({
          success: true,
          data: scrapedData,
          enhanced: true,
          fallback: true,
        })
      } catch (fetchError) {
        console.error('[API Scrape] Fetch fallback also failed:', fetchError)
      }
    } else {
      // Legacy scraper path
      try {
        const scrapedData = quick
          ? await quickScrape(url)
          : await scrapeWebsite(url)

        console.log(`[API Scrape] Legacy - ${scrapedData.images.length} images, ${scrapedData.cssColors.length} colors`)

        return NextResponse.json({
          success: true,
          data: scrapedData,
        })
      } catch (legacyError) {
        console.log('[API Scrape] Legacy scraper failed, trying fetch fallback')

        try {
          const scrapedData = await fetchScrape(url)
          return NextResponse.json({
            success: true,
            data: scrapedData,
            fallback: true,
          })
        } catch {
          // Fall through to empty result
        }
      }
    }

    // All scrapers failed → return empty
    return emptyResponse(url)
  } catch (error) {
    console.error('[API Scrape] Error:', error)
    const url = (await request.json().catch(() => ({}))).url || ''
    return emptyResponse(url)
  }
}

function emptyResponse(url: string) {
  console.log('[API Scrape] Returning empty result - research will continue')
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
