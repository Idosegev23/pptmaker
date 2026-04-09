'use client'

import { useRef, useCallback, useEffect, useState } from 'react'

/**
 * HtmlSlideEditor — editable HTML slide in an iframe.
 *
 * Injects a thin editing layer into GPT-generated HTML:
 * - Text elements become contentEditable on double-click
 * - Elements can be dragged (single click + drag)
 * - Parent receives updated HTML via onHtmlChange callback
 */

interface HtmlSlideEditorProps {
  html: string
  scale?: number
  onHtmlChange?: (newHtml: string) => void
  className?: string
}

// Editing script injected into the iframe
const EDITOR_SCRIPT = `
<script>
(function() {
  const slide = document.querySelector('.slide') || document.body.firstElementChild || document.body;
  let dragTarget = null;
  let dragStartX = 0, dragStartY = 0;
  let elemStartX = 0, elemStartY = 0;
  let isEditing = false;

  // Make all positioned elements interactive
  function initElements() {
    const elements = slide.querySelectorAll('[style*="position"]');
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position !== 'absolute' && style.position !== 'relative') return;
      if (el === slide) return;

      // Visual hover indicator
      el.addEventListener('mouseenter', () => {
        if (!isEditing) el.style.outline = '2px dashed rgba(59,130,246,0.5)';
      });
      el.addEventListener('mouseleave', () => {
        if (!isEditing || el !== dragTarget) el.style.outline = '';
      });

      // Double-click to edit text
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (el.textContent && el.textContent.trim()) {
          el.contentEditable = 'true';
          el.style.outline = '2px solid #3b82f6';
          el.style.cursor = 'text';
          el.focus();
          isEditing = true;

          const exitEdit = () => {
            el.contentEditable = 'false';
            el.style.outline = '';
            el.style.cursor = '';
            isEditing = false;
            notifyParent();
          };
          el.addEventListener('blur', exitEdit, { once: true });
          el.addEventListener('keydown', (ke) => {
            if (ke.key === 'Escape') { el.blur(); }
          });
        }
      });

      // Single click + drag to move
      el.addEventListener('mousedown', (e) => {
        if (isEditing) return;
        if (e.detail >= 2) return; // double-click handled above
        e.preventDefault();
        dragTarget = el;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        elemStartX = parseInt(el.style.left) || el.offsetLeft;
        elemStartY = parseInt(el.style.top) || el.offsetTop;
        el.style.outline = '2px solid #3b82f6';
        el.style.zIndex = '9999';
      });
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (!dragTarget) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dragTarget.style.left = (elemStartX + dx) + 'px';
    dragTarget.style.top = (elemStartY + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (dragTarget) {
      dragTarget.style.outline = '';
      dragTarget.style.zIndex = '';
      dragTarget = null;
      notifyParent();
    }
  });

  // Click on empty space = deselect
  slide.addEventListener('click', (e) => {
    if (e.target === slide) {
      document.querySelectorAll('[contenteditable="true"]').forEach(el => el.blur());
    }
  });

  function notifyParent() {
    // Send updated HTML back to parent
    const fullHtml = document.documentElement.outerHTML;
    window.parent.postMessage({ type: 'slide-html-update', html: '<!DOCTYPE html>' + fullHtml }, window.location.ancestorOrigins?.[0] || '*');
  }

  // Init after a short delay (let styles settle)
  setTimeout(initElements, 100);
})();
<\/script>
`;

export default function HtmlSlideEditor({
  html,
  scale = 0.55,
  onHtmlChange,
  className = '',
}: HtmlSlideEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isReady, setIsReady] = useState(false)
  const W = 1920
  const H = 1080

  // Inject editor script into HTML (robust: handle missing </body>)
  const editableHtml = html.includes('</body>')
    ? html.replace('</body>', EDITOR_SCRIPT + '</body>')
    : html.includes('</html>')
    ? html.replace('</html>', EDITOR_SCRIPT + '</html>')
    : html + EDITOR_SCRIPT

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'slide-html-update' && onHtmlChange) {
        // Strip our editor script before saving
        const cleanHtml = event.data.html.replace(/<script>[\s\S]*?<\/script>/g, '')
        onHtmlChange(cleanHtml)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onHtmlChange])

  // Detect iframe load
  const handleLoad = useCallback(() => {
    setIsReady(true)
  }, [])

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-900/90 backdrop-blur-sm border-b border-gray-700 rounded-t-lg">
        <span className="text-[10px] text-emerald-400 font-medium">עריכה חיה</span>
        <span className="text-[10px] text-gray-500">|</span>
        <span className="text-[10px] text-gray-400">לחיצה כפולה = עריכת טקסט</span>
        <span className="text-[10px] text-gray-500">|</span>
        <span className="text-[10px] text-gray-400">גרירה = הזזת אלמנט</span>
        {!isReady && <span className="text-[10px] text-amber-400 animate-pulse mr-auto">טוען...</span>}
      </div>

      {/* Scaled iframe container */}
      <div
        style={{
          width: Math.round(W * scale),
          height: Math.round(H * scale),
          marginTop: 32, // toolbar height
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '0 0 8px 8px',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={editableHtml}
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleLoad}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            border: 'none',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          title="Slide Editor"
        />
      </div>
    </div>
  )
}
