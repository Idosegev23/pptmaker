import type { ParsedDocument } from '@/types/brief'

/**
 * Parse Google Docs by exporting as plain text via Drive API
 */
export async function parseGoogleDoc(docUrl: string): Promise<ParsedDocument> {
  console.log(`[Google Docs Parser] Processing: ${docUrl}`)

  // Extract document ID from URL
  const docIdMatch = docUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (!docIdMatch) {
    throw new Error('Invalid Google Docs URL. Expected format: https://docs.google.com/document/d/...')
  }

  const docId = docIdMatch[1]
  console.log(`[Google Docs Parser] Document ID: ${docId}`)

  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!credentialsJson) {
    throw new Error(
      'Google Service Account not configured. Please export the document as PDF or Word and upload it instead.'
    )
  }

  try {
    const { google } = await import('googleapis')

    const credentials = JSON.parse(credentialsJson)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
      ],
    })

    const drive = google.drive({ version: 'v3', auth })

    // Export as plain text
    const response = await drive.files.export({
      fileId: docId,
      mimeType: 'text/plain',
    })

    const text = (response.data as string)?.trim() || ''
    console.log(`[Google Docs Parser] Exported: ${text.length} chars`)

    if (!text || text.length < 10) {
      throw new Error('Document appears to be empty')
    }

    return {
      text,
      metadata: {
        format: 'google-docs',
        language: detectHebrew(text) ? 'he' : 'en',
        hasImages: false,
        hasTables: text.includes('\t'),
      },
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    if (message.includes('403') || message.includes('not found') || message.includes('404')) {
      throw new Error(
        'אין גישה למסמך. וודא שהמסמך משותף עם חשבון השירות, או ייצא אותו כ-PDF והעלה ידנית.'
      )
    }

    throw new Error(`Failed to read Google Doc: ${message}`)
  }
}

function detectHebrew(text: string): boolean {
  return (text.match(/[\u0590-\u05FF]/g) || []).length > 10
}
