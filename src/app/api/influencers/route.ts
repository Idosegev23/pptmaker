import { NextRequest, NextResponse } from 'next/server'
import { discoverAndScrapeInfluencers, scrapeMultipleInfluencers } from '@/lib/apify/influencer-scraper'
import { researchInfluencers } from '@/lib/gemini/influencer-research'
import type { BrandResearch } from '@/lib/gemini/brand-research'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      brandResearch, 
      budget, 
      goals,
      usernames,
      mode = 'discover' // 'discover' | 'scrape' | 'research'
    } = body as {
      brandResearch?: BrandResearch
      budget?: number
      goals?: string[]
      usernames?: string[]
      mode?: 'discover' | 'scrape' | 'research'
    }
    
    console.log(`[API Influencers] Mode: ${mode}`)
    
    // Mode: Scrape specific usernames
    if (mode === 'scrape' && usernames && usernames.length > 0) {
      console.log(`[API Influencers] Scraping ${usernames.length} specific profiles`)
      const scraped = await scrapeMultipleInfluencers(usernames)
      
      return NextResponse.json({
        success: true,
        influencers: scraped,
        count: scraped.length,
      })
    }
    
    // Mode: AI research only (no scraping)
    if (mode === 'research' && brandResearch && budget && goals) {
      console.log('[API Influencers] AI research only')
      const strategy = await researchInfluencers(brandResearch, budget, goals)
      
      return NextResponse.json({
        success: true,
        strategy,
        recommendations: strategy.recommendations,
      })
    }
    
    // Mode: Full discovery - AI research + real scraping
    if (mode === 'discover' && brandResearch && budget && goals) {
      console.log('[API Influencers] Full discovery mode')
      
      // Step 1: Get AI recommendations
      const strategy = await researchInfluencers(brandResearch, budget, goals)
      console.log(`[API Influencers] AI recommended ${strategy.recommendations?.length || 0} influencers`)
      
      // Step 2: Try to scrape real profiles based on industry
      const industry = brandResearch.industry || 'lifestyle'
      const audience = {
        gender: brandResearch.targetDemographics?.primaryAudience?.gender,
        ageRange: brandResearch.targetDemographics?.primaryAudience?.ageRange,
        interests: brandResearch.targetDemographics?.primaryAudience?.interests,
      }
      
      // Scrape real influencers
      const scrapedInfluencers = await discoverAndScrapeInfluencers(
        industry,
        audience,
        budget,
        6 // Get 6 real influencers
      )
      
      console.log(`[API Influencers] Scraped ${scrapedInfluencers.length} real profiles`)
      
      // Combine AI strategy with real scraped data
      return NextResponse.json({
        success: true,
        strategy,
        recommendations: strategy.recommendations,
        scrapedInfluencers,
        combinedCount: scrapedInfluencers.length + (strategy.recommendations?.length || 0),
      })
    }
    
    return NextResponse.json(
      { error: 'Missing required parameters for the selected mode' },
      { status: 400 }
    )
    
  } catch (error) {
    console.error('[API Influencers] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process influencer request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

