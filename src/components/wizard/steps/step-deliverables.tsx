'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { DeliverablesStepData } from '@/types/wizard'

interface StepDeliverablesProps {
  data: Partial<DeliverablesStepData>
  extractedData: Partial<DeliverablesStepData>
  onChange: (data: Partial<DeliverablesStepData>) => void
  errors: Record<string, string> | null
}

const DELIVERABLE_TYPE_OPTIONS = [
  { value: '', label: 'בחרו סוג...' },
  { value: 'פעימת סטוריז', label: 'פעימת סטוריז' },
  { value: 'רילז', label: 'רילז' },
  { value: 'טיקטוק', label: 'טיקטוק' },
  { value: 'פוסט פיד', label: 'פוסט פיד' },
  { value: 'שיתוף פעולה', label: 'שיתוף פעולה' },
  { value: 'לייב', label: 'לייב' },
  { value: 'אחר', label: 'אחר' },
]

export default function StepDeliverables({
  data,
  extractedData,
  onChange,
  errors,
}: StepDeliverablesProps) {
  const deliverables = data.deliverables ?? []
  const deliverablesSummary = data.deliverablesSummary ?? ''
  const referenceImages = data.referenceImages ?? []

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const addDeliverable = useCallback(() => {
    onChange({
      ...data,
      deliverables: [
        ...deliverables,
        { type: '', quantity: 1, description: '', purpose: '' },
      ],
    })
  }, [data, onChange, deliverables])

  const removeDeliverable = useCallback(
    (index: number) => {
      const updated = deliverables.filter((_, i) => i !== index)
      onChange({ ...data, deliverables: updated })
    },
    [data, onChange, deliverables]
  )

  const updateDeliverable = useCallback(
    (index: number, field: 'type' | 'quantity' | 'description' | 'purpose', value: string | number) => {
      const updated = [...deliverables]
      updated[index] = { ...updated[index], [field]: value }
      onChange({ ...data, deliverables: updated })
    },
    [data, onChange, deliverables]
  )

  // Image upload
  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      setIsUploading(true)
      try {
        const formData = new FormData()
        for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i])
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) throw new Error('Upload failed')

        const result = await res.json()
        const newImages = (result.urls || []).map((url: string) => ({
          url,
          caption: '',
        }))

        onChange({
          ...data,
          referenceImages: [...referenceImages, ...newImages],
        })
      } catch (err) {
        console.error('Image upload error:', err)
      } finally {
        setIsUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [data, onChange, referenceImages]
  )

  const removeImage = useCallback(
    (index: number) => {
      const updated = referenceImages.filter((_, i) => i !== index)
      onChange({ ...data, referenceImages: updated })
    },
    [data, onChange, referenceImages]
  )

  const updateImageCaption = useCallback(
    (index: number, caption: string) => {
      const updated = [...referenceImages]
      updated[index] = { ...updated[index], caption }
      onChange({ ...data, referenceImages: updated })
    },
    [data, onChange, referenceImages]
  )

  return (
    <div dir="rtl" className="space-y-6">
      {/* Deliverables table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-foreground">
            תוצרים
          </label>
          <Button variant="ghost" size="sm" onClick={addDeliverable}>
            + הוסף תוצר
          </Button>
        </div>

        {errors?.deliverables && (
          <p className="text-xs text-destructive">{errors.deliverables}</p>
        )}

        {deliverables.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-input p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              לא הוספו תוצרים עדיין
            </p>
            <Button variant="secondary" size="sm" onClick={addDeliverable}>
              הוסף תוצר ראשון
            </Button>
          </div>
        )}

        {/* Table header for md+ screens */}
        {deliverables.length > 0 && (
          <div className="hidden md:grid md:grid-cols-[180px_80px_1fr_1fr_40px] gap-2 px-2 text-xs font-medium text-muted-foreground">
            <span>סוג</span>
            <span>כמות</span>
            <span>תיאור</span>
            <span>מטרה</span>
            <span></span>
          </div>
        )}

        {deliverables.map((deliverable, index) => (
          <div
            key={index}
            className="rounded-lg border border-input bg-muted/20 p-4 md:p-2 space-y-3 md:space-y-0 md:grid md:grid-cols-[180px_80px_1fr_1fr_40px] md:gap-2 md:items-start"
          >
            {/* Type - Mobile label */}
            <div className="md:hidden text-xs font-medium text-muted-foreground mb-1">סוג</div>
            <Select
              options={DELIVERABLE_TYPE_OPTIONS}
              value={
                DELIVERABLE_TYPE_OPTIONS.some((o) => o.value === deliverable.type)
                  ? deliverable.type
                  : 'אחר'
              }
              onChange={(e) => updateDeliverable(index, 'type', e.target.value)}
            />

            {/* Quantity - Mobile label */}
            <div className="md:hidden text-xs font-medium text-muted-foreground mb-1 mt-2">כמות</div>
            <Input
              type="number"
              min={1}
              value={deliverable.quantity}
              onChange={(e) =>
                updateDeliverable(index, 'quantity', parseInt(e.target.value) || 1)
              }
            />

            {/* Description - Mobile label */}
            <div className="md:hidden text-xs font-medium text-muted-foreground mb-1 mt-2">תיאור</div>
            <Textarea
              placeholder="תיאור התוצר..."
              value={deliverable.description}
              onChange={(e) => updateDeliverable(index, 'description', e.target.value)}
              className="min-h-[60px] md:min-h-[42px]"
            />

            {/* Purpose - Mobile label */}
            <div className="md:hidden text-xs font-medium text-muted-foreground mb-1 mt-2">מטרה</div>
            <Input
              placeholder="מטרת התוצר"
              value={deliverable.purpose}
              onChange={(e) => updateDeliverable(index, 'purpose', e.target.value)}
            />

            {/* Remove button */}
            <div className="flex md:justify-center mt-2 md:mt-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDeliverable(index)}
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

      {/* Reference images */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-foreground">
          תמונות רפרנס לתוצרים
        </label>

        <div
          className="rounded-lg border-2 border-dashed border-input p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto text-muted-foreground mb-2"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          {isUploading ? (
            <p className="text-sm text-muted-foreground">מעלה תמונות...</p>
          ) : (
            <p className="text-sm text-muted-foreground">לחצו להעלאת תמונות רפרנס</p>
          )}
        </div>

        {referenceImages.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {referenceImages.map((img, index) => (
              <div
                key={index}
                className="relative group rounded-lg border border-input overflow-hidden"
              >
                <div className="aspect-video bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.caption || `רפרנס ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="כיתוב..."
                    value={img.caption ?? ''}
                    onChange={(e) => updateImageCaption(index, e.target.value)}
                    className="w-full text-xs bg-transparent border-none outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-1 left-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <Textarea
        label="סיכום תוצרים (אופציונלי)"
        placeholder="סכמו את מסגרת התוצרים במשפט-שניים..."
        value={deliverablesSummary}
        onChange={(e) => onChange({ ...data, deliverablesSummary: e.target.value })}
        error={errors?.deliverablesSummary}
        className="min-h-[80px]"
      />
    </div>
  )
}
