'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, Input } from '@/components/ui'
import type { Document } from '@/types/database'

// Tab definitions
type TabId = 'general' | 'texts' | 'images' | 'colors' | 'influencers'

interface Tab {
  id: TabId
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'general', label: 'כללי', icon: '⚙️' },
  { id: 'texts', label: 'טקסטים', icon: '📝' },
  { id: 'images', label: 'תמונות', icon: '🖼️' },
  { id: 'colors', label: 'צבעים', icon: '🎨' },
  { id: 'influencers', label: 'משפיענים', icon: '👥' },
]

const GOAL_OPTIONS = [
  'מודעות',
  'חינוך שוק',
  'נוכחות דיגיטלית',
  'נחשקות ו-FOMO',
  'הנעה למכר',
  'השקת מוצר',
  'חיזוק נאמנות',
]

// Document data interface
interface DocumentData {
  brandName?: string
  budget?: number
  goals?: string[]
  bigIdea?: string
  keyMessages?: string[]
  closingHeadline?: string
  strategyHeadline?: string
  strategyPillars?: string[]
  brandBrief?: string
  keyInsight?: string
  _brandColors?: {
    primary?: string
    secondary?: string
    accent?: string
  }
  _generatedImages?: {
    coverImage?: string
    brandImage?: string
    audienceImage?: string
    activityImage?: string
  }
  influencerResearch?: {
    recommendations?: Array<{
      name: string
      handle: string
      followers: string
      engagement: string
      whyRelevant: string
      profilePicUrl?: string
    }>
  }
  _scraped?: {
    logoUrl?: string
  }
  [key: string]: unknown
}

export default function EditPage() {
  const router = useRouter()
  const params = useParams()
  const [document, setDocument] = useState<Document | null>(null)
  const [documentData, setDocumentData] = useState<DocumentData>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [hasChanges, setHasChanges] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  
  const logoInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState<string | null>(null)

  // Load document
  useEffect(() => {
    loadDocument()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadDocument = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      console.error('Error loading document:', error)
      router.push('/documents')
      return
    }

    setDocument(data)
    setDocumentData(data.data as DocumentData || {})
    setIsLoading(false)
  }

  // Update field
  const updateField = useCallback((field: string, value: unknown) => {
    setDocumentData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }, [])

  // Update nested field
  const updateNestedField = useCallback((parent: string, field: string, value: unknown) => {
    setDocumentData(prev => ({
      ...prev,
      [parent]: {
        ...(prev[parent] as Record<string, unknown> || {}),
        [field]: value
      }
    }))
    setHasChanges(true)
  }, [])

  // Save changes
  const saveChanges = async () => {
    if (!document) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentData),
      })

      if (!response.ok) throw new Error('Failed to save')
      
      setHasChanges(false)
    } catch (error) {
      console.error('Save error:', error)
      alert('שגיאה בשמירה')
    } finally {
      setIsSaving(false)
    }
  }

  // Download PDF
  const downloadPdf = async () => {
    if (!document) return
    
    // Save changes first if needed
    if (hasChanges) {
      await saveChanges()
    }

    setIsGeneratingPdf(true)
    try {
      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          action: 'download',
        }),
      })

      if (!response.ok) throw new Error('PDF generation failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${document.title}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('PDF error:', error)
      alert('שגיאה ביצירת ה-PDF')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  // Upload image handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, imageField: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploadingImage(imageField)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fieldId', imageField)
      
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      
      const { url } = await res.json()
      
      // Update the appropriate image field
      if (imageField === 'logo') {
        updateNestedField('_scraped', 'logoUrl', url)
      } else {
        updateNestedField('_generatedImages', imageField, url)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('שגיאה בהעלאה')
    } finally {
      setUploadingImage(null)
    }
  }

  // Toggle goal
  const toggleGoal = (goal: string) => {
    const currentGoals = documentData.goals || []
    if (currentGoals.includes(goal)) {
      updateField('goals', currentGoals.filter(g => g !== goal))
    } else if (currentGoals.length < 5) {
      updateField('goals', [...currentGoals, goal])
    }
  }

  // Add/remove key message
  const addKeyMessage = () => {
    const current = documentData.keyMessages || []
    updateField('keyMessages', [...current, ''])
  }

  const updateKeyMessage = (index: number, value: string) => {
    const current = [...(documentData.keyMessages || [])]
    current[index] = value
    updateField('keyMessages', current)
  }

  const removeKeyMessage = (index: number) => {
    const current = [...(documentData.keyMessages || [])]
    current.splice(index, 1)
    updateField('keyMessages', current)
  }

  // Update influencer
  const updateInfluencer = (index: number, field: string, value: string) => {
    const recommendations = [...(documentData.influencerResearch?.recommendations || [])]
    recommendations[index] = { ...recommendations[index], [field]: value }
    updateField('influencerResearch', { ...documentData.influencerResearch, recommendations })
  }

  const removeInfluencer = (index: number) => {
    const recommendations = [...(documentData.influencerResearch?.recommendations || [])]
    recommendations.splice(index, 1)
    updateField('influencerResearch', { ...documentData.influencerResearch, recommendations })
  }

  const addInfluencer = () => {
    const recommendations = [...(documentData.influencerResearch?.recommendations || [])]
    recommendations.push({
      name: '',
      handle: '',
      followers: '',
      engagement: '',
      whyRelevant: '',
    })
    updateField('influencerResearch', { ...documentData.influencerResearch, recommendations })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500">טוען מסמך...</p>
        </div>
      </div>
    )
  }

  if (!document) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/documents">
                <Button variant="ghost" size="sm">
                  → חזרה
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">{document.title}</h1>
                <p className="text-sm text-gray-500">עריכת הצעת מחיר</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                  שינויים לא נשמרו
                </span>
              )}
              <Button
                variant="outline"
                onClick={saveChanges}
                disabled={isSaving || !hasChanges}
              >
                {isSaving ? 'שומר...' : '💾 שמור'}
              </Button>
              <Button
                variant="primary"
                onClick={downloadPdf}
                disabled={isGeneratingPdf}
                className="bg-gradient-to-l from-blue-600 to-purple-600"
              >
                {isGeneratingPdf ? '⏳ מייצר...' : '📥 הורד PDF'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Tabs Sidebar */}
          <div className="w-56 flex-shrink-0">
            <Card className="p-2 bg-white sticky top-28">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-right px-4 py-3 rounded-lg transition-all flex items-center gap-3 ${
                    activeTab === tab.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="font-medium">{tab.label}</span>
                </button>
              ))}
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <Card className="p-8 bg-white">
              {/* General Tab */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">הגדרות כלליות</h2>
                  
                  {/* Brand Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">שם המותג</label>
                    <Input
                      value={documentData.brandName || ''}
                      onChange={e => updateField('brandName', e.target.value)}
                      placeholder="שם המותג"
                    />
                  </div>

                  {/* Logo */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">לוגו</label>
                    <div className="flex items-center gap-4">
                      {documentData._scraped?.logoUrl ? (
                        <img
                          src={documentData._scraped.logoUrl}
                          alt="Logo"
                          className="h-16 w-auto object-contain border rounded-lg p-2"
                        />
                      ) : (
                        <div className="h-16 w-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                          🖼️
                        </div>
                      )}
                      <input
                        type="file"
                        ref={logoInputRef}
                        onChange={e => handleImageUpload(e, 'logo')}
                        accept="image/*"
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingImage === 'logo'}
                      >
                        {uploadingImage === 'logo' ? 'מעלה...' : 'החלף לוגו'}
                      </Button>
                    </div>
                  </div>

                  {/* Budget */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">תקציב (₪)</label>
                    <Input
                      type="number"
                      value={documentData.budget || ''}
                      onChange={e => updateField('budget', parseInt(e.target.value) || 0)}
                      placeholder="50000"
                    />
                  </div>

                  {/* Goals */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">מטרות הקמפיין</label>
                    <div className="flex flex-wrap gap-2">
                      {GOAL_OPTIONS.map(goal => (
                        <button
                          key={goal}
                          onClick={() => toggleGoal(goal)}
                          className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                            (documentData.goals || []).includes(goal)
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {goal}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Texts Tab */}
              {activeTab === 'texts' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">טקסטים</h2>
                  
                  {/* Brand Brief */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">בריף המותג</label>
                    <textarea
                      value={documentData.brandBrief || ''}
                      onChange={e => updateField('brandBrief', e.target.value)}
                      placeholder="למה הלקוח פנה אלינו..."
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                  </div>

                  {/* Key Insight */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">תובנה מרכזית</label>
                    <textarea
                      value={documentData.keyInsight || ''}
                      onChange={e => updateField('keyInsight', e.target.value)}
                      placeholder="התובנה המרכזית מהמחקר..."
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={2}
                    />
                  </div>

                  {/* Strategy Headline */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">כותרת האסטרטגיה</label>
                    <Input
                      value={documentData.strategyHeadline || ''}
                      onChange={e => updateField('strategyHeadline', e.target.value)}
                      placeholder="האסטרטגיה שלנו..."
                    />
                  </div>

                  {/* Big Idea */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">הרעיון המרכזי</label>
                    <textarea
                      value={documentData.bigIdea || ''}
                      onChange={e => updateField('bigIdea', e.target.value)}
                      placeholder="הרעיון המרכזי לקמפיין..."
                      className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                  </div>

                  {/* Key Messages */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">מסרים עיקריים</label>
                      <Button variant="ghost" size="sm" onClick={addKeyMessage}>
                        + הוסף מסר
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(documentData.keyMessages || []).map((msg, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={msg}
                            onChange={e => updateKeyMessage(index, e.target.value)}
                            placeholder={`מסר ${index + 1}`}
                            className="flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeKeyMessage(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Closing Headline */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">כותרת סיום</label>
                    <Input
                      value={documentData.closingHeadline || ''}
                      onChange={e => updateField('closingHeadline', e.target.value)}
                      placeholder="המשפט האחרון..."
                    />
                  </div>
                </div>
              )}

              {/* Images Tab */}
              {activeTab === 'images' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">תמונות</h2>
                  
                  <input
                    type="file"
                    ref={imageInputRef}
                    onChange={e => {
                      if (uploadingImage) {
                        handleImageUpload(e, uploadingImage)
                      }
                    }}
                    accept="image/*"
                    className="hidden"
                  />

                  <div className="grid grid-cols-2 gap-6">
                    {[
                      { key: 'coverImage', label: 'תמונת כיסוי' },
                      { key: 'brandImage', label: 'תמונת מותג' },
                      { key: 'audienceImage', label: 'תמונת קהל יעד' },
                      { key: 'activityImage', label: 'תמונת פעילות' },
                    ].map(({ key, label }) => {
                      const imageUrl = (documentData._generatedImages as Record<string, string>)?.[key]
                      return (
                        <div key={key} className="border rounded-xl overflow-hidden">
                          <div className="aspect-video bg-gray-100 relative group">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={label}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <span className="text-4xl">🖼️</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Button
                                variant="outline"
                                className="bg-white"
                                onClick={() => {
                                  setUploadingImage(key)
                                  imageInputRef.current?.click()
                                }}
                                disabled={uploadingImage === key}
                              >
                                {uploadingImage === key ? 'מעלה...' : 'החלף תמונה'}
                              </Button>
                            </div>
                          </div>
                          <div className="p-3 bg-white">
                            <p className="font-medium text-gray-700">{label}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Colors Tab */}
              {activeTab === 'colors' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">צבעי המותג</h2>
                  
                  <div className="grid grid-cols-3 gap-6">
                    {[
                      { key: 'primary', label: 'צבע ראשי' },
                      { key: 'secondary', label: 'צבע משני' },
                      { key: 'accent', label: 'צבע הדגשה' },
                    ].map(({ key, label }) => {
                      const color = (documentData._brandColors as Record<string, string>)?.[key] || '#000000'
                      return (
                        <div key={key} className="text-center">
                          <label className="block text-sm font-medium text-gray-700 mb-3">{label}</label>
                          <div className="flex flex-col items-center gap-3">
                            <input
                              type="color"
                              value={color}
                              onChange={e => updateNestedField('_brandColors', key, e.target.value)}
                              className="w-20 h-20 rounded-xl cursor-pointer border-2 border-gray-200"
                            />
                            <Input
                              value={color}
                              onChange={e => updateNestedField('_brandColors', key, e.target.value)}
                              className="w-28 text-center uppercase text-sm"
                              dir="ltr"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Color Preview */}
                  <div className="mt-8 p-6 rounded-xl" style={{
                    background: `linear-gradient(135deg, ${documentData._brandColors?.primary || '#000'} 0%, ${documentData._brandColors?.secondary || '#333'} 50%, ${documentData._brandColors?.accent || '#666'} 100%)`
                  }}>
                    <p className="text-white text-center font-medium">תצוגה מקדימה של הצבעים</p>
                  </div>
                </div>
              )}

              {/* Influencers Tab */}
              {activeTab === 'influencers' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">משפיענים</h2>
                    <Button variant="outline" onClick={addInfluencer}>
                      + הוסף משפיען
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    {(documentData.influencerResearch?.recommendations || []).map((inf, index) => (
                      <div key={index} className="border rounded-xl p-5 bg-gray-50">
                        <div className="flex items-start gap-4">
                          {/* Profile Image */}
                          <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                            {inf.profilePicUrl ? (
                              <img src={inf.profilePicUrl} alt={inf.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">
                                {inf.name?.charAt(0) || '?'}
                              </div>
                            )}
                          </div>

                          {/* Details */}
                          <div className="flex-1 grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-gray-500">שם</label>
                              <Input
                                value={inf.name || ''}
                                onChange={e => updateInfluencer(index, 'name', e.target.value)}
                                placeholder="שם המשפיען"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Handle</label>
                              <Input
                                value={inf.handle || ''}
                                onChange={e => updateInfluencer(index, 'handle', e.target.value)}
                                placeholder="@username"
                                dir="ltr"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">עוקבים</label>
                              <Input
                                value={inf.followers || ''}
                                onChange={e => updateInfluencer(index, 'followers', e.target.value)}
                                placeholder="100K"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Engagement</label>
                              <Input
                                value={inf.engagement || ''}
                                onChange={e => updateInfluencer(index, 'engagement', e.target.value)}
                                placeholder="3.5%"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-gray-500">למה רלוונטי</label>
                              <textarea
                                value={inf.whyRelevant || ''}
                                onChange={e => updateInfluencer(index, 'whyRelevant', e.target.value)}
                                placeholder="הסבר קצר..."
                                className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                                rows={2}
                              />
                            </div>
                          </div>

                          {/* Remove button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeInfluencer(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            🗑️
                          </Button>
                        </div>
                      </div>
                    ))}

                    {(documentData.influencerResearch?.recommendations || []).length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <p className="text-4xl mb-2">👥</p>
                        <p>אין משפיענים עדיין</p>
                        <Button variant="outline" onClick={addInfluencer} className="mt-4">
                          + הוסף משפיען
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

