import { NextRequest, NextResponse } from 'next/server'
import { researchBrand } from '@/lib/gemini/brand-research'
import { extractColorsFromLogo, analyzeColorPalette } from '@/lib/gemini/color-extractor'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brandName, websiteData } = body
    
    if (!brandName) {
      return NextResponse.json(
        { error: 'Brand name is required' },
        { status: 400 }
      )
    }
    
    console.log(`[API Research] Starting deep research for: ${brandName}`)
    
    // Convert enhanced websiteData to research format
    const researchWebsiteData = websiteData ? {
      url: websiteData.url,
      title: websiteData.title,
      description: websiteData.description,
      headings: [
        ...(websiteData.headings?.h1 || []),
        ...(websiteData.headings?.h2 || []),
      ],
      paragraphs: websiteData.paragraphs || [],
      socialLinks: Object.values(websiteData.socialLinks || {}).filter(Boolean) as string[],
    } : undefined
    
    // Research brand using Gemini with Google Search grounding
    const research = await researchBrand(brandName, researchWebsiteData)
    console.log(`[API Research] Research complete, confidence: ${research.confidence}`)
    
    // Extract colors - try multiple sources
    let colors = null
    
    // Try primary logo first
    const logoUrl = websiteData?.logos?.primary || websiteData?.logoUrl
    if (logoUrl) {
      console.log('[API Research] Extracting colors from logo:', logoUrl)
      try {
        colors = await extractColorsFromLogo(logoUrl)
        console.log('[API Research] Logo colors extracted successfully')
      } catch (error) {
        console.error('[API Research] Logo color extraction failed:', error)
      }
    }
    
    // Fallback to dominant CSS colors
    const cssColors = websiteData?.dominantColors || websiteData?.cssColors
    if (!colors && cssColors?.length > 0) {
      console.log('[API Research] Analyzing CSS colors...')
      colors = await analyzeColorPalette(cssColors)
    }
    
    // Use research visual identity if available
    if (!colors && research.visualIdentity?.primaryColors?.length > 0) {
      colors = {
        primary: research.visualIdentity.primaryColors[0],
        secondary: research.visualIdentity.primaryColors[1] || '#666666',
        accent: research.visualIdentity.primaryColors[0],
        background: '#FFFFFF',
        text: '#111111',
        palette: research.visualIdentity.primaryColors,
        style: 'minimal' as const,
        mood: research.visualIdentity.style || 'מקצועי',
      }
    }
    
    // Default colors
    if (!colors) {
      colors = {
        primary: '#111111',
        secondary: '#666666',
        accent: '#E94560',
        background: '#FFFFFF',
        text: '#111111',
        palette: ['#111111', '#666666', '#E94560'],
        style: 'minimal' as const,
        mood: 'מקצועי ומודרני'
      }
    }
    
    console.log(`[API Research] Final colors: primary=${colors.primary}, accent=${colors.accent}`)
    
    return NextResponse.json({
      success: true,
      research,
      colors,
      logos: websiteData?.logos || null,
    })
  } catch (error) {
    console.error('[API Research] Error:', error)
    return NextResponse.json(
      { error: 'Failed to research brand', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

