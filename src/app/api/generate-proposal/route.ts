import { NextRequest, NextResponse } from 'next/server'
import { generateProposalContent } from '@/lib/openai/proposal-writer'
import { researchInfluencers } from '@/lib/gemini/influencer-research'
import { discoverAndScrapeInfluencers } from '@/lib/apify/influencer-scraper'
import { generateBrandAssetsFromLogo } from '@/lib/gemini/logo-designer'
import { generateIsraeliProposalImages } from '@/lib/gemini/israeli-image-generator'
import { createClient } from '@/lib/supabase/server'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import type { BrandColors } from '@/lib/gemini/color-extractor'

/**
 * Upload image buffer directly to Supabase Storage
 * Returns public URL
 */
async function uploadImageToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'image/png'
): Promise<string | null> {
  try {
    console.log(`[Upload] Starting upload: ${fileName}, size: ${buffer.length} bytes`)
    
    const supabase = await createClient()
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      })
    
    if (uploadError) {
      console.error(`[Upload] Failed ${fileName}:`, uploadError)
      return null
    }
    
    console.log(`[Upload] Upload success: ${fileName}, path: ${uploadData?.path}`)
    
    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName)
    
    const publicUrl = urlData?.publicUrl
    console.log(`[Upload] Public URL: ${publicUrl?.slice(0, 80)}...`)
    
    return publicUrl || null
  } catch (error) {
    console.error(`[Upload] Error ${fileName}:`, error)
    return null
  }
}

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
    
    // Upload images directly to Supabase Storage (avoid sending huge base64 to client)
    const timestamp = Date.now()
    // Use only ASCII characters for file names (Supabase doesn't support Hebrew in keys)
    const brandPrefix = brandResearch.brandName
      .replace(/[^a-zA-Z0-9]/g, '') // Remove all non-ASCII
      .slice(0, 20) || `brand_${timestamp}` // Fallback if empty after cleanup
    
    console.log('[API Generate] ========== UPLOADING IMAGES TO STORAGE ==========')
    
    const imageUrls: Record<string, string | undefined> = {}
    
    // Upload each image in parallel
    const uploadPromises: Promise<void>[] = []
    
    if (images.cover) {
      uploadPromises.push(
        uploadImageToStorage(
          images.cover.imageData,
          `proposals/${brandPrefix}/cover_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.coverImage = url
            console.log(`[API Generate] coverImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }
    
    if (images.lifestyle) {
      uploadPromises.push(
        uploadImageToStorage(
          images.lifestyle.imageData,
          `proposals/${brandPrefix}/brand_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.brandImage = url
            console.log(`[API Generate] brandImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }
    
    if (images.audience) {
      uploadPromises.push(
        uploadImageToStorage(
          images.audience.imageData,
          `proposals/${brandPrefix}/audience_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.audienceImage = url
            console.log(`[API Generate] audienceImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }
    
    if (images.activity) {
      uploadPromises.push(
        uploadImageToStorage(
          images.activity.imageData,
          `proposals/${brandPrefix}/activity_${timestamp}.png`
        ).then(url => {
          if (url) {
            imageUrls.activityImage = url
            console.log(`[API Generate] activityImage uploaded: ${url.slice(0, 60)}...`)
          }
        })
      )
    }
    
    // Wait for all uploads
    try {
      await Promise.all(uploadPromises)
      console.log(`[API Generate] All uploads completed`)
    } catch (uploadAllError) {
      console.error('[API Generate] Promise.all failed:', uploadAllError)
    }
    
    console.log(`[API Generate] Uploaded ${Object.values(imageUrls).filter(Boolean).length} images to Storage`)
    console.log('[API Generate] Image URLs to return:', JSON.stringify(imageUrls, null, 2))
    console.log('[API Generate] ========== END IMAGE UPLOAD ==========')
    
    // Brand designs - keep as data URLs (they're smaller and used differently)
    const brandDesigns = brandAssets?.designs?.reduce((acc, design) => {
      acc[design.type] = `data:image/png;base64,${design.imageData}`
      return acc
    }, {} as Record<string, string>) || {}
    
    return NextResponse.json({
      success: true,
      content,
      // URLs to uploaded images (not base64!)
      imageUrls: imageUrls,
      // Brand designs as base64 (small, for decorative use)
      brandDesigns: brandDesigns,
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

