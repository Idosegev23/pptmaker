import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePdf } from '@/lib/playwright/pdf'
import { generateResearchHtml } from '@/lib/research-pdf/template'
import { uploadToGoogleDrive } from '@/lib/google-drive/client'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 120

/**
 * POST /api/research-pdf
 * Generates a branded research PDF and uploads it to Google Drive.
 */
export async function POST(request: NextRequest) {
  const requestId = `research-pdf-${Date.now()}`

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

    const body = await request.json()
    const { brandName, brandResearch, influencerStrategy, brandColors } = body

    if (!brandName) {
      return NextResponse.json({ error: 'brandName is required' }, { status: 400 })
    }

    console.log(`[${requestId}] Generating research PDF for: ${brandName}`)

    // 1. Generate HTML
    const html = generateResearchHtml({ brandName, brandResearch, influencerStrategy, brandColors })

    // 2. Convert to PDF
    const pdfBuffer = await generatePdf(html, { format: 'A4' })
    console.log(`[${requestId}] PDF generated: ${pdfBuffer.length} bytes`)

    // 3. Try to upload to Google Drive
    try {
      const fileName = `מחקר_${brandName}_${new Date().toISOString().split('T')[0]}.pdf`
      const driveResult = await uploadToGoogleDrive({
        fileName,
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      })

      console.log(`[${requestId}] Uploaded to Drive: ${driveResult.webViewLink}`)

      return NextResponse.json({
        success: true,
        viewUrl: driveResult.webViewLink,
        downloadUrl: driveResult.webContentLink,
        fileId: driveResult.fileId,
      })
    } catch (driveError) {
      console.error(`[${requestId}] Drive upload failed, returning PDF as download:`, driveError)

      // Fallback: return PDF as direct download
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="research_${encodeURIComponent(brandName)}.pdf"`,
        },
      })
    }
  } catch (error) {
    console.error(`[${requestId}] Error:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Research PDF generation failed' },
      { status: 500 }
    )
  }
}
