'use client'

import React, { useCallback, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { QuantitiesStepData } from '@/types/wizard'

interface StepQuantitiesProps {
  data: Partial<QuantitiesStepData>
  extractedData: Partial<QuantitiesStepData>
  onChange: (data: Partial<QuantitiesStepData>) => void
  errors: Record<string, string> | null
}

export default function StepQuantities({
  data,
  extractedData,
  onChange,
  errors,
}: StepQuantitiesProps) {
  const influencerCount = data.influencerCount ?? 0
  const campaignDurationMonths = data.campaignDurationMonths ?? 1
  const contentTypes = data.contentTypes ?? []
  const totalDeliverables = data.totalDeliverables ?? 0

  // Auto-calculate totals
  const calculatedTotal = useMemo(() => {
    return contentTypes.reduce((sum, ct) => sum + (ct.totalQuantity || 0), 0)
  }, [contentTypes])

  const formulaString = useMemo(() => {
    if (contentTypes.length === 0) return ''
    const parts = contentTypes.map(
      (ct) =>
        `${ct.type}: ${ct.quantityPerInfluencer} x ${influencerCount} משפיענים x ${campaignDurationMonths} חודשים = ${ct.totalQuantity}`
    )
    return parts.join('\n')
  }, [contentTypes, influencerCount, campaignDurationMonths])

  // Add content type
  const addContentType = useCallback(() => {
    onChange({
      ...data,
      contentTypes: [
        ...contentTypes,
        { type: '', quantityPerInfluencer: 1, totalQuantity: 0 },
      ],
    })
  }, [data, onChange, contentTypes])

  // Remove content type
  const removeContentType = useCallback(
    (index: number) => {
      const updated = contentTypes.filter((_, i) => i !== index)
      onChange({ ...data, contentTypes: updated })
    },
    [data, onChange, contentTypes]
  )

  // Update content type field
  const updateContentType = useCallback(
    (index: number, field: 'type' | 'quantityPerInfluencer' | 'totalQuantity', value: string | number) => {
      const updated = [...contentTypes]
      updated[index] = { ...updated[index], [field]: value }

      // Auto-calc total if changing quantityPerInfluencer
      if (field === 'quantityPerInfluencer') {
        const qty = typeof value === 'number' ? value : parseInt(value) || 0
        updated[index].totalQuantity = qty * influencerCount * campaignDurationMonths
      }

      onChange({ ...data, contentTypes: updated })
    },
    [data, onChange, contentTypes, influencerCount, campaignDurationMonths]
  )

  // Recalculate all totals when influencer count or duration changes
  const recalculateAll = useCallback(
    (newInfluencerCount: number, newDuration: number) => {
      const updated = contentTypes.map((ct) => ({
        ...ct,
        totalQuantity: ct.quantityPerInfluencer * newInfluencerCount * newDuration,
      }))
      const newTotal = updated.reduce((sum, ct) => sum + ct.totalQuantity, 0)
      onChange({
        ...data,
        contentTypes: updated,
        totalDeliverables: newTotal,
      })
    },
    [data, onChange, contentTypes]
  )

  return (
    <div dir="rtl" className="space-y-6">
      {/* Top-level counts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="מספר משפיענים"
          type="number"
          min={0}
          value={influencerCount || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0
            onChange({ ...data, influencerCount: val })
            recalculateAll(val, campaignDurationMonths)
          }}
          error={errors?.influencerCount}
        />

        <Input
          label="משך הקמפיין (חודשים)"
          type="number"
          min={1}
          value={campaignDurationMonths || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 1
            onChange({ ...data, campaignDurationMonths: val })
            recalculateAll(influencerCount, val)
          }}
          error={errors?.campaignDurationMonths}
        />
      </div>

      {/* Content types */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-foreground">
            סוגי תוכן
          </label>
          <Button variant="ghost" size="sm" onClick={addContentType}>
            + הוסף סוג תוכן
          </Button>
        </div>

        {errors?.contentTypes && (
          <p className="text-xs text-destructive">{errors.contentTypes}</p>
        )}

        {contentTypes.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-input p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              לא הוגדרו סוגי תוכן
            </p>
            <p className="text-xs text-muted-foreground">
              הוסיפו סוגי תוכן כדי לחשב את כמות התוצרים הכוללת
            </p>
          </div>
        )}

        {/* Table header */}
        {contentTypes.length > 0 && (
          <div className="hidden md:grid md:grid-cols-[1fr_120px_120px_40px] gap-3 px-2 text-xs font-medium text-muted-foreground">
            <span>סוג תוכן</span>
            <span>כמות למשפיען</span>
            <span>סה&quot;כ</span>
            <span></span>
          </div>
        )}

        {contentTypes.map((ct, index) => (
          <div
            key={index}
            className="rounded-lg border border-input bg-muted/20 p-4 md:p-2 space-y-3 md:space-y-0 md:grid md:grid-cols-[1fr_120px_120px_40px] md:gap-3 md:items-center"
          >
            {/* Type */}
            <div>
              <div className="md:hidden text-xs font-medium text-muted-foreground mb-1">סוג תוכן</div>
              <Input
                placeholder="סוג התוכן"
                value={ct.type}
                onChange={(e) => updateContentType(index, 'type', e.target.value)}
              />
            </div>

            {/* Qty per influencer */}
            <div>
              <div className="md:hidden text-xs font-medium text-muted-foreground mb-1 mt-2">
                כמות למשפיען
              </div>
              <Input
                type="number"
                min={0}
                value={ct.quantityPerInfluencer || ''}
                onChange={(e) =>
                  updateContentType(index, 'quantityPerInfluencer', parseInt(e.target.value) || 0)
                }
              />
            </div>

            {/* Total */}
            <div>
              <div className="md:hidden text-xs font-medium text-muted-foreground mb-1 mt-2">
                סה&quot;כ
              </div>
              <Input
                type="number"
                min={0}
                value={ct.totalQuantity || ''}
                onChange={(e) =>
                  updateContentType(index, 'totalQuantity', parseInt(e.target.value) || 0)
                }
                hint={`${ct.quantityPerInfluencer} x ${influencerCount} x ${campaignDurationMonths}`}
              />
            </div>

            {/* Remove */}
            <div className="flex md:justify-center mt-2 md:mt-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeContentType(index)}
                className="text-destructive hover:bg-destructive/10"
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
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Grand total */}
      {contentTypes.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">סיכום כמויות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Formula display */}
            {formulaString && (
              <div className="rounded-lg bg-background p-3 text-xs text-muted-foreground whitespace-pre-line font-mono leading-relaxed">
                {formulaString}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="font-semibold text-foreground">סה&quot;כ תוצרים:</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={totalDeliverables || calculatedTotal || ''}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      totalDeliverables: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-24 text-center font-bold"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
