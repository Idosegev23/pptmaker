import { NextRequest, NextResponse } from 'next/server'
import { extractColorsFromLogo, analyzeColorPalette } from '@/lib/gemini/color-extractor'
import type { BrandColors } from '@/lib/gemini/color-extractor'
import { generateSmartImages } from '@/lib/gemini/israeli-image-generator'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/generate-visual-assets
 *
 * Generates visual assets for a proposal:
 * 1. Scrapes brand website → logo, images, colors
 * 2. Extracts brand color palette from logo/CSS
 * 3. Generates smart AI images using brand data
 * 4. Uploads everything to Supabase Storage
 *
 * Returns: { scraped, brandColors, generatedImages, imageStrategy }
 */

async function uploadImageToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'image/png'
): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error(`[Visual Assets][Upload] Failed ${fileName}:`, uploadError)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName)

    return urlData?.publicUrl || null
  } catch (error) {
    console.error(`[Visual Assets][Upload] Error ${fileName}:`, error)
    return null
  }
}

export async function POST(request: NextRequest) {
  const requestId = `va-${Date.now()}`
  console.log(`[Visual Assets][${requestId}] Starting visual assets generation`)

  try {
    const body = await request.json()
    const {
      brandName,
      brandResearch,
      stepData,
      websiteUrl,
    } = body

    if (!brandName) {
      return NextResponse.json({ error: 'brandName is required' }, { status: 400 })
    }

    const startTime = Date.now()

    // ─── Step 1: Scrape brand website ───
    console.log(`[Visual Assets][${requestId}] Step 1: Scraping brand website`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scrapedData: any = null
    let logoUrl: string | null = null

    // Find website URL from: explicit param > brandResearch.website > guess
    const siteUrl = websiteUrl
      || brandResearch?.website
      || null

    if (siteUrl) {
      try {
        const scrapeRes = await fetch(new URL('/api/scrape', request.url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: siteUrl, enhanced: true }),
        })
        const scrapeJson = await scrapeRes.json()

        if (scrapeJson.success && scrapeJson.data) {
          scrapedData = scrapeJson.data
          logoUrl = scrapedData.logoUrl || null
          console.log(`[Visual Assets][${requestId}] Scraped: logo=${!!logoUrl}, images=${scrapedData.allImages?.length || 0}, colors=${scrapedData.colorPalette?.length || 0}`)
        }
      } catch (scrapeErr) {
        console.error(`[Visual Assets][${requestId}] Scrape failed:`, scrapeErr)
      }
    } else {
      console.log(`[Visual Assets][${requestId}] No website URL - skipping scrape`)
    }

    // ─── Step 2: Extract brand colors ───
    console.log(`[Visual Assets][${requestId}] Step 2: Extracting brand colors`)

    let brandColors: BrandColors | null = null

    // Try logo color extraction first
    if (logoUrl) {
      try {
        brandColors = await extractColorsFromLogo(logoUrl)
        console.log(`[Visual Assets][${requestId}] Colors from logo: primary=${brandColors.primary}, accent=${brandColors.accent}`)
      } catch (colorErr) {
        console.error(`[Visual Assets][${requestId}] Logo color extraction failed:`, colorErr)
      }
    }

    // Fallback: CSS colors from website
    const cssColors = scrapedData?.colorPalette || scrapedData?.dominantColors || scrapedData?.cssColors
    if (!brandColors && cssColors?.length > 0) {
      try {
        brandColors = await analyzeColorPalette(cssColors)
        console.log(`[Visual Assets][${requestId}] Colors from CSS: primary=${brandColors.primary}`)
      } catch {
        // continue to next fallback
      }
    }

    // Fallback: website primary/secondary colors
    if (!brandColors && scrapedData?.primaryColor) {
      brandColors = {
        primary: scrapedData.primaryColor,
        secondary: scrapedData.secondaryColor || scrapedData.accentColor || '#666666',
        accent: scrapedData.accentColor || scrapedData.primaryColor,
        background: '#FFFFFF',
        text: '#111111',
        palette: [scrapedData.primaryColor, scrapedData.secondaryColor, scrapedData.accentColor].filter(Boolean),
        style: 'minimal' as const,
        mood: 'מקצועי',
      }
    }

    // Default colors if all else failed
    if (!brandColors) {
      brandColors = {
        primary: '#111111',
        secondary: '#666666',
        accent: '#E94560',
        background: '#FFFFFF',
        text: '#111111',
        palette: ['#111111', '#666666', '#E94560'],
        style: 'minimal' as const,
        mood: 'מודרני ומינימליסטי',
      }
      console.log(`[Visual Assets][${requestId}] Using default colors`)
    }

    // ─── Step 3: Generate AI images ───
    console.log(`[Visual Assets][${requestId}] Step 3: Generating AI images`)

    const imageUrls: Record<string, string | undefined> = {}
    const extraImageUrls: { id: string; url: string; placement: string }[] = []
    let imageStrategyMeta: {
      conceptSummary: string
      visualDirection: string
      totalPlanned: number
      totalGenerated: number
      styleGuide: string
    } | undefined

    // Build a minimal BrandResearch object for image generation
    const researchForImages: BrandResearch = brandResearch || {
      brandName,
      industry: stepData?.brief?.brandBrief?.match(/תעשיי[הת]\s+(\S+)/)?.[1] || '',
      marketPosition: '',
      brandPersonality: [],
      targetDemographics: {
        primaryAudience: {
          gender: stepData?.target_audience?.targetGender || '',
          ageRange: stepData?.target_audience?.targetAgeRange || '25-45',
          interests: [],
        },
      },
      confidence: 0.5,
    } as unknown as BrandResearch

    // Build proposal content context from stepData for better prompts
    const proposalContext = stepData ? {
      goals: stepData.goals?.goals || [],
      strategyHeadline: stepData.strategy?.strategyHeadline || '',
      activityTitle: stepData.creative?.activityTitle || '',
      activityDescription: stepData.creative?.activityDescription || '',
      targetDescription: stepData.target_audience?.targetDescription || '',
    } : undefined

    try {
      const smartImageSet = await generateSmartImages(
        researchForImages,
        brandColors,
        proposalContext
      )

      // Upload images to Supabase Storage
      const timestamp = Date.now()
      const brandPrefix = brandName
        .replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '')
        .slice(0, 20) || `brand_${timestamp}`

      const { legacyMapping, images: allSmartImages } = smartImageSet

      const uploadPromises: Promise<void>[] = []

      // Upload legacy-mapped images (cover, brand, audience, activity)
      if (legacyMapping.cover) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.cover.imageData, `proposals/${brandPrefix}/cover_${timestamp}.png`)
            .then(url => { if (url) imageUrls.coverImage = url })
        )
      }
      if (legacyMapping.brand) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.brand.imageData, `proposals/${brandPrefix}/brand_${timestamp}.png`)
            .then(url => { if (url) imageUrls.brandImage = url })
        )
      }
      if (legacyMapping.audience) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.audience.imageData, `proposals/${brandPrefix}/audience_${timestamp}.png`)
            .then(url => { if (url) imageUrls.audienceImage = url })
        )
      }
      if (legacyMapping.activity) {
        uploadPromises.push(
          uploadImageToStorage(legacyMapping.activity.imageData, `proposals/${brandPrefix}/activity_${timestamp}.png`)
            .then(url => { if (url) imageUrls.activityImage = url })
        )
      }

      // Upload extra images beyond the 4 legacy slots
      const legacyIds = [
        legacyMapping.cover?.id, legacyMapping.brand?.id,
        legacyMapping.audience?.id, legacyMapping.activity?.id,
      ].filter(Boolean)
      const extras = allSmartImages.filter(img => !legacyIds.includes(img.id))
      for (const img of extras) {
        uploadPromises.push(
          uploadImageToStorage(img.imageData, `proposals/${brandPrefix}/${img.id}_${timestamp}.png`)
            .then(url => {
              if (url) extraImageUrls.push({ id: img.id, url, placement: img.placement })
            })
        )
      }

      await Promise.all(uploadPromises).catch(err => {
        console.error(`[Visual Assets][${requestId}] Image upload error:`, err)
      })

      imageStrategyMeta = {
        conceptSummary: smartImageSet.strategy.conceptSummary,
        visualDirection: smartImageSet.strategy.visualDirection,
        totalPlanned: smartImageSet.strategy.images.length,
        totalGenerated: smartImageSet.images.length,
        styleGuide: smartImageSet.promptsData.styleGuide,
      }

      console.log(`[Visual Assets][${requestId}] Images generated: ${smartImageSet.images.length}/${smartImageSet.strategy.images.length}`)
      console.log(`[Visual Assets][${requestId}] Uploaded: cover=${!!imageUrls.coverImage}, brand=${!!imageUrls.brandImage}, audience=${!!imageUrls.audienceImage}, activity=${!!imageUrls.activityImage}, extras=${extraImageUrls.length}`)
    } catch (imgErr) {
      console.error(`[Visual Assets][${requestId}] Image generation failed entirely:`, imgErr)
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[Visual Assets][${requestId}] Complete in ${elapsed}s`)

    return NextResponse.json({
      success: true,
      scraped: scrapedData ? {
        logoUrl: scrapedData.logoUrl || null,
        logoAlternatives: scrapedData.logoAlternatives || [],
        heroImages: scrapedData.heroImages || [],
        productImages: scrapedData.productImages || [],
        lifestyleImages: scrapedData.lifestyleImages || [],
      } : null,
      brandColors,
      generatedImages: imageUrls,
      extraImages: extraImageUrls,
      imageStrategy: imageStrategyMeta || null,
      elapsed,
    })
  } catch (error) {
    console.error(`[Visual Assets][${requestId}] Error:`, error)
    return NextResponse.json(
      { error: 'Failed to generate visual assets', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
