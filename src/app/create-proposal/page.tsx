'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { UploadedDocument } from '@/types/brief'

type ProcessingStage = 'idle' | 'uploading' | 'parsing' | 'extracting' | 'creating' | 'done' | 'error'

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.png,.jpg,.jpeg,.webp'
const MAX_FILE_SIZE = 20 * 1024 * 1024

export default function CreateProposalPage() {
  const router = useRouter()
  const briefInputRef = useRef<HTMLInputElement>(null)
  const kickoffInputRef = useRef<HTMLInputElement>(null)

  const [briefDoc, setBriefDoc] = useState<UploadedDocument | null>(null)
  const [kickoffDoc, setKickoffDoc] = useState<UploadedDocument | null>(null)
  const [googleDocsUrl, setGoogleDocsUrl] = useState('')
  const [googleDocsType, setGoogleDocsType] = useState<'client_brief' | 'kickoff'>('client_brief')
  const [stage, setStage] = useState<ProcessingStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  const handleFileSelect = useCallback(
    async (file: File, docType: 'client_brief' | 'kickoff') => {
      if (file.size > MAX_FILE_SIZE) {
        setError('הקובץ גדול מדי. מקסימום 20MB.')
        return
      }

      const doc: UploadedDocument = {
        id: `${docType}-${Date.now()}`,
        type: docType,
        format: getFileFormat(file.type),
        status: 'pending',
        fileName: file.name,
      }

      if (docType === 'client_brief') {
        setBriefDoc(doc)
      } else {
        setKickoffDoc(doc)
      }
      setError(null)
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, docType: 'client_brief' | 'kickoff') => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFileSelect(file, docType)
    },
    [handleFileSelect]
  )

  const handleGoogleDocsAdd = useCallback(() => {
    if (!googleDocsUrl.includes('docs.google.com/document')) {
      setError('כתובת לא תקינה. צריך להיות קישור ל-Google Docs.')
      return
    }

    const doc: UploadedDocument = {
      id: `${googleDocsType}-${Date.now()}`,
      type: googleDocsType,
      format: 'google_docs',
      status: 'pending',
      fileName: 'Google Docs',
      googleDocsUrl,
    }

    if (googleDocsType === 'client_brief') {
      setBriefDoc(doc)
    } else {
      setKickoffDoc(doc)
    }
    setGoogleDocsUrl('')
    setError(null)
  }, [googleDocsUrl, googleDocsType])

  const parseFile = async (file: File, docType: string): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('docType', docType)

    const res = await fetch('/api/parse-document', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) throw new Error(data.error || 'Failed to parse document')
    return data.parsedText
  }

  const parseGoogleDoc = async (url: string, docType: string): Promise<string> => {
    const res = await fetch('/api/parse-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleDocsUrl: url, docType }),
    })
    const data = await res.json()

    if (!res.ok) throw new Error(data.error || 'Failed to parse Google Doc')
    return data.parsedText
  }

  const handleGenerate = async () => {
    if (!briefDoc) {
      setError('יש להעלות לפחות בריף לקוח')
      return
    }

    setStage('parsing')
    setError(null)

    try {
      // Parse documents
      setProgress('מפרסר מסמכים...')
      let briefText = ''
      let kickoffText = ''

      // Parse brief
      if (briefDoc.format === 'google_docs' && briefDoc.googleDocsUrl) {
        briefText = await parseGoogleDoc(briefDoc.googleDocsUrl, 'client_brief')
      } else {
        const briefInput = briefInputRef.current
        const briefFile = briefInput?.files?.[0]
        if (briefFile) {
          briefText = await parseFile(briefFile, 'client_brief')
        }
      }

      // Parse kickoff (if exists)
      if (kickoffDoc) {
        if (kickoffDoc.format === 'google_docs' && kickoffDoc.googleDocsUrl) {
          kickoffText = await parseGoogleDoc(kickoffDoc.googleDocsUrl, 'kickoff')
        } else {
          const kickoffInput = kickoffInputRef.current
          const kickoffFile = kickoffInput?.files?.[0]
          if (kickoffFile) {
            kickoffText = await parseFile(kickoffFile, 'kickoff')
          }
        }
      }

      if (!briefText) {
        throw new Error('לא הצלחנו לחלץ טקסט מהבריף. נסה פורמט אחר.')
      }

      // Extract structured data
      setStage('extracting')
      setProgress('מחלץ מידע מהמסמכים...')

      const extractRes = await fetch('/api/extract-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientBriefText: briefText, kickoffText }),
      })
      const extractData = await extractRes.json()

      if (!extractRes.ok) throw new Error(extractData.error || 'Failed to extract data')

      // Create document in DB
      setStage('creating')
      setProgress('יוצר מסמך...')

      const docRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote',
          title: extractData.data.brand?.name
            ? `הצעה - ${extractData.data.brand.name}`
            : 'הצעת מחיר חדשה',
          data: {
            brandName: extractData.data.brand?.name || '',
            _extractedData: extractData.data,
            _wizardState: {
              currentStep: 'brief',
              stepStatuses: {
                brief: 'pending',
                goals: 'pending',
                target_audience: 'pending',
                key_insight: 'pending',
                strategy: 'pending',
                creative: 'pending',
                deliverables: 'pending',
                quantities: 'pending',
                media_targets: 'pending',
                influencers: 'pending',
              },
              lastSavedAt: null,
            },
          },
          status: 'draft',
        }),
      })
      const docData = await docRes.json()

      if (!docRes.ok) throw new Error(docData.error || 'Failed to create document')

      setStage('done')
      setProgress('מעביר לעורך...')

      // Redirect to wizard
      const docId = docData.id || docData.document?.id
      router.push(`/wizard/${docId}`)
    } catch (err) {
      console.error('[Create Proposal] Error:', err)
      setStage('error')
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה')
    }
  }

  const isProcessing = stage !== 'idle' && stage !== 'error'

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">יצירת הצעת מחיר</h1>
            <p className="text-muted-foreground mt-1">
              העלה את בריף הלקוח ומסמך ההתנעה - המערכת תחלץ את כל המידע הנדרש
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            ביטול
          </Button>
        </div>

        {/* Upload Areas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Client Brief */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h3 className="font-semibold">בריף לקוח</h3>
                <p className="text-sm text-muted-foreground">חובה</p>
              </div>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                briefDoc ? 'border-green-300 bg-green-50' : 'border-border hover:border-primary/50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'client_brief')}
            >
              {briefDoc ? (
                <div>
                  <div className="text-green-600 text-2xl mb-2">&#10003;</div>
                  <p className="font-medium">{briefDoc.fileName}</p>
                  <button
                    className="text-sm text-muted-foreground underline mt-2"
                    onClick={() => {
                      setBriefDoc(null)
                      if (briefInputRef.current) briefInputRef.current.value = ''
                    }}
                  >
                    החלף קובץ
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-muted-foreground mb-4">גרור קובץ לכאן או לחץ לבחירה</p>
                  <Button
                    variant="outline"
                    onClick={() => briefInputRef.current?.click()}
                  >
                    בחר קובץ
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">
                    PDF, Word, תמונה (עד 20MB)
                  </p>
                </div>
              )}
            </div>

            <input
              ref={briefInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file, 'client_brief')
              }}
            />
          </Card>

          {/* Kickoff Document */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-secondary/10 text-secondary-foreground flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h3 className="font-semibold">מסמך התנעה</h3>
                <p className="text-sm text-muted-foreground">אופציונלי</p>
              </div>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                kickoffDoc ? 'border-green-300 bg-green-50' : 'border-border hover:border-primary/50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'kickoff')}
            >
              {kickoffDoc ? (
                <div>
                  <div className="text-green-600 text-2xl mb-2">&#10003;</div>
                  <p className="font-medium">{kickoffDoc.fileName}</p>
                  <button
                    className="text-sm text-muted-foreground underline mt-2"
                    onClick={() => {
                      setKickoffDoc(null)
                      if (kickoffInputRef.current) kickoffInputRef.current.value = ''
                    }}
                  >
                    החלף קובץ
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-muted-foreground mb-4">גרור קובץ לכאן או לחץ לבחירה</p>
                  <Button
                    variant="outline"
                    onClick={() => kickoffInputRef.current?.click()}
                  >
                    בחר קובץ
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">
                    PDF, Word, תמונה (עד 20MB)
                  </p>
                </div>
              )}
            </div>

            <input
              ref={kickoffInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file, 'kickoff')
              }}
            />
          </Card>
        </div>

        {/* Google Docs Option */}
        <Card className="p-6 mb-8">
          <h3 className="font-semibold mb-3">או הדבק קישור ל-Google Docs</h3>
          <div className="flex gap-3">
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              value={googleDocsType}
              onChange={(e) => setGoogleDocsType(e.target.value as 'client_brief' | 'kickoff')}
            >
              <option value="client_brief">בריף לקוח</option>
              <option value="kickoff">מסמך התנעה</option>
            </select>
            <Input
              dir="ltr"
              placeholder="https://docs.google.com/document/d/..."
              value={googleDocsUrl}
              onChange={(e) => setGoogleDocsUrl(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleGoogleDocsAdd} disabled={!googleDocsUrl}>
              הוסף
            </Button>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-4">
              <Spinner />
              <div>
                <p className="font-medium">{progress}</p>
                <p className="text-sm text-muted-foreground">
                  {stage === 'parsing' && 'קורא ומפרסר את המסמכים...'}
                  {stage === 'extracting' && 'AI מנתח את המידע ומחלץ נתונים מובנים...'}
                  {stage === 'creating' && 'יוצר מסמך חדש...'}
                  {stage === 'done' && 'מעביר לעורך ההצעה...'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Generate Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={!briefDoc || isProcessing}
            className="px-12 py-6 text-lg"
          >
            {isProcessing ? 'מעבד...' : 'צור הצעת מחיר'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function getFileFormat(mimeType: string): UploadedDocument['format'] {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('wordprocessingml')) return 'docx'
  if (mimeType.startsWith('image/')) return 'image'
  return 'pdf'
}
