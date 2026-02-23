'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import GoogleDrivePicker from '@/components/google-drive-picker'
import type { UploadedDocument, ExtractedBriefData } from '@/types/brief'

type ProcessingStage = 'idle' | 'parsing' | 'processing' | 'researching' | 'visuals' | 'creating' | 'done' | 'error'

// ---------- Fallback tips (only shown before brand is identified) ----------
const GENERIC_TIPS = [
  'הצעת מחיר מנצחת מתחילה בהבנה עמוקה של הלקוח - לא רק מה הוא מבקש, אלא למה',
  'משפיענים עם מעורבות גבוהה (3%+) מניבים ROI גבוה יותר ממשפיענים עם עוקבים רבים',
  'קמפיין משפיענים ממוצע מחזיר $5.78 על כל דולר שמושקע',
  'שילוב בין Macro ו-Micro משפיענים מייצר חשיפה רחבה וגם אמינות ממוקדת',
  'תוכן שנוצר על ידי משפיענים מקבל מעורבות גבוהה פי 8 מתוכן ממותג רגיל',
  'בריף ממוקד ותמציתי למשפיען מניב תוכן אותנטי יותר מבריף מפורט מדי',
  'קהלי יעד מוגדרים היטב מעלים את אחוזי ההמרה ב-73% בממוצע',
  'הזמן הממוצע לסגירת עסקה עם הצעה מעוצבת ומקצועית קצר ב-40%',
  'רילס וסטוריז הם הפורמטים עם הצמיחה המהירה ביותר בשיווק משפיענים',
  '92% מהצרכנים סומכים על המלצה ממשפיען יותר מפרסומת מסורתית',
  'שילוב בין אורגני לממומן מייצר אפקט סינרגטי שמכפיל תוצאות',
  'CPE (Cost Per Engagement) ממוצע בישראל נע בין 1.5-4 שקלים',
  'תוכן video מניב מעורבות גבוהה פי 3 מתמונות סטטיות ברשתות החברתיות',
  'משפיענים שעובדים עם מותג לטווח ארוך מייצרים תוצאות טובות פי 2',
  'הוספת metrics מצופים (reach, impressions, engagement) מראה מקצועיות ובונה אמון',
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
      // Silent fail
    }
  }

  const handleGenerate = async () => {
    if (!briefDoc) {
      setError('יש להעלות לפחות בריף לקוח')
      return
    }

    setStage('parsing')
    setError(null)
    setLogs([])
    setBrandInfo(null)
    setBrandFacts([])

    try {
      // === STEP 1: Parse Documents ===
      addLog('info', 'מתחיל עיבוד מסמכים...')
      let briefText = ''
      let kickoffText = ''

      if (briefFile) {
        const formatName = getFormatDisplayName(briefFile.type)
        addLog('info', `קורא בריף לקוח: ${briefDoc.fileName} (${formatName}, ${formatFileSize(briefFile.size)})`)

        const startTime = Date.now()
        briefText = await parseFileUpload(briefFile, 'client_brief')
        const elapsedMs = ((Date.now() - startTime) / 1000).toFixed(1)

        addLog('success', `בריף נקרא בהצלחה - ${briefText.length.toLocaleString()} תווים (${elapsedMs}s)`)
      }

      if (!briefText) {
        throw new Error('לא הצלחנו לחלץ טקסט מהבריף. נסה לגרור את הקובץ מחדש או לבחור פורמט אחר.')
      }

      if (kickoffDoc && kickoffFile) {
        const formatName = getFormatDisplayName(kickoffFile.type)
        addLog('info', `קורא מסמך התנעה: ${kickoffDoc.fileName} (${formatName}, ${formatFileSize(kickoffFile.size)})`)

        try {
          const startTime = Date.now()
          kickoffText = await parseFileUpload(kickoffFile, 'kickoff')
          const elapsedMs = ((Date.now() - startTime) / 1000).toFixed(1)
          addLog('success', `מסמך התנעה נקרא - ${kickoffText.length.toLocaleString()} תווים (${elapsedMs}s)`)
        } catch (kickoffErr) {
          addLog('warning', `מסמך ההתנעה לא נקרא: ${kickoffErr instanceof Error ? kickoffErr.message : 'שגיאה'}. ממשיכים עם הבריף בלבד.`)
        }
      } else {
        addLog('detail', 'לא הועלה מסמך התנעה - ממשיכים עם הבריף בלבד')
      }

      // === STEP 2: AI Processing ===
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

      // === STEP 3: Background Research ===
      setStage('researching')
      addLog('info', 'מריץ מחקר מותג ומשפיענים ברקע...')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let brandResearch: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let researchColors: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let researchLogos: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let influencerData: any = null

      if (extracted.brand?.name) {
        fetchBrandFacts(extracted.brand.name)

        const researchPromises = await Promise.allSettled([
          fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandName: extracted.brand.name }),
          }).then(async (res) => {
            if (!res.ok) throw new Error('Research failed')
            return res.json()
          }),
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

        if (researchPromises[0].status === 'fulfilled') {
          const researchResult = researchPromises[0].value
          brandResearch = researchResult.research
          researchColors = researchResult.colors || null
          researchLogos = researchResult.logos || null
          addLog('success', 'מחקר מותג הושלם בהצלחה')
          if (researchColors?.primary) {
            addLog('detail', `צבעי מותג מהמחקר: ${researchColors.primary}`)
          }
        } else {
          addLog('warning', 'מחקר מותג לא הצליח - ממשיכים בלעדיו')
        }

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

      // === STEP 4: Visual Assets (scrape + colors + AI images) ===
      setStage('visuals')
      addLog('info', 'מתחיל יצירת נכסים ויזואליים (לוגו, צבעים, תמונות)...')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let visualAssets: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let scrapedData: any = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let brandColors: any = researchColors || null
      let generatedImages: Record<string, string | undefined> = {}

      try {
        const visualStart = Date.now()
        const websiteUrl = brandResearch?.website || extracted.brand?.website || null

        const visualRes = await fetch('/api/generate-visual-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandName: extracted.brand?.name || '',
            brandResearch,
            stepData,
            websiteUrl,
          }),
        })

        if (visualRes.ok) {
          visualAssets = await visualRes.json()
          const visualElapsed = ((Date.now() - visualStart) / 1000).toFixed(1)

          if (visualAssets.scraped?.logoUrl) {
            scrapedData = visualAssets.scraped
            addLog('success', `לוגו מותג נמצא (${visualElapsed}s)`)
          }

          if (visualAssets.brandColors?.primary) {
            brandColors = visualAssets.brandColors
            addLog('detail', `פלטת צבעים: ${brandColors.primary}, ${brandColors.secondary || ''}, ${brandColors.accent || ''}`)
          }

          generatedImages = visualAssets.generatedImages || {}
          const imgCount = Object.values(generatedImages).filter(Boolean).length
          const extraCount = visualAssets.extraImages?.length || 0

          if (imgCount > 0 || extraCount > 0) {
            addLog('success', `נוצרו ${imgCount + extraCount} תמונות AI למותג`)
          } else {
            addLog('warning', 'יצירת תמונות AI לא הצליחה - ימשיכו ללא תמונות')
          }

          if (visualAssets.imageStrategy) {
            addLog('detail', `אסטרטגיית תמונה: ${visualAssets.imageStrategy.conceptSummary?.slice(0, 60) || ''}...`)
          }
        } else {
          addLog('warning', 'שלב הויזואל נכשל - ממשיכים ללא תמונות')
        }
      } catch (visualErr) {
        console.error('[Create Proposal] Visual assets error:', visualErr)
        addLog('warning', 'יצירת נכסים ויזואליים נכשלה - ממשיכים ללא תמונות')
      }

      // === STEP 5: Create Document ===
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
            // Visual assets
            _scraped: scrapedData || undefined,
            _brandColors: brandColors || undefined,
            _generatedImages: Object.keys(generatedImages).length > 0 ? generatedImages : undefined,
            _extraImages: visualAssets?.extraImages?.length > 0 ? visualAssets.extraImages : undefined,
            _imageStrategy: visualAssets?.imageStrategy || undefined,
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

  // ---------- Tips system: brand-specific when available, generic fallback ----------
  const activeTips = useMemo(() => {
    if (brandFacts.length > 0) return brandFacts
    return GENERIC_TIPS
  }, [brandFacts])

  const isBrandTips = brandFacts.length > 0

  const [tipIndex, setTipIndex] = useState(0)
  const [tipVisible, setTipVisible] = useState(true)

  // Reset tip index when tips source changes
  useEffect(() => {
    setTipIndex(0)
    setTipVisible(true)
  }, [isBrandTips])

  useEffect(() => {
    if (stage === 'idle' || stage === 'error') return
    const interval = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % activeTips.length)
        setTipVisible(true)
      }, 500)
    }, 7000)
    return () => clearInterval(interval)
  }, [stage, activeTips.length])

  // Elapsed timer
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

  // ===================== RENDER =====================

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7]">
      {/* ---------- Top Navigation ---------- */}
      <header className="sticky top-0 z-50 w-full border-b border-[#dfdfdf] bg-white">
        <div className="flex items-center justify-between px-6 py-3 max-w-[1200px] mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Image
              src="/logoblack.png"
              alt="Leaders"
              width={120}
              height={36}
              className="h-8 w-auto"
            />
          </div>

          {/* Center: Page title as pill badge */}
          <div className="hidden sm:flex items-center">
            <span className="bg-[#e5f2d6] text-[#212529] rounded-full px-5 py-2 text-sm font-semibold">
              יצירת הצעת מחיר
            </span>
          </div>

          {/* Cancel */}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 bg-white border border-[#dfdfdf] text-[#6b7281] rounded-full px-5 py-2 text-sm font-medium hover:bg-[#f4f5f7] hover:text-[#212529] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            חזרה
          </button>
        </div>
      </header>

      <div className="max-w-[1000px] mx-auto px-4 md:px-6 py-8">
        {/* ---------- Upload State ---------- */}
        {!isProcessing && (
          <>
            {/* Hero Header */}
            <div className="mb-8">
              <h1 className="text-[32px] font-bold text-[#212529] leading-tight mb-2">
                הצעת מחיר חדשה
              </h1>
              <p className="text-[#6b7281] text-base">
                העלה את בריף הלקוח ומסמך ההתנעה - הסוכן ינתח, יצליב, ויבנה הצעה מלאה ב-10 שלבים
              </p>
            </div>

            {/* Upload Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
              {/* Client Brief Card */}
              <div className="bg-white rounded-2xl p-6 hover:scale-[1.01] transition-transform">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#dbe4f5] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#3b5998]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-[#212529]">בריף לקוח</h3>
                      <p className="text-xs text-[#6b7281]">חובה</p>
                    </div>
                  </div>
                  <span className="inline-block border border-[#dfdfdf] rounded-md px-2 py-1 text-xs text-[#6b7281]">
                    שלב 1
                  </span>
                </div>

                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    briefDoc
                      ? 'border-[#e5f2d6] bg-[#e5f2d6]/20'
                      : 'border-[#dfdfdf] hover:border-[#f2cc0d] hover:bg-[#f2cc0d]/5'
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, 'client_brief')}
                >
                  {briefDoc ? (
                    <div className="animate-fadeIn">
                      <div className="w-12 h-12 rounded-full bg-[#e5f2d6] mx-auto mb-3 flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#4a7c3f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="font-semibold text-[#212529] text-sm">{briefDoc.fileName}</p>
                      <button
                        className="text-xs text-[#6b7281] hover:text-[#212529] mt-2 transition-colors"
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
                      <div className="w-12 h-12 rounded-full bg-[#f4f5f7] mx-auto mb-3 flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#6b7281]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <p className="text-[#6b7281] text-sm mb-4">גרור קובץ לכאן או בחר</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => briefInputRef.current?.click()}
                          className="bg-white border border-[#dfdfdf] text-[#212529] rounded-full px-4 py-2 text-sm font-medium hover:bg-[#f4f5f7] transition-all"
                        >
                          בחר קובץ
                        </button>
                        <GoogleDrivePicker
                          onFilePicked={(file) => handleFileSelect(file, 'client_brief')}
                          disabled={isProcessing}
                        />
                      </div>
                      <p className="text-xs text-[#6b7281]/60 mt-3">
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
              </div>

              {/* Kickoff Document Card */}
              <div className="bg-white rounded-2xl p-6 hover:scale-[1.01] transition-transform">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#e5f2d6] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#4a7c3f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-[#212529]">מסמך התנעה</h3>
                      <p className="text-xs text-[#6b7281]">אופציונלי</p>
                    </div>
                  </div>
                  <span className="inline-block border border-[#dfdfdf] rounded-md px-2 py-1 text-xs text-[#6b7281]">
                    שלב 2
                  </span>
                </div>

                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    kickoffDoc
                      ? 'border-[#e5f2d6] bg-[#e5f2d6]/20'
                      : 'border-[#dfdfdf] hover:border-[#f2cc0d] hover:bg-[#f2cc0d]/5'
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, 'kickoff')}
                >
                  {kickoffDoc ? (
                    <div className="animate-fadeIn">
                      <div className="w-12 h-12 rounded-full bg-[#e5f2d6] mx-auto mb-3 flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#4a7c3f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="font-semibold text-[#212529] text-sm">{kickoffDoc.fileName}</p>
                      <button
                        className="text-xs text-[#6b7281] hover:text-[#212529] mt-2 transition-colors"
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
                      <div className="w-12 h-12 rounded-full bg-[#f4f5f7] mx-auto mb-3 flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#6b7281]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <p className="text-[#6b7281] text-sm mb-4">גרור קובץ לכאן או בחר</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => kickoffInputRef.current?.click()}
                          className="bg-white border border-[#dfdfdf] text-[#212529] rounded-full px-4 py-2 text-sm font-medium hover:bg-[#f4f5f7] transition-all"
                        >
                          בחר קובץ
                        </button>
                        <GoogleDrivePicker
                          onFilePicked={(file) => handleFileSelect(file, 'kickoff')}
                          disabled={isProcessing}
                        />
                      </div>
                      <p className="text-xs text-[#6b7281]/60 mt-3">
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
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">
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

            {/* Generate Button */}
            <div className="flex justify-center">
              <button
                onClick={handleGenerate}
                disabled={!briefDoc}
                className="flex items-center gap-3 bg-[#f2cc0d] text-[#212529] rounded-full px-10 py-4 text-lg font-bold hover:brightness-95 transition-all shadow-[0_0_20px_rgba(242,204,13,0.3)] hover:shadow-[0_0_30px_rgba(242,204,13,0.4)] disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                צור הצעת מחיר
              </button>
            </div>
          </>
        )}

        {/* ---------- Processing State ---------- */}
        {isProcessing && (
          <div className="space-y-5 animate-fadeIn">
            {/* Processing Hero Card - dark with brand accents */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white p-8">
              {/* Decorative SVG rings */}
              <svg className="absolute top-0 left-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 800 500" fill="none">
                <circle cx="650" cy="250" r="120" stroke="#f2cc0d" strokeWidth="1.5" />
                <circle cx="650" cy="250" r="200" stroke="#f2cc0d" strokeWidth="1" />
                <circle cx="650" cy="250" r="300" stroke="#f2cc0d" strokeWidth="0.5" />
                <circle cx="150" cy="400" r="80" stroke="#e5f2d6" strokeWidth="1" />
                <circle cx="150" cy="400" r="150" stroke="#e5f2d6" strokeWidth="0.5" />
              </svg>

              <div className="relative z-10">
                {/* Header row: logo + title + timer */}
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <Image
                      src="/logo.png"
                      alt="Leaders"
                      width={100}
                      height={30}
                      className="h-7 w-auto opacity-60"
                    />
                    <div className="w-px h-8 bg-white/10" />
                    <div>
                      <h2 className="text-xl font-bold">
                        {stage === 'done' ? 'ההצעה מוכנה!' : 'בונה את ההצעה שלך...'}
                      </h2>
                      <p className="text-white/50 text-sm mt-0.5">
                        {stage === 'parsing' && 'קורא ומנתח את המסמכים שהעלית'}
                        {stage === 'processing' && 'הסוכן מנתח, מצליב, ומייצר הצעה מלאה'}
                        {stage === 'researching' && 'מריץ מחקר שוק ומשפיענים ברקע'}
                        {stage === 'visuals' && 'מייצר לוגו, צבעים ותמונות AI למותג'}
                        {stage === 'creating' && 'שומר את ההצעה במערכת'}
                        {stage === 'done' && 'מעביר אותך לעורך ההצעה'}
                      </p>
                    </div>
                  </div>
                  {stage !== 'done' && (
                    <div className="text-left shrink-0">
                      <div className="text-2xl font-mono font-bold tabular-nums text-[#f2cc0d]">
                        {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                      </div>
                      <p className="text-white/30 text-xs">זמן עיבוד</p>
                    </div>
                  )}
                </div>

                {/* Progress Steps */}
                <div className="flex items-center gap-2 mb-8">
                  {[
                    { key: 'parsing', label: 'סריקה' },
                    { key: 'processing', label: 'ניתוח AI' },
                    { key: 'researching', label: 'מחקר' },
                    { key: 'visuals', label: 'ויזואל' },
                    { key: 'creating', label: 'יצירה' },
                  ].map((step, i) => {
                    const status = getStepStatus(step.key, stage)
                    return (
                      <div key={step.key} className="flex items-center gap-2 flex-1">
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                            status === 'done'
                              ? 'bg-[#e5f2d6] text-[#4a7c3f] shadow-[0_0_12px_rgba(229,242,214,0.3)]'
                              : status === 'active'
                              ? 'bg-[#f2cc0d] text-[#212529] shadow-[0_0_15px_rgba(242,204,13,0.3)] scale-110'
                              : 'bg-white/10 text-white/30'
                          }`}>
                            {status === 'done' ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : status === 'active' ? (
                              <div className="w-2 h-2 bg-[#212529] rounded-full animate-ping" />
                            ) : (
                              <span>{i + 1}</span>
                            )}
                          </div>
                          <span className={`text-sm hidden sm:inline ${
                            status === 'done' ? 'text-[#e5f2d6]' :
                            status === 'active' ? 'text-[#f2cc0d] font-medium' :
                            'text-white/30'
                          }`}>{step.label}</span>
                        </div>
                        {i < 4 && (
                          <div className="flex-1 h-px relative">
                            <div className="absolute inset-0 bg-white/10" />
                            <div className={`absolute inset-y-0 right-0 transition-all duration-700 ${
                              status === 'done'
                                ? 'left-0 bg-gradient-to-l from-[#e5f2d6] to-[#e5f2d6]/60'
                                : 'left-full bg-[#f2cc0d]'
                            }`} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Brand Card - when brand is identified */}
                {brandInfo?.brand?.name && (
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-[#f2cc0d] text-[#212529] flex items-center justify-center font-bold text-2xl shadow-[0_0_15px_rgba(242,204,13,0.2)]">
                        {brandInfo.brand.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-lg">{brandInfo.brand.name}</p>
                        {brandInfo.brand.industry && (
                          <p className="text-white/40 text-sm">{brandInfo.brand.industry}</p>
                        )}
                      </div>
                      {brandInfo.budget?.amount ? (
                        <div className="text-left bg-white/5 rounded-lg px-4 py-2 border border-white/5">
                          <p className="text-white/30 text-xs">תקציב</p>
                          <p className="font-bold text-lg text-[#f2cc0d]">{brandInfo.budget.currency}{brandInfo.budget.amount.toLocaleString()}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Tip Card */}
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isBrandTips ? 'bg-[#f2cc0d]/20 text-[#f2cc0d]' : 'bg-white/10 text-white/60'
                    }`}>
                      {isBrandTips ? (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-h-[3.5rem]">
                      <p className={`text-xs font-medium mb-1.5 ${
                        isBrandTips ? 'text-[#f2cc0d]/70' : 'text-white/40'
                      }`}>
                        {isBrandTips
                          ? `על ${brandInfo?.brand?.name || 'המותג'}`
                          : `טיפ מקצועי`
                        }
                        <span className="text-white/20 mr-2">
                          {tipIndex + 1}/{activeTips.length}
                        </span>
                      </p>
                      <p className={`text-white/80 text-sm leading-relaxed transition-opacity duration-500 ${
                        tipVisible ? 'opacity-100' : 'opacity-0'
                      }`}>
                        {activeTips[tipIndex % activeTips.length]}
                      </p>
                    </div>
                  </div>
                  {/* Tip dots */}
                  <div className="flex justify-center gap-1 mt-5">
                    {activeTips.map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 rounded-full transition-all duration-300 ${
                          i === tipIndex % activeTips.length
                            ? `w-4 ${isBrandTips ? 'bg-[#f2cc0d]' : 'bg-white/40'}`
                            : 'w-1 bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Live Log */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-sm text-[#6b7281] hover:text-[#212529] transition-colors mb-2 select-none">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                לוג עיבוד ({logs.length} רשומות)
              </summary>
              <div className="bg-white rounded-2xl p-4 border border-[#dfdfdf]">
                <div className="bg-[#1a1a2e] rounded-xl p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-1" dir="ltr">
                  {logs.map((log) => (
                    <div key={log.id} className="flex gap-2 items-start">
                      <span className="text-[#6b7281]/60 shrink-0">
                        {log.timestamp.toLocaleTimeString('he-IL')}
                      </span>
                      <span className={getLogColorDark(log.type)}>
                        {getLogIcon(log.type)}
                      </span>
                      <span className={log.type === 'detail' ? 'text-[#6b7281]' : 'text-[#e0e0e0]'}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  {stage !== 'done' && (
                    <div className="text-[#6b7281]/40 animate-pulse">
                      &gt; waiting...
                    </div>
                  )}
                </div>
              </div>
            </details>
          </div>
        )}

        {/* Error during processing */}
        {stage === 'error' && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mt-5">
            {error}
            <button
              className="block mt-2 text-sm underline"
              onClick={() => { setStage('idle'); setError(null); setLogs([]) }}
            >
              נסה שוב
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// === Helper Functions ===

function getStepStatus(step: string, currentStage: ProcessingStage): 'pending' | 'active' | 'done' {
  const order = ['parsing', 'processing', 'researching', 'visuals', 'creating', 'done']
  const stepIdx = order.indexOf(step)
  const currentIdx = order.indexOf(currentStage)
  if (currentIdx > stepIdx) return 'done'
  if (currentIdx === stepIdx) return 'active'
  return 'pending'
}

function getLogColorDark(type: LogEntry['type']): string {
  switch (type) {
    case 'success': return 'text-[#e5f2d6]'
    case 'warning': return 'text-[#f2cc0d]'
    case 'error': return 'text-red-400'
    case 'detail': return 'text-[#6b7281]/60'
    default: return 'text-[#dbe4f5]'
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
