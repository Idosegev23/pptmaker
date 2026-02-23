'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

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
      picker?: {
        PickerBuilder: new () => GooglePickerBuilder
        ViewId: { DOCS: string }
        Action: { PICKED: string; CANCEL: string }
        DocsView: new (viewId: string) => { setMimeTypes: (types: string) => unknown; setIncludeFolders: (v: boolean) => unknown; setEnableDrives: (v: boolean) => unknown }
      }
    }
    gapi?: {
      load: (api: string, callback: () => void) => void
    }
  }
}

interface GooglePickerBuilder {
  addView: (view: unknown) => GooglePickerBuilder
  enableFeature: (feature: unknown) => GooglePickerBuilder
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

// Shared state across all picker instances
let pickerReady = false
const pickerReadyCallbacks: (() => void)[] = []

function ensurePickerLoaded(callback: () => void) {
  if (pickerReady) {
    callback()
    return
  }
  pickerReadyCallbacks.push(callback)
  // Only load once
  if (pickerReadyCallbacks.length === 1) {
    loadScript('https://apis.google.com/js/api.js', 'google-api')
      .then(() => {
        if (window.gapi) {
          window.gapi.load('picker', () => {
            pickerReady = true
            pickerReadyCallbacks.forEach(cb => cb())
            pickerReadyCallbacks.length = 0
          })
        }
      })
      .catch((err) => {
        console.error('[Google Drive Picker] Failed to load scripts:', err)
      })
  }
}

export default function GoogleDrivePicker({ onFilePicked, disabled, label }: GoogleDrivePickerProps) {
  const [loading, setLoading] = useState(false)
  const [scriptsLoaded, setScriptsLoaded] = useState(pickerReady)

  // Check if picker is configured
  const isConfigured = Boolean(GOOGLE_API_KEY)

  useEffect(() => {
    if (!isConfigured) return
    ensurePickerLoaded(() => setScriptsLoaded(true))
  }, [isConfigured])

  const openPicker = useCallback(async () => {
    if (!window.google?.picker) {
      console.error('[Google Drive Picker] Picker API not loaded')
      return
    }

    setLoading(true)

    try {
      // Get the Google access token from Supabase session
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.provider_token

      if (!accessToken) {
        console.error('[Google Drive Picker] No provider token - user needs to re-login')
        alert('נדרשת התחברות מחדש עם Google כדי לגשת ל-Drive. אנא התנתק והתחבר שוב.')
        setLoading(false)
        return
      }

      // Build and show the picker
      const google = window.google!

      // My Drive view
      const myDriveView = new google.picker!.DocsView(google.picker!.ViewId.DOCS)
      myDriveView.setMimeTypes(PICKER_MIME_TYPES)
      myDriveView.setIncludeFolders(true)

      // Shared Drives view
      const sharedDriveView = new google.picker!.DocsView(google.picker!.ViewId.DOCS)
      sharedDriveView.setMimeTypes(PICKER_MIME_TYPES)
      sharedDriveView.setEnableDrives(true)
      sharedDriveView.setIncludeFolders(true)

      const picker = new google.picker!.PickerBuilder()
        .addView(myDriveView)
        .addView(sharedDriveView)
        .setOAuthToken(accessToken)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback(async (data: GooglePickerCallbackData) => {
          if (data.action === google.picker!.Action.PICKED && data.docs?.[0]) {
            const doc = data.docs[0]
            console.log(`[Google Drive Picker] Selected: ${doc.name} (${doc.mimeType})`)

            try {
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
      console.error('[Google Drive Picker] Error:', err)
      setLoading(false)
    }
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
