import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import { renderProposalToHtml } from '@/templates/quote/proposal-template'
import { generatePremiumProposalSlides } from '@/templates/quote/premium-proposal-template'
import { generateProposalImages } from '@/lib/gemini/proposal-images'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const body = await request.json()
    const { documentId, action, generateImages = true } = body

    // Get document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      console.error('Document not found:', docError)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // In dev mode, skip ownership check (user_id might be null)
    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get document data
    const documentData = document.data as Record<string, unknown>
    
    // Check if this is an auto-proposal with rich data
    const isAutoProposal = !!documentData._brandResearch || !!documentData._brandColors || !!documentData.influencerResearch
    
    // Get pre-generated images or generate new ones
    let images: Record<string, string> = (documentData._generatedImages as Record<string, string>) || {}
    
    if (!isAutoProposal && generateImages && process.env.GEMINI_API_KEY && Object.keys(images).length === 0) {
      console.log('[PDF] Generating images with Gemini...')
      try {
        const generatedImages = await generateProposalImages(documentData, documentId)
        // Convert GeneratedImages to Record<string, string>
        images = Object.entries(generatedImages).reduce((acc, [key, value]) => {
          if (typeof value === 'string') acc[key] = value
          return acc
        }, {} as Record<string, string>)
        console.log('[PDF] Generated images:', Object.keys(images))
      } catch (error) {
        console.error('[PDF] Image generation failed, continuing without images:', error)
      }
    }
    
    // Get brand colors and scraped assets
    const brandColors = documentData._brandColors as { primary?: string; secondary?: string; accent?: string } | undefined
    const scrapedAssets = documentData._scraped as { 
      logoUrl?: string
      screenshot?: string
      heroImages?: string[]
      productImages?: string[]
      lifestyleImages?: string[]
    } | undefined
    
    // Fallback images from Unsplash when no scraped/generated images
    const fallbackImages = {
      cover: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1920&h=1080&fit=crop',
      brand: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop',
      audience: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1920&h=1080&fit=crop',
      lifestyle: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1920&h=1080&fit=crop',
    }
    
    // Build final images with fallbacks
    const finalImages = {
      coverImage: images.coverImage || scrapedAssets?.heroImages?.[0] || fallbackImages.cover,
      brandImage: images.brandImage || scrapedAssets?.heroImages?.[1] || fallbackImages.brand,
      audienceImage: images.audienceImage || scrapedAssets?.lifestyleImages?.[0] || fallbackImages.audience,
    }
    
    console.log('[PDF] Images:', {
      cover: finalImages.coverImage ? 'Yes' : 'No',
      brand: finalImages.brandImage ? 'Yes' : 'No',
      audience: finalImages.audienceImage ? 'Yes' : 'No',
      usingFallbacks: !images.coverImage && !scrapedAssets?.heroImages?.[0],
    })
    
    // Render proposal slides - use premium template for auto-proposals
    let htmlPages: string[]
    
    if (isAutoProposal) {
      console.log('[PDF] Using premium template for auto-proposal')
      htmlPages = generatePremiumProposalSlides(documentData, {
        accentColor: brandColors?.primary || '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        clientLogoUrl: scrapedAssets?.logoUrl,
        images: finalImages,
      })
    } else {
      console.log('[PDF] Using standard template')
      htmlPages = renderProposalToHtml(documentData, {
        accentColor: '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        images,
      })
    }
    
    console.log(`[PDF] Rendering ${htmlPages.length} slides...`)
    
    // Generate multi-page PDF in 16:9 format
    const pdfBuffer = await generateMultiPagePdf(htmlPages, { format: '16:9' })
    
    console.log(`[PDF] Generated PDF, size: ${pdfBuffer.length} bytes`)

    // Upload to Supabase Storage
    const fileName = `proposal_${document.id}_${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      // Continue anyway - we can still return the PDF for download
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName)

    // Update document with PDF URL and generated images
    await supabase
      .from('documents')
      .update({
        pdf_url: urlData.publicUrl,
        status: 'generated',
        data: {
          ...documentData,
          _generatedImages: images,
        }
      })
      .eq('id', documentId)

    if (action === 'download') {
      // Return PDF directly for download
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      pdfUrl: urlData.publicUrl,
      generatedImages: Object.keys(images).length,
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
