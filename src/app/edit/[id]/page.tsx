'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Presentation, Slide, SlideElement, TextElement, ShapeElement, ImageElement, VideoElement, MockupElement, CompareElement, LogoStripElement, MapElement, ShapeType, VideoProvider } from '@/types/presentation'
import { isTextElement, detectVideoProvider, extractYouTubeId } from '@/types/presentation'
import type { AdvancedElementType } from '@/components/presentation/EditorToolbar'
import { usePresentationEditor } from '@/hooks/usePresentationEditor'
import { buildSlideContext, getSlidePurpose } from '@/lib/editor/slide-context-builder'
import FlowStepper from '@/components/flow-stepper'
import SlideEditor from '@/components/presentation/SlideEditor'
import SlideViewer from '@/components/presentation/SlideViewer'
import PropertiesPanel from '@/components/presentation/PropertiesPanel'
import ImageSourceModal from '@/components/presentation/ImageSourceModal'
import EditorToolbar from '@/components/presentation/EditorToolbar'
import AlignmentToolbar from '@/components/presentation/AlignmentToolbar'
import LayerPanel from '@/components/presentation/LayerPanel'
import TextFormatBar from '@/components/presentation/TextFormatBar'
import GoogleDriveSaveButton from '@/components/google-drive-save-button'
import FeedbackDialog from '@/components/feedback-dialog'
import PresentationMode from '@/components/presentation/PresentationMode'
import ShareDialog from '@/components/share/ShareDialog'
import VideoSourceModal from '@/components/presentation/VideoSourceModal'

// ─── Empty presentation (placeholder while loading) ────────
const EMPTY_PRESENTATION: Presentation = {
  id: '',
  title: '',
  designSystem: {
    colors: { primary: '#E94560', secondary: '#0F3460', accent: '#16213E', background: '#1a1a2e', text: '#FFFFFF', cardBg: '#16213E', cardBorder: '#0F3460' },
    fonts: { heading: 'Heebo', body: 'Heebo' },
    direction: 'rtl',
  },
  slides: [],
}

type PageState = 'loading' | 'generating' | 'ready' | 'error'

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function PresentationEditorPage() {
  const params = useParams()
  const documentId = params.id as string

  const [pageState, setPageState] = useState<PageState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [brandName, setBrandName] = useState('')
  const [htmlSlides, setHtmlSlides] = useState<string[] | null>(null)
  const [activeHtmlSlide, setActiveHtmlSlide] = useState(0)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [showProperties, setShowProperties] = useState(true)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [imageModalElementId, setImageModalElementId] = useState<string | null>(null)
  const [imageModalTab, setImageModalTab] = useState<'upload' | 'url' | 'ai'>('upload')
  const [imageModalMode, setImageModalMode] = useState<'replace' | 'add' | 'mockup-content'>('replace')
  const [aiRewriteState, setAiRewriteState] = useState<{ elementId: string; loading: boolean } | null>(null)
  const [aiDesignInstruction, setAiDesignInstruction] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [gridVisible, setGridVisible] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [isPresentationMode, setIsPresentationMode] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [clipboardElement, setClipboardElement] = useState<SlideElement | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragSrcIndex = useRef<number | null>(null)
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)
  const [formatBrush, setFormatBrush] = useState<Partial<TextElement> | null>(null)

  const editor = usePresentationEditor(EMPTY_PRESENTATION)
  const slideContainerRef = useRef<HTMLDivElement>(null)
  const thumbnailsRef = useRef<HTMLDivElement>(null)
  const [slideScale, setSlideScale] = useState(0.5)
  const [documentData, setDocumentData] = useState<Record<string, unknown> | null>(null)

  // Memoized slide context — feeds all AI operations
  const slideContext = useMemo(() => {
    if (!editor.selectedSlide) return undefined
    return buildSlideContext(
      editor.presentation,
      editor.selectedSlideIndex,
      documentData || undefined,
    )
  }, [editor.presentation, editor.selectedSlideIndex, editor.selectedSlide, documentData])

  // ─── Load document ───────────────────────────────────
  useEffect(() => {
    loadDocument()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  const loadDocument = async () => {
    try {
      setPageState('loading')

      const res = await fetch(`/api/documents/${documentId}`)
      if (!res.ok) throw new Error('Document not found')

      const data = await res.json()
      const doc = data.document
      const docData = doc.data as Record<string, unknown>
      setBrandName((docData.brandName as string) || doc.title || 'הצעת מחיר')
      setDocumentData(docData)

      // Check for HTML-Native presentation first (v6)
      const htmlPres = docData._htmlPresentation as { htmlSlides?: string[]; slideTypes?: string[]; designSystem?: unknown } | undefined
      if (htmlPres?.htmlSlides?.length) {
        console.log(`[Editor] Loaded HTML-Native presentation with ${htmlPres.htmlSlides.length} slides`)
        setHtmlSlides(htmlPres.htmlSlides)
        setPageState('ready')
        return
      }

      const existing = docData._presentation as Presentation | undefined
      if (existing && existing.slides?.length > 0) {
        console.log(`[Editor] Loaded AST presentation with ${existing.slides.length} slides`)
        editor.setPresentation(existing)
        setPageState('ready')
        return
      }

      console.log('[Editor] No AST found, generating presentation...')
      setPageState('generating')

      const genRes = await fetch('/api/preview-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, generateAST: true }),
      })

      if (!genRes.ok) throw new Error('Could not generate slides')

      const genData = await genRes.json()

      if (genData.presentation) {
        editor.setPresentation(genData.presentation)
        await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _presentation: genData.presentation }),
        })
        setPageState('ready')
        return
      }

      setError('המצגת עדיין בפורמט ישן. יש ליצור אותה מחדש מתוך ה-Wizard.')
      setPageState('error')
    } catch (err) {
      console.error('[Editor] Load error:', err)
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת המצגת')
      setPageState('error')
    }
  }

  // ─── Mobile detection ───────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ─── F5 for presentation mode ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault()
        setIsPresentationMode(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ─── Auto-save on changes ────────────────────────────
  useEffect(() => {
    if (editor.isDirty && pageState === 'ready') {
      editor.save(documentId)
    }
  }, [editor, editor.isDirty, documentId, pageState])

  // ─── Calculate slide scale ───────────────────────────
  useEffect(() => {
    const container = slideContainerRef.current
    if (!container || pageState !== 'ready') return

    const updateScale = () => {
      const rect = container.getBoundingClientRect()
      const availW = rect.width - 40
      const availH = rect.height - 40
      if (availW <= 0 || availH <= 0) return
      const scaleX = availW / 1920
      const scaleY = availH / 1080
      setSlideScale(Math.min(scaleX, scaleY, 1))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    return () => observer.disconnect()
  }, [pageState, showProperties])

  // ─── Scroll thumbnail into view ──────────────────────
  useEffect(() => {
    if (thumbnailsRef.current) {
      const thumb = thumbnailsRef.current.children[editor.selectedSlideIndex] as HTMLElement
      if (thumb) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [editor.selectedSlideIndex])

  // ─── Keyboard shortcuts ─────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) { editor.redo() } else { editor.undo() }
      }
      // Ctrl+C — copy element
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isTyping && editor.selectedElement) {
        e.preventDefault()
        setClipboardElement(structuredClone(editor.selectedElement))
      }
      // Ctrl+V — paste element
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !isTyping && clipboardElement) {
        e.preventDefault()
        const pasted = structuredClone(clipboardElement)
        pasted.id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        pasted.x += 30
        pasted.y += 30
        editor.addElement(pasted)
      }
      // Ctrl+D — duplicate element
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && !isTyping && editor.selectedElementId) {
        e.preventDefault()
        editor.duplicateElement(editor.selectedElementId)
      }
      // Ctrl+= / Ctrl+- — zoom
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+') && !isTyping) {
        e.preventDefault()
        setSlideScale(prev => Math.min(prev + 0.1, 1.5))
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-' && !isTyping) {
        e.preventDefault()
        setSlideScale(prev => Math.max(prev - 0.1, 0.2))
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0' && !isTyping) {
        e.preventDefault()
        // Reset zoom to auto-fit
        const container = slideContainerRef.current
        if (container) {
          const rect = container.getBoundingClientRect()
          const scaleX = (rect.width - 40) / 1920
          const scaleY = (rect.height - 40) / 1080
          setSlideScale(Math.min(scaleX, scaleY, 1))
        }
      }
      // G — toggle grid
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping) {
        e.preventDefault()
        setGridVisible(prev => !prev)
      }
      // Delete / Backspace — delete selected element(s)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
        if (editor.selectedElementIds.length > 1) {
          e.preventDefault()
          editor.deleteElements(editor.selectedElementIds)
        } else if (editor.selectedElementId) {
          e.preventDefault()
          editor.deleteElement(editor.selectedElementId)
        }
      }
      // Ctrl+A — select all elements
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !isTyping) {
        e.preventDefault()
        editor.selectAllElements()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editor, clipboardElement])

  // ─── Download PDF ────────────────────────────────────
  const downloadPdf = useCallback(async () => {
    await editor.saveNow(documentId)
    setIsGeneratingPdf(true)

    try {
      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, action: 'download' }),
      })

      if (!response.ok) throw new Error('PDF generation failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${brandName || 'proposal'}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF error:', err)
      alert('שגיאה ביצירת ה-PDF')
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [documentId, brandName, editor])

  // ─── Get PDF blob for Drive save ────────────────────
  const getProposalPdf = useCallback(async () => {
    await editor.saveNow(documentId)
    const response = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId, action: 'download' }),
    })
    if (!response.ok) throw new Error('PDF generation failed')
    const blob = await response.blob()
    return {
      blob,
      fileName: `${brandName || 'proposal'}.pdf`,
      mimeType: 'application/pdf',
    }
  }, [documentId, brandName, editor])

  // ─── AI Rewrite ──────────────────────────────────────
  const handleAIRewrite = useCallback(async (elementId: string, currentText: string) => {
    setAiRewriteState({ elementId, loading: true })

    try {
      const element = editor.selectedSlide?.elements.find(e => e.id === elementId)
      const role = element && isTextElement(element) ? element.role : undefined

      const res = await fetch('/api/copilot/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentText,
          elementRole: role,
          slideLabel: editor.selectedSlide?.label,
          brandName,
          // Context-aware fields
          slideType: slideContext?.slideType,
          slidePurpose: slideContext ? getSlidePurpose(slideContext.slideType) : undefined,
          slideTextSummary: slideContext?.slideTextSummary,
          industry: slideContext?.industry,
          targetAudience: slideContext?.targetAudience,
          brandPersonality: slideContext?.brandPersonality,
        }),
      })

      const data = await res.json()
      if (data.text) {
        editor.updateElement(elementId, { content: data.text } as Partial<SlideElement>)
      }
    } catch (err) {
      console.error('AI rewrite error:', err)
    } finally {
      setAiRewriteState(null)
    }
  }, [editor, brandName, slideContext])

  // ─── Regenerate slide with AI ────────────────────────
  const handleRegenerateSlide = useCallback(async (instruction?: string) => {
    setIsRegenerating(true)
    try {
      const res = await fetch('/api/regenerate-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          slideIndex: editor.selectedSlideIndex,
          instruction: instruction || aiDesignInstruction || undefined,
        }),
      })

      const data = await res.json()
      if (data.slide) {
        editor.replaceSlide(editor.selectedSlideIndex, data.slide as Slide)
        setAiDesignInstruction('')
      }
    } catch (err) {
      console.error('Regenerate slide error:', err)
    } finally {
      setIsRegenerating(false)
    }
  }, [documentId, editor, aiDesignInstruction])

  // ─── Format painter: apply on element select ───────
  useEffect(() => {
    if (formatBrush && editor.selectedElementId && editor.selectedElement && isTextElement(editor.selectedElement)) {
      editor.updateElement(editor.selectedElementId, formatBrush as Partial<SlideElement>)
      setFormatBrush(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.selectedElementId])

  // ─── ESC to cancel format brush ────────────────────
  useEffect(() => {
    if (!formatBrush) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFormatBrush(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [formatBrush])

  // ─── Computed values ────────────────────────────────
  const designSystem = editor.presentation.designSystem
  const selectedElements = useMemo(() => {
    if (!editor.selectedSlide) return []
    return editor.selectedSlide.elements.filter(e => editor.selectedElementIds.includes(e.id))
  }, [editor.selectedSlide, editor.selectedElementIds])

  const selectedTextElement = editor.selectedElement && isTextElement(editor.selectedElement) ? editor.selectedElement : null

  const handleAddText = useCallback(() => {
    const element: TextElement = {
      id: generateId('el'),
      type: 'text',
      x: 660, y: 440, width: 600, height: 200,
      zIndex: 100,
      fontSize: 36, fontWeight: 400,
      color: designSystem.colors.text,
      textAlign: 'right',
      content: 'טקסט חדש',
      role: 'body',
      lineHeight: 1.4,
    }
    editor.addElement(element)
  }, [editor, designSystem])

  const handleAddShape = useCallback((shapeType: ShapeType) => {
    let element: ShapeElement
    switch (shapeType) {
      case 'circle':
        element = {
          id: generateId('el'), type: 'shape',
          x: 810, y: 390, width: 300, height: 300, zIndex: 50,
          shapeType: 'circle', fill: designSystem.colors.accent, borderRadius: 9999,
        }
        break
      case 'line':
        element = {
          id: generateId('el'), type: 'shape',
          x: 460, y: 530, width: 1000, height: 4, zIndex: 50,
          shapeType: 'line', fill: designSystem.colors.primary, borderRadius: 0,
        }
        break
      default:
        element = {
          id: generateId('el'), type: 'shape',
          x: 660, y: 390, width: 600, height: 300, zIndex: 50,
          shapeType: 'rectangle', fill: designSystem.colors.cardBg, borderRadius: 16,
        }
    }
    editor.addElement(element)
  }, [editor, designSystem])

  const handleAddImage = useCallback(() => {
    setImageModalMode('add')
    setImageModalElementId('__new__')
    setImageModalTab('upload')
  }, [])

  const handleAddVideo = useCallback(() => {
    setShowVideoModal(true)
  }, [])

  const handleVideoSelected = useCallback((src: string, provider: VideoProvider, posterImage?: string) => {
    const ytId = provider === 'youtube' ? extractYouTubeId(src) : null
    const element: VideoElement = {
      id: generateId('el'),
      type: 'video',
      x: 460, y: 240, width: 1000, height: 560, zIndex: 60,
      src,
      videoProvider: provider,
      posterImage: posterImage || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined),
      autoPlay: true,
      muted: true,
      loop: true,
      objectFit: 'cover',
    }
    editor.addElement(element)
    setShowVideoModal(false)
  }, [editor])

  const handleAddAdvancedElement = useCallback((type: AdvancedElementType) => {
    let element: SlideElement
    switch (type) {
      case 'mockup': {
        const el: MockupElement = {
          id: generateId('el'), type: 'mockup',
          x: 560, y: 140, width: 400, height: 700, zIndex: 60,
          deviceType: 'iPhone 15 Pro',
          contentType: 'color', contentSrc: '#1a1a2e',
        }
        element = el
        break
      }
      case 'compare': {
        const el: CompareElement = {
          id: generateId('el'), type: 'compare',
          x: 360, y: 190, width: 1200, height: 700, zIndex: 60,
          beforeImage: '', afterImage: '',
          beforeLabel: 'לפני', afterLabel: 'אחרי',
          orientation: 'horizontal', initialPosition: 50,
        }
        element = el
        break
      }
      case 'logo-strip': {
        const el: LogoStripElement = {
          id: generateId('el'), type: 'logo-strip',
          x: 60, y: 900, width: 1800, height: 120, zIndex: 60,
          logos: [], speed: 40, direction: 'rtl', grayscale: true, gap: 60,
        }
        element = el
        break
      }
      case 'map': {
        const el: MapElement = {
          id: generateId('el'), type: 'map',
          x: 560, y: 290, width: 800, height: 500, zIndex: 60,
          address: '', zoom: 15, borderRadius: 16,
        }
        element = el
        break
      }
    }
    editor.addElement(element)
  }, [editor])

  const handleDuplicateElement = useCallback(() => {
    if (editor.selectedElementId) {
      editor.duplicateElement(editor.selectedElementId)
    }
  }, [editor])

  const handleDeleteElement = useCallback(() => {
    if (editor.selectedElementId) {
      editor.deleteElement(editor.selectedElementId)
    }
  }, [editor])

  // ─── Slide management ────────────────────────────────
  const handleAddSlide = useCallback(() => {
    const slides = editor.presentation.slides
    const newSlide: Slide = {
      id: generateId('slide'),
      slideType: 'brief',
      label: `שקף ${slides.length + 1}`,
      background: { type: 'solid', value: designSystem.colors.background },
      elements: [],
    }
    editor.addSlide(newSlide, editor.selectedSlideIndex + 1)
  }, [editor, designSystem])

  const handleDuplicateSlide = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    editor.duplicateSlide(index)
  }, [editor])

  const handleDeleteSlide = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    editor.deleteSlide(index)
  }, [editor])

  // ─── Image replace/add ───────────────────────────────
  const imageModalElementIdRef = useRef<string | null>(null)
  useEffect(() => {
    imageModalElementIdRef.current = imageModalElementId
  }, [imageModalElementId])

  const handleImageSelected = useCallback((url: string, contentType?: 'image' | 'video') => {
    const elementId = imageModalElementIdRef.current
    console.log('[Editor] handleImageSelected called:', { url: url?.slice(0, 60), elementId, mode: imageModalMode, contentType })

    if (imageModalMode === 'add') {
      const element: ImageElement = {
        id: generateId('el'),
        type: 'image',
        x: 560, y: 290, width: 800, height: 500, zIndex: 60,
        src: url, alt: '', objectFit: 'cover', borderRadius: 12,
      }
      editor.addElement(element)
    } else if (imageModalMode === 'mockup-content' && elementId) {
      // Update mockup element content — detect type from callback or URL
      const type = contentType || (url.match(/\.(mp4|webm|mov|avi)(\?|$)/i) ? 'video' : 'image')
      editor.updateElement(elementId, { contentSrc: url, contentType: type } as Partial<SlideElement>)
      console.log('[Editor] Mockup content updated:', elementId, type)
    } else if (elementId) {
      editor.updateElement(elementId, { src: url } as Partial<SlideElement>)
      console.log('[Editor] Image element updated:', elementId)
    }
    setImageModalElementId(null)
    setImageModalMode('replace')
  }, [editor, imageModalMode])

  // ─── Mobile block ──────────────────────────────────
  if (isMobile) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/60">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-bold mb-2">עריכת מצגות זמינה רק במחשב</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            לחוויית עריכה מלאה, פתחו את הדף בדפדפן במחשב שולחני או נייד.
          </p>
          <a
            href="/dashboard"
            className="inline-block px-6 py-2.5 bg-white text-[#0a0a0f] rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors"
          >
            חזרה לדשבורד
          </a>
        </div>
      </div>
    )
  }

  // ─── Loading state ──────────────────────────────────
  if (pageState === 'loading' || pageState === 'generating') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-gray-800" />
            <div className="absolute inset-0 rounded-full border-2 border-t-white animate-spin" />
          </div>
          <p className="text-gray-400 text-base" dir="rtl">
            {pageState === 'generating' ? 'מעצב מצגת עם AI...' : 'טוען מצגת...'}
          </p>
          {pageState === 'generating' && (
            <p className="text-gray-600 text-xs mt-1" dir="rtl">זה יכול לקחת עד דקה בפעם הראשונה</p>
          )}
        </div>
      </div>
    )
  }

  // ─── Error state ────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4 text-red-400">!</div>
          <h2 className="text-lg font-bold text-white mb-2">שגיאה בטעינה</h2>
          <p className="text-gray-400 mb-6 text-sm">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setError(null); loadDocument() }}
              className="px-5 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              נסה שוב
            </button>
            <Link
              href="/dashboard"
              className="px-5 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              חזרה לרשימה
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ─── HTML-Native presentation mode (v6) ─────────────
  if (htmlSlides && htmlSlides.length > 0) {
    const HtmlSlideViewer = require('@/components/presentation/HtmlSlideViewer').default
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex" dir="rtl">
        {/* Sidebar — thumbnails */}
        <div className="w-48 bg-[#111118] border-l border-gray-800 overflow-y-auto p-3 flex flex-col gap-2">
          <div className="text-xs text-gray-500 font-medium px-1 mb-2">{brandName}</div>
          {htmlSlides.map((html, i) => (
            <div key={i} onClick={() => setActiveHtmlSlide(i)} className="cursor-pointer">
              <HtmlSlideViewer
                html={html}
                scale={0.09}
                isActive={activeHtmlSlide === i}
                className="rounded"
              />
              <div className="text-[10px] text-gray-500 text-center mt-1">שקף {i + 1}</div>
            </div>
          ))}
        </div>

        {/* Main slide view */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-14 bg-[#111118] border-b border-gray-800 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">← חזרה</Link>
              <h1 className="text-white font-medium">{brandName}</h1>
              <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">HTML-Native ✨</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setIsGeneratingPdf(true)
                  try {
                    const res = await fetch('/api/pdf', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ documentId, action: 'download' }),
                    })
                    if (res.ok) {
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a'); a.href = url; a.download = `${brandName}.pdf`; a.click()
                      URL.revokeObjectURL(url)
                    }
                  } finally { setIsGeneratingPdf(false) }
                }}
                disabled={isGeneratingPdf}
                className="px-4 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {isGeneratingPdf ? 'מייצר PDF...' : 'הורד PDF'}
              </button>
            </div>
          </div>

          {/* Slide display */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            <HtmlSlideViewer
              html={htmlSlides[activeHtmlSlide] || ''}
              scale={0.55}
            />
          </div>

          {/* Slide counter */}
          <div className="h-10 bg-[#111118] border-t border-gray-800 flex items-center justify-center">
            <span className="text-xs text-gray-500">
              שקף {activeHtmlSlide + 1} מתוך {htmlSlides.length}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ─── No slides state ────────────────────────────────
  if (editor.presentation.slides.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-gray-400 text-base mb-4">לא נמצאו שקפים</p>
          <Link
            href={`/wizard/${documentId}`}
            className="px-5 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            חזרה ל-Wizard
          </Link>
        </div>
      </div>
    )
  }

  // ─── Thumbnail scale ────────────────────────────────
  const thumbScale = 140 / 1920
  const slides = editor.presentation.slides

  return (
    <div className="h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">
      {/* ── Header ───────────────────────────────────── */}
      <header className="bg-[#0f0f18]/90 backdrop-blur-md border-b border-white/5 z-50 flex-shrink-0" dir="rtl">
        <div className="max-w-[1800px] mx-auto px-5 py-2.5">
          <div className="flex items-center justify-between relative">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="text-gray-500 hover:text-white transition-colors text-xs flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                חזרה
              </Link>
              <div className="h-4 w-px bg-white/10" />
              <h1 className="text-white/90 font-medium text-sm">{brandName}</h1>
              <span className="text-gray-600 text-xs bg-white/5 px-2 py-0.5 rounded">{slides.length} שקפים</span>
              {editor.isDirty && <span className="text-yellow-500/70 text-xs animate-pulse">שומר...</span>}
              {aiRewriteState?.loading && <span className="text-purple-400/70 text-xs animate-pulse">AI כותב...</span>}
              {isRegenerating && <span className="text-purple-400/70 text-xs animate-pulse">AI מעצב שקף...</span>}
            </div>

            <div className="hidden lg:block absolute left-1/2 -translate-x-1/2">
              <FlowStepper currentStep="edit" compact />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 px-1">
                <button onClick={editor.undo} disabled={!editor.canUndo} className="p-1.5 text-gray-500 hover:text-white disabled:opacity-20 transition-colors" title="בטל (Ctrl+Z)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button onClick={editor.redo} disabled={!editor.canRedo} className="p-1.5 text-gray-500 hover:text-white disabled:opacity-20 transition-colors" title="בצע שוב (Ctrl+Shift+Z)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
                </button>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg">
                <button onClick={() => editor.selectSlide(Math.max(0, editor.selectedSlideIndex - 1))} disabled={editor.selectedSlideIndex === 0} className="text-gray-400 hover:text-white disabled:opacity-20 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <span className="text-white/70 text-xs font-medium tabular-nums min-w-[40px] text-center" dir="ltr">
                  {editor.selectedSlideIndex + 1} / {slides.length}
                </span>
                <button onClick={() => editor.selectSlide(Math.min(slides.length - 1, editor.selectedSlideIndex + 1))} disabled={editor.selectedSlideIndex === slides.length - 1} className="text-gray-400 hover:text-white disabled:opacity-20 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              </div>

              <div className="flex items-center gap-0.5 px-2 py-1 bg-white/5 rounded-lg">
                <button
                  onClick={() => setSlideScale(prev => Math.max(prev - 0.1, 0.2))}
                  className="text-gray-400 hover:text-white transition-colors p-0.5"
                  title="הקטן (Ctrl+-)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <span className="text-white/60 text-[10px] font-medium tabular-nums min-w-[36px] text-center">
                  {Math.round(slideScale * 100)}%
                </span>
                <button
                  onClick={() => setSlideScale(prev => Math.min(prev + 0.1, 1.5))}
                  className="text-gray-400 hover:text-white transition-colors p-0.5"
                  title="הגדל (Ctrl++)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>

              <button onClick={() => setShowProperties(p => !p)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${showProperties ? 'text-white bg-white/20 ring-1 ring-white/30' : 'text-gray-400 bg-white/5 hover:bg-white/10 hover:text-white'}`}>
                {showProperties ? 'סגור פאנל' : 'פאנל עריכה'}
              </button>

              <button
                onClick={() => setShowShareDialog(true)}
                className="px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors"
                title="שתף מצגת"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block ml-1">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                שתף
              </button>

              <button
                onClick={() => setIsPresentationMode(true)}
                className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-white/5 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                title="מצב הצגה (F5)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block ml-1">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                הצגה
              </button>

              <button onClick={downloadPdf} disabled={isGeneratingPdf} className="px-4 py-1.5 text-xs font-medium text-black bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isGeneratingPdf ? 'מייצר...' : 'הורד PDF'}
              </button>

              <GoogleDriveSaveButton
                getFileData={getProposalPdf}
                onSaved={(result) => window.open(result.webViewLink, '_blank')}
                onError={() => alert('שגיאה בשמירה ל-Drive')}
                label="שמור ב-Drive"
                className="px-4 py-1.5 text-xs font-medium rounded-lg"
              />

              <button
                onClick={() => setShowFeedback(true)}
                className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 rounded-lg hover:bg-amber-500/20 transition-colors"
                title="דרגו את ההצעה"
              >
                דרגו
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Toolbar ───────────────────────────────────── */}
      <EditorToolbar
        onAddText={handleAddText}
        onAddShape={handleAddShape}
        onAddImage={handleAddImage}
        onAddVideo={handleAddVideo}
        onAddAdvancedElement={handleAddAdvancedElement}
        onDuplicate={handleDuplicateElement}
        onDelete={handleDeleteElement}
        selectedElement={editor.selectedElement}
        gridVisible={gridVisible}
        onToggleGrid={() => setGridVisible(prev => !prev)}
        snapToGrid={snapToGrid}
        onToggleSnap={() => setSnapToGrid(prev => !prev)}
        onApplyStylePreset={(preset) => {
          if (editor.selectedElementId) {
            editor.updateElement(editor.selectedElementId, preset as Partial<SlideElement>)
          }
        }}
        formatBrush={formatBrush}
        onCopyFormat={() => {
          if (selectedTextElement) {
            setFormatBrush({
              fontSize: selectedTextElement.fontSize,
              fontWeight: selectedTextElement.fontWeight,
              color: selectedTextElement.color,
              fontFamily: selectedTextElement.fontFamily,
              textAlign: selectedTextElement.textAlign,
              lineHeight: selectedTextElement.lineHeight,
            })
          }
        }}
        onCancelFormat={() => setFormatBrush(null)}
      />

      {/* ── Alignment bar (multi-select) ──────────── */}
      {selectedElements.length >= 2 && (
        <div className="flex-shrink-0 px-4 py-1 bg-[#0a0a14] border-b border-blue-500/10" dir="rtl">
          <AlignmentToolbar
            selectedElements={selectedElements}
            onUpdateElement={editor.updateElement}
          />
        </div>
      )}

      {/* ── Main content ─────────────────────────────── */}
      <div className="flex-1 flex min-h-0 relative z-10" dir="ltr">
        {/* Thumbnails sidebar */}
        <div
          className="w-[160px] flex-shrink-0 bg-[#0f0f18]/50 border-r border-white/5 overflow-y-auto py-3 px-2 flex flex-col"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#222 transparent' }}
        >
          <div ref={thumbnailsRef} className="flex-1">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className={`relative group mb-2 ${dragOverIndex === index ? 'pt-6' : ''}`}
                draggable
                onDragStart={() => { dragSrcIndex.current = index }}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index) }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={() => {
                  if (dragSrcIndex.current !== null && dragSrcIndex.current !== index) {
                    editor.reorderSlides(dragSrcIndex.current, index)
                  }
                  dragSrcIndex.current = null
                  setDragOverIndex(null)
                }}
                onDragEnd={() => { dragSrcIndex.current = null; setDragOverIndex(null) }}
              >
                {dragOverIndex === index && (
                  <div className="absolute top-0 left-2 right-2 h-1 bg-white/60 rounded-full" />
                )}
                <button
                  onClick={() => editor.selectSlide(index)}
                  className={`w-full rounded-lg overflow-hidden transition-all ${
                    index === editor.selectedSlideIndex
                      ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-[#0a0a0f] shadow-lg shadow-white/5'
                      : 'opacity-50 hover:opacity-80'
                  }`}
                  style={{ aspectRatio: '16/9', position: 'relative', cursor: 'grab' }}
                  title={`${slide.label} (${index + 1}) — גרור לשינוי סדר`}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0 }}>
                    <SlideViewer slide={slide} designSystem={designSystem} scale={thumbScale} />
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent pt-3 pb-1 text-center" style={{ zIndex: 1 }}>
                    <span className="text-[9px] text-white/80 font-medium">{index + 1}</span>
                  </div>
                </button>

                {/* Slide action buttons (visible on hover) */}
                <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ zIndex: 2 }}>
                  <button
                    onClick={(e) => handleDuplicateSlide(index, e)}
                    className="w-5 h-5 rounded bg-black/60 backdrop-blur-sm text-white/70 hover:text-white flex items-center justify-center"
                    title="שכפל שקף"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  {slides.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteSlide(index, e)}
                      className="w-5 h-5 rounded bg-black/60 backdrop-blur-sm text-red-400/70 hover:text-red-300 flex items-center justify-center"
                      title="מחק שקף"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add slide button */}
          <button
            onClick={handleAddSlide}
            className="w-full mt-2 py-2.5 border-2 border-dashed border-white/10 rounded-lg text-gray-500 hover:text-white hover:border-white/30 transition-colors text-xs flex items-center justify-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            הוסף שקף
          </button>
        </div>

        {/* Main slide area */}
        <div ref={slideContainerRef} className="flex-1 flex items-center justify-center overflow-hidden relative" style={{ background: '#0a0a0f' }}>
          {/* Layer Panel */}
          {editor.selectedSlide && (
            <LayerPanel
              slide={editor.selectedSlide}
              selectedElementId={editor.selectedElementId}
              selectedElementIds={editor.selectedElementIds}
              onElementSelect={editor.selectElement}
              onBringToFront={editor.bringToFront}
              onSendToBack={editor.sendToBack}
              onMoveUp={editor.moveLayerUp}
              onMoveDown={editor.moveLayerDown}
              onToggleLock={(id, locked) => editor.updateElement(id, { locked } as Partial<SlideElement>)}
              isOpen={layerPanelOpen}
              onToggle={() => setLayerPanelOpen(p => !p)}
            />
          )}

          {editor.selectedSlide && (
            <div
              className="rounded-xl shadow-2xl shadow-black/60"
              style={{
                width: Math.round(1920 * slideScale),
                height: Math.round(1080 * slideScale),
                position: 'relative',
                overflow: 'visible',
              }}
            >
              {/* Text Format Bar (floating above selected text element) */}
              {selectedTextElement && (
                <TextFormatBar
                  element={selectedTextElement}
                  designSystem={designSystem}
                  scale={slideScale}
                  onChange={(changes) => editor.updateElement(selectedTextElement.id, changes as Partial<SlideElement>)}
                />
              )}

              <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 'inherit' }}>
                <SlideEditor
                  slide={editor.selectedSlide}
                  designSystem={designSystem}
                  scale={slideScale}
                  selectedElementId={editor.selectedElementId}
                  selectedElementIds={editor.selectedElementIds}
                  onElementSelect={editor.selectElement}
                  onAddToSelection={editor.addToSelection}
                  onRemoveFromSelection={editor.removeFromSelection}
                  onSelectElements={editor.selectElements}
                  onElementUpdate={editor.updateElement}
                  onUpdateElements={editor.updateElements}
                  onElementDelete={editor.deleteElement}
                  onDeleteElements={editor.deleteElements}
                  onDuplicateElement={editor.duplicateElement}
                  gridVisible={gridVisible}
                  snapToGrid={snapToGrid}
                />
              </div>
            </div>
          )}
        </div>

        {/* Properties panel */}
        {showProperties && editor.selectedSlide && (
          <PropertiesPanel
            slide={editor.selectedSlide}
            selectedElement={editor.selectedElement}
            designSystem={designSystem}
            documentId={documentId}
            onElementUpdate={editor.updateElement}
            onBackgroundUpdate={editor.updateSlideBackground}
            onClose={() => setShowProperties(false)}
            onImageReplace={(elementId, tab) => { setImageModalMode('replace'); setImageModalElementId(elementId); setImageModalTab(tab || 'upload') }}
            onMockupContentReplace={(elementId) => { setImageModalMode('mockup-content'); setImageModalElementId(elementId); setImageModalTab('upload') }}
            onAIRewrite={handleAIRewrite}
            onRegenerateSlide={() => handleRegenerateSlide()}
            aiDesignInstruction={aiDesignInstruction}
            onAiDesignInstructionChange={setAiDesignInstruction}
            isRegenerating={isRegenerating}
          />
        )}
      </div>

      {/* Image source modal */}
      <ImageSourceModal
        isOpen={imageModalElementId !== null}
        onClose={() => { setImageModalElementId(null); setImageModalMode('replace') }}
        onImageSelected={handleImageSelected}
        designSystem={designSystem}
        documentId={documentId}
        slideLabel={editor.selectedSlide?.label}
        initialTab={imageModalTab}
        slideContext={slideContext}
        allowVideo={imageModalMode === 'mockup-content'}
      />

      <FeedbackDialog
        documentId={documentId}
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
      />

      <ShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        documentId={documentId}
      />

      {showVideoModal && (
        <VideoSourceModal
          onSelect={handleVideoSelected}
          onClose={() => setShowVideoModal(false)}
        />
      )}

      {isPresentationMode && (
        <PresentationMode
          slides={slides}
          designSystem={designSystem}
          startIndex={editor.selectedSlideIndex}
          onExit={() => setIsPresentationMode(false)}
        />
      )}
    </div>
  )
}
