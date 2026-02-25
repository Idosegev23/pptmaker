'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { enrichStepData } from '@/components/wizard/wizard-utils'
import FlowStepper from '@/components/flow-stepper'

type ResearchStage = 'loading' | 'brand_research' | 'influencer_research' | 'enriching' | 'done' | 'error'

const RESEARCH_STEPS = [
  { key: 'loading', label: 'טוען נתונים' },
  { key: 'brand_research', label: 'מחקר מותג' },
  { key: 'influencer_research', label: 'מחקר משפיענים' },
  { key: 'enriching', label: 'העשרת הצעה' },
]

const BRAND_STAGES = [
  'מחפש מידע על המותג...',
  'סורק אתרים ומקורות...',
  'מנתח מתחרים בשוק...',
  'בוחן קהל יעד...',
  'מזהה נוכחות דיגיטלית...',
  'מסכם תובנות...',
]

const INFLUENCER_STAGES = [
  'מנתח נישת המותג...',
  'מאתר משפיענים רלוונטיים...',
  'בודק פרופילים...',
  'בונה אסטרטגיית משפיענים...',
  'מכין המלצות...',
]

const GENERIC_TIPS = [
  'נתון אמת: קמפיין משפיענים מקצועי מייצר החזר השקעה (ROI) ממוצע של $5.20 על כל דולר שמושקע.',
  '82% מהצרכנים מעידים שהם סומכים על המלצות של מיקרו-משפיענים יותר מאשר על פרסומות ממומנות רגילות.',
  'שילוב תוכן גולשים (UGC) בתוך קמפיינים ממומנים (Paid Social) מוריד את עלות ההמרה (CPA) בעד 50%.',
  'הצעת מחיר מנצחת מתחילה בתובנה (Insight) חדה - כזו שמחברת בין הכאב של הקהל לפתרון של המותג.',
  'סוד מקצועי: משפיעני Nano (1K-10K עוקבים) מציגים את אחוזי המעורבות (Engagement) הגבוהים ביותר ברשת.',
  'מסמכים והצעות מחיר שכוללים ויזואליה מותאמת אישית נסגרים ב-34% יותר מהר לעומת הצעות טקסטואליות.',
  'CPE (עלות למעורבות) ממוצע בקמפיין משפיענים איכותי בישראל נע לרוב בין 1.5 ל-3.5 שקלים, תלוי בנישה.',
  'טיקטוק או אינסטגרם? בטיקטוק החשיפה האורגנית גבוהה פי 4, אך באינסטגרם אחוזי ההמרה לרכישה עדיין מובילים.',
  'קמפיינים ארוכי טווח (שגרירי מותג) מייצרים פי 2 יותר זכירות מותג מאשר קמפיינים נקודתיים (One-offs).',
  'כדי לייצר קריאייטיב שובר רשת, תנו למשפיענים חופש פעולה ב-80% מהתוכן, ושמרו 20% למסרי חובה של המותג.',
  '67% מאנשי השיווק מדווחים שהאיכות של קהל שמגיע דרך משפיענים גבוהה יותר מקהל שמגיע מפרסום רגיל.',
  'הטעות הכי נפוצה היא לבחור משפיענים רק לפי כמות עוקבים, ולא לפי אמינות והתאמה לערכי המותג.',
]

export default function ResearchPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [stage, setStage] = useState<ResearchStage>('loading')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [brandName, setBrandName] = useState('')
  const [brandIndustry, setBrandIndustry] = useState('')
  const [budgetAmount, setBudgetAmount] = useState(0)
  const [budgetCurrency, setBudgetCurrency] = useState('₪')
  const [brandDone, setBrandDone] = useState(false)
  const [influencerDone, setInfluencerDone] = useState(false)
  const [subStageMsg, setSubStageMsg] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [researchResults, setResearchResults] = useState<{ brand: any; influencer: any; colors: any } | null>(null)
  const [showResults, setShowResults] = useState(false)

  const startedRef = useRef(false)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Tips rotation
  const [tipIndex, setTipIndex] = useState(0)
  const [tipVisible, setTipVisible] = useState(true)

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

  // Sub-stage message rotation
  useEffect(() => {
    if (stage !== 'brand_research' && stage !== 'influencer_research') return
    const stages = stage === 'brand_research' ? BRAND_STAGES : INFLUENCER_STAGES
    let idx = 0
    setSubStageMsg(stages[0])
    const interval = setInterval(() => {
      idx = (idx + 1) % stages.length
      setSubStageMsg(stages[idx])
    }, 8000)
    return () => clearInterval(interval)
  }, [stage])

  // Tips rotation
  useEffect(() => {
    if (stage === 'loading' || stage === 'error' || stage === 'done') return
    const interval = setInterval(() => {
      setTipVisible(false)
      setTimeout(() => {
        setTipIndex(prev => (prev + 1) % GENERIC_TIPS.length)
        setTipVisible(true)
      }, 500)
    }, 7000)
    return () => clearInterval(interval)
  }, [stage])

  const runResearch = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setError(null)

    try {
      // Stage 1: Load document
      setStage('loading')
      const docRes = await fetch(`/api/documents/${documentId}`)
      if (!docRes.ok) throw new Error('Failed to load document')
      const docData = await docRes.json()
      const data = docData.document?.data || docData.data || {}
      const pipelineStatus = data._pipelineStatus || {}

      // Skip if already done
      if (pipelineStatus.research === 'complete') {
        router.push(`/wizard/${documentId}`)
        return
      }

      const name = data.brandName || data._extractedData?.brand?.name || ''
      setBrandName(name)
      setBrandIndustry(data._extractedData?.brand?.industry || '')
      if (data._extractedData?.budget?.amount) {
        setBudgetAmount(data._extractedData.budget.amount)
        setBudgetCurrency(data._extractedData.budget.currency || '₪')
      }

      // No brand name → skip to wizard
      if (!name) {
        console.log('[Research] No brand name, skipping to wizard')
        router.push(`/wizard/${documentId}`)
        return
      }

      // Stage 2-3: Run research in parallel
      setStage('brand_research')
      setBrandDone(false)
      setInfluencerDone(false)

      const extracted = data._extractedData || {}
      const brand = extracted.brand || {}
      const targetAudience = extracted.targetAudience || {}

      const [brandResult, influencerResult] = await Promise.allSettled([
        fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName: name }),
        }).then(async res => {
          setBrandDone(true)
          if (!res.ok) throw new Error('Brand research failed')
          return res.json()
        }),
        fetch('/api/influencers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'research',
            brandResearch: {
              brandName: name,
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
        }).then(async res => {
          setInfluencerDone(true)
          if (!res.ok) throw new Error('Influencer research failed')
          return res.json()
        }),
      ])

      // Update visual stage as influencer finishes
      setStage('influencer_research')

      const brandResearch = brandResult.status === 'fulfilled' ? brandResult.value.research : null
      const colors = brandResult.status === 'fulfilled' ? brandResult.value.colors : null
      const influencerStrategy = influencerResult.status === 'fulfilled'
        ? (influencerResult.value.strategy || influencerResult.value)
        : null

      if (!brandResearch && !influencerStrategy) {
        throw new Error('שני המחקרים נכשלו. נסה שוב.')
      }

      // Stage 4: Enrich step data
      setStage('enriching')
      const existingStepData = data._stepData || {}
      const enriched = enrichStepData(existingStepData, brandResearch, influencerStrategy)

      // Save everything to document
      const patchPayload: Record<string, unknown> = {
        _pipelineStatus: { ...pipelineStatus, research: 'complete' },
        _stepData: enriched,
      }
      if (brandResearch) patchPayload._brandResearch = brandResearch
      if (influencerStrategy) patchPayload._influencerStrategy = influencerStrategy
      if (colors) patchPayload._brandColors = colors

      const patchRes = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
      })

      if (!patchRes.ok) {
        console.error('[Research] Failed to save research data')
      }

      // Done — save results for display
      setResearchResults({ brand: brandResearch, influencer: influencerStrategy, colors })
      setStage('done')
      setShowResults(true)
    } catch (err) {
      console.error('[Research] Error:', err)
      setStage('error')
      setError(err instanceof Error ? err.message : 'שגיאה במחקר')
      startedRef.current = false
    }
  }, [documentId, router])

  // Auto-start on mount
  useEffect(() => {
    runResearch()
  }, [runResearch])

  // Step status helper
  const getStepStatus = useCallback((stepKey: string): 'pending' | 'active' | 'done' => {
    const order = ['loading', 'brand_research', 'influencer_research', 'enriching']
    const stepIdx = order.indexOf(stepKey)
    const currentStage: string = stage
    const currentIdx = order.indexOf(currentStage)
    if (currentStage === 'done') return 'done'
    if (currentStage === 'error') return stepIdx <= order.indexOf('loading') ? 'done' : 'pending'
    if (currentIdx > stepIdx) return 'done'
    if (currentIdx === stepIdx) return 'active'
    return 'pending'
  }, [stage])

  // Download research as JSON file
  const downloadResearch = useCallback(() => {
    if (!researchResults) return
    const content = {
      brandName,
      researchDate: new Date().toLocaleDateString('he-IL'),
      brandResearch: researchResults.brand,
      influencerStrategy: researchResults.influencer,
      brandColors: researchResults.colors,
    }
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `research-${brandName || 'report'}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [researchResults, brandName])

  const activeTips = useMemo(() => GENERIC_TIPS, [])
  const stageStr: string = stage
  const isProcessing = stageStr !== 'error'

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f5f7] font-sans selection:bg-[#f2cc0d] selection:text-[#212529]">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#dfdfdf] bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-6 py-4 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <Image src="/logoblack.png" alt="Leaders" width={120} height={36} className="h-8 w-auto hover:opacity-80 transition-opacity" />
          </div>
          <div className="hidden sm:block">
            <FlowStepper currentStep="research" compact />
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 bg-white border border-[#dfdfdf] text-[#6b7281] rounded-full px-5 py-2 text-sm font-medium hover:bg-gray-50 hover:text-[#212529] hover:shadow-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            ביטול
          </button>
        </div>
      </header>

      <div className="max-w-[1000px] mx-auto px-4 md:px-6 py-10">
        {isProcessing && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700">
            {/* Hero Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] text-white p-8 md:p-10 shadow-2xl border border-white/10">
              {/* Decorative rings */}
              <svg className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 800 500" fill="none">
                <circle cx="650" cy="250" r="120" stroke="url(#rg1)" strokeWidth="2" className="animate-[spin_20s_linear_infinite] origin-[650px_250px]" strokeDasharray="10 20" />
                <circle cx="650" cy="250" r="200" stroke="#f2cc0d" strokeWidth="1" opacity="0.3" />
                <circle cx="150" cy="400" r="100" stroke="url(#rg2)" strokeWidth="1.5" className="animate-[spin_15s_linear_infinite_reverse] origin-[150px_400px]" strokeDasharray="30 10" />
                <defs>
                  <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f2cc0d" /><stop offset="100%" stopColor="transparent" /></linearGradient>
                  <linearGradient id="rg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="transparent" /></linearGradient>
                </defs>
              </svg>

              <div className="relative z-10">
                {/* Header row */}
                <div className="flex items-start justify-between mb-10">
                  <div className="flex items-center gap-5">
                    <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                      <Image src="/logoblack.png" alt="Leaders" width={100} height={30} className="h-6 w-auto brightness-0 invert" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight">
                        {stageStr === 'done' ? 'המחקר הושלם!' : stageStr === 'error' ? 'שגיאה במחקר' : 'חוקרים את המותג והשוק...'}
                      </h2>
                      <p className="text-[#94a3b8] text-sm mt-1 font-medium">
                        {stageStr === 'loading' && 'טוען נתוני המסמך...'}
                        {stageStr === 'brand_research' && subStageMsg}
                        {stageStr === 'influencer_research' && subStageMsg}
                        {stageStr === 'enriching' && 'משלב תוצאות מחקר עם הצעת המחיר...'}
                        {stageStr === 'done' && 'מעביר לעורך ההצעה...'}
                        {stageStr === 'error' && error}
                      </p>
                    </div>
                  </div>
                  {stageStr !== 'done' && stageStr !== 'error' && (
                    <div className="text-left shrink-0 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5">
                      <div className="text-3xl font-mono font-bold tabular-nums text-[#f2cc0d] drop-shadow-[0_0_8px_rgba(242,204,13,0.5)]">
                        {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                      </div>
                      <p className="text-[#94a3b8] text-xs font-semibold tracking-wider text-center mt-1">זמן ריצה</p>
                    </div>
                  )}
                </div>

                {/* Progress Steps - Wizard-style pills */}
                <div className="flex items-center gap-2 mb-10">
                  {RESEARCH_STEPS.map((step, i) => {
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
                        {i < RESEARCH_STEPS.length - 1 && (
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

                {/* Brand research detail tracks */}
                {(stageStr === 'brand_research' || stageStr === 'influencer_research' || stageStr === 'enriching') && (
                  <div className="space-y-4 mb-8">
                    {/* Brand track */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-3 mb-3">
                        {brandDone ? (
                          <div className="w-8 h-8 rounded-lg bg-[#10b981] flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-sm text-white">מחקר מותג ושוק</div>
                          <div className="text-xs text-[#94a3b8]">
                            {brandDone ? 'הושלם!' : BRAND_STAGES[Math.floor(elapsed / 8) % BRAND_STAGES.length]}
                          </div>
                        </div>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-l from-blue-500 to-blue-400 rounded-full transition-all duration-1000"
                          style={{ width: brandDone ? '100%' : `${Math.min(15 + (elapsed % 60) * 1.2, 85)}%` }}
                        />
                      </div>
                    </div>

                    {/* Influencer track */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                      <div className="flex items-center gap-3 mb-3">
                        {influencerDone ? (
                          <div className="w-8 h-8 rounded-lg bg-[#10b981] flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-sm text-white">מחקר משפיענים</div>
                          <div className="text-xs text-[#94a3b8]">
                            {influencerDone ? 'הושלם!' : INFLUENCER_STAGES[Math.floor(elapsed / 8) % INFLUENCER_STAGES.length]}
                          </div>
                        </div>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-l from-purple-500 to-purple-400 rounded-full transition-all duration-1000"
                          style={{ width: influencerDone ? '100%' : `${Math.min(20 + (elapsed % 60) * 1.1, 85)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Brand Card - reveal when identified */}
                {brandName && stageStr !== 'loading' && (
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 mb-6 shadow-xl animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f2cc0d] to-[#e0bc00] text-[#0f172a] flex items-center justify-center font-black text-3xl shadow-[0_0_20px_rgba(242,204,13,0.3)] border border-white/20">
                        {brandName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">מותג נחקר</p>
                        <p className="font-extrabold text-2xl text-white tracking-tight">{brandName}</p>
                        {brandIndustry && (
                          <div className="inline-flex items-center mt-2 px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-semibold border border-white/5">
                            {brandIndustry}
                          </div>
                        )}
                      </div>
                      {budgetAmount > 0 && (
                        <div className="text-left bg-[#0f172a]/50 rounded-xl px-5 py-3 border border-white/10">
                          <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-wider mb-1">תקציב קמפיין</p>
                          <p className="font-black text-2xl text-[#f2cc0d] drop-shadow-md">{budgetCurrency}{budgetAmount.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Done state — show results */}
                {stageStr === 'done' && !showResults && (
                  <div className="bg-[#10b981]/10 backdrop-blur-md border border-[#10b981]/30 rounded-2xl p-6 text-center animate-in zoom-in-95 duration-500">
                    <div className="w-16 h-16 rounded-full bg-[#10b981]/20 mx-auto mb-4 flex items-center justify-center">
                      <svg className="w-8 h-8 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-extrabold text-white mb-2">המחקר הושלם בהצלחה!</h3>
                    <p className="text-[#94a3b8] text-sm">מעביר לעורך ההצעה עם כל הנתונים...</p>
                  </div>
                )}

                {/* Error state */}
                {stageStr === 'error' && (
                  <div className="bg-red-500/10 backdrop-blur-md border border-red-500/30 rounded-2xl p-6 text-center animate-in zoom-in-95 duration-500">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 mx-auto mb-4 flex items-center justify-center">
                      <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-extrabold text-white mb-2">שגיאה במחקר</h3>
                    <p className="text-red-300 text-sm mb-6">{error}</p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => { startedRef.current = false; runResearch() }}
                        className="bg-[#f2cc0d] text-[#0f172a] font-bold px-6 py-3 rounded-full hover:scale-105 transition-transform shadow-lg"
                      >
                        נסה שוב
                      </button>
                      <button
                        onClick={() => router.push(`/wizard/${documentId}`)}
                        className="bg-white/10 text-white/80 font-medium px-6 py-3 rounded-full hover:bg-white/20 transition-colors border border-white/10"
                      >
                        דלג לעורך
                      </button>
                    </div>
                  </div>
                )}

                {/* Tip Card */}
                {stageStr !== 'done' && stageStr !== 'error' && (
                  <div className="bg-black/20 backdrop-blur-sm border border-white/5 rounded-2xl p-6 mt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner bg-white/5 text-white/50 border border-white/5">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                        </svg>
                      </div>
                      <div className="flex-1 min-h-[4rem]">
                        <p className="text-[#94a3b8] text-xs font-bold uppercase tracking-wider mb-2">
                          תובנה מקצועית בזמן ההמתנה
                          <span className="text-white/20 mr-3 text-[10px]">({tipIndex + 1}/{activeTips.length})</span>
                        </p>
                        <p className={`text-white/90 text-base md:text-lg font-medium leading-relaxed transition-all duration-500 ${
                          tipVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                        }`}>
                          &ldquo;{activeTips[tipIndex % activeTips.length]}&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ RESEARCH RESULTS ═══ */}
        {showResults && researchResults && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Action bar */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-[#212529]">תוצאות המחקר</h2>
              <div className="flex gap-3">
                <button
                  onClick={downloadResearch}
                  className="flex items-center gap-2 bg-white border border-[#dfdfdf] text-[#6b7281] rounded-full px-5 py-2.5 text-sm font-medium hover:bg-gray-50 hover:text-[#212529] hover:shadow-sm transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  הורד מחקר
                </button>
                <button
                  onClick={() => router.push(`/wizard/${documentId}`)}
                  className="flex items-center gap-2 bg-[#f2cc0d] text-[#0f172a] rounded-full px-6 py-2.5 text-sm font-bold hover:scale-105 transition-transform shadow-md"
                >
                  המשך לעריכת ההצעה
                  <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Brand Research ── */}
            {researchResults.brand && (
              <ResearchSection title="מחקר מותג" icon="🏢" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {researchResults.brand.industry && (
                    <InfoCard label="תעשייה" value={researchResults.brand.industry} />
                  )}
                  {researchResults.brand.marketPosition && (
                    <InfoCard label="מיקום בשוק" value={researchResults.brand.marketPosition} />
                  )}
                  {researchResults.brand.pricePositioning && (
                    <InfoCard label="מיצוב מחיר" value={researchResults.brand.pricePositioning} />
                  )}
                  {researchResults.brand.founded && (
                    <InfoCard label="שנת הקמה" value={researchResults.brand.founded} />
                  )}
                </div>
                {researchResults.brand.companyDescription && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-1">תיאור המותג</p>
                    <p className="text-sm text-[#212529] leading-relaxed whitespace-pre-line">{researchResults.brand.companyDescription}</p>
                  </div>
                )}
                {researchResults.brand.brandPersonality?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">אישיות המותג</p>
                    <div className="flex flex-wrap gap-2">
                      {researchResults.brand.brandPersonality.map((p: string, i: number) => (
                        <span key={i} className="bg-[#f2cc0d]/10 text-[#8a7000] px-3 py-1 rounded-full text-xs font-semibold border border-[#f2cc0d]/20">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {researchResults.brand.uniqueSellingPoints?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">יתרונות תחרותיים</p>
                    <ul className="space-y-1">
                      {researchResults.brand.uniqueSellingPoints.map((usp: string, i: number) => (
                        <li key={i} className="text-sm text-[#212529] flex items-start gap-2">
                          <span className="text-[#f2cc0d] mt-1">●</span>{usp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {researchResults.brand.competitors?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">מתחרים</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {researchResults.brand.competitors.slice(0, 6).map((c: { name: string; description?: string; differentiator?: string }, i: number) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="font-bold text-sm text-[#212529]">{c.name}</p>
                          {c.differentiator && <p className="text-xs text-[#6b7281] mt-1">{c.differentiator}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ResearchSection>
            )}

            {/* ── Target Audience ── */}
            {researchResults.brand?.targetDemographics && (
              <ResearchSection title="קהל יעד" icon="👥">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {researchResults.brand.targetDemographics.primaryAudience?.gender && (
                    <InfoCard label="מגדר" value={researchResults.brand.targetDemographics.primaryAudience.gender} />
                  )}
                  {researchResults.brand.targetDemographics.primaryAudience?.ageRange && (
                    <InfoCard label="טווח גילאים" value={researchResults.brand.targetDemographics.primaryAudience.ageRange} />
                  )}
                  {researchResults.brand.targetDemographics.primaryAudience?.socioeconomic && (
                    <InfoCard label="סוציו-אקונומי" value={researchResults.brand.targetDemographics.primaryAudience.socioeconomic} />
                  )}
                  {researchResults.brand.targetDemographics.primaryAudience?.lifestyle && (
                    <InfoCard label="סגנון חיים" value={researchResults.brand.targetDemographics.primaryAudience.lifestyle} />
                  )}
                </div>
                {researchResults.brand.targetDemographics.primaryAudience?.interests?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">תחומי עניין</p>
                    <div className="flex flex-wrap gap-2">
                      {researchResults.brand.targetDemographics.primaryAudience.interests.map((interest: string, i: number) => (
                        <span key={i} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold border border-blue-100">{typeof interest === 'string' ? interest : JSON.stringify(interest)}</span>
                      ))}
                    </div>
                  </div>
                )}
                {researchResults.brand.targetDemographics.primaryAudience?.painPoints?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">נקודות כאב</p>
                    <ul className="space-y-1">
                      {researchResults.brand.targetDemographics.primaryAudience.painPoints.map((p: string, i: number) => (
                        <li key={i} className="text-sm text-[#212529] flex items-start gap-2">
                          <span className="text-red-400 mt-1">●</span>{typeof p === 'string' ? p : JSON.stringify(p)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ResearchSection>
            )}

            {/* ── Digital Presence ── */}
            {researchResults.brand?.socialPresence && (
              <ResearchSection title="נוכחות דיגיטלית" icon="📱">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(researchResults.brand.socialPresence).map(([platform, data]) => {
                    if (!data) return null
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const d = data as any
                    return (
                      <div key={platform} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <p className="font-bold text-sm text-[#212529] capitalize mb-2">{platform}</p>
                        {d.handle && <p className="text-xs text-[#6b7281]">{d.handle}</p>}
                        {d.followers && <p className="text-lg font-black text-[#212529] mt-1">{d.followers}</p>}
                        {d.engagement && <p className="text-xs text-[#6b7281]">מעורבות: {d.engagement}</p>}
                        {d.contentStyle && <p className="text-xs text-[#6b7281] mt-1">{d.contentStyle}</p>}
                      </div>
                    )
                  })}
                </div>
              </ResearchSection>
            )}

            {/* ── Influencer Strategy ── */}
            {researchResults.influencer && (
              <ResearchSection title="אסטרטגיית משפיענים" icon="📊" defaultOpen>
                {researchResults.influencer.strategySummary && (
                  <p className="text-sm text-[#212529] leading-relaxed mb-4">{researchResults.influencer.strategySummary}</p>
                )}
                {researchResults.influencer.tiers?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">שכבות משפיענים</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {researchResults.influencer.tiers.map((tier: { name: string; description?: string; recommendedCount?: number; budgetAllocation?: string; purpose?: string }, i: number) => (
                        <div key={i} className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                          <p className="font-bold text-sm text-purple-900">{tier.name}</p>
                          {tier.recommendedCount && <p className="text-2xl font-black text-purple-700 mt-1">{tier.recommendedCount}</p>}
                          {tier.budgetAllocation && <p className="text-xs text-purple-600 mt-1">תקציב: {tier.budgetAllocation}</p>}
                          {tier.purpose && <p className="text-xs text-[#6b7281] mt-1">{tier.purpose}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {researchResults.influencer.expectedKPIs?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-2">יעדים צפויים</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {researchResults.influencer.expectedKPIs.map((kpi: { metric: string; target: string; rationale?: string }, i: number) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                          <p className="text-xs text-[#6b7281]">{kpi.metric}</p>
                          <p className="text-xl font-black text-[#212529] mt-1">{kpi.target}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ResearchSection>
            )}

            {/* ── Influencer Recommendations ── */}
            {researchResults.influencer?.recommendations?.length > 0 && (
              <ResearchSection title="משפיענים מומלצים" icon="⭐" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {researchResults.influencer.recommendations.map((rec: { name?: string; handle?: string; category?: string; followers?: string; engagement?: string; whyRelevant?: string; platform?: string; estimatedCost?: string; profilePicUrl?: string }, i: number) => (
                    <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-3">
                        {rec.profilePicUrl ? (
                          <Image src={rec.profilePicUrl} alt={rec.name || ''} width={48} height={48} className="w-12 h-12 rounded-full object-cover border-2 border-gray-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg">
                            {(rec.name || '?').charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-sm text-[#212529]">{rec.name}</p>
                          {rec.handle && <p className="text-xs text-[#6b7281]">{rec.handle}</p>}
                        </div>
                      </div>
                      <div className="flex gap-3 mb-3">
                        {rec.followers && (
                          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
                            <p className="text-[10px] text-[#6b7281] uppercase">עוקבים</p>
                            <p className="font-bold text-sm text-[#212529]">{rec.followers}</p>
                          </div>
                        )}
                        {rec.engagement && (
                          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
                            <p className="text-[10px] text-[#6b7281] uppercase">מעורבות</p>
                            <p className="font-bold text-sm text-[#212529]">{rec.engagement}</p>
                          </div>
                        )}
                        {rec.estimatedCost && (
                          <div className="bg-gray-50 rounded-lg px-3 py-1.5">
                            <p className="text-[10px] text-[#6b7281] uppercase">עלות</p>
                            <p className="font-bold text-sm text-[#212529]">{rec.estimatedCost}</p>
                          </div>
                        )}
                      </div>
                      {rec.category && (
                        <span className="inline-block bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold mb-2">{rec.category}</span>
                      )}
                      {rec.whyRelevant && (
                        <p className="text-xs text-[#6b7281] leading-relaxed">{rec.whyRelevant}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ResearchSection>
            )}

            {/* ── Sources ── */}
            {researchResults.brand?.sources?.length > 0 && (
              <ResearchSection title="מקורות" icon="📚">
                <div className="space-y-2">
                  {researchResults.brand.sources.map((src: { title: string; url?: string }, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-[#6b7281]">•</span>
                      {src.url ? (
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{src.title}</a>
                      ) : (
                        <span className="text-[#212529]">{src.title}</span>
                      )}
                    </div>
                  ))}
                </div>
              </ResearchSection>
            )}

            {/* Bottom action bar */}
            <div className="flex items-center justify-center gap-4 pt-4 pb-8">
              <button
                onClick={downloadResearch}
                className="flex items-center gap-2 bg-white border border-[#dfdfdf] text-[#6b7281] rounded-full px-6 py-3 text-sm font-medium hover:bg-gray-50 hover:text-[#212529] hover:shadow-sm transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                הורד מחקר (JSON)
              </button>
              <button
                onClick={() => router.push(`/wizard/${documentId}`)}
                className="flex items-center gap-2 bg-[#f2cc0d] text-[#0f172a] rounded-full px-8 py-3 text-sm font-bold hover:scale-105 transition-transform shadow-lg"
              >
                המשך לעריכת ההצעה
                <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ Helper Components ═══

function ResearchSection({ title, icon, defaultOpen = false, children }: {
  title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <h3 className="font-bold text-[#212529] text-base">{title}</h3>
        </div>
        <svg className={`w-5 h-5 text-[#6b7281] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-5 animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <p className="text-xs font-bold text-[#6b7281] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#212529]">{value}</p>
    </div>
  )
}
