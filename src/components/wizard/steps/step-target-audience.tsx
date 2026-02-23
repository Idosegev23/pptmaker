'use client'

import React, { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TargetAudienceStepData } from '@/types/wizard'

interface StepTargetAudienceProps {
  data: Partial<TargetAudienceStepData>
  extractedData: Partial<TargetAudienceStepData>
  onChange: (data: Partial<TargetAudienceStepData>) => void
  errors: Record<string, string> | null
}

const GENDER_OPTIONS = [
  { value: '', label: 'בחרו מגדר...' },
  { value: 'נשים', label: 'נשים' },
  { value: 'גברים', label: 'גברים' },
  { value: 'שניהם', label: 'שניהם' },
]

export default function StepTargetAudience({
  data,
  extractedData,
  onChange,
  errors,
}: StepTargetAudienceProps) {
  const targetGender = data.targetGender ?? ''
  const targetAgeRange = data.targetAgeRange ?? ''
  const targetDescription = data.targetDescription ?? ''
  const targetBehavior = data.targetBehavior ?? ''
  const targetInsights = data.targetInsights ?? []
  const targetSecondary = data.targetSecondary ?? null

  const [showSecondary, setShowSecondary] = useState(!!targetSecondary)

  const addInsight = useCallback(() => {
    onChange({
      ...data,
      targetInsights: [...targetInsights, ''],
    })
  }, [data, onChange, targetInsights])

  const removeInsight = useCallback(
    (index: number) => {
      const updated = targetInsights.filter((_, i) => i !== index)
      onChange({ ...data, targetInsights: updated })
    },
    [data, onChange, targetInsights]
  )

  const updateInsight = useCallback(
    (index: number, value: string) => {
      const updated = [...targetInsights]
      updated[index] = value
      onChange({ ...data, targetInsights: updated })
    },
    [data, onChange, targetInsights]
  )

  const toggleSecondary = useCallback(() => {
    if (showSecondary) {
      setShowSecondary(false)
      onChange({ ...data, targetSecondary: undefined })
    } else {
      setShowSecondary(true)
      onChange({
        ...data,
        targetSecondary: targetSecondary ?? {
          gender: '',
          ageRange: '',
          description: '',
        },
      })
    }
  }, [showSecondary, data, onChange, targetSecondary])

  const updateSecondaryField = useCallback(
    (field: 'gender' | 'ageRange' | 'description', value: string) => {
      onChange({
        ...data,
        targetSecondary: {
          gender: targetSecondary?.gender ?? '',
          ageRange: targetSecondary?.ageRange ?? '',
          description: targetSecondary?.description ?? '',
          [field]: value,
        },
      })
    },
    [data, onChange, targetSecondary]
  )

  return (
    <div dir="rtl" className="space-y-6">
      {/* Primary audience */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">קהל יעד ראשי</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="מגדר"
            options={GENDER_OPTIONS}
            value={targetGender}
            onChange={(e) => onChange({ ...data, targetGender: e.target.value })}
            error={errors?.targetGender}
          />

          <Input
            label="טווח גילאים"
            placeholder="לדוגמה: 25-34"
            value={targetAgeRange}
            onChange={(e) => onChange({ ...data, targetAgeRange: e.target.value })}
            error={errors?.targetAgeRange}
          />
        </div>

        <Textarea
          label="תיאור קהל היעד"
          placeholder="תארו את קהל היעד - סגנון חיים, תחומי עניין, ערכים..."
          value={targetDescription}
          onChange={(e) => onChange({ ...data, targetDescription: e.target.value })}
          error={errors?.targetDescription}
          className="min-h-[120px]"
        />

        <Textarea
          label="התנהגות צרכנית"
          placeholder="כיצד הקהל מתנהג ברשתות? מה הם צורכים? איך הם מקבלים החלטות?"
          value={targetBehavior}
          onChange={(e) => onChange({ ...data, targetBehavior: e.target.value })}
          error={errors?.targetBehavior}
          className="min-h-[100px]"
        />

        {/* Insights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground">
              תובנות על קהל היעד
            </label>
            <Button variant="ghost" size="sm" onClick={addInsight}>
              + הוסף תובנה
            </Button>
          </div>

          {errors?.targetInsights && (
            <p className="text-xs text-destructive">{errors.targetInsights}</p>
          )}

          {targetInsights.length === 0 && (
            <p className="text-sm text-muted-foreground">
              לא נוספו תובנות. לחצו על &quot;הוסף תובנה&quot; להתחיל.
            </p>
          )}

          {targetInsights.map((insight, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder={`תובנה ${index + 1}`}
                value={typeof insight === 'string' ? insight : (insight as {title?: string; name?: string})?.title || (insight as {name?: string})?.name || ''}
                onChange={(e) => updateInsight(index, e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeInsight(index)}
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
      </div>

      {/* Secondary audience */}
      <div className="border-t pt-4">
        <button
          type="button"
          onClick={toggleSecondary}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('transition-transform duration-200', showSecondary && 'rotate-90')}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          קהל יעד משני (אופציונלי)
        </button>

        {showSecondary && (
          <div className="mt-4 space-y-4 rounded-lg border border-input bg-muted/20 p-4">
            <Select
              label="מגדר"
              options={GENDER_OPTIONS}
              value={targetSecondary?.gender ?? ''}
              onChange={(e) => updateSecondaryField('gender', e.target.value)}
            />

            <Input
              label="טווח גילאים"
              placeholder="לדוגמה: 18-24"
              value={targetSecondary?.ageRange ?? ''}
              onChange={(e) => updateSecondaryField('ageRange', e.target.value)}
            />

            <Textarea
              label="תיאור"
              placeholder="תארו את קהל היעד המשני..."
              value={targetSecondary?.description ?? ''}
              onChange={(e) => updateSecondaryField('description', e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        )}
      </div>
    </div>
  )
}
