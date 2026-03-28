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
    const brandName = (documentData.brandName as string) || ''

    // ── HTML-Native path (v6) ──
    const htmlPres = documentData._htmlPresentation as { htmlSlides?: string[]; slideTypes?: string[]; designSystem?: Record<string, unknown> } | undefined
    if (htmlPres?.htmlSlides?.length && slideIndex < htmlPres.htmlSlides.length) {
      console.log(`[${requestId}] HTML-Native regeneration for slide ${slideIndex}`)

      const ds = htmlPres.designSystem as Record<string, unknown> || {}
      const colors = (ds.colors || {}) as Record<string, string>
      const cd = (ds.creativeDirection || {}) as Record<string, string>
      const pipeline = documentData._pipeline as { foundation?: { plan?: { title?: string; slideType?: string; subtitle?: string; bodyText?: string; keyNumber?: string; keyNumberLabel?: string; bulletPoints?: string[]; cards?: { title: string; body: string }[]; existingImageKey?: string; emotionalTone?: string }[]; images?: Record<string, string> } } | undefined
      const plan = pipeline?.foundation?.plan?.[slideIndex]
      const slideType = htmlPres.slideTypes?.[slideIndex] || plan?.slideType || 'brief'

      const contentParts: string[] = []
      if (plan) {
        contentParts.push(`Title: ${plan.title || ''}`)
        if (plan.subtitle) contentParts.push(`Subtitle: ${plan.subtitle}`)
        if (plan.bodyText) contentParts.push(`Body: ${plan.bodyText}`)
        if (plan.bulletPoints?.length) contentParts.push(`Bullets:\n${plan.bulletPoints.map(b => `  • ${b}`).join('\n')}`)
        if (plan.cards?.length) contentParts.push(`Cards:\n${plan.cards.map(c => `  - ${c.title}: ${c.body}`).join('\n')}`)
        if (plan.keyNumber) contentParts.push(`KEY STAT: ${plan.keyNumber} (${plan.keyNumberLabel || ''})`)
      }
      const imageUrl = plan?.existingImageKey ? pipeline?.foundation?.images?.[plan.existingImageKey] : undefined

      const prompt = `Regenerate ONE presentation slide. Make it BREATHTAKING.
${instruction ? `\nUSER REQUEST: ${instruction}\n` : ''}
<design_system>
Brand: ${brandName} | Primary: ${colors.primary || '#EB0A1E'} | Accent: ${colors.accent || '#58595B'}
Background: ${colors.background || '#0C0C10'} | Text: ${colors.text || '#F5F5F7'}
Font: Heebo | RTL
${cd.visualMetaphor ? `Metaphor: ${cd.visualMetaphor}` : ''}
</design_system>

<slide type="${slideType}">
${contentParts.join('\n')}
${imageUrl ? `IMAGE: ${imageUrl}` : ''}
</slide>

Return a COMPLETE self-contained HTML document (1920x1080). Use glassmorphism, gradients, watermarks, 5-layer depth.
Return JSON: { "html": "<!DOCTYPE html>..." }`

      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

      const response = await openai.responses.create({
        model: 'gpt-5.4',
        instructions: 'Legendary designer. Return ONLY valid JSON with "html" field.',
        input: prompt,
        text: { format: { type: 'json_schema', name: 'single_slide', strict: true, schema: { type: 'object' as const, additionalProperties: false, required: ['html'], properties: { html: { type: 'string' as const } } } } },
      })

      const parsed = JSON.parse(response.output_text || '{}') as { html: string }
      if (!parsed.html) throw new Error('GPT returned empty html')
      console.log(`[${requestId}] ✅ HTML slide regenerated: ${parsed.html.length} chars`)

      // Save updated slide
      const updatedSlides = [...htmlPres.htmlSlides]
      updatedSlides[slideIndex] = parsed.html
      await supabase.from('documents').update({
        data: { ...documentData, _htmlPresentation: { ...htmlPres, htmlSlides: updatedSlides } },
      }).eq('id', documentId)

      return NextResponse.json({ success: true, html: parsed.html, mode: 'html' })
    }

    // ── AST path (legacy) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const presentation = documentData._presentation as any | undefined
    if (!presentation?.designSystem) {
      return NextResponse.json({ error: 'No presentation found' }, { status: 400 })
    }

    const currentSlide = presentation.slides[slideIndex] as { slideType?: string; label?: string } | undefined
    const slideContent = { slideType: currentSlide?.slideType || 'brief', title: currentSlide?.label || '', content: documentData }

    const newSlide = await regenerateSingleSlide(
      presentation.designSystem, slideContent, brandName, undefined, undefined, instruction || undefined,
    )
    console.log(`[${requestId}] ✅ AST slide regenerated: ${newSlide.elements.length} elements`)

    return NextResponse.json({ success: true, slide: newSlide, mode: 'ast' })
  } catch (error) {
    console.error(`[${requestId}] Error:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Slide regeneration failed' },
      { status: 500 }
    )
  }
}
