'use client'

/**
 * HtmlSlideshow — fullscreen slideshow viewer for HTML-native presentations.
 * Used in share page and presentation mode.
 *
 * Features:
 * - Arrow key navigation
 * - Click to advance
 * - Slide counter
 * - Fullscreen toggle
 * - Touch swipe support
 * - Escape to exit fullscreen
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface HtmlSlideshowProps {
  htmlSlides: string[]
  brandName?: string
}

export default function HtmlSlideshow({ htmlSlides, brandName = '' }: HtmlSlideshowProps) {
  const [current, setCurrent] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)

  const total = htmlSlides.length

  const goNext = useCallback(() => setCurrent(c => Math.min(total - 1, c + 1)), [total])
  const goPrev = useCallback(() => setCurrent(c => Math.max(0, c - 1)), [])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
      if (e.key === 'Home') { e.preventDefault(); setCurrent(0) }
      if (e.key === 'End') { e.preventDefault(); setCurrent(total - 1) }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 'Escape') exitFullscreen()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev, total])

  // Touch swipe
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) { dx > 0 ? goPrev() : goNext() }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  // Sanitize
  const sanitize = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className="relative w-full h-screen bg-black overflow-hidden select-none"
      onClick={goNext}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Current slide */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${Math.min(
              (typeof window !== 'undefined' ? window.innerWidth : 1920) / 1920,
              (typeof window !== 'undefined' ? window.innerHeight : 1080) / 1080
            )})`,
            transformOrigin: 'center center',
          }}
        >
          <iframe
            srcDoc={sanitize(htmlSlides[current] || '')}
            sandbox="allow-same-origin"
            style={{ width: 1920, height: 1080, border: 'none', pointerEvents: 'none' }}
            title={`Slide ${current + 1}`}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-6 py-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity z-10">
        <div className="flex items-center gap-4">
          {/* Navigation */}
          <button onClick={(e) => { e.stopPropagation(); goPrev() }} disabled={current === 0} className="text-white/70 hover:text-white disabled:text-white/20 text-lg">→</button>
          <span className="text-white/60 text-sm font-mono">{current + 1} / {total}</span>
          <button onClick={(e) => { e.stopPropagation(); goNext() }} disabled={current === total - 1} className="text-white/70 hover:text-white disabled:text-white/20 text-lg">←</button>
        </div>

        <div className="flex items-center gap-3">
          {brandName && <span className="text-white/40 text-xs">{brandName}</span>}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
            className="text-white/50 hover:text-white text-sm px-2 py-1 rounded border border-white/20"
          >
            {isFullscreen ? 'יציאה' : 'מסך מלא'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute top-0 inset-x-0 h-1 bg-white/10 z-10">
        <div
          className="h-full bg-white/60 transition-all duration-300"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  )
}
