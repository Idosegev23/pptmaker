'use client'

import React, { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { StrategyStepData } from '@/types/wizard'

interface StepStrategyProps {
  data: Partial<StrategyStepData>
  extractedData: Partial<StrategyStepData>
  onChange: (data: Partial<StrategyStepData>) => void
  errors: Record<string, string> | null
  briefContext?: string
}

export default function StepStrategy({ data, extractedData, onChange, errors, briefContext }: StepStrategyProps) {
  const strategyHeadline = data.strategyHeadline ?? ''
  const strategyDescription = data.strategyDescription ?? ''
  const strategyPillars = data.strategyPillars ?? []
  const strategyFlow = data.strategyFlow ?? { steps: [] }
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false)

  const handleGenerateFlow = useCallback(async () => {
    setIsGeneratingFlow(true)
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_strategy_flow',
          strategyHeadline,
          strategyPillars: strategyPillars.map(p => `${p.title}: ${p.description}`).join(', '),
          briefContext: briefContext || '',
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.steps?.length) {
          onChange({ ...data, strategyFlow: { steps: result.steps } })
        }
      }
    } catch {
      // Silent fail
    } finally {
      setIsGeneratingFlow(false)
    }
  }, [strategyHeadline, strategyPillars, briefContext, data, onChange])

  const addPillar = useCallback(() => {
    onChange({
      ...data,
      strategyPillars: [...strategyPillars, { title: '', description: '' }],
    })
  }, [data, onChange, strategyPillars])

  const removePillar = useCallback(
    (index: number) => {
      const updated = strategyPillars.filter((_, i) => i !== index)
      onChange({ ...data, strategyPillars: updated })
    },
    [data, onChange, strategyPillars]
  )

  const updatePillar = useCallback(
    (index: number, field: 'title' | 'description', value: string) => {
      const updated = [...strategyPillars]
      updated[index] = { ...updated[index], [field]: value }
      onChange({ ...data, strategyPillars: updated })
    },
    [data, onChange, strategyPillars]
  )

  return (
    <div dir="rtl" className="space-y-6">
      {/* Strategy Headline */}
      <div className="space-y-2">
        <Input
          label="כותרת האסטרטגיה"
          placeholder="משפט אסטרטגי שמגדיר את כיוון הפעילות"
          value={strategyHeadline}
          onChange={(e) => onChange({ ...data, strategyHeadline: e.target.value })}
          error={errors?.strategyHeadline}
        />
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground mb-1 font-medium">דוגמאות:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
            <li>נייצר מהלך מודעות רחב שיפעל ב-2 שלבים</li>
            <li>נרים קמפיין שיגע בכמה עולמות תוכן</li>
            <li>ניצור נוכחות דיגיטלית שמובילה מחשיפה להמרה</li>
          </ul>
        </div>
      </div>

      {/* Strategy Description */}
      <Textarea
        label="תיאור האסטרטגיה (אופציונלי)"
        placeholder="פרטו את הגישה האסטרטגית, ההיגיון ותהליך העבודה..."
        value={strategyDescription}
        onChange={(e) => onChange({ ...data, strategyDescription: e.target.value })}
        error={errors?.strategyDescription}
        className="min-h-[120px]"
      />

      {/* Strategy Pillars */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-foreground">
            עמודי תווך אסטרטגיים
          </label>
          <Button variant="ghost" size="sm" onClick={addPillar}>
            + הוסף עמוד תווך
          </Button>
        </div>

        {errors?.strategyPillars && (
          <p className="text-xs text-destructive">{errors.strategyPillars}</p>
        )}

        {strategyPillars.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-input p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              לא הוספו עמודי תווך עדיין
            </p>
            <p className="text-xs text-muted-foreground">
              עמודי תווך הם הנדבכים המרכזיים של האסטרטגיה - כל אחד מהם נושא חלק ממהלך הפעילות
            </p>
          </div>
        )}

        {strategyPillars.map((pillar, index) => (
          <div
            key={index}
            className="rounded-lg border border-input bg-muted/20 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                עמוד תווך {index + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removePillar(index)}
                className="text-destructive hover:bg-destructive/10"
              >
                הסר
              </Button>
            </div>

            <Input
              placeholder="כותרת עמוד התווך"
              value={pillar.title}
              onChange={(e) => updatePillar(index, 'title', e.target.value)}
            />

            <Textarea
              placeholder="תיאור עמוד התווך - מה כולל, איך מתבצע, מה המטרה..."
              value={pillar.description}
              onChange={(e) => updatePillar(index, 'description', e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        ))}
      </div>

      {/* Strategy Flow Visualization */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-foreground">
            תהליך עבודה (Flow)
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateFlow}
            disabled={isGeneratingFlow || !strategyHeadline}
            className="text-primary border-primary/30 hover:bg-primary/5"
          >
            {isGeneratingFlow ? (
              <>
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin ml-1.5" />
                מייצר Flow...
              </>
            ) : (
              'ייצר Flow עם AI'
            )}
          </Button>
        </div>

        {strategyFlow.steps.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 px-1">
            {strategyFlow.steps.map((step, index) => (
              <React.Fragment key={index}>
                <div className="flex-shrink-0 w-40 rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                  <div className="text-2xl mb-1">{step.icon || '🔹'}</div>
                  <p className="text-sm font-bold text-foreground">{step.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">{step.description}</p>
                </div>
                {index < strategyFlow.steps.length - 1 && (
                  <svg className="w-5 h-5 text-primary/30 flex-shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            לחצו &quot;ייצר Flow עם AI&quot; כדי ליצור תהליך עבודה ויזואלי מהאסטרטגיה
          </p>
        )}
      </div>
    </div>
  )
}
