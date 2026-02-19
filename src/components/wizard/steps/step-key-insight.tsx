'use client'

import React, { useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { KeyInsightStepData } from '@/types/wizard'

interface StepKeyInsightProps {
  data: Partial<KeyInsightStepData>
  extractedData: Partial<KeyInsightStepData>
  onChange: (data: Partial<KeyInsightStepData>) => void
  errors: Record<string, string> | null
}

export default function StepKeyInsight({
  data,
  extractedData,
  onChange,
  errors,
}: StepKeyInsightProps) {
  const keyInsight = data.keyInsight ?? ''
  const insightSource = data.insightSource ?? ''
  const insightData = data.insightData ?? ''

  const hasExtractedInsight =
    extractedData?.keyInsight && extractedData.keyInsight !== keyInsight

  const applyExtracted = useCallback(() => {
    if (!extractedData) return
    onChange({
      ...data,
      keyInsight: extractedData.keyInsight || keyInsight,
      insightSource: extractedData.insightSource || insightSource,
      insightData: extractedData.insightData || insightData,
    })
  }, [extractedData, data, onChange, keyInsight, insightSource, insightData])

  return (
    <div dir="rtl" className="space-y-6">
      {/* Extracted insight banner */}
      {hasExtractedInsight && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-amber-800">
              תובנה שחולצה מהבריף:
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-amber-700 leading-relaxed">
              {extractedData.keyInsight}
            </p>
            {extractedData.insightSource && (
              <p className="text-xs text-amber-600">
                <span className="font-semibold">מקור:</span> {extractedData.insightSource}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={applyExtracted}
              className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100"
            >
              החל תובנה מחולצת
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Key Insight */}
      <div className="space-y-2">
        <Textarea
          label="התובנה המרכזית"
          placeholder="מהי התובנה שמבססת את כל הפעילות?"
          value={keyInsight}
          onChange={(e) => onChange({ ...data, keyInsight: e.target.value })}
          error={errors?.keyInsight}
          className="min-h-[160px] text-base"
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          למה נכון למותג לעשות את מה שאנחנו הולכים להציע? לאן אנחנו רוצים להביא את הקהל?
        </p>
      </div>

      {/* Insight Source */}
      <Input
        label="מקור התובנה"
        placeholder="מחקר שוק, נתוני Google Trends, סקר לקוחות..."
        value={insightSource}
        onChange={(e) => onChange({ ...data, insightSource: e.target.value })}
        error={errors?.insightSource}
        hint="ציינו מהו המקור שממנו נגזרה התובנה"
      />

      {/* Supporting Data */}
      <Textarea
        label="נתונים תומכים (אופציונלי)"
        placeholder="נתונים, מספרים ומחקרים שתומכים בתובנה..."
        value={insightData}
        onChange={(e) => onChange({ ...data, insightData: e.target.value })}
        error={errors?.insightData}
        className="min-h-[100px]"
      />
    </div>
  )
}
