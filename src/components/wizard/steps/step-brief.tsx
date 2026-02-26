'use client'

import React, { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { BriefStepData } from '@/types/wizard'

interface StepBriefProps {
  data: Partial<BriefStepData>
  extractedData: Partial<BriefStepData>
  onChange: (data: Partial<BriefStepData>) => void
  errors: Record<string, string> | null
}

export default function StepBrief({ data, extractedData, onChange, errors }: StepBriefProps) {
  const brandName = data.brandName ?? ''
  const brandBrief = data.brandBrief ?? ''
  const brandPainPoints = data.brandPainPoints ?? []
  const brandObjective = data.brandObjective ?? ''
  const successMetrics = data.successMetrics ?? []
  const clientSpecificRequests = data.clientSpecificRequests ?? []

  // Check if extractedData differs from current data
  const hasExtractedDiff =
    extractedData &&
    (
      (extractedData.brandName && extractedData.brandName !== brandName) ||
      (extractedData.brandBrief && extractedData.brandBrief !== brandBrief) ||
      (extractedData.brandObjective && extractedData.brandObjective !== brandObjective) ||
      (extractedData.brandPainPoints && extractedData.brandPainPoints.length > 0 &&
        JSON.stringify(extractedData.brandPainPoints) !== JSON.stringify(brandPainPoints))
    )

  const applyExtracted = useCallback(() => {
    if (!extractedData) return
    onChange({
      ...data,
      brandName: extractedData.brandName || brandName,
      brandBrief: extractedData.brandBrief || brandBrief,
      brandPainPoints: extractedData.brandPainPoints?.length
        ? extractedData.brandPainPoints
        : brandPainPoints,
      brandObjective: extractedData.brandObjective || brandObjective,
    })
  }, [extractedData, data, onChange, brandName, brandBrief, brandPainPoints, brandObjective])

  const addPainPoint = useCallback(() => {
    onChange({
      ...data,
      brandPainPoints: [...brandPainPoints, ''],
    })
  }, [data, onChange, brandPainPoints])

  const removePainPoint = useCallback(
    (index: number) => {
      const updated = brandPainPoints.filter((_, i) => i !== index)
      onChange({ ...data, brandPainPoints: updated })
    },
    [data, onChange, brandPainPoints]
  )

  const updatePainPoint = useCallback(
    (index: number, value: string) => {
      const updated = [...brandPainPoints]
      updated[index] = value
      onChange({ ...data, brandPainPoints: updated })
    },
    [data, onChange, brandPainPoints]
  )

  const addMetric = useCallback(() => {
    onChange({ ...data, successMetrics: [...successMetrics, ''] })
  }, [data, onChange, successMetrics])

  const removeMetric = useCallback((index: number) => {
    onChange({ ...data, successMetrics: successMetrics.filter((_, i) => i !== index) })
  }, [data, onChange, successMetrics])

  const updateMetric = useCallback((index: number, value: string) => {
    const updated = [...successMetrics]
    updated[index] = value
    onChange({ ...data, successMetrics: updated })
  }, [data, onChange, successMetrics])

  return (
    <div dir="rtl" className="space-y-10">
      {/* Extracted data banner */}
      {hasExtractedDiff && (
        <div className="relative rounded-2xl border border-wizard-border bg-brand-pearl/50 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 bottom-0 w-1 bg-gradient-to-b from-accent to-brand-primary" />
          <h3 className="text-sm font-heebo font-bold text-wizard-text-primary mb-3">
            המערכת חילצה את המידע הבא מהבריף
          </h3>
          <div className="space-y-1.5">
            {extractedData.brandName && extractedData.brandName !== brandName && (
              <p className="text-[13px] text-wizard-text-secondary">
                <span className="font-heebo font-semibold">שם מותג</span> {extractedData.brandName}
              </p>
            )}
            {extractedData.brandBrief && extractedData.brandBrief !== brandBrief && (
              <p className="text-[13px] text-wizard-text-secondary">
                <span className="font-heebo font-semibold">רקע</span>{' '}
                {extractedData.brandBrief.length > 120
                  ? extractedData.brandBrief.slice(0, 120) + '...'
                  : extractedData.brandBrief}
              </p>
            )}
            {extractedData.brandObjective && extractedData.brandObjective !== brandObjective && (
              <p className="text-[13px] text-wizard-text-secondary">
                <span className="font-heebo font-semibold">מטרה</span> {extractedData.brandObjective}
              </p>
            )}
            {extractedData.brandPainPoints &&
              extractedData.brandPainPoints.length > 0 &&
              JSON.stringify(extractedData.brandPainPoints) !== JSON.stringify(brandPainPoints) && (
                <p className="text-[13px] text-wizard-text-secondary">
                  <span className="font-heebo font-semibold">נקודות כאב</span>{' '}
                  {extractedData.brandPainPoints.map((p: unknown) => typeof p === 'string' ? p : ((p as {title?: string})?.title || '')).join(', ')}
                </p>
              )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={applyExtracted}
            className="mt-3 border-accent/30 text-accent hover:bg-accent/5"
          >
            החל מידע מחולץ
          </Button>
        </div>
      )}

      {/* Brand Name */}
      <Input
        label="שם המותג"
        placeholder="הזינו את שם המותג..."
        value={brandName}
        onChange={(e) => onChange({ ...data, brandName: e.target.value })}
        error={errors?.brandName}
      />

      {/* Brand Brief */}
      <Textarea
        label="רקע ובריף"
        placeholder="תארו את רקע המותג והבריף שהתקבל..."
        value={brandBrief}
        onChange={(e) => onChange({ ...data, brandBrief: e.target.value })}
        error={errors?.brandBrief}
        className="min-h-[150px]"
      />

      {/* Pain Points */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            נקודות כאב של המותג
          </label>
          <Button variant="ghost" size="sm" onClick={addPainPoint} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף נקודת כאב</span>
          </Button>
        </div>

        {errors?.brandPainPoints && (
          <p className="text-xs text-destructive">{errors.brandPainPoints}</p>
        )}

        {brandPainPoints.length === 0 && (
          <p className="text-sm text-wizard-text-tertiary">
            לא נוספו נקודות כאב. לחצו על &quot;הוסף נקודת כאב&quot; להתחיל.
          </p>
        )}

        {brandPainPoints.map((point, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder={`נקודת כאב ${index + 1}`}
              value={typeof point === 'string' ? point : (point as {title?: string})?.title || ''}
              onChange={(e) => updatePainPoint(index, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removePainPoint(index)}
              className="shrink-0 text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </div>
        ))}
      </div>

      {/* Brand Objective */}
      <Input
        label="מטרת המותג"
        placeholder="מהי המטרה העיקרית של הפנייה?"
        value={brandObjective}
        onChange={(e) => onChange({ ...data, brandObjective: e.target.value })}
        error={errors?.brandObjective}
      />

      {/* Success Metrics from brief */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            מדדי הצלחה (מהבריף)
          </label>
          <Button variant="ghost" size="sm" onClick={addMetric} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף מדד</span>
          </Button>
        </div>

        {successMetrics.length === 0 && (
          <p className="text-sm text-wizard-text-tertiary">
            לא נמצאו מדדי הצלחה בבריף. הוסיפו ידנית אם יש.
          </p>
        )}

        {successMetrics.map((metric, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder={`מדד הצלחה ${index + 1}`}
              value={metric}
              onChange={(e) => updateMetric(index, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeMetric(index)}
              className="shrink-0 text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </div>
        ))}
      </div>

      {/* Client Specific Requests */}
      {clientSpecificRequests.length > 0 && (
        <div className="rounded-2xl border border-wizard-border bg-brand-pearl/40 p-4">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em] mb-2">
            דרישות ספציפיות מהלקוח
          </label>
          <ul className="space-y-1">
            {clientSpecificRequests.map((req, i) => (
              <li key={i} className="text-[13px] text-wizard-text-secondary flex items-start gap-2">
                <span className="text-accent mt-0.5">•</span>
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
