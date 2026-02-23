'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import GoogleDrivePicker from '@/components/google-drive-picker'
import type { UploadedDocument, ExtractedBriefData } from '@/types/brief'

type ProcessingStage = 'idle' | 'parsing' | 'processing' | 'researching' | 'creating' | 'done' | 'error'

// ---------- Professional tips shown during processing ----------
const PROCESSING_TIPS = [
  'הצעת מחיר מנצחת מתחילה בהבנה עמוקה של הלקוח - לא רק מה הוא מבקש, אלא למה',
  'משפיענים עם מעורבות גבוהה (3%+) מניבים ROI גבוה יותר ממשפיענים עם עוקבים רבים ומעורבות נמוכה',
  'קמפיין משפיענים ממוצע מחזיר $5.78 על כל דולר שמושקע',
  'שילוב בין Macro ו-Micro משפיענים מייצר גם חשיפה רחבה וגם אמינות ממוקדת',
  'תוכן שנוצר על ידי משפיענים מקבל מעורבות גבוהה פי 8 מתוכן ממותג רגיל',
  'הגדרת KPIs ברורים מראש מאפשרת מדידה אמיתית של הצלחת הקמפיין',
  'בריף ממוקד ותמציתי למשפיען מניב תוכן אותנטי יותר מבריף מפורט מדי',
  'קהלי יעד מוגדרים היטב מעלים את אחוזי ההמרה ב-73% בממוצע',
  'הזמן הממוצע לסגירת עסקה עם הצעה מעוצבת ומקצועית קצר ב-40%',
  'שקיפות בתמחור בונה אמון - תמיד הסבירו מאחורי המספרים',
  'רילס וסטוריז הם הפורמטים עם הצמיחה המהירה ביותר בשיווק משפיענים',
  'קמפיינים עם נרטיב מרכזי אחד חזק מצליחים יותר מקמפיינים מפוזרים',
  '92% מהצרכנים סומכים על המלצה ממשפיען יותר מפרסומת מסורתית',
  'תכנון timeline ריאלי עם buffers מונע לחצים ומשפר את איכות התוכן',
  'שלב תמיד אלמנט של UGC (תוכן גולשים) כמכפיל ערך לקמפיין',
  'הצגת case studies דומים מעלה את שיעור הסגירה ב-25%',
  'ניתוח מתחרים לפני בניית ההצעה מאפשר מיצוב ייחודי ומדויק',
  'שילוב בין אורגני לממומן מייצר אפקט סינרגטי שמכפיל תוצאות',
  'CPE (Cost Per Engagement) ממוצע בישראל נע בין 1.5-4 שקלים',
  'הצעה עם תובנה אסטרטגית מבוססת מחקר מרשימה יותר מהצעה טכנית בלבד',
  'הכנת 3 חלופות תקציב (בסיס, מורחב, פרימיום) מעלה את שווי העסקה ב-30%',
  'משפיענים שעובדים עם מותג לטווח ארוך מייצרים תוצאות טובות פי 2 מקמפיין חד-פעמי',
  'הוספת metrics מצופים (reach, impressions, engagement) מראה מקצועיות ובונה אמון',
  'תוכן video מניב מעורבות גבוהה פי 3 מתמונות סטטיות ברשתות החברתיות',
]

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

      // === STEP 2: AI Processing (Extract + Generate full proposal) ===
      setStage('processing')
      addLog('info', 'סוכן AI מעבד את המסמכים ומייצר הצעה מלאה...')
      addLog('detail', `סך הכל ${(briefText.length + kickoffText.length).toLocaleString()} תווים לניתוח`)

      const processStart = Date.now()
      const processRes = await fetch('/api/process-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientBriefText: briefText, kickoffText: kickoffText || undefined }),
      })
      const processData = await processRes.json()
      const processElapsed = ((Date.now() - processStart) / 1000).toFixed(1)

      if (!processRes.ok) throw new Error(processData.error || 'שגיאה בעיבוד המסמכים')

      const extracted: ExtractedBriefData = processData.extracted
      const stepData = processData.stepData
      setBrandInfo(extracted)

      // Log processing results
      addLog('success', `עיבוד AI הושלם (${processElapsed}s) - רמת ביטחון: ${extracted._meta?.confidence || 'N/A'}`)

      if (extracted.brand?.name) {
        addLog('success', `מותג זוהה: ${extracted.brand.name}${extracted.brand.industry ? ` (${extracted.brand.industry})` : ''}`)
      } else {
        addLog('warning', 'שם המותג לא זוהה - נדרש קלט ידני')
      }

      if (extracted.budget?.amount && extracted.budget.amount > 0) {
        addLog('detail', `תקציב: ${extracted.budget.currency}${extracted.budget.amount.toLocaleString()}`)
      }

      if (stepData?.key_insight?.keyInsight) {
        addLog('detail', `תובנה: ${stepData.key_insight.keyInsight.slice(0, 80)}...`)
      }
      if (stepData?.strategy?.strategyHeadline) {
        addLog('detail', `אסטרטגיה: ${stepData.strategy.strategyHeadline}`)
      }
      if (stepData?.strategy?.strategyPillars?.length) {
        addLog('detail', `עמודי אסטרטגיה: ${stepData.strategy.strategyPillars.length}`)
      }
      if (stepData?.creative?.activityTitle) {
        addLog('detail', `קריאייטיב: ${stepData.creative.activityTitle}`)
      }
      if (stepData?.quantities?.totalDeliverables) {
        addLog('detail', `תוצרים: ${stepData.quantities.totalDeliverables} סה"כ`)
      }
      if (stepData?.influencers?.influencers?.length) {
        addLog('detail', `משפיענים מוצעים: ${stepData.influencers.influencers.length}`)
      }

      if (extracted._meta?.warnings?.length) {
        extracted._meta.warnings.forEach((w: string) => addLog('warning', w))
      }

      // === STEP 3: Background Research (parallel, non-blocking) ===
      setStage('researching')
      addLog('info', 'מריץ מחקר מותג ומשפיענים ברקע...')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let brandResearch: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let influencerData: any = null

      if (extracted.brand?.name) {
        // Start brand facts in background
        fetchBrandFacts(extracted.brand.name)

        // Run research + influencer suggestions in parallel
        const researchPromises = await Promise.allSettled([
          // Brand research
          fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandName: extracted.brand.name }),
          }).then(async (res) => {
            if (!res.ok) throw new Error('Research failed')
            return res.json()
          }),
          // Influencer suggestions
          fetch('/api/influencers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'research',
              brandResearch: {
                brandName: extracted.brand.name,
                industry: extracted.brand.industry || '',
                targetDemographics: {
                  primaryAudience: {
                    gender: extracted.targetAudience?.primary?.gender || '',
                    ageRange: extracted.targetAudience?.primary?.ageRange || '',
                    interests: extracted.targetAudience?.primary?.interests || [],
                  },
                },
              },
              budget: extracted.budget?.amount || 0,
              goals: extracted.campaignGoals || [],
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error('Influencer research failed')
            return res.json()
          }),
        ])

        // Handle brand research result
        if (researchPromises[0].status === 'fulfilled') {
          brandResearch = researchPromises[0].value.research
          addLog('success', 'מחקר מותג הושלם בהצלחה')
        } else {
          addLog('warning', 'מחקר מותג לא הצליח - ממשיכים בלעדיו')
        }

        // Handle influencer result
        if (researchPromises[1].status === 'fulfilled') {
          influencerData = researchPromises[1].value
          const recCount = influencerData?.strategy?.recommendations?.length || influencerData?.recommendations?.length || 0
          addLog('success', `המלצות משפיענים: ${recCount} פרופילים`)
        } else {
          addLog('warning', 'מחקר משפיענים לא הצליח - ממשיכים בלעדיו')
        }
      } else {
        addLog('detail', 'דילוג על מחקר - שם מותג לא זוהה')
      }

      // === STEP 4: Create Document ===
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
            _stepData: stepData,
            _brandResearch: brandResearch || undefined,
            _influencerStrategy: influencerData?.strategy || undefined,
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

  // Rotate tips during processing (slow - 7 seconds each)
  const [tipIndex, setTipIndex] = useState(0)
  const [tipVisible, setTipVisible] = useState(true)

  useEffect(() => {
    if (stage === 'idle' || stage === 'error') return
    const interval = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % PROCESSING_TIPS.length)
        setTipVisible(true)
      }, 500) // fade out, then change + fade in
    }, 7000)
    return () => clearInterval(interval)
  }, [stage])

  // Rotate brand facts
  const factToShow = brandFacts.length > 0 ? brandFacts[currentFact % brandFacts.length] : null
  if (brandFacts.length > 1) {
    setTimeout(() => setCurrentFact(prev => prev + 1), 5000)
  }

  // Elapsed time counter
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (stage !== 'idle' && stage !== 'error' && stage !== 'done') {
      setElapsed(0)
      elapsedRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    } else if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [stage])

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

        {/* Processing Panel - Premium Design */}
        {isProcessing && (
          <div className="space-y-6 mb-8">
            {/* Main Processing Card with gradient */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white p-8 shadow-2xl">
              {/* Animated background orbs */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-32 -left-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
              </div>

              <div className="relative z-10">
                {/* Header with timer */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">
                      {stage === 'done' ? 'ההצעה מוכנה!' : 'בונה את ההצעה שלך...'}
                    </h2>
                    <p className="text-white/60 text-sm">
                      {stage === 'parsing' && 'קורא ומנתח את המסמכים שהעלית'}
                      {stage === 'processing' && 'הסוכן מנתח, מצליב, ומייצר הצעה מלאה'}
                      {stage === 'researching' && 'מריץ מחקר שוק ומשפיענים ברקע'}
                      {stage === 'creating' && 'שומר את ההצעה במערכת'}
                      {stage === 'done' && 'מעביר אותך לעורך ההצעה'}
                    </p>
                  </div>
                  {stage !== 'done' && (
                    <div className="text-left">
                      <div className="text-3xl font-mono font-bold tabular-nums">
                        {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                      </div>
                      <p className="text-white/40 text-xs">זמן עיבוד</p>
                    </div>
                  )}
                </div>

                {/* Progress Steps - Premium style */}
                <div className="flex items-center gap-3 mb-8">
                  {[
                    { key: 'parsing', label: 'סריקה', icon: '1' },
                    { key: 'processing', label: 'ניתוח AI', icon: '2' },
                    { key: 'researching', label: 'מחקר', icon: '3' },
                    { key: 'creating', label: 'יצירה', icon: '4' },
                  ].map((step, i) => {
                    const status = getStepStatus(step.key, stage)
                    return (
                      <div key={step.key} className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                            status === 'done'
                              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                              : status === 'active'
                              ? 'bg-white text-indigo-900 shadow-lg shadow-white/20 scale-110'
                              : 'bg-white/10 text-white/40'
                          }`}>
                            {status === 'done' ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : status === 'active' ? (
                              <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-ping" />
                            ) : step.icon}
                          </div>
                          <span className={`text-sm hidden sm:inline ${
                            status === 'done' ? 'text-emerald-400' :
                            status === 'active' ? 'text-white font-medium' :
                            'text-white/40'
                          }`}>{step.label}</span>
                        </div>
                        {i < 3 && (
                          <div className="flex-1 h-px relative">
                            <div className="absolute inset-0 bg-white/10" />
                            <div className={`absolute inset-y-0 right-0 bg-gradient-to-l from-emerald-500 to-emerald-400 transition-all duration-700 ${
                              status === 'done' ? 'left-0' : 'left-full'
                            }`} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Brand card - shown once brand is identified */}
                {brandInfo?.brand?.name && (
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-400 text-white flex items-center justify-center font-bold text-xl shadow-lg">
                        {brandInfo.brand.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-lg">{brandInfo.brand.name}</p>
                        {brandInfo.brand.industry && (
                          <p className="text-white/50 text-sm">{brandInfo.brand.industry}</p>
                        )}
                      </div>
                      {brandInfo.budget?.amount ? (
                        <div className="text-left bg-white/5 rounded-lg px-4 py-2">
                          <p className="text-white/40 text-xs">תקציב</p>
                          <p className="font-bold text-lg">{brandInfo.budget.currency}{brandInfo.budget.amount.toLocaleString()}</p>
                        </div>
                      ) : null}
                    </div>
                    {factToShow && (
                      <p className="text-white/50 text-sm mt-4 pt-4 border-t border-white/5">
                        {factToShow}
                      </p>
                    )}
                  </div>
                )}

                {/* Tip Card - large, prominent */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM4 11a1 1 0 100-2H3a1 1 0 000 2h1zM10 18a1 1 0 001-1v-1a1 1 0 10-2 0v1a1 1 0 001 1z" />
                        <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-h-[3rem]">
                      <p className="text-xs text-amber-400/70 font-medium mb-1">
                        טיפ מקצועי #{tipIndex + 1}
                      </p>
                      <p className={`text-white/80 text-sm leading-relaxed transition-opacity duration-500 ${
                        tipVisible ? 'opacity-100' : 'opacity-0'
                      }`}>
                        {PROCESSING_TIPS[tipIndex]}
                      </p>
                    </div>
                  </div>
                  {/* Tip progress dots */}
                  <div className="flex justify-center gap-1 mt-4">
                    {Array.from({ length: Math.min(PROCESSING_TIPS.length, 24) }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full transition-all duration-300 ${
                          i === tipIndex ? 'bg-amber-400 w-3' : 'bg-white/15'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Log - Separate card, collapsible */}
            <details className="group" open>
              <summary className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 select-none">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                לוג עיבוד ({logs.length} רשומות)
              </summary>
              <Card className="p-4">
                <div className="bg-slate-950 rounded-lg p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-1 direction-ltr text-left" dir="ltr">
                  {logs.map((log) => (
                    <div key={log.id} className="flex gap-2 items-start">
                      <span className="text-slate-600 shrink-0">
                        {log.timestamp.toLocaleTimeString('he-IL')}
                      </span>
                      <span className={getLogColorDark(log.type)}>
                        {getLogIcon(log.type)}
                      </span>
                      <span className={log.type === 'detail' ? 'text-slate-500' : 'text-slate-300'}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  {stage !== 'done' && (
                    <div className="text-slate-600 animate-pulse">
                      &gt; waiting...
                    </div>
                  )}
                </div>
              </Card>
            </details>
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

// === Helper Functions ===

function getStepStatus(step: string, currentStage: ProcessingStage): 'pending' | 'active' | 'done' {
  const order = ['parsing', 'processing', 'researching', 'creating', 'done']
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

function getLogColorDark(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return 'text-emerald-400'
    case 'warning': return 'text-amber-400'
    case 'error': return 'text-red-400'
    case 'detail': return 'text-slate-600'
    default: return 'text-blue-400'
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
