import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { regenerateSingleSlide } from '@/lib/gemini/slide-designer'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const requestId = `regen-slide-${Date.now()}`

  try {
    const supabase = await createClient()

    // Auth check
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const { documentId, slideIndex, instruction } = body

    if (!documentId || slideIndex === undefined) {
      return NextResponse.json({ error: 'documentId and slideIndex are required' }, { status: 400 })
    }

    console.log(`[${requestId}] Regenerating slide ${slideIndex} for document ${documentId}`)

    // Fetch document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const documentData = document.data as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const presentation = documentData._presentation as any | undefined

    if (!presentation?.designSystem) {
      return NextResponse.json({ error: 'No presentation found in document' }, { status: 400 })
    }

    // Get slide type config for the requested slide
    const currentSlide = presentation.slides[slideIndex] as { slideType?: string; label?: string; archetype?: string } | undefined
    const slideType = currentSlide?.slideType || 'brief'
    const slideLabel = currentSlide?.label || ''

    // Build content context from document data
    const brandName = (documentData.brandName as string) || ''

    // Adjacent slides context for variety
    const prevSlide = slideIndex > 0 ? presentation.slides[slideIndex - 1] as { label?: string; archetype?: string } : null
    const nextSlide = slideIndex < presentation.slides.length - 1 ? presentation.slides[slideIndex + 1] as { label?: string; archetype?: string } : null

    const adjacentContext = [
      prevSlide ? `השקף הקודם: ${prevSlide.label || ''}${prevSlide.archetype ? ` (${prevSlide.archetype})` : ''}` : null,
      nextSlide ? `השקף הבא: ${nextSlide.label || ''}${nextSlide.archetype ? ` (${nextSlide.archetype})` : ''}` : null,
    ].filter(Boolean).join('. ')

    const enrichedInstruction = [
      instruction,
      adjacentContext ? `הקשר שקפים סמוכים: ${adjacentContext}. בחר archetype שונה מהשכנים.` : null,
    ].filter(Boolean).join('\n')

    const slideContent = {
      slideType,
      title: slideLabel,
      content: documentData,
    }

    console.log(`[${requestId}] Regenerating: type=${slideType}, label=${slideLabel}, adjacent=${adjacentContext}`)

    const newSlide = await regenerateSingleSlide(
      presentation.designSystem,
      slideContent,
      brandName,
      undefined,
      undefined,
      enrichedInstruction || undefined,
    )

    console.log(`[${requestId}] Regenerated slide with ${newSlide.elements.length} elements`)

    return NextResponse.json({ success: true, slide: newSlide })
  } catch (error) {
    console.error(`[${requestId}] Error:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Slide regeneration failed' },
      { status: 500 }
    )
  }
}
