'use client'

import {
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react'
import type { ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import type {
  WizardStepId,
  WizardStepDataMap,
  WizardState,
} from '@/types/wizard'
import { wizardReducer, getInitialWizardState } from './wizard-reducer'
import {
  WIZARD_STEPS,
  WIZARD_STEP_ORDER,
  getStepMeta,
  getStepIndex,
} from './wizard-constants'
import {
  extractedDataToStepData,
  wizardDataToProposalData,
  validateStep,
} from './wizard-utils'
import WizardHeader from './wizard-header'
import WizardProgress from './wizard-progress'
import WizardNavigation from './wizard-navigation'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

// Dynamically imported step components
import StepBrief from './steps/step-brief'
import StepGoals from './steps/step-goals'
import StepTargetAudience from './steps/step-target-audience'
import StepKeyInsight from './steps/step-key-insight'
import StepStrategy from './steps/step-strategy'
import StepCreative from './steps/step-creative'
import StepDeliverables from './steps/step-deliverables'
import StepQuantities from './steps/step-quantities'
import StepMediaTargets from './steps/step-media-targets'
import StepInfluencers from './steps/step-influencers'

// ---------- Types ----------

interface ProposalWizardProps {
  documentId: string
  initialData: Record<string, unknown>
}

export interface StepProps {
  data: Partial<WizardStepDataMap[WizardStepId]>
  extractedData: Partial<WizardStepDataMap[WizardStepId]>
  onChange: (data: Partial<WizardStepDataMap[WizardStepId]>) => void
  errors: Record<string, string> | null
}

// ---------- Step component map ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STEP_COMPONENTS: Record<WizardStepId, ComponentType<any>> = {
  brief: StepBrief,
  goals: StepGoals,
  target_audience: StepTargetAudience,
  key_insight: StepKeyInsight,
  strategy: StepStrategy,
  creative: StepCreative,
  deliverables: StepDeliverables,
  quantities: StepQuantities,
  media_targets: StepMediaTargets,
  influencers: StepInfluencers,
}

// ---------- Auto-save debounce hook ----------

function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delayMs: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return useCallback(
    (...args: unknown[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delayMs)
    },
    [delayMs]
  ) as T
}

// ---------- Main component ----------

export default function ProposalWizard({
  documentId,
  initialData,
}: ProposalWizardProps) {
  const router = useRouter()

  // Initialize state from saved wizard state or fresh
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => {
    const base = getInitialWizardState()
    base.documentId = documentId

    // Restore persisted wizard state if available
    if (initialData._wizardState) {
      const saved = initialData._wizardState as WizardState
      return {
        ...saved,
        documentId,
        isDirty: false,
      }
    }

    // Convert extracted data to step data if available
    if (initialData._extractedData) {
      const extracted = initialData._extractedData as Record<string, unknown>
      const stepData = extractedDataToStepData(
        extracted as unknown as Parameters<typeof extractedDataToStepData>[0]
      )
      base.stepData = stepData
      base.extractedData = stepData
    }

    // Set first step as active
    base.stepStatuses = { ...base.stepStatuses, brief: 'active' }

    return base
  })

  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [stepErrors, setStepErrors] = useState<Record<string, string> | null>(
    null
  )
  const [transitionDir, setTransitionDir] = useState<
    'forward' | 'backward' | null
  >(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const prevStepRef = useRef(state.currentStep)

  // ---------- Save logic ----------

  const saveToServer = useCallback(
    async (stateToSave: WizardState) => {
      setIsSaving(true)
      try {
        const payload = {
          _wizardState: {
            ...stateToSave,
            isDirty: false, // persisted state is never dirty
          },
        }

        const res = await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          console.error('[Wizard] Save failed:', res.status)
          return
        }

        dispatch({ type: 'MARK_SAVED', timestamp: new Date().toISOString() })
      } catch (err) {
        console.error('[Wizard] Save error:', err)
      } finally {
        setIsSaving(false)
      }
    },
    [documentId]
  )

  // Debounced auto-save (5 seconds after data changes)
  const debouncedSave = useDebouncedCallback(
    (currentState: unknown) => {
      saveToServer(currentState as WizardState)
    },
    5000
  )

  // Trigger debounced save when state becomes dirty
  useEffect(() => {
    if (state.isDirty) {
      debouncedSave(state)
    }
  }, [state, state.isDirty, debouncedSave])

  // ---------- Step data helpers ----------

  const currentStepMeta = useMemo(
    () => getStepMeta(state.currentStep),
    [state.currentStep]
  )

  const currentStepData = useMemo(
    () => (state.stepData[state.currentStep] || {}) as Partial<WizardStepDataMap[WizardStepId]>,
    [state.stepData, state.currentStep]
  )

  const currentExtractedData = useMemo(
    () => (state.extractedData[state.currentStep] || {}) as Partial<WizardStepDataMap[WizardStepId]>,
    [state.extractedData, state.currentStep]
  )

  const brandName = useMemo(() => {
    const brief = state.stepData.brief
    return brief?.brandName || ''
  }, [state.stepData.brief])

  const isFirstStep = state.currentStep === WIZARD_STEP_ORDER[0]
  const isLastStep =
    state.currentStep === WIZARD_STEP_ORDER[WIZARD_STEP_ORDER.length - 1]

  // ---------- Step transition animation ----------

  function animateTransition(direction: 'forward' | 'backward') {
    setTransitionDir(direction)
    setIsTransitioning(true)

    // After the exit animation, the state will have already changed,
    // then we trigger the enter animation
    setTimeout(() => {
      setIsTransitioning(false)
    }, 200)
  }

  // ---------- Navigation handlers ----------

  const handleStepDataChange = useCallback(
    (data: Partial<WizardStepDataMap[WizardStepId]>) => {
      dispatch({
        type: 'UPDATE_STEP_DATA',
        step: state.currentStep,
        data,
      })
      // Clear errors when user edits
      setStepErrors(null)
    },
    [state.currentStep]
  )

  const handleGoToStep = useCallback(
    (step: WizardStepId) => {
      const currentIndex = getStepIndex(state.currentStep)
      const targetIndex = getStepIndex(step)
      const direction = targetIndex > currentIndex ? 'forward' : 'backward'

      // Save before navigating
      if (state.isDirty) {
        saveToServer(state)
      }

      animateTransition(direction)
      setTimeout(() => {
        dispatch({ type: 'GO_TO_STEP', step })
      }, 100)
    },
    [state, saveToServer]
  )

  const handleContinue = useCallback(() => {
    // Validate current step if required
    if (currentStepMeta.required) {
      const errors = validateStep(state.currentStep, currentStepData)
      if (errors) {
        setStepErrors(errors)
        return
      }
    }

    // Mark as complete and go next
    dispatch({ type: 'MARK_STEP_COMPLETE', step: state.currentStep })

    // Save before navigating
    if (state.isDirty) {
      saveToServer(state)
    }

    animateTransition('forward')
    setTimeout(() => {
      dispatch({ type: 'NEXT_STEP' })
      setStepErrors(null)
    }, 100)
  }, [state, currentStepMeta, currentStepData, saveToServer])

  const handleBack = useCallback(() => {
    if (isFirstStep) return

    // Save before navigating
    if (state.isDirty) {
      saveToServer(state)
    }

    animateTransition('backward')
    setTimeout(() => {
      dispatch({ type: 'PREV_STEP' })
      setStepErrors(null)
    }, 100)
  }, [isFirstStep, state, saveToServer])

  const handleSkip = useCallback(() => {
    if (isLastStep) return

    // Save before navigating
    if (state.isDirty) {
      saveToServer(state)
    }

    animateTransition('forward')
    setTimeout(() => {
      dispatch({ type: 'SKIP_STEP' })
      setStepErrors(null)
    }, 100)
  }, [isLastStep, state, saveToServer])

  const handleExit = useCallback(() => {
    // Save before exiting if there are unsaved changes
    if (state.isDirty) {
      saveToServer(state)
    }
  }, [state, saveToServer])

  const handleGenerate = useCallback(async () => {
    // Validate current (last) step if required
    if (currentStepMeta.required) {
      const errors = validateStep(state.currentStep, currentStepData)
      if (errors) {
        setStepErrors(errors)
        return
      }
    }

    setIsGenerating(true)

    try {
      // Mark last step complete
      dispatch({ type: 'MARK_STEP_COMPLETE', step: state.currentStep })

      // Convert wizard data to proposal data
      const proposalData = wizardDataToProposalData(state.stepData)

      // Save everything: proposal data + wizard state
      const payload = {
        ...proposalData,
        _wizardState: {
          ...state,
          stepStatuses: {
            ...state.stepStatuses,
            [state.currentStep]: 'completed',
          },
          isDirty: false,
        },
        _wizardComplete: true,
      }

      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Failed to save proposal data')
      }

      dispatch({ type: 'MARK_SAVED', timestamp: new Date().toISOString() })

      // Redirect to edit/preview
      router.push(`/edit/${documentId}`)
    } catch (err) {
      console.error('[Wizard] Generate error:', err)
      alert('שגיאה ביצירת ההצעה. נסה שוב.')
    } finally {
      setIsGenerating(false)
    }
  }, [state, currentStepMeta, currentStepData, documentId, router])

  // ---------- Render step component ----------

  const StepComponent = STEP_COMPONENTS[state.currentStep]

  // Track previous step for transition direction
  useEffect(() => {
    prevStepRef.current = state.currentStep
  }, [state.currentStep])

  // ---------- Generating overlay ----------

  if (isGenerating) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background"
      >
        <Spinner size="lg" className="text-primary" />
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">
            יוצר את ההצעה...
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            ממיר את הנתונים למסמך הצעה מקצועי
          </p>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <WizardHeader
        brandName={brandName}
        isDirty={state.isDirty}
        isSaving={isSaving}
        lastSavedAt={state.lastSavedAt}
        onExit={handleExit}
      />

      {/* Progress bar */}
      <WizardProgress
        currentStep={state.currentStep}
        stepStatuses={state.stepStatuses}
        onGoToStep={handleGoToStep}
      />

      {/* Step content area */}
      <main className="flex-1 overflow-y-auto pb-24">
        {/* Step header */}
        <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>שלב {currentStepMeta.order}</span>
              <span>/</span>
              <span>{WIZARD_STEPS.length}</span>
              {!currentStepMeta.required && (
                <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-[10px]">
                  אופציונלי
                </span>
              )}
            </div>
            <h2 className="mt-1 text-2xl font-bold text-foreground">
              {currentStepMeta.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentStepMeta.description}
            </p>
          </div>
        </div>

        {/* Step component with transition */}
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div
            className={cn(
              'transition-all duration-200 ease-in-out',
              isTransitioning && transitionDir === 'forward' && 'translate-x-4 opacity-0',
              isTransitioning && transitionDir === 'backward' && '-translate-x-4 opacity-0',
              !isTransitioning && 'translate-x-0 opacity-100'
            )}
          >
            {StepComponent && (
              <StepComponent
                data={currentStepData}
                extractedData={currentExtractedData}
                onChange={handleStepDataChange}
                errors={stepErrors}
              />
            )}
          </div>
        </div>
      </main>

      {/* Bottom navigation */}
      <WizardNavigation
        currentStep={state.currentStep}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        isRequired={currentStepMeta.required}
        onBack={handleBack}
        onSkip={handleSkip}
        onContinue={handleContinue}
        onGenerate={handleGenerate}
      />
    </div>
  )
}
