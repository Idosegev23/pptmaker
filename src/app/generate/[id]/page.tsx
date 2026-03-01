'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import FlowStepper from '@/components/flow-stepper'

// ── Progress weights — how much of the 100% bar each phase takes ──
const PHASE_WEIGHTS = {
  research: 10,
  visuals: 10,
  foundation: 15,
  batches: 55, // split evenly across N batches
  finalize: 10,
}

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

interface StepInfo {
  key: string
  label: string
}

/** Safely parse API response — handles Vercel timeout (returns plain text) */
async function safeJson(res: Response): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const text = await res.text()
  try {
    return { ok: res.ok, data: JSON.parse(text) }
  } catch {
    // Vercel timeout or non-JSON error
    const msg = text.slice(0, 200) || `HTTP ${res.status}`
    return { ok: false, data: { error: msg, details: `Server returned non-JSON response (status ${res.status})` } }
  }
}

export default function GeneratePage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  // Core state
  const [stage, setStage] = useState('loading')
  const [batchIndex, setBatchIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const generationStartedRef = useRef(false)

  // Dynamic batch info — set after foundation
  const [batchCount, setBatchCount] = useState(0)
  const [batchSizes, setBatchSizes] = useState<number[]>([])
  const [totalSlides, setTotalSlides] = useState(0)
  const [slidesDone, setSlidesDone] = useState(0)

  // Overall progress 0-100 (smooth)
  const [progress, setProgress] = useState(0)
  const progressTargetRef = useRef(0)
  const progressAnimRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer refs
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tipRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Smooth progress animation ──
  // When target changes, smoothly animate toward it
  const animateProgressTo = useCallback((target: number) => {
    progressTargetRef.current = Math.min(target, 100)
    if (progressAnimRef.current) return // already running
    progressAnimRef.current = setInterval(() => {
      setProgress(prev => {
        const diff = progressTargetRef.current - prev
        if (Math.abs(diff) < 0.5) {
          if (progressAnimRef.current) {
            clearInterval(progressAnimRef.current)
            progressAnimRef.current = null
          }
          return progressTargetRef.current
        }
        // Ease toward target — faster when far, slower when close
        return prev + diff * 0.15
      })
    }, 100)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressAnimRef.current) clearInterval(progressAnimRef.current)
    }
  }, [])

  // ── Elapsed timer ──
  useEffect(() => {
    if (stage !== 'done' && stage !== 'error' && stage !== 'loading') {
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

  // ── Tips rotation ──
  useEffect(() => {
    tipRef.current = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length)
    }, 6000)
    return () => { if (tipRef.current) clearInterval(tipRef.current) }
  }, [])

  // ── Helper: calculate progress % for a given phase ──
  const getPhaseStart = useCallback((phase: string, bIdx?: number) => {
    let start = 0
    if (phase === 'research') return start
    start += PHASE_WEIGHTS.research
    if (phase === 'visuals') return start
    start += PHASE_WEIGHTS.visuals
    if (phase === 'foundation') return start
    start += PHASE_WEIGHTS.foundation
    if (phase === 'batch' && bIdx !== undefined && batchCount > 0) {
      const perBatch = PHASE_WEIGHTS.batches / batchCount
      return start + perBatch * bIdx
    }
    if (phase === 'finalize') return start + PHASE_WEIGHTS.batches
    if (phase === 'done') return 100
    return start
  }, [batchCount])

  // ── MAIN GENERATION FLOW ──
  const runGeneration = useCallback(async () => {
    if (generationStartedRef.current) return
    generationStartedRef.current = true

    try {
      // 1. Load document
      setStage('loading')
      const docRes = await fetch(`/api/documents/${documentId}`)
      if (!docRes.ok) throw new Error('Failed to load document')
      const docData = await docRes.json()
      const data = docData.document?.data || docData.data || {}
      const pipelineStatus = data._pipelineStatus || {}
      const brandName = data.brandName || ''

      // 2. Research
      if (pipelineStatus.research === 'pending') {
        setStage('research')
        animateProgressTo(PHASE_WEIGHTS.research * 0.5)
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
      animateProgressTo(PHASE_WEIGHTS.research)

      // 3. Visual assets
      if (pipelineStatus.visualAssets !== 'complete') {
        setStage('visuals')
        animateProgressTo(getPhaseStart('visuals') + PHASE_WEIGHTS.visuals * 0.3)
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
      animateProgressTo(getPhaseStart('foundation'))

      // 4. Check for cached presentation
      const cachedCheckRes = await fetch(`/api/documents/${documentId}`)
      const cachedCheckData = await cachedCheckRes.json()
      const cachedData = cachedCheckData.document?.data || cachedCheckData.data || {}

      if (cachedData._presentation?.slides?.length > 0) {
        console.log('[Generate] Using cached presentation')
        animateProgressTo(100)
        setStage('done')
        setTimeout(() => router.push(`/edit/${documentId}`), 1500)
        return
      }

      // 5. STAGED SLIDE GENERATION

      // 5a: Foundation
      setStage('foundation')
      animateProgressTo(getPhaseStart('foundation') + PHASE_WEIGHTS.foundation * 0.5)
      console.log('[Generate] Running foundation...')

      const foundationRes = await fetch('/api/generate-slides-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, stage: 'foundation' }),
      })

      const { ok: foundationOk, data: foundationData } = await safeJson(foundationRes)
      if (!foundationOk) {
        throw new Error((foundationData.details || foundationData.error || 'Foundation failed') as string)
      }
      const bc = (foundationData.batchCount as number) || 3
      const ts = (foundationData.totalSlides as number) || 12
      const bs: number[] = (foundationData.batchSizes as number[]) || []

      setBatchCount(bc)
      setTotalSlides(ts)
      setBatchSizes(bs)
      setSlidesDone(0)
      animateProgressTo(getPhaseStart('foundation') + PHASE_WEIGHTS.foundation)
      console.log(`[Generate] Foundation complete: ${bc} batches, ${ts} slides`)

      // 5b: Batches
      let accumulated = 0
      const perBatch = PHASE_WEIGHTS.batches / bc

      for (let b = 0; b < bc; b++) {
        setStage('batch')
        setBatchIndex(b)

        const batchStart = PHASE_WEIGHTS.research + PHASE_WEIGHTS.visuals + PHASE_WEIGHTS.foundation + perBatch * b
        animateProgressTo(batchStart + perBatch * 0.15) // small initial progress
        console.log(`[Generate] Running batch ${b + 1}/${bc}...`)

        const batchRes = await fetch('/api/generate-slides-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId, stage: 'batch', batchIndex: b }),
        })

        const { ok: batchOk, data: batchData } = await safeJson(batchRes)
        if (!batchOk) {
          throw new Error((batchData.details || batchData.error || `Batch ${b + 1} failed`) as string)
        }
        accumulated = (batchData.totalSlidesAccumulated as number) || (accumulated + (bs[b] || 0))
        setSlidesDone(accumulated)
        animateProgressTo(batchStart + perBatch)
        console.log(`[Generate] Batch ${b + 1} done: ${batchData.slidesGenerated} slides (total: ${accumulated})`)
      }

      // 5c: Finalize
      setStage('finalize')
      setBatchIndex(-1)
      animateProgressTo(getPhaseStart('finalize') + PHASE_WEIGHTS.finalize * 0.3)
      console.log('[Generate] Finalizing presentation...')

      const finalizeRes = await fetch('/api/generate-slides-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, stage: 'finalize' }),
      })

      const { ok: finalizeOk, data: finalData } = await safeJson(finalizeRes)
      if (!finalizeOk) {
        throw new Error((finalData.details || finalData.error || 'Finalize failed') as string)
      }
      setSlidesDone(ts)
      animateProgressTo(100)
      console.log(`[Generate] Finalized: ${finalData.slideCount} slides, quality: ${finalData.qualityScore ?? '-'}/100`)

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

      setStage('done')
      setTimeout(() => router.push(`/edit/${documentId}`), 1500)
    } catch (err) {
      console.error('[Generate] Error:', err)
      setStage('error')
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת המצגת')
    }
  }, [documentId, router, animateProgressTo, getPhaseStart])

  useEffect(() => {
    runGeneration()
  }, [runGeneration])

  // ── Build dynamic steps based on batch info ──
  const progressSteps: StepInfo[] = [
    { key: 'research', label: 'מחקר' },
    { key: 'visuals', label: 'ויזואליה' },
    { key: 'foundation', label: 'מערכת עיצוב' },
  ]

  if (batchCount > 0) {
    // Dynamic batch steps with slide ranges
    let slideStart = 1
    for (let b = 0; b < batchCount; b++) {
      const size = batchSizes[b] || 0
      const slideEnd = slideStart + size - 1
      progressSteps.push({
        key: `batch_${b}`,
        label: batchCount <= 3
          ? `שקפים ${slideStart}-${slideEnd}`
          : `קבוצה ${b + 1}`,
      })
      slideStart = slideEnd + 1
    }
  } else {
    // Before foundation returns — show placeholder
    progressSteps.push({ key: 'batch_0', label: 'עיצוב שקפים' })
  }

  progressSteps.push({ key: 'finalize', label: 'בדיקות' })

  // ── Step status logic ──
  function getStepStatus(stepKey: string): 'pending' | 'active' | 'done' {
    // Build ordered list of step keys
    const order = ['research', 'visuals', 'foundation']
    for (let b = 0; b < Math.max(batchCount, 1); b++) order.push(`batch_${b}`)
    order.push('finalize', 'done')

    // Map current stage to a key in the order
    let currentKey = stage
    if (stage === 'batch' && batchIndex >= 0) {
      currentKey = `batch_${batchIndex}`
    }

    const stepIdx = order.indexOf(stepKey)
    const currentIdx = order.indexOf(currentKey)

    if (stepIdx < 0) return 'pending'
    if (currentIdx > stepIdx) return 'done'
    if (currentIdx === stepIdx) return 'active'
    return 'pending'
  }

  // ── Stage display metadata ──
  const getStageLabel = (): string => {
    if (stage === 'loading') return 'טוען נתונים...'
    if (stage === 'research') return 'מחקר מותג ומשפיענים'
    if (stage === 'visuals') return 'יצירת שפה ויזואלית ותמונות'
    if (stage === 'foundation') return 'בניית כיוון קריאייטיבי ומערכת עיצוב'
    if (stage === 'batch' && batchIndex >= 0) {
      return `עיצוב שקפים — קבוצה ${batchIndex + 1} מתוך ${batchCount}`
    }
    if (stage === 'finalize') return 'בדיקת איכות והרכבה סופית'
    if (stage === 'done') return 'המצגת מוכנה!'
    if (stage === 'error') return 'שגיאה'
    return ''
  }

  const getStageSubtitle = (): string => {
    if (stage === 'loading') return 'מכין את כל הנתונים'
    if (stage === 'research') return 'סורק את הרשת למחקר שוק ואיתור משפיעני מפתח'
    if (stage === 'visuals') return 'מנתח שפה ויזואלית, לוגו, צבעים ותמונות מהאתר'
    if (stage === 'foundation') return 'ארט דיירקטור AI בונה מערכת עיצוב, טיפוגרפיה ואפקטים'
    if (stage === 'batch' && batchIndex >= 0) {
      const size = batchSizes[batchIndex] || 0
      const start = batchSizes.slice(0, batchIndex).reduce((s, v) => s + v, 0) + 1
      return `מעצב ${size} שקפים (${start}-${start + size - 1}) עם AI`
    }
    if (stage === 'finalize') return 'מוודא ניגודיות, היררכיה, איזון ויזואלי ועקביות'
    if (stage === 'done') return 'מנווט לתצוגת מצגת...'
    if (stage === 'error') return 'משהו השתבש'
    return ''
  }

  const showTimer = stage !== 'done' && stage !== 'error' && stage !== 'loading'
  const roundedProgress = Math.round(progress)

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
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-extrabold tracking-tight">
                    {getStageLabel()}
                  </h2>
                  <p className="text-[#94a3b8] text-sm mt-1 font-medium">
                    {getStageSubtitle()}
                  </p>
                </div>
                {showTimer && (
                  <div className="text-left shrink-0 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5 mr-4">
                    <div className="text-3xl font-mono font-bold tabular-nums text-[#f2cc0d] drop-shadow-[0_0_8px_rgba(242,204,13,0.5)]">
                      {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="text-[#94a3b8] text-xs font-semibold tracking-wider text-center mt-1">זמן ריצה</p>
                  </div>
                )}
              </div>

              {/* Overall progress bar */}
              {showTimer && (
                <div className="mb-4">
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#f2cc0d] to-[#f59e0b] transition-[width] duration-300 ease-out"
                        style={{ width: `${roundedProgress}%` }}
                      />
                    </div>
                    <span className="text-[#f2cc0d] text-sm font-bold tabular-nums shrink-0 min-w-[3ch] text-left">
                      {roundedProgress}%
                    </span>
                  </div>
                  {/* Slide counter under progress bar */}
                  {totalSlides > 0 && (
                    <div className="flex justify-between text-xs text-white/40 font-medium px-0.5">
                      <span>{slidesDone}/{totalSlides} שקפים הושלמו</span>
                      <span>{batchCount} קבוצות</span>
                    </div>
                  )}
                </div>
              )}

              {/* Progress Steps — dynamic horizontal pills */}
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
              {stage === 'done' && (
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
          {stage === 'error' && error && (
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
                    setProgress(0)
                    progressTargetRef.current = 0
                    setSlidesDone(0)
                    setTotalSlides(0)
                    setBatchCount(0)
                    setBatchSizes([])
                    setBatchIndex(-1)
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
