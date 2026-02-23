'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import GoogleDrivePicker from '@/components/google-drive-picker'
import type { UploadedDocument, ExtractedBriefData } from '@/types/brief'

type ProcessingStage = 'idle' | 'parsing' | 'extracting' | 'creating' | 'done' | 'error'

interface LogEntry {
  id: string
  timestamp: Date
  type: 'info' | 'success' | 'warning' | 'error' | 'detail'
  message: string
}

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.png,.jpg,.jpeg,.webp'
const MAX_FILE_SIZE = 20 * 1024 * 1024

export default function CreateProposalPage() {
  const router = useRouter()
  const briefInputRef = useRef<HTMLInputElement>(null)
  const kickoffInputRef = useRef<HTMLInputElement>(null)

  const [briefDoc, setBriefDoc] = useState<UploadedDocument | null>(null)
  const [briefFile, setBriefFile] = useState<File | null>(null)
  const [kickoffDoc, setKickoffDoc] = useState<UploadedDocument | null>(null)
  const [kickoffFile, setKickoffFile] = useState<File | null>(null)
  const [stage, setStage] = useState<ProcessingStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [brandInfo, setBrandInfo] = useState<ExtractedBriefData | null>(null)
  const [brandFacts, setBrandFacts] = useState<string[]>([])
  const [currentFact, setCurrentFact] = useState(0)

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type,
      message,
    }])
  }, [])

  const handleFileSelect = useCallback(
    (file: File, docType: 'client_brief' | 'kickoff') => {
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
        setBriefFile(file)
      } else {
        setKickoffDoc(doc)
        setKickoffFile(file)
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

  const parseFileUpload = async (file: File, docType: string): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('docType', docType)

    const res = await fetch('/api/parse-document', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) throw new Error(data.error || 'Failed to parse document')
    return data.parsedText
  }

  // Fetch brand facts in background
  const fetchBrandFacts = async (brandName: string) => {
    try {
      const res = await fetch('/api/brand-quick-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.facts?.length) {
          setBrandFacts(data.facts)
        }
      }
    } catch {
      // Silent fail - this is a nice-to-have
    }
  }

  const handleGenerate = async () => {
    if (!briefDoc) {
      setError('יש להעלות לפחות בריף לקוח')
      return
    }

    // Reset state
    setStage('parsing')
    setError(null)
    setLogs([])
    setBrandInfo(null)
    setBrandFacts([])
    setCurrentFact(0)

    try {
      // === STEP 1: Parse Documents ===
      addLog('info', 'מתחיל עיבוד מסמכים...')
      let briefText = ''
      let kickoffText = ''

      // Parse brief (required)
      if (briefFile) {
        const formatName = getFormatDisplayName(briefFile.type)
        addLog('info', `קורא בריף לקוח: ${briefDoc.fileName} (${formatName}, ${formatFileSize(briefFile.size)})`)

        const startTime = Date.now()
        briefText = await parseFileUpload(briefFile, 'client_brief')
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

        addLog('success', `בריף נקרא בהצלחה - ${briefText.length.toLocaleString()} תווים (${elapsed}s)`)
      }

      if (!briefText) {
        throw new Error('לא הצלחנו לחלץ טקסט מהבריף. נסה לגרור את הקובץ מחדש או לבחור פורמט אחר.')
      }

      // Parse kickoff (optional)
      if (kickoffDoc && kickoffFile) {
        const formatName = getFormatDisplayName(kickoffFile.type)
        addLog('info', `קורא מסמך התנעה: ${kickoffDoc.fileName} (${formatName}, ${formatFileSize(kickoffFile.size)})`)

        try {
          const startTime = Date.now()
          kickoffText = await parseFileUpload(kickoffFile, 'kickoff')
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          addLog('success', `מסמך התנעה נקרא - ${kickoffText.length.toLocaleString()} תווים (${elapsed}s)`)
        } catch (kickoffErr) {
          addLog('warning', `מסמך ההתנעה לא נקרא: ${kickoffErr instanceof Error ? kickoffErr.message : 'שגיאה'}. ממשיכים עם הבריף בלבד.`)
        }
      } else {
        addLog('detail', 'לא הועלה מסמך התנעה - ממשיכים עם הבריף בלבד')
      }

      // === STEP 2: AI Extraction ===
      setStage('extracting')
      addLog('info', 'שולח ל-AI לחילוץ מידע מובנה (Gemini Pro)...')
      addLog('detail', `סך הכל ${(briefText.length + kickoffText.length).toLocaleString()} תווים לניתוח`)

      const extractStart = Date.now()
      const extractRes = await fetch('/api/extract-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientBriefText: briefText, kickoffText: kickoffText || undefined }),
      })
      const extractData = await extractRes.json()
      const extractElapsed = ((Date.now() - extractStart) / 1000).toFixed(1)

      if (!extractRes.ok) throw new Error(extractData.error || 'שגיאה בחילוץ מידע מהמסמכים')

      const extracted: ExtractedBriefData = extractData.data
      setBrandInfo(extracted)

      // Log extraction results
      addLog('success', `חילוץ AI הושלם (${extractElapsed}s) - רמת ביטחון: ${extracted._meta?.confidence || 'N/A'}`)

      if (extracted.brand?.name) {
        addLog('success', `מותג זוהה: ${extracted.brand.name}${extracted.brand.industry ? ` (${extracted.brand.industry})` : ''}`)
        // Start background brand research
        fetchBrandFacts(extracted.brand.name)
      } else {
        addLog('warning', 'שם המותג לא זוהה - נדרש קלט ידני')
      }

      if (extracted.budget?.amount && extracted.budget.amount > 0) {
        addLog('detail', `תקציב: ${extracted.budget.currency}${extracted.budget.amount.toLocaleString()}`)
      }

      if (extracted.campaignGoals?.length) {
        addLog('detail', `מטרות: ${extracted.campaignGoals.join(', ')}`)
      }

      if (extracted.targetAudience?.primary?.gender) {
        const ta = extracted.targetAudience.primary
        addLog('detail', `קהל יעד: ${ta.gender}${ta.ageRange ? `, גילאי ${ta.ageRange}` : ''}`)
      }

      if (extracted._meta?.warnings?.length) {
        extracted._meta.warnings.forEach(w => addLog('warning', w))
      }

      // === STEP 3: Create Document ===
      setStage('creating')
      addLog('info', 'יוצר מסמך חדש במערכת...')

      const docRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote',
          title: extracted.brand?.name
            ? `הצעה - ${extracted.brand.name}`
            : 'הצעת מחיר חדשה',
          data: {
            brandName: extracted.brand?.name || '',
            _extractedData: extracted,
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

      const docId = docData.id || docData.document?.id
      addLog('success', `מסמך נוצר בהצלחה (ID: ${docId?.slice(0, 8)}...)`)

      setStage('done')
      addLog('info', 'מעביר לעורך ההצעה...')

      // Small delay so user can see the success
      setTimeout(() => {
        router.push(`/wizard/${docId}`)
      }, 1500)
    } catch (err) {
      console.error('[Create Proposal] Error:', err)
      setStage('error')
      const msg = err instanceof Error ? err.message : 'שגיאה לא צפויה'
      setError(msg)
      addLog('error', msg)
    }
  }

  // Rotate brand facts
  const factToShow = brandFacts.length > 0 ? brandFacts[currentFact % brandFacts.length] : null
  if (brandFacts.length > 1) {
    setTimeout(() => setCurrentFact(prev => prev + 1), 4000)
  }

  const isProcessing = stage !== 'idle' && stage !== 'error'

  return (
    <div dir="rtl" className="min-h-screen bg-background">
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

        {/* Upload Areas - hidden during processing */}
        {!isProcessing && (
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
                        setBriefFile(null)
                        if (briefInputRef.current) briefInputRef.current.value = ''
                      }}
                    >
                      החלף קובץ
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-muted-foreground mb-4">גרור קובץ לכאן או לחץ לבחירה</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        variant="outline"
                        onClick={() => briefInputRef.current?.click()}
                      >
                        בחר קובץ
                      </Button>
                      <GoogleDrivePicker
                        onFilePicked={(file) => handleFileSelect(file, 'client_brief')}
                        disabled={isProcessing}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      PDF, Word, Google Docs, תמונה (עד 20MB)
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
                        setKickoffFile(null)
                        if (kickoffInputRef.current) kickoffInputRef.current.value = ''
                      }}
                    >
                      החלף קובץ
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-muted-foreground mb-4">גרור קובץ לכאן או לחץ לבחירה</p>
                    <div className="flex gap-2 justify-center">
                      <Button
                        variant="outline"
                        onClick={() => kickoffInputRef.current?.click()}
                      >
                        בחר קובץ
                      </Button>
                      <GoogleDrivePicker
                        onFilePicked={(file) => handleFileSelect(file, 'kickoff')}
                        disabled={isProcessing}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      PDF, Word, Google Docs, תמונה (עד 20MB)
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
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
            {error}
            {stage === 'error' && (
              <button
                className="block mt-2 text-sm underline"
                onClick={() => { setStage('idle'); setError(null); setLogs([]) }}
              >
                נסה שוב
              </button>
            )}
          </div>
        )}

        {/* Processing Panel */}
        {isProcessing && (
          <div className="space-y-4 mb-8">
            {/* Progress Steps */}
            <Card className="p-6">
              <div className="flex items-center gap-6 mb-6">
                <StepIndicator label="קריאת מסמכים" status={getStepStatus('parsing', stage)} />
                <div className="flex-1 h-px bg-border" />
                <StepIndicator label="חילוץ AI" status={getStepStatus('extracting', stage)} />
                <div className="flex-1 h-px bg-border" />
                <StepIndicator label="יצירת מסמך" status={getStepStatus('creating', stage)} />
              </div>

              {/* Brand card - shown once brand is identified */}
              {brandInfo?.brand?.name && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                      {brandInfo.brand.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-lg">{brandInfo.brand.name}</p>
                      {brandInfo.brand.industry && (
                        <p className="text-sm text-muted-foreground">{brandInfo.brand.industry}</p>
                      )}
                    </div>
                    {brandInfo.budget?.amount ? (
                      <div className="mr-auto text-left">
                        <p className="text-sm text-muted-foreground">תקציב</p>
                        <p className="font-bold">{brandInfo.budget.currency}{brandInfo.budget.amount.toLocaleString()}</p>
                      </div>
                    ) : null}
                  </div>
                  {factToShow && (
                    <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-primary/10 animate-pulse">
                      {factToShow}
                    </p>
                  )}
                </div>
              )}

              {/* Live log */}
              <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2 items-start">
                    <span className="text-muted-foreground text-xs mt-0.5 shrink-0">
                      {log.timestamp.toLocaleTimeString('he-IL')}
                    </span>
                    <span className={getLogColor(log.type)}>
                      {getLogIcon(log.type)}
                    </span>
                    <span className={log.type === 'detail' ? 'text-muted-foreground' : ''}>
                      {log.message}
                    </span>
                  </div>
                ))}
                {stage !== 'done' && (
                  <div className="flex gap-2 items-center text-muted-foreground">
                    <span className="text-xs mt-0.5 shrink-0">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                    <span className="animate-pulse">...</span>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Generate Button */}
        {!isProcessing && (
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={!briefDoc || isProcessing}
              className="px-12 py-6 text-lg"
            >
              צור הצעת מחיר
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// === Helper Components ===

function StepIndicator({ label, status }: { label: string; status: 'pending' | 'active' | 'done' }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        status === 'done' ? 'bg-green-500 text-white' :
        status === 'active' ? 'bg-primary text-white animate-pulse' :
        'bg-muted text-muted-foreground'
      }`}>
        {status === 'done' ? '✓' : status === 'active' ? '●' : '○'}
      </div>
      <span className={`text-sm ${status === 'active' ? 'font-medium' : status === 'done' ? 'text-green-600' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  )
}

// === Helper Functions ===

function getStepStatus(step: string, currentStage: ProcessingStage): 'pending' | 'active' | 'done' {
  const order = ['parsing', 'extracting', 'creating', 'done']
  const stepIdx = order.indexOf(step)
  const currentIdx = order.indexOf(currentStage)
  if (currentIdx > stepIdx) return 'done'
  if (currentIdx === stepIdx) return 'active'
  return 'pending'
}

function getLogColor(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return 'text-green-600'
    case 'warning': return 'text-yellow-600'
    case 'error': return 'text-red-600'
    case 'detail': return 'text-muted-foreground'
    default: return 'text-blue-600'
  }
}

function getLogIcon(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return '✓'
    case 'warning': return '!'
    case 'error': return '✗'
    case 'detail': return '·'
    default: return '►'
  }
}

function getFileFormat(mimeType: string): UploadedDocument['format'] {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('wordprocessingml')) return 'docx'
  if (mimeType.startsWith('image/')) return 'image'
  return 'pdf'
}

function getFormatDisplayName(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('wordprocessingml')) return 'Word'
  if (mimeType.startsWith('image/')) return 'תמונה'
  return 'קובץ'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
