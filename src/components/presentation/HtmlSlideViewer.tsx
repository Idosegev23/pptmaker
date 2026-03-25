'use client'

/**
 * HtmlSlideViewer — renders a single HTML slide in a sandboxed iframe.
 * Used for HTML-Native presentations (v6) where GPT outputs raw HTML/CSS.
 */

interface HtmlSlideViewerProps {
  html: string
  scale?: number
  className?: string
  onClick?: () => void
  isActive?: boolean
}

export default function HtmlSlideViewer({
  html,
  scale = 1,
  className = '',
  onClick,
  isActive = false,
}: HtmlSlideViewerProps) {
  const W = 1920
  const H = 1080

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width: W * scale,
        height: H * scale,
        cursor: onClick ? 'pointer' : 'default',
        outline: isActive ? '3px solid #3b82f6' : 'none',
        outlineOffset: '2px',
        borderRadius: 4,
      }}
      onClick={onClick}
    >
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin"
        style={{
          width: W,
          height: H,
          border: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none', // Prevent interaction inside iframe
        }}
        title="Slide"
      />
    </div>
  )
}
