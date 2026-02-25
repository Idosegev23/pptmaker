'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import FlowStepper from '@/components/flow-stepper'

type GenerationStage =
  | 'loading'
  | 'research'
  | 'visuals'
  | 'foundation'
  | 'batch_0'
  | 'batch_1'
  | 'batch_2'
  | 'finalize'
  | 'done'
  | 'error'

const TIPS = [
  'הארט דיירקטור שלנו מעצב כל שקף בנפרד עם תשומת לב לפרטים',
  'כל מצגת עוברת 6 שלבי עיבוד — כמו סטודיו עיצוב אמיתי',
  'אנחנו משתמשים ב-32 טכניקות עיצוב מתקדמות',
  'כל שקף מקבל Layout Strategy ייחודי בהתאם לתוכן שלו',
  'מערכת הבדיקה שלנו מוודאת ניגודיות, היררכיה ואיזון ויזואלי',
  'צבעי המותג מנותחים ומותאמים לנגישות WCAG',
  'הטיפוגרפיה מותאמת אוטומטית לעברית RTL',
  'כל שקף מקבל ציון איכות ותיקונים אוטומטיים',
  'המערכת בוחרת טכניקת לייאאוט שונה לכל שקף — Brutalism, Bento, Swiss Grid',
  'המצגת שלך תהיה ברמת Awwwards — עיצוב שזוכה בפרסים',
  'אנחנו מייצרים שכבות עומק — 5 רמות Z-Index לעומק ויזואלי',
  'מערכת הפייסינג שלנו יוצרת מסע רגשי לאורך המצגת',
]

export default function GeneratePage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [stage, setStage] = useState<GenerationStage>('loading')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [slideProgress, setSlideProgress] = useState({ done: 0, total: 0 })
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tipRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const generationStartedRef = useRef(false)

  // Elapsed timer
  useEffect(() => {
    const stageStr: string = stage
    if (stageStr !== 'done' && stageStr !== 'error' && stageStr !== 'loading') {
      if (!elapsedRef.current) {
        setElapsed(0)
        elapsedRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
      }
    } else if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
      elapsedRef.current = null
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
  }, [stage])

  // Tips rotation
  useEffect(() => {
    tipRef.current = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length)
    }, 6000)
    return () => { if (tipRef.current) clearInterval(tipRef.current) }
  }, [])

  const runGeneration = useCallback(async () => {
    if (generationStartedRef.current) return
    generationStartedRef.current = true

    try {
      // 1. Load document to check pipeline status
      setStage('loading')
      const docRes = await fetch(`/api/documents/${documentId}`)
      if (!docRes.ok) throw new Error('Failed to load document')
      const docData = await docRes.json()
      const data = docData.document?.data || docData.data || {}
      const pipelineStatus = data._pipelineStatus || {}
      const brandName = data.brandName || ''

      // 2. Run research if still pending
      if (pipelineStatus.research === 'pending') {
        setStage('research')
        console.log('[Generate] Running deferred research...')

        const extracted = data._extractedData || {}
        const brand = extracted.brand || {}
        const targetAudience = extracted.targetAudience || {}

        const results = await Promise.allSettled([
          fetch('/api/research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandName }),
          }).then(res => res.ok ? res.json() : Promise.reject('Research failed')),
          fetch('/api/influencers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'research',
              brandResearch: {
                brandName,
                industry: brand.industry || '',
                targetDemographics: {
                  primaryAudience: {
                    gender: targetAudience.primary?.gender || '',
                    ageRange: targetAudience.primary?.ageRange || '',
                    interests: targetAudience.primary?.interests || [],
                  },
                },
              },
              budget: extracted.budget?.amount || 0,
              goals: extracted.campaignGoals || [],
            }),
          }).then(res => res.ok ? res.json() : Promise.reject('Influencer research failed')),
        ])

        const patchData: Record<string, unknown> = {
          _pipelineStatus: { ...pipelineStatus, research: 'complete' },
        }
        if (results[0].status === 'fulfilled') {
          patchData._brandResearch = results[0].value.research
          if (results[0].value.colors) patchData._brandColors = results[0].value.colors
        }
        if (results[1].status === 'fulfilled') {
          patchData._influencerStrategy = results[1].value.strategy || results[1].value
        }

        await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchData),
        })
        console.log('[Generate] Research saved')
      }

      // 3. Run visual assets generation
      if (pipelineStatus.visualAssets !== 'complete') {
        setStage('visuals')
        console.log('[Generate] Generating visual assets...')

        const freshDocRes = await fetch(`/api/documents/${documentId}`)
        const freshDocData = await freshDocRes.json()
        const freshData = freshDocData.document?.data || freshDocData.data || {}
        const websiteUrl = freshData._brandResearch?.website || freshData._extractedData?.brand?.website || null

        try {
          const visualRes = await fetch('/api/generate-visual-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brandName: freshData.brandName || '',
              brandResearch: freshData._brandResearch,
              stepData: freshData._stepData,
              websiteUrl,
            }),
          })

          if (visualRes.ok) {
            const visualAssets = await visualRes.json()
            const patchVisuals: Record<string, unknown> = {
              _pipelineStatus: { ...freshData._pipelineStatus, visualAssets: 'complete' },
            }
            if (visualAssets.scraped) patchVisuals._scraped = visualAssets.scraped
            if (visualAssets.brandColors?.primary) patchVisuals._brandColors = visualAssets.brandColors
            if (visualAssets.generatedImages) patchVisuals._generatedImages = visualAssets.generatedImages
            if (visualAssets.extraImages?.length) patchVisuals._extraImages = visualAssets.extraImages
            if (visualAssets.imageStrategy) patchVisuals._imageStrategy = visualAssets.imageStrategy

            await fetch(`/api/documents/${documentId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patchVisuals),
            })
            console.log('[Generate] Visual assets saved')
          }
        } catch (visualErr) {
          console.error('[Generate] Visual assets failed (continuing):', visualErr)
        }
      }

      // 4. Check for cached presentation (skip if already generated)
      const cachedCheckRes = await fetch(`/api/documents/${documentId}`)
      const cachedCheckData = await cachedCheckRes.json()
      const cachedData = cachedCheckData.document?.data || cachedCheckData.data || {}

      if (cachedData._presentation?.slides?.length > 0) {
        console.log('[Generate] Using cached presentation')
        setStage('done')
        setTimeout(() => router.push(`/edit/${documentId}`), 1500)
        return
      }

      // 5. STAGED SLIDE GENERATION

      // Stage 5a: Foundation (Creative Direction + Design System + Layout Strategy)
      setStage('foundation')
      console.log('[Generate] Running foundation (stages 1-3)...')
      const foundationRes = await fetch('/api/generate-slides-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, stage: 'foundation' }),
      })

      if (!foundationRes.ok) {
        const err = await foundationRes.json()
        throw new Error(err.details || err.error || 'Foundation failed')
      }

      const foundationData = await foundationRes.json()
      const batchCount = foundationData.batchCount || 3
      const totalSlides = foundationData.totalSlides || 12
      setSlideProgress({ done: 0, total: totalSlides })
      console.log(`[Generate] Foundation complete: ${batchCount} batches, ${totalSlides} slides`)

      // Stage 5b: Generate slide batches sequentially
      let slidesAccumulated = 0
      const batchSizes: number[] = foundationData.batchSizes || [5, 5, 2]

      for (let b = 0; b < batchCount; b++) {
        const batchStage = `batch_${b}` as GenerationStage
        setStage(batchStage)
        console.log(`[Generate] Running batch ${b + 1}/${batchCount}...`)

        const batchRes = await fetch('/api/generate-slides-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId, stage: 'batch', batchIndex: b }),
        })

        if (!batchRes.ok) {
          const err = await batchRes.json()
          throw new Error(err.details || err.error || `Batch ${b + 1} failed`)
        }

        const batchData = await batchRes.json()
        slidesAccumulated = batchData.totalSlidesAccumulated || (slidesAccumulated + (batchSizes[b] || 0))
        setSlideProgress({ done: slidesAccumulated, total: totalSlides })
        console.log(`[Generate] Batch ${b + 1} done: ${batchData.slidesGenerated} slides (total: ${slidesAccumulated})`)
      }

      // Stage 5c: Finalize (validation + assembly)
      setStage('finalize')
      console.log('[Generate] Finalizing presentation...')
      const finalizeRes = await fetch('/api/generate-slides-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, stage: 'finalize' }),
      })

      if (!finalizeRes.ok) {
        const err = await finalizeRes.json()
        throw new Error(err.details || err.error || 'Finalize failed')
      }

      const finalData = await finalizeRes.json()
      setSlideProgress({ done: totalSlides, total: totalSlides })
      console.log(`[Generate] Finalized: ${finalData.slideCount} slides, quality: ${finalData.qualityScore}/100`)

      // Update pipeline status
      await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _pipelineStatus: {
            textGeneration: 'complete',
            research: 'complete',
            visualAssets: 'complete',
            slideGeneration: 'complete',
          },
        }),
      })

      // Done — redirect to editor
      setStage('done')
      setTimeout(() => router.push(`/edit/${documentId}`), 1500)
    } catch (err) {
      console.error('[Generate] Error:', err)
      setStage('error')
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת המצגת')
    }
  }, [documentId, router])

  useEffect(() => {
    runGeneration()
  }, [runGeneration])

  // ── Stage display metadata ──────────────────────────────

  const stageStr: string = stage

  const stageLabel: Record<string, string> = {
    loading: 'טוען נתונים...',
    research: 'מחקר מותג ומשפיענים',
    visuals: 'יצירת שפה ויזואלית ותמונות',
    foundation: 'בניית כיוון קריאייטיבי ומערכת עיצוב',
    batch_0: 'עיצוב שקפים — קבוצה 1',
    batch_1: 'עיצוב שקפים — קבוצה 2',
    batch_2: 'עיצוב שקפים — קבוצה 3',
    finalize: 'בדיקת איכות והרכבה סופית',
    done: 'המצגת מוכנה!',
    error: 'שגיאה',
  }

  const stageSubtitle: Record<string, string> = {
    loading: 'מכין את כל הנתונים',
    research: 'סורק את הרשת למחקר שוק ואיתור משפיעני מפתח',
    visuals: 'מרנדר שפה ויזואלית ותמונות ברזולוציית 4K',
    foundation: 'ארט דיירקטור AI בונה כיוון קריאייטיבי, מערכת עיצוב ואסטרטגיית לייאאוט',
    batch_0: 'שער, בריף, מטרות, קהל יעד, תובנה מרכזית',
    batch_1: 'אסטרטגיה, רעיון מרכזי, גישה, תוצרים, מדדים',
    batch_2: 'אסטרטגיית משפיענים, משפיענים מומלצים, סיום',
    finalize: 'מוודא ניגודיות, היררכיה, איזון ויזואלי ועקביות',
    done: 'מנווט לתצוגת מצגת...',
    error: 'משהו השתבש',
  }

  // Progress steps — 7 visual steps
  const progressSteps = [
    { key: 'research', label: 'מחקר' },
    { key: 'visuals', label: 'ויזואליה' },
    { key: 'foundation', label: 'כיוון קריאייטיבי' },
    { key: 'batch_0', label: 'שקפים 1' },
    { key: 'batch_1', label: 'שקפים 2' },
    { key: 'batch_2', label: 'שקפים 3' },
    { key: 'finalize', label: 'בדיקות' },
  ]

  function getStepStatus(stepKey: string): 'pending' | 'active' | 'done' {
    const order = ['research', 'visuals', 'foundation', 'batch_0', 'batch_1', 'batch_2', 'finalize', 'done']
    const stepIdx = order.indexOf(stepKey)
    const currentIdx = order.indexOf(stageStr)
    if (currentIdx > stepIdx) return 'done'
    if (currentIdx === stepIdx) return 'active'
    return 'pending'
  }

  const showTimer = stageStr !== 'done' && stageStr !== 'error' && stageStr !== 'loading'

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7] font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#dfdfdf] bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/logoblack.png" alt="Leaders" width={120} height={36} className="h-8 w-auto hover:opacity-80 transition-opacity" />
          </div>
          <div className="hidden sm:block">
            <FlowStepper currentStep="generate" compact />
          </div>
          <div />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[800px]">
          {/* Hero Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] text-white p-8 md:p-10 shadow-2xl border border-white/10">
            {/* Decorative rings */}
            <svg className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none" viewBox="0 0 800 500" fill="none">
              <circle cx="650" cy="250" r="100" stroke="#f2cc0d" strokeWidth="1.5" className="animate-[spin_20s_linear_infinite] origin-[650px_250px]" strokeDasharray="10 20" />
              <circle cx="650" cy="250" r="160" stroke="#f2cc0d" strokeWidth="0.8" opacity="0.3" />
            </svg>

            <div className="relative z-10">
              {/* Header row */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight">
                    {stageStr === 'done' ? 'המצגת שלך מוכנה!' : (stageLabel[stageStr] || stage)}
                  </h2>
                  <p className="text-[#94a3b8] text-sm mt-1 font-medium">
                    {stageSubtitle[stageStr] || ''}
                  </p>
                </div>
                {showTimer && (
                  <div className="text-left shrink-0 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5">
                    <div className="text-3xl font-mono font-bold tabular-nums text-[#f2cc0d] drop-shadow-[0_0_8px_rgba(242,204,13,0.5)]">
                      {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="text-[#94a3b8] text-xs font-semibold tracking-wider text-center mt-1">זמן ריצה</p>
                  </div>
                )}
              </div>

              {/* Slide counter (during batch generation) */}
              {slideProgress.total > 0 && stageStr !== 'done' && (
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-[#f2cc0d] to-[#f59e0b] transition-all duration-1000 ease-out"
                      style={{ width: `${Math.round((slideProgress.done / slideProgress.total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[#f2cc0d] text-sm font-bold tabular-nums shrink-0">
                    {slideProgress.done}/{slideProgress.total} שקפים
                  </span>
                </div>
              )}

              {/* Progress Steps — horizontal pills */}
              <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
                {progressSteps.map((step, i) => {
                  const status = getStepStatus(step.key)
                  return (
                    <div key={step.key} className="flex items-center gap-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                          status === 'done'
                            ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                            : status === 'active'
                            ? 'bg-[#f2cc0d] text-[#0f172a] shadow-[0_0_15px_rgba(242,204,13,0.4)] scale-110'
                            : 'bg-white/5 text-white/25 border border-white/5'
                        }`}>
                          {status === 'done' ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : status === 'active' ? (
                            <div className="relative flex items-center justify-center w-full h-full">
                              <div className="absolute inset-0 rounded-xl border-2 border-[#0f172a] border-t-transparent animate-spin" />
                              <span className="text-[10px]">{i + 1}</span>
                            </div>
                          ) : (
                            <span className="text-[10px]">{i + 1}</span>
                          )}
                        </div>
                        <span className={`text-xs font-bold hidden md:inline tracking-wide whitespace-nowrap ${
                          status === 'done' ? 'text-[#10b981]' :
                          status === 'active' ? 'text-[#f2cc0d]' :
                          'text-white/25'
                        }`}>{step.label}</span>
                      </div>
                      {i < progressSteps.length - 1 && (
                        <div className="w-3 h-0.5 rounded-full mx-0.5 transition-colors duration-500" style={{
                          backgroundColor: status === 'done' ? '#10b98140' : 'rgba(255,255,255,0.08)',
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Tips rotation */}
              {showTimer && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 transition-all duration-500">
                  <div className="flex items-start gap-2">
                    <span className="text-[#f2cc0d] text-sm shrink-0">💡</span>
                    <p className="text-white/60 text-sm leading-relaxed">{TIPS[tipIndex]}</p>
                  </div>
                </div>
              )}

              {/* Done celebration */}
              {stageStr === 'done' && (
                <div className="text-center py-4 animate-in fade-in zoom-in-95 duration-500">
                  <div className="w-16 h-16 rounded-full bg-[#10b981]/20 mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-white/70 text-sm">מעביר לתצוגת מצגת...</p>
                </div>
              )}
            </div>
          </div>

          {/* Error state */}
          {stageStr === 'error' && error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-2xl p-6 mt-6 shadow-sm">
              <div className="flex items-center gap-3 font-bold text-lg mb-2 text-red-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                שגיאת מערכת
              </div>
              <p className="font-medium text-red-700 mr-9">{error}</p>
              <div className="flex gap-3 mt-4 mr-9">
                <button
                  className="bg-red-100 hover:bg-red-200 text-red-800 font-bold py-2 px-5 rounded-full transition-colors"
                  onClick={() => {
                    setStage('loading')
                    setError(null)
                    setSlideProgress({ done: 0, total: 0 })
                    generationStartedRef.current = false
                    runGeneration()
                  }}
                >
                  נסה שוב
                </button>
                <button
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2 px-5 rounded-full transition-colors"
                  onClick={() => router.push(`/wizard/${documentId}`)}
                >
                  חזרה לעורך
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
