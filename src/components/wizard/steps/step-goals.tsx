'use client'

import React, { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GoalsStepData } from '@/types/wizard'

interface StepGoalsProps {
  data: Partial<GoalsStepData>
  extractedData: Partial<GoalsStepData>
  onChange: (data: Partial<GoalsStepData>) => void
  errors: Record<string, string> | null
}

const PREDEFINED_GOALS = [
  'מודעות',
  'חינוך שוק',
  'נוכחות דיגיטלית',
  'נחשקות ו-FOMO',
  'הנעה למכר',
  'השקת מוצר',
  'חיזוק נאמנות',
]

export default function StepGoals({ data, extractedData, onChange, errors }: StepGoalsProps) {
  const goals = data.goals ?? []
  const customGoals = data.customGoals ?? []
  const [newCustomGoal, setNewCustomGoal] = useState('')

  const isGoalSelected = useCallback(
    (title: string) => goals.some((g) => g.title === title),
    [goals]
  )

  const toggleGoal = useCallback(
    (title: string) => {
      if (isGoalSelected(title)) {
        onChange({
          ...data,
          goals: goals.filter((g) => g.title !== title),
        })
      } else {
        onChange({
          ...data,
          goals: [...goals, { title, description: '' }],
        })
      }
    },
    [data, onChange, goals, isGoalSelected]
  )

  const updateGoalDescription = useCallback(
    (title: string, description: string) => {
      const updated = goals.map((g) => (g.title === title ? { ...g, description } : g))
      onChange({ ...data, goals: updated })
    },
    [data, onChange, goals]
  )

  const addCustomGoal = useCallback(() => {
    const trimmed = newCustomGoal.trim()
    if (!trimmed) return
    onChange({
      ...data,
      customGoals: [...customGoals, trimmed],
      goals: [...goals, { title: trimmed, description: '' }],
    })
    setNewCustomGoal('')
  }, [data, onChange, customGoals, goals, newCustomGoal])

  const removeCustomGoal = useCallback(
    (goalText: string) => {
      onChange({
        ...data,
        customGoals: customGoals.filter((g) => g !== goalText),
        goals: goals.filter((g) => g.title !== goalText),
      })
    },
    [data, onChange, customGoals, goals]
  )

  // All goal titles (predefined + custom)
  const allGoalTitles = [...PREDEFINED_GOALS, ...customGoals.filter((cg) => !PREDEFINED_GOALS.includes(cg))]

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          מטרות הקמפיין
        </label>
        <p className="text-sm text-muted-foreground mb-4">
          בחרו את המטרות הרלוונטיות לקמפיין. ניתן לבחור מספר מטרות ולהוסיף תיאור לכל אחת.
        </p>

        {errors?.goals && (
          <p className="text-xs text-destructive mb-3">{errors.goals}</p>
        )}

        {/* Goal chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {PREDEFINED_GOALS.map((goal) => {
            const selected = isGoalSelected(goal)
            return (
              <button
                key={goal}
                type="button"
                onClick={() => toggleGoal(goal)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border',
                  selected
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                    : 'bg-background text-foreground border-input hover:border-primary/50 hover:bg-muted'
                )}
              >
                {selected && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="inline-block ml-1 -mt-0.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {goal}
              </button>
            )
          })}

          {/* Custom goal chips */}
          {customGoals
            .filter((cg) => !PREDEFINED_GOALS.includes(cg))
            .map((goal) => {
              const selected = isGoalSelected(goal)
              return (
                <div key={goal} className="relative group">
                  <button
                    type="button"
                    onClick={() => toggleGoal(goal)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border',
                      selected
                        ? 'bg-accent text-accent-foreground border-accent shadow-md'
                        : 'bg-background text-foreground border-input hover:border-accent/50 hover:bg-muted'
                    )}
                  >
                    {selected && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="inline-block ml-1 -mt-0.5"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {goal}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCustomGoal(goal)}
                    className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                </div>
              )
            })}
        </div>

        {/* Selected goals with description textareas */}
        {goals.length > 0 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-foreground">
              פירוט מטרות נבחרות
            </label>
            {goals.map((goal) => (
              <div
                key={goal.title}
                className="rounded-lg border border-input bg-muted/30 p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{goal.title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleGoal(goal.title)}
                    className="text-muted-foreground hover:text-destructive text-xs"
                  >
                    הסר
                  </Button>
                </div>
                <Textarea
                  placeholder={`פרטו את מטרת ה${goal.title}...`}
                  value={goal.description}
                  onChange={(e) => updateGoalDescription(goal.title, e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add custom goal */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">הוספת מטרה מותאמת אישית</label>
        <div className="flex gap-2">
          <Input
            placeholder="שם המטרה..."
            value={newCustomGoal}
            onChange={(e) => setNewCustomGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomGoal()
              }
            }}
          />
          <Button
            variant="secondary"
            onClick={addCustomGoal}
            disabled={!newCustomGoal.trim()}
            className="shrink-0"
          >
            הוסף
          </Button>
        </div>
      </div>
    </div>
  )
}
