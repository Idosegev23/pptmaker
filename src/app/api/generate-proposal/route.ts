import { NextRequest, NextResponse } from 'next/server'
import { generateProposalContent } from '@/lib/openai/proposal-writer'
import { researchInfluencers } from '@/lib/gemini/influencer-research'
import { discoverAndScrapeInfluencers } from '@/lib/apify/influencer-scraper'
import { generateBrandAssetsFromLogo } from '@/lib/gemini/logo-designer'
import { generateIsraeliProposalImages, israeliImageToDataUrl } from '@/lib/gemini/israeli-image-generator'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import type { BrandColors } from '@/lib/gemini/color-extractor'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brandResearch, brandColors, budget, goals, scrapedData } = body as {
      brandResearch: BrandResearch
      brandColors: BrandColors
      budget: number
      goals: string[]
      scrapedData?: {
        logoUrl?: string
        screenshot?: string
        heroImages?: string[]
        productImages?: string[]
        lifestyleImages?: string[]
      }
    }
    
    if (!brandResearch || !budget) {
      return NextResponse.json(
        { error: 'Brand research and budget are required' },
        { status: 400 }
      )
    }
    
    console.log(`[API Generate] Generating proposal for: ${brandResearch.brandName}`)
    console.log(`[API Generate] Budget: ${budget}, Goals: ${goals.join(', ')}`)
    
    // Get logo URL for brand assets
    const logoUrl = scrapedData?.logoUrl
    
    // Run all generation tasks in parallel for speed
    const [content, influencerStrategy, scrapedInfluencers, brandAssets, images] = await Promise.all([
      // 1. Generate proposal content
      generateProposalContent(brandResearch, { budget, goals }, brandColors),
      
      // 2. AI influencer research
      researchInfluencers(brandResearch, budget, goals),
      
      // 3. Real influencer scraping
      discoverAndScrapeInfluencers(
        brandResearch.industry || 'lifestyle',
        {
          gender: brandResearch.targetDemographics?.primaryAudience?.gender,
          ageRange: brandResearch.targetDemographics?.primaryAudience?.ageRange,
          interests: brandResearch.targetDemographics?.primaryAudience?.interests,
        },
        budget,
        6
      ).catch(err => {
        console.error('[API Generate] Influencer scraping failed:', err)
        return []
      }),
      
      // 4. Generate brand assets from logo
      logoUrl ? generateBrandAssetsFromLogo(logoUrl, brandResearch.brandName, brandResearch.industry || 'lifestyle').catch(err => {
        console.error('[API Generate] Brand assets generation failed:', err)
        return null
      }) : Promise.resolve(null),
      
      // 5. Generate Israeli market lifestyle images (Nano Banana Pro style)
      generateIsraeliProposalImages(brandResearch, brandColors),
    ])
    
    console.log(`[API Generate] Content generated, tone: ${content.toneUsed}`)
    console.log(`[API Generate] Influencer strategy: ${influencerStrategy.recommendations?.length || 0} AI recommendations`)
    console.log(`[API Generate] Scraped influencers: ${scrapedInfluencers.length} real profiles`)
    console.log(`[API Generate] Brand assets: ${brandAssets?.designs?.length || 0} designs generated`)
    
    // Convert Israeli images to data URLs
    const imageUrls = {
      coverImage: images.cover ? israeliImageToDataUrl(images.cover) : undefined,
      brandImage: images.lifestyle ? israeliImageToDataUrl(images.lifestyle) : undefined,
      audienceImage: images.audience ? israeliImageToDataUrl(images.audience) : undefined,
      activityImage: images.activity ? israeliImageToDataUrl(images.activity) : undefined,
    }
    
    // Add brand assets if generated
    const brandDesigns = brandAssets?.designs?.reduce((acc, design) => {
      acc[design.type] = `data:image/png;base64,${design.imageData}`
      return acc
    }, {} as Record<string, string>) || {}
    
    console.log(`[API Generate] Generated ${Object.values(imageUrls).filter(Boolean).length} images, ${Object.keys(brandDesigns).length} brand designs`)
    
    return NextResponse.json({
      success: true,
      content,
      images: {
        ...imageUrls,
        ...brandDesigns,
      },
      influencerStrategy,
      scrapedInfluencers: scrapedInfluencers.map(inf => ({
        name: inf.fullName || inf.username,
        username: inf.username,
        profileUrl: inf.profileUrl,
        profilePicUrl: inf.profilePicUrl,
        followers: inf.followers,
        engagementRate: inf.engagementRate,
        avgLikes: inf.avgLikes,
        avgComments: inf.avgComments,
        bio: inf.bio,
        categories: inf.categories,
        recentPosts: inf.recentPosts.slice(0, 3),
        isVerified: inf.isVerified,
      })),
      brandAssets: brandAssets ? {
        analysis: brandAssets.analysis,
        designTypes: brandAssets.designs.map(d => d.type),
      } : undefined,
      scrapedAssets: scrapedData ? {
        logoUrl: scrapedData.logoUrl,
        screenshot: scrapedData.screenshot,
        heroImages: scrapedData.heroImages,
        productImages: scrapedData.productImages,
        lifestyleImages: scrapedData.lifestyleImages,
      } : undefined,
    })
  } catch (error) {
    console.error('[API Generate] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate proposal', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

