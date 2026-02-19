'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WizardHeaderProps {
  brandName: string
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: string | null
  onExit: () => void
}

function formatSavedTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function WizardHeader({
  brandName,
  isDirty,
  isSaving,
  lastSavedAt,
  onExit,
}: WizardHeaderProps) {
  const router = useRouter()

  function handleExit() {
    if (isDirty) {
      const confirmed = window.confirm(
        'יש שינויים שלא נשמרו. האם אתה בטוח שברצונך לצאת?'
      )
      if (!confirmed) return
    }
    onExit()
    router.push('/dashboard')
  }

  function getSaveStatusText(): string {
    if (isSaving) return 'שומר...'
    if (isDirty) return 'שינויים לא שמורים'
    return 'נשמר'
  }

  function getSaveStatusColor(): string {
    if (isSaving) return 'text-amber-500'
    if (isDirty) return 'text-orange-500'
    return 'text-green-500'
  }

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      {/* Right side: Brand name */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <svg
            className="h-4 w-4 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-bold leading-tight">
            {brandName || 'הצעה חדשה'}
          </h1>
          <span className="text-xs text-muted-foreground">
            אשף יצירת הצעה
          </span>
        </div>
      </div>

      {/* Center: Save status */}
      <div className="flex items-center gap-2">
        {/* Save indicator dot */}
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full transition-colors',
            isSaving && 'animate-pulse bg-amber-500',
            !isSaving && isDirty && 'bg-orange-500',
            !isSaving && !isDirty && 'bg-green-500'
          )}
        />
        <span className={cn('text-xs font-medium', getSaveStatusColor())}>
          {getSaveStatusText()}
        </span>
        {lastSavedAt && !isDirty && !isSaving && (
          <span className="text-xs text-muted-foreground">
            ({formatSavedTime(lastSavedAt)})
          </span>
        )}
      </div>

      {/* Left side: Exit button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExit}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <span>יציאה</span>
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </Button>
    </header>
  )
}
