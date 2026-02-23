'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''

// Supported MIME types for the picker
const PICKER_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document', // Google Docs
  'image/png',
  'image/jpeg',
  'image/webp',
].join(',')

interface GoogleDrivePickerProps {
  onFilePicked: (file: File) => void
  disabled?: boolean
  label?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            include_granted_scopes?: boolean
            callback: (response: { access_token?: string; error?: string }) => void
          }) => { requestAccessToken: () => void }
        }
      }
      picker?: {
        PickerBuilder: new () => GooglePickerBuilder
        ViewId: { DOCS: string }
        Action: { PICKED: string; CANCEL: string }
        Feature: { MULTISELECT_ENABLED: string; NAV_HIDDEN: string }
      }
    }
    gapi?: {
      load: (api: string, callback: () => void) => void
    }
  }
}

interface GooglePickerBuilder {
  addView: (view: unknown) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setCallback: (callback: (data: GooglePickerCallbackData) => void) => GooglePickerBuilder
  setTitle: (title: string) => GooglePickerBuilder
  setLocale: (locale: string) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface GooglePickerCallbackData {
  action: string
  docs?: Array<{
    id: string
    name: string
    mimeType: string
    url: string
  }>
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.onload = () => resolve()
    script.onerror = reject
    document.body.appendChild(script)
  })
}

export default function GoogleDrivePicker({ onFilePicked, disabled, label }: GoogleDrivePickerProps) {
  const [loading, setLoading] = useState(false)
  const [scriptsLoaded, setScriptsLoaded] = useState(false)

  // Check if picker is configured
  const isConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_API_KEY)

  useEffect(() => {
    if (!isConfigured) return

    // Load Google Identity Services + Picker API scripts
    Promise.all([
      loadScript('https://accounts.google.com/gsi/client', 'google-gsi'),
      loadScript('https://apis.google.com/js/api.js', 'google-api'),
    ])
      .then(() => {
        // Load the picker module
        if (window.gapi) {
          window.gapi.load('picker', () => {
            setScriptsLoaded(true)
          })
        }
      })
      .catch((err) => {
        console.error('[Google Drive Picker] Failed to load scripts:', err)
      })
  }, [isConfigured])

  const openPicker = useCallback(() => {
    if (!window.google?.accounts?.oauth2 || !window.google?.picker) {
      console.error('[Google Drive Picker] APIs not loaded')
      return
    }

    setLoading(true)

    // Request OAuth token
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      include_granted_scopes: false,
      callback: async (response) => {
        if (response.error || !response.access_token) {
          console.error('[Google Drive Picker] Auth error:', response.error)
          setLoading(false)
          return
        }

        const accessToken = response.access_token

        // Build and show the picker
        try {
          const view = new (window.google!.picker!.PickerBuilder as unknown as {
            new (): GooglePickerBuilder
          })()

          // Create a DocsView with the supported MIME types
          const google = window.google!
          const docsView = new (google as unknown as { picker: { DocsView: new (viewId: string) => { setMimeTypes: (types: string) => unknown } } }).picker.DocsView(
            google.picker!.ViewId.DOCS
          )
          docsView.setMimeTypes(PICKER_MIME_TYPES)

          const picker = new google.picker!.PickerBuilder()
            .addView(docsView)
            .setOAuthToken(accessToken)
            .setDeveloperKey(GOOGLE_API_KEY)
            .setCallback(async (data: GooglePickerCallbackData) => {
              if (data.action === google.picker!.Action.PICKED && data.docs?.[0]) {
                const doc = data.docs[0]
                console.log(`[Google Drive Picker] Selected: ${doc.name} (${doc.mimeType})`)

                try {
                  // Download the file using Drive API
                  const file = await downloadDriveFile(doc.id, doc.name, doc.mimeType, accessToken)
                  onFilePicked(file)
                } catch (err) {
                  console.error('[Google Drive Picker] Download error:', err)
                }
              }
              setLoading(false)
            })
            .setTitle('בחר מסמך מ-Google Drive')
            .setLocale('he')
            .build()

          picker.setVisible(true)
        } catch (err) {
          console.error('[Google Drive Picker] Picker error:', err)
          setLoading(false)
        }
      },
    })

    tokenClient.requestAccessToken()
  }, [onFilePicked])

  if (!isConfigured) return null

  return (
    <Button
      variant="outline"
      onClick={openPicker}
      disabled={disabled || loading || !scriptsLoaded}
      className="gap-2"
    >
      <svg width="18" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00AC47"/>
        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 9.85z" fill="#EA4335"/>
        <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.85 0H34.45c-1.65 0-3.2.45-4.55 1.2z" fill="#00832D"/>
        <path d="m59.8 53h-32.3L13.75 76.8c1.35.8 2.9 1.2 4.55 1.2h22.55c1.65 0 3.2-.45 4.55-1.2z" fill="#2684FC"/>
        <path d="M73.4 26.5 60.65 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.6 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
      </svg>
      {loading ? 'פותח...' : (label || 'Google Drive')}
    </Button>
  )
}

/**
 * Download a file from Google Drive using the user's access token.
 * For Google Docs, exports as PDF first.
 */
async function downloadDriveFile(
  fileId: string,
  fileName: string,
  mimeType: string,
  accessToken: string
): Promise<File> {
  let downloadUrl: string
  let finalMimeType = mimeType
  let finalFileName = fileName

  if (mimeType === 'application/vnd.google-apps.document') {
    // Export Google Docs as PDF
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
    finalMimeType = 'application/pdf'
    finalFileName = fileName.replace(/\.[^.]*$/, '') + '.pdf'
    if (!finalFileName.endsWith('.pdf')) finalFileName += '.pdf'
  } else {
    // Direct download for other file types
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  }

  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
  }

  const blob = await response.blob()
  return new File([blob], finalFileName, { type: finalMimeType })
}
