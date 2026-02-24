import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderProposalToHtml } from '@/templates/quote/proposal-template'
import { generatePremiumProposalSlides } from '@/templates/quote/premium-proposal-template'
import { generateAISlides } from '@/lib/gemini/slide-designer'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 600

/**
 * POST /api/preview-slides
 * Returns HTML slide strings for client-side preview rendering.
 * Priority: cached AI slides → generate AI slides (+ cache) → premium template fallback
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const { documentId } = await request.json()

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const documentData = document.data as Record<string, unknown>

    const isAutoProposal = !!documentData._brandResearch || !!documentData._brandColors || !!documentData.influencerResearch

    // 1. Check for cached AI slides → return instantly
    const cachedSlides = documentData._cachedSlides as string[] | undefined
    if (cachedSlides && cachedSlides.length > 0) {
      console.log(`[Preview Slides] Using ${cachedSlides.length} cached AI slides`)
      return NextResponse.json({
        slides: cachedSlides,
        brandName: (documentData.brandName as string) || document.title || '',
        slideCount: cachedSlides.length,
        fromCache: true,
      })
    }

    // Build images config (shared by both AI and fallback)
    const images = (documentData._generatedImages as Record<string, string>) || {}
    const brandColors = documentData._brandColors as { primary?: string; secondary?: string; accent?: string } | undefined
    const scrapedAssets = documentData._scraped as {
      logoUrl?: string
      heroImages?: string[]
      lifestyleImages?: string[]
    } | undefined

    const finalImages = {
      coverImage: images.coverImage || scrapedAssets?.heroImages?.[0] || '',
      brandImage: images.brandImage || scrapedAssets?.heroImages?.[1] || scrapedAssets?.heroImages?.[0] || '',
      audienceImage: images.audienceImage || scrapedAssets?.lifestyleImages?.[0] || '',
      activityImage: images.activityImage || scrapedAssets?.lifestyleImages?.[1] || scrapedAssets?.lifestyleImages?.[0] || '',
    }

    const extraImages = documentData._extraImages as { id: string; url: string; placement: string }[] | undefined
    const imageStrategy = documentData._imageStrategy as {
      conceptSummary?: string
      visualDirection?: string
      styleGuide?: string
    } | undefined

    const templateConfig = {
      accentColor: brandColors?.primary || '#E94560',
      brandLogoUrl: documentData.brandLogoFile as string | undefined,
      clientLogoUrl: scrapedAssets?.logoUrl,
      images: finalImages,
      extraImages,
      imageStrategy,
    }

    let htmlPages: string[]

    if (isAutoProposal) {
      // 2. Try generating AI slides (the new slide-designer)
      try {
        console.log('[Preview Slides] Generating AI slides with slide-designer...')
        htmlPages = await generateAISlides(documentData, templateConfig)
        console.log(`[Preview Slides] AI generated ${htmlPages.length} slides`)

        // Cache them for future requests (preview + PDF)
        await supabase
          .from('documents')
          .update({ data: { ...documentData, _cachedSlides: htmlPages } })
          .eq('id', documentId)
        console.log('[Preview Slides] Cached AI slides to document')
      } catch (aiError) {
        // 3. Fallback to premium template if AI fails
        console.error('[Preview Slides] AI slide generation failed, using premium template:', aiError)
        htmlPages = generatePremiumProposalSlides(documentData, templateConfig)
      }
    } else {
      htmlPages = renderProposalToHtml(documentData, {
        accentColor: '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        images,
      })
    }

    return NextResponse.json({
      slides: htmlPages,
      brandName: (documentData.brandName as string) || document.title || '',
      slideCount: htmlPages.length,
      fromCache: false,
    })
  } catch (error) {
    console.error('[Preview Slides] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate slides', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
