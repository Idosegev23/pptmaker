'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'

type GenerationStage = 'loading' | 'research' | 'visuals' | 'slides' | 'done' | 'error'

export default function GeneratePage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [stage, setStage] = useState<GenerationStage>('loading')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const generationStartedRef = useRef(false)

  // Elapsed timer
  useEffect(() => {
    if (stage !== 'done' && stage !== 'error' && stage !== 'loading') {
      setElapsed(0)
      elapsedRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    } else if (elapsedRef.current) {
      clearInterval(elapsedRef.current)
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [stage])

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

        // Save research results
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
      if (pipelineStatus.visualAssets === 'pending' || pipelineStatus.visualAssets !== 'complete') {
        setStage('visuals')
        console.log('[Generate] Generating visual assets...')

        // Re-fetch document to get latest data (including research results)
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

      // 4. Generate slides (always regenerate fresh)
      setStage('slides')
      console.log('[Generate] Generating AI slides...')

      const slideRes = await fetch('/api/preview-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (!slideRes.ok) {
        const slideErr = await slideRes.json()
        throw new Error(slideErr.error || 'Slide generation failed')
      }

      const slideData = await slideRes.json()
      console.log(`[Generate] Generated ${slideData.slideCount} slides`)

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

      // Done - redirect to slide viewer
      setStage('done')
      setTimeout(() => {
        router.push(`/edit/${documentId}`)
      }, 1500)
    } catch (err) {
      console.error('[Generate] Error:', err)
      setStage('error')
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת המצגת')
    }
  }, [documentId, router])

  useEffect(() => {
    runGeneration()
  }, [runGeneration])

  const stageLabel = {
    loading: 'טוען נתונים...',
    research: 'מחקר מותג ומשפיענים',
    visuals: 'יצירת שפה ויזואלית ותמונות',
    slides: 'עיצוב שקפי המצגת',
    done: 'המצגת מוכנה!',
    error: 'שגיאה',
  }

  const stageSubtitle = {
    loading: 'מכין את כל הנתונים',
    research: 'סורק את הרשת למחקר שוק ואיתור משפיעני מפתח',
    visuals: 'מרנדר שפה ויזואלית ותמונות ברזולוציית 4K',
    slides: 'סוכן ה-AI מעצב כל שקף בנפרד',
    done: 'מנווט לתצוגת מצגת...',
    error: 'משהו השתבש',
  }

  const stages = [
    { key: 'research', label: 'מחקר' },
    { key: 'visuals', label: 'ויזואליה' },
    { key: 'slides', label: 'עיצוב שקפים' },
  ]

  function getStepStatus(stepKey: string): 'pending' | 'active' | 'done' {
    const order = ['research', 'visuals', 'slides', 'done']
    const stepIdx = order.indexOf(stepKey)
    const currentIdx = order.indexOf(stage)
    if (currentIdx > stepIdx) return 'done'
    if (currentIdx === stepIdx) return 'active'
    return 'pending'
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7] font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#dfdfdf] bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/logoblack.png" alt="Leaders" width={120} height={36} className="h-8 w-auto hover:opacity-80 transition-opacity" />
          </div>
          <span className="bg-gradient-to-r from-[#e5f2d6] to-[#d4eabf] text-[#4a7c3f] rounded-full px-6 py-2 text-sm font-bold shadow-sm border border-[#cbe3af]">
            מעצב מצגת פרימיום
          </span>
          <div />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[700px]">
          {/* Hero Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] text-white p-8 md:p-10 shadow-2xl border border-white/10">
            {/* Decorative rings */}
            <svg className="absolute top-0 left-0 w-full h-full opacity-15 pointer-events-none" viewBox="0 0 700 400" fill="none">
              <circle cx="550" cy="200" r="100" stroke="#f2cc0d" strokeWidth="1.5" className="animate-[spin_20s_linear_infinite] origin-[550px_200px]" strokeDasharray="10 20" />
              <circle cx="550" cy="200" r="160" stroke="#f2cc0d" strokeWidth="0.8" opacity="0.3" />
            </svg>

            <div className="relative z-10">
              {/* Header row */}
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight">
                    {stage === 'done' ? 'המצגת שלך מוכנה!' : stageLabel[stage]}
                  </h2>
                  <p className="text-[#94a3b8] text-sm mt-1 font-medium">
                    {stageSubtitle[stage]}
                  </p>
                </div>
                {stage !== 'done' && stage !== 'error' && stage !== 'loading' && (
                  <div className="text-left shrink-0 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5">
                    <div className="text-3xl font-mono font-bold tabular-nums text-[#f2cc0d] drop-shadow-[0_0_8px_rgba(242,204,13,0.5)]">
                      {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                    </div>
                    <p className="text-[#94a3b8] text-xs font-semibold tracking-wider text-center mt-1">זמן ריצה</p>
                  </div>
                )}
              </div>

              {/* Progress Steps */}
              <div className="flex items-center gap-2 mb-6">
                {stages.map((step, i) => {
                  const status = getStepStatus(step.key)
                  return (
                    <div key={step.key} className="flex items-center gap-2 flex-1">
                      <div className="flex items-center gap-3 shrink-0">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                          status === 'done'
                            ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                            : status === 'active'
                            ? 'bg-[#f2cc0d] text-[#0f172a] shadow-[0_0_20px_rgba(242,204,13,0.4)] scale-110'
                            : 'bg-white/5 text-white/30 border border-white/5'
                        }`}>
                          {status === 'done' ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : status === 'active' ? (
                            <div className="relative flex items-center justify-center w-full h-full">
                              <div className="absolute inset-0 rounded-2xl border-2 border-[#0f172a] border-t-transparent animate-spin" />
                              <span>{i + 1}</span>
                            </div>
                          ) : (
                            <span>{i + 1}</span>
                          )}
                        </div>
                        <span className={`text-sm font-bold hidden sm:inline tracking-wide ${
                          status === 'done' ? 'text-[#10b981]' :
                          status === 'active' ? 'text-[#f2cc0d]' :
                          'text-white/30'
                        }`}>{step.label}</span>
                      </div>
                      {i < 2 && (
                        <div className="flex-1 h-1.5 rounded-full relative overflow-hidden bg-white/5">
                          <div className={`absolute inset-y-0 right-0 transition-all duration-1000 ease-out ${
                            status === 'done'
                              ? 'left-0 bg-gradient-to-l from-[#10b981] to-[#047857]'
                              : 'left-full bg-[#f2cc0d]'
                          }`} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

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
