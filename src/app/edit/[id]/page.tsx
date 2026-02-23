'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function SlideViewerPage() {
  const router = useRouter()
  const params = useParams()
  const [slides, setSlides] = useState<string[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [brandName, setBrandName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [documentTitle, setDocumentTitle] = useState('')
  const thumbnailsRef = useRef<HTMLDivElement>(null)

  // Load slides from API
  useEffect(() => {
    loadSlides()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadSlides = async () => {
    try {
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

  // Scroll thumbnail into view
  useEffect(() => {
    if (thumbnailsRef.current) {
      const thumb = thumbnailsRef.current.children[currentSlide] as HTMLElement
      if (thumb) {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
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

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-gray-800"></div>
            <div className="absolute inset-0 rounded-full border-2 border-t-white animate-spin"></div>
          </div>
          <p className="text-gray-400 text-lg">מייצר תצוגה מקדימה...</p>
          <p className="text-gray-600 text-sm mt-2">מעבד את שקפי המצגת</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">!</div>
          <h2 className="text-xl font-bold text-white mb-2">שגיאה בטעינה</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setError(null); setIsLoading(true); loadSlides() }}
              className="px-5 py-2.5 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              נסה שוב
            </button>
            <Link
              href="/documents"
              className="px-5 py-2.5 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-700 transition-colors"
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">לא נמצאו שקפים</p>
          <Link
            href={`/wizard/${params.id}`}
            className="px-5 py-2.5 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            חזרה ל-Wizard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col" dir="rtl">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/documents"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                &larr; חזרה
              </Link>
              <div className="h-5 w-px bg-gray-700"></div>
              <div>
                <h1 className="text-white font-semibold">{brandName || 'הצעת מחיר'}</h1>
                <p className="text-gray-500 text-xs">{slides.length} שקפים</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href={`/wizard/${params.id}`}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
              >
                עריכה ב-Wizard
              </Link>
              <button
                onClick={downloadPdf}
                disabled={isGeneratingPdf}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingPdf ? 'מייצר PDF...' : 'הורד PDF'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Slide */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6">
        <div className="w-full max-w-[1200px]">
          {/* Slide container with 16:9 aspect ratio */}
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              key={currentSlide}
              srcDoc={slides[currentSlide]}
              className="absolute inset-0 w-full h-full rounded-lg shadow-2xl shadow-black/50 border border-gray-800"
              sandbox="allow-same-origin"
              title={`שקף ${currentSlide + 1}`}
              style={{ background: '#fff' }}
            />
          </div>

          {/* Navigation controls */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
              disabled={currentSlide === 0}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>

            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm font-medium tabular-nums">
                {currentSlide + 1} / {slides.length}
              </span>
            </div>

            <button
              onClick={() => setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1))}
              disabled={currentSlide === slides.length - 1}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="bg-gray-900/80 border-t border-gray-800 px-6 py-4">
        <div
          ref={thumbnailsRef}
          className="flex gap-3 overflow-x-auto pb-2 max-w-[1600px] mx-auto scrollbar-thin"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}
        >
          {slides.map((slideHtml, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`flex-shrink-0 relative rounded-md overflow-hidden transition-all ${
                index === currentSlide
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105'
                  : 'opacity-60 hover:opacity-90'
              }`}
              style={{ width: '160px', height: '90px' }}
            >
              <iframe
                srcDoc={slideHtml}
                className="w-[1920px] h-[1080px] pointer-events-none"
                tabIndex={-1}
                title={`thumbnail ${index + 1}`}
                sandbox="allow-same-origin"
                loading="lazy"
                style={{
                  transform: 'scale(0.0833)',
                  transformOrigin: 'top left',
                  background: '#fff',
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center">
                <span className="text-[10px] text-white font-medium">{index + 1}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
