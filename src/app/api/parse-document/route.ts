import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseDocument, parseGoogleDoc } from '@/lib/parsers'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    // Handle Google Docs link (JSON body)
    if (contentType.includes('application/json')) {
      const body = await request.json()
      const { googleDocsUrl, docType } = body

      if (!googleDocsUrl) {
        return NextResponse.json({ error: 'Missing googleDocsUrl' }, { status: 400 })
      }

      console.log(`[Parse Document] Google Docs: ${googleDocsUrl}`)
      const parsed = await parseGoogleDoc(googleDocsUrl)

      return NextResponse.json({
        success: true,
        parsedText: parsed.text,
        metadata: parsed.metadata,
        docType,
      })
    }

    // Handle file upload (FormData)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const docType = formData.get('docType') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size (20MB)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 20MB.' },
        { status: 400 }
      )
    }

    console.log(`[Parse Document] File: ${file.name} (${file.type}, ${Math.round(file.size / 1024)}KB)`)

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to Supabase Storage
    const supabase = await createClient()
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `documents/briefs/${docType || 'doc'}_${timestamp}_${sanitizedName}`

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('[Parse Document] Upload error:', uploadError)
      // Continue with parsing even if upload fails - the text is what matters
    }

    // Get public URL
    let storageUrl: string | undefined
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(storagePath)
      storageUrl = urlData.publicUrl
    }

    // Parse the document
    const parsed = await parseDocument(buffer, file.type, file.name)

    console.log(`[Parse Document] Parsed: ${parsed.text.length} chars, format: ${parsed.metadata.format}`)

    return NextResponse.json({
      success: true,
      storageUrl,
      parsedText: parsed.text,
      metadata: parsed.metadata,
      fileName: file.name,
      docType,
    })
  } catch (error) {
    console.error('[Parse Document] Error:', error)
    const message = error instanceof Error ? error.message : 'Failed to parse document'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
