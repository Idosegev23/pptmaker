'use client'

import { useRef, useEffect } from 'react'
import type { WizardStepId, StepStatus } from '@/types/wizard'
import { WIZARD_STEPS } from './wizard-constants'
import { cn } from '@/lib/utils'

interface WizardProgressProps {
  currentStep: WizardStepId
  stepStatuses: Record<WizardStepId, StepStatus>
  onGoToStep: (step: WizardStepId) => void
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function WizardProgress({
  currentStep,
  stepStatuses,
  onGoToStep,
}: WizardProgressProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Scroll to active step when it changes
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current
      const activeEl = activeRef.current
      const containerRect = container.getBoundingClientRect()
      const activeRect = activeEl.getBoundingClientRect()

      if (
        activeRect.right > containerRect.right ||
        activeRect.left < containerRect.left
      ) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })
      }
    }
  }, [currentStep])

  function getStepStatus(stepId: WizardStepId): StepStatus {
    if (stepId === currentStep) return 'active'
    return stepStatuses[stepId]
  }

  function isClickable(status: StepStatus): boolean {
    return status === 'completed' || status === 'skipped' || status === 'active'
  }

  function handleStepClick(stepId: WizardStepId) {
    const status = getStepStatus(stepId)
    if (isClickable(status)) {
      onGoToStep(stepId)
    }
  }

  // Check if the step AFTER index is completed (for connecting line fill)
  function isLineCompleted(index: number): boolean {
    if (index >= WIZARD_STEPS.length - 1) return false
    const currentStepStatus = getStepStatus(WIZARD_STEPS[index].id)
    return currentStepStatus === 'completed' || currentStepStatus === 'skipped'
  }

  return (
    <div dir="rtl" className="border-b border-wizard-border bg-white px-4 py-5 md:px-8">
      <div
        ref={scrollRef}
        className="mx-auto flex max-w-3xl items-start justify-between overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-0 pb-6"
      >
        {WIZARD_STEPS.map((step, index) => {
          const status = getStepStatus(step.id)
          const clickable = isClickable(status)
          const isActive = step.id === currentStep
          const lineCompleted = isLineCompleted(index)

          return (
            <div key={step.id} className="flex items-start snap-center shrink-0">
              {/* Step node */}
              <div className="relative flex flex-col items-center">
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => handleStepClick(step.id)}
                  disabled={!clickable}
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-rubik font-bold',
                    'transition-all duration-300',
                    // Active
                    isActive && 'ring-2 ring-accent ring-offset-2 ring-offset-white text-accent bg-accent/5',
                    // Completed
                    !isActive && status === 'completed' && 'bg-brand-primary text-white cursor-pointer hover:shadow-wizard-md',
                    // Skipped
                    !isActive && status === 'skipped' && 'border-2 border-dashed border-wizard-text-tertiary bg-transparent text-wizard-text-tertiary cursor-pointer',
                    // Pending
                    status === 'pending' && 'bg-brand-mist text-wizard-text-tertiary cursor-not-allowed',
                  )}
                  title={step.label}
                  aria-label={`${step.label} - ${getStatusLabel(status)}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {status === 'completed' && !isActive ? (
                    <CheckIcon className="text-white" />
                  ) : (
                    <span>{step.order}</span>
                  )}
                  {/* Active ping */}
                  {isActive && (
                    <span className="absolute -inset-1 rounded-full animate-ping bg-accent/10 pointer-events-none" />
                  )}
                </button>

                {/* Label below circle */}
                <span
                  className={cn(
                    'absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-heebo',
                    isActive ? 'font-bold text-accent' : 'font-medium text-wizard-text-tertiary'
                  )}
                >
                  {step.labelShort}
                </span>
              </div>

              {/* Connecting line between steps */}
              {index < WIZARD_STEPS.length - 1 && (
                <div className="relative mx-1 mt-4 h-[2px] w-6 md:w-10 shrink-0">
                  {/* Background track */}
                  <div className="absolute inset-0 rounded-full bg-brand-mist" />
                  {/* Fill */}
                  <div
                    className={cn(
                      'absolute inset-y-0 right-0 rounded-full transition-all duration-500',
                      lineCompleted
                        ? 'w-full bg-gradient-to-l from-accent to-brand-primary'
                        : 'w-0'
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getStatusLabel(status: StepStatus): string {
  switch (status) {
    case 'active':
      return 'שלב נוכחי'
    case 'completed':
      return 'הושלם'
    case 'skipped':
      return 'דולג'
    case 'pending':
      return 'ממתין'
  }
}
