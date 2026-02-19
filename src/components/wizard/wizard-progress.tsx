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
      className={cn('h-3 w-3', className)}
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

      // Check if active element is outside visible area
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

  return (
    <div dir="rtl" className="border-b border-border bg-muted/30 px-4 py-3">
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {WIZARD_STEPS.map((step, index) => {
          const status = getStepStatus(step.id)
          const clickable = isClickable(status)
          const isActive = step.id === currentStep

          return (
            <div key={step.id} className="flex items-center gap-1.5 shrink-0">
              {/* Connector line (not before the first step) */}
              {index > 0 && (
                <div
                  className={cn(
                    'h-px w-4 transition-colors',
                    status === 'completed' || status === 'active'
                      ? 'bg-primary/50'
                      : 'bg-border'
                  )}
                />
              )}

              {/* Step pill */}
              <button
                ref={isActive ? activeRef : undefined}
                type="button"
                onClick={() => handleStepClick(step.id)}
                disabled={!clickable}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  // Active (current step)
                  isActive &&
                    'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20',
                  // Completed
                  !isActive &&
                    status === 'completed' &&
                    'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer dark:bg-green-900/30 dark:text-green-400',
                  // Skipped
                  !isActive &&
                    status === 'skipped' &&
                    'border-2 border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground/60 cursor-pointer bg-transparent',
                  // Pending
                  status === 'pending' &&
                    'bg-muted text-muted-foreground/50 cursor-not-allowed'
                )}
                title={step.label}
                aria-label={`${step.label} - ${getStatusLabel(status)}`}
                aria-current={isActive ? 'step' : undefined}
              >
                {/* Step number or check icon */}
                {status === 'completed' && !isActive ? (
                  <CheckIcon
                    className={cn(
                      'text-green-600 dark:text-green-400'
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none',
                      isActive && 'bg-primary-foreground/20 text-primary-foreground',
                      !isActive &&
                        status === 'completed' &&
                        'bg-green-200 text-green-700 dark:bg-green-800 dark:text-green-300',
                      !isActive &&
                        status === 'skipped' &&
                        'bg-muted-foreground/10 text-muted-foreground',
                      status === 'pending' &&
                        'bg-muted-foreground/10 text-muted-foreground/40'
                    )}
                  >
                    {step.order}
                  </span>
                )}

                {/* Step label */}
                <span className="whitespace-nowrap">{step.labelShort}</span>
              </button>
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
