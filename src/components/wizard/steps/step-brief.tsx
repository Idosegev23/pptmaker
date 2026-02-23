'use client'

import React, { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  return (
    <div dir="rtl" className="space-y-6">
      {/* Extracted data banner */}
      {hasExtractedDiff && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-amber-800">
              המערכת חילצה את המידע הבא מהבריף:
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {extractedData.brandName && extractedData.brandName !== brandName && (
              <p className="text-sm text-amber-700">
                <span className="font-semibold">שם מותג:</span> {extractedData.brandName}
              </p>
            )}
            {extractedData.brandBrief && extractedData.brandBrief !== brandBrief && (
              <p className="text-sm text-amber-700">
                <span className="font-semibold">רקע:</span>{' '}
                {extractedData.brandBrief.length > 120
                  ? extractedData.brandBrief.slice(0, 120) + '...'
                  : extractedData.brandBrief}
              </p>
            )}
            {extractedData.brandObjective && extractedData.brandObjective !== brandObjective && (
              <p className="text-sm text-amber-700">
                <span className="font-semibold">מטרה:</span> {extractedData.brandObjective}
              </p>
            )}
            {extractedData.brandPainPoints &&
              extractedData.brandPainPoints.length > 0 &&
              JSON.stringify(extractedData.brandPainPoints) !== JSON.stringify(brandPainPoints) && (
                <p className="text-sm text-amber-700">
                  <span className="font-semibold">נקודות כאב:</span>{' '}
                  {extractedData.brandPainPoints.map((p: unknown) => typeof p === 'string' ? p : ((p as {title?: string})?.title || '')).join(', ')}
                </p>
              )}
            <Button
              variant="outline"
              size="sm"
              onClick={applyExtracted}
              className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100"
            >
              החל מידע מחולץ
            </Button>
          </CardContent>
        </Card>
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
          <label className="block text-sm font-medium text-foreground">
            נקודות כאב של המותג
          </label>
          <Button variant="ghost" size="sm" onClick={addPainPoint}>
            + הוסף נקודת כאב
          </Button>
        </div>

        {errors?.brandPainPoints && (
          <p className="text-xs text-destructive">{errors.brandPainPoints}</p>
        )}

        {brandPainPoints.length === 0 && (
          <p className="text-sm text-muted-foreground">
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
              className="shrink-0 text-destructive hover:bg-destructive/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
    </div>
  )
}
