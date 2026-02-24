'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function SlideViewerPage() {
  const params = useParams()
  const [slides, setSlides] = useState<string[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [brandName, setBrandName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isGeneratingPptx, setIsGeneratingPptx] = useState(false)
  const [documentTitle, setDocumentTitle] = useState('')
  const thumbnailsRef = useRef<HTMLDivElement>(null)
  const slideContainerRef = useRef<HTMLDivElement>(null)
  const [slideScale, setSlideScale] = useState(0.5)

  // Load slides from API
  useEffect(() => {
    loadSlides()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadSlides = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/preview-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: params.id }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load slides')
      }

      const data = await res.json()
      setSlides(data.slides)
      setBrandName(data.brandName)
      setDocumentTitle(data.brandName || 'הצעת מחיר')
    } catch (err) {
      console.error('Error loading slides:', err)
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת השקפים')
    } finally {
      setIsLoading(false)
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrentSlide(prev => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slides.length])

  // Calculate slide scale to fit container
  useEffect(() => {
    const container = slideContainerRef.current
    if (!container || slides.length === 0) return

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
  }, [slides.length])

  // Scroll thumbnail into view
  useEffect(() => {
    if (thumbnailsRef.current) {
      const thumb = thumbnailsRef.current.children[currentSlide] as HTMLElement
      if (thumb) {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [currentSlide])

  // Download PDF
  const downloadPdf = useCallback(async () => {
    setIsGeneratingPdf(true)
    try {
      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: params.id,
          action: 'download',
        }),
      })

      if (!response.ok) throw new Error('PDF generation failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${documentTitle || 'proposal'}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF error:', err)
      alert('שגיאה ביצירת ה-PDF')
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [params.id, documentTitle])

  // Download PPTX
  const downloadPptx = useCallback(async () => {
    setIsGeneratingPptx(true)
    try {
      const response = await fetch('/api/export-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: params.id }),
      })

      if (!response.ok) throw new Error('PPTX generation failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${documentTitle || 'proposal'}.pptx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PPTX error:', err)
      alert('שגיאה ביצירת ה-PPTX')
    } finally {
      setIsGeneratingPptx(false)
    }
  }, [params.id, documentTitle])

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-gray-800"></div>
            <div className="absolute inset-0 rounded-full border-2 border-t-white animate-spin"></div>
          </div>
          <p className="text-gray-400 text-base" dir="rtl">מעצב מצגת עם AI...</p>
          <p className="text-gray-600 text-xs mt-1" dir="rtl">זה יכול לקחת עד דקה בפעם הראשונה</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4 text-red-400">!</div>
          <h2 className="text-lg font-bold text-white mb-2">שגיאה בטעינה</h2>
          <p className="text-gray-400 mb-6 text-sm">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setError(null); setIsLoading(true); loadSlides() }}
              className="px-5 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              נסה שוב
            </button>
            <Link
              href="/documents"
              className="px-5 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              חזרה לרשימה
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (slides.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-gray-400 text-base mb-4">לא נמצאו שקפים</p>
          <Link
            href={`/wizard/${params.id}`}
            className="px-5 py-2 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            חזרה ל-Wizard
          </Link>
        </div>
      </div>
    )
  }

  const scaledW = Math.round(1920 * slideScale)
  const scaledH = Math.round(1080 * slideScale)

  // Thumbnail scale: button is ~140px wide, iframe is 1920px
  const thumbScale = 140 / 1920

  return (
    <div className="h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">
      {/* Header - RTL for Hebrew */}
      <header className="bg-[#0f0f18]/90 backdrop-blur-md border-b border-white/5 z-50 flex-shrink-0" dir="rtl">
        <div className="max-w-[1800px] mx-auto px-5 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/documents"
                className="text-gray-500 hover:text-white transition-colors text-xs flex items-center gap-1"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                חזרה
              </Link>
              <div className="h-4 w-px bg-white/10"></div>
              <h1 className="text-white/90 font-medium text-sm">{brandName || 'הצעת מחיר'}</h1>
              <span className="text-gray-600 text-xs bg-white/5 px-2 py-0.5 rounded">{slides.length} שקפים</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-lg">
                <button
                  onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                  disabled={currentSlide === 0}
                  className="text-gray-400 hover:text-white disabled:opacity-20 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <span className="text-white/70 text-xs font-medium tabular-nums min-w-[40px] text-center" dir="ltr">
                  {currentSlide + 1} / {slides.length}
                </span>
                <button
                  onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))}
                  disabled={currentSlide === slides.length - 1}
                  className="text-gray-400 hover:text-white disabled:opacity-20 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
              </div>

              <Link
                href={`/wizard/${params.id}`}
                className="px-3 py-1.5 text-xs font-medium text-gray-400 bg-white/5 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
              >
                עריכה
              </Link>
              <button
                onClick={downloadPptx}
                disabled={isGeneratingPptx}
                className="px-4 py-1.5 text-xs font-medium text-gray-300 bg-white/10 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingPptx ? 'מייצר...' : 'הורד PPTX'}
              </button>
              <button
                onClick={downloadPdf}
                disabled={isGeneratingPdf}
                className="px-4 py-1.5 text-xs font-medium text-black bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingPdf ? 'מייצר...' : 'הורד PDF'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content - LTR for correct iframe scaling (thumbnails left, slide right) */}
      <div className="flex-1 flex min-h-0" dir="ltr">
        {/* Thumbnails sidebar - left side */}
        <div
          className="w-[160px] flex-shrink-0 bg-[#0f0f18]/50 border-r border-white/5 overflow-y-auto py-3 px-2"
          ref={thumbnailsRef}
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#222 transparent' }}
        >
          {slides.map((slideHtml, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-full mb-2 rounded-lg overflow-hidden transition-all ${
                index === currentSlide
                  ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-[#0a0a0f] shadow-lg shadow-white/5'
                  : 'opacity-50 hover:opacity-80'
              }`}
              style={{ aspectRatio: '16/9', position: 'relative' }}
            >
              <iframe
                srcDoc={slideHtml}
                className="pointer-events-none"
                tabIndex={-1}
                title={`thumbnail ${index + 1}`}
                sandbox="allow-same-origin"
                loading="lazy"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 1920,
                  height: 1080,
                  transform: `scale(${thumbScale})`,
                  transformOrigin: 'top left',
                  background: '#fff',
                  border: 'none',
                }}
              />
              <div
                className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent pt-3 pb-1 text-center"
                style={{ zIndex: 1 }}
              >
                <span className="text-[9px] text-white/80 font-medium">{index + 1}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Main slide area */}
        <div
          ref={slideContainerRef}
          className="flex-1 flex items-center justify-center overflow-hidden"
          style={{ background: '#0a0a0f' }}
        >
          <div
            className="rounded-xl shadow-2xl shadow-black/60"
            style={{
              width: scaledW,
              height: scaledH,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <iframe
              key={currentSlide}
              srcDoc={slides[currentSlide]}
              sandbox="allow-same-origin"
              title={`שקף ${currentSlide + 1}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 1920,
                height: 1080,
                transform: `scale(${slideScale})`,
                transformOrigin: 'top left',
                background: '#fff',
                border: 'none',
                display: 'block',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
