'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { renderStructuredSlide } from '@/lib/gemini/layout-prototypes/renderer'
import ShareDialog from '@/components/share/ShareDialog'
import {
  Undo2, Redo2, Grid3x3, Magnet, Copy, Sparkles, Play, Download, Share2, MessageSquare,
  Image as ImageIcon, Video, Type, Square, Circle, Minus, Palette, RefreshCw, Eye, EyeOff,
  ArrowLeft, ArrowRight, Trash2, RotateCcw, Plus, ChevronLeft, Layers, Settings,
} from 'lucide-react'
import type { StructuredPresentation, StructuredSlide, LayoutId, FreeElement } from '@/lib/gemini/layout-prototypes/types'

const LAYOUTS: LayoutId[] = [
  'hero-cover', 'full-bleed-image-text', 'split-image-text', 'centered-insight',
  'three-pillars-grid', 'numbered-stats', 'influencer-grid', 'closing-cta',
]

// Inline-edit roles → slot key mapping (renderer's data-role → slots key)
const ROLE_TO_SLOT_KEY: Record<string, string> = {
  eyebrow: 'eyebrowLabel',
  title: 'title',
  subtitle: 'subtitle',
  tagline: 'tagline',
  body: 'body',
  bodyText: 'bodyText',
  brandName: 'brandName',
  'data-point': 'dataPoint',
  'data-label': 'dataLabel',
  source: 'source',
}

export default function GammaProtoPage() {
  const params = useParams<{ id: string }>()
  const [pres, setPres] = useState<StructuredPresentation | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [mediaPicker, setMediaPicker] = useState<'image' | 'video' | null>(null)
  const [snap, setSnap] = useState(false)
  const [grid, setGrid] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const clipboardRef = useRef<FreeElement | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  // Undo/redo: debounced snapshots of the *previous* state
  const historyRef = useRef<StructuredPresentation[]>([])
  const futureRef = useRef<StructuredPresentation[]>([])
  const lastSnapshot = useRef<StructuredPresentation | null>(null)
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [histVersion, setHistVersion] = useState(0) // force re-render for button enable state

  useEffect(() => {
    if (!pres) return
    if (!lastSnapshot.current) { lastSnapshot.current = pres; return }
    if (lastSnapshot.current === pres) return
    const prev = lastSnapshot.current
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
    snapshotTimer.current = setTimeout(() => {
      historyRef.current = [...historyRef.current.slice(-49), prev]
      futureRef.current = []
      lastSnapshot.current = pres
      setHistVersion(v => v + 1)
    }, 400)
  }, [pres])

  function undo() {
    if (historyRef.current.length === 0 || !pres) return
    const prev = historyRef.current[historyRef.current.length - 1]
    historyRef.current = historyRef.current.slice(0, -1)
    futureRef.current = [pres, ...futureRef.current].slice(0, 50)
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
    lastSnapshot.current = prev
    setPres(prev)
    setHistVersion(v => v + 1)
  }
  function redo() {
    if (futureRef.current.length === 0 || !pres) return
    const next = futureRef.current[0]
    futureRef.current = futureRef.current.slice(1)
    historyRef.current = [...historyRef.current, pres].slice(-50)
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current)
    lastSnapshot.current = next
    setPres(next)
    setHistVersion(v => v + 1)
  }

  // Global shortcuts: Cmd/Ctrl+Z, Shift+Cmd+Z, Cmd+D (duplicate slide)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (!meta && !isTyping) return
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (meta && e.key.toLowerCase() === 'd' && !isTyping) {
        e.preventDefault()
        duplicateSlide()
      }
      if (meta && e.key.toLowerCase() === 'c' && selectedRole?.startsWith('free-') && !isTyping) {
        const cur = pres?.slides[idx]
        const el = cur?.freeElements?.find(f => f.id === selectedRole)
        if (el) clipboardRef.current = el
      }
      if (meta && e.key.toLowerCase() === 'v' && clipboardRef.current && !isTyping) {
        e.preventDefault()
        const src = clipboardRef.current
        appendFreeElement({ ...src, id: `free-${src.kind}-${Date.now()}` })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function duplicateSlide() {
    if (!pres) return
    const copy = JSON.parse(JSON.stringify(pres.slides[idx])) as StructuredSlide
    const slides = [...pres.slides]
    slides.splice(idx + 1, 0, copy)
    setPres({ ...pres, slides })
    setIdx(idx + 1)
  }

  // Generate (first time)
  const generate = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/gamma-prototype', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: params.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Request failed')
      setPres(json.presentation)
      setIdx(0)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Unknown error') }
    finally { setLoading(false) }
  }, [params.id])

  // Load existing structured presentation, or generate fresh
  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/documents/${params.id}`)
        const json = await res.json()
        const stored = json?.document?.data?._structuredPresentation as StructuredPresentation | undefined
        if (stored && stored.slides?.length) {
          setPres(stored); setIdx(0); setLoading(false); return
        }
      } catch {}
      // No stored — generate
      generate()
    })()
  }, [params.id, generate])

  // Auto-save (debounced 1.5s)
  useEffect(() => {
    if (!pres) return
    setSaving('saving')
    const t = setTimeout(async () => {
      try {
        await fetch(`/api/documents/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _structuredPresentation: pres }),
        })
        setSaving('saved')
      } catch { setSaving('idle') }
    }, 1500)
    return () => clearTimeout(t)
  }, [pres, params.id])

  const slide = pres?.slides[idx]
  const html = useMemo(
    () => (slide && pres ? renderStructuredSlide(slide, pres.designSystem, { editor: true, grid, snap }) : ''),
    [slide, pres, grid, snap],
  )

  // Receive edits from in-iframe editor
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      if (!pres || !ev.data?.type) return
      const cur = pres.slides[idx]

      if (ev.data.type === 'gamma-edit') {
        const { role, styleString } = ev.data as { role: string; styleString: string }
        const next = { ...pres, slides: [...pres.slides] }
        next.slides[idx] = { ...cur, elementStyles: { ...(cur.elementStyles || {}), [role]: styleString } }
        setPres(next)
        return
      }

      if (ev.data.type === 'gamma-text') {
        const { role, text } = ev.data as { role: string; text: string }
        const next = { ...pres, slides: [...pres.slides] }
        if (role.startsWith('free-')) {
          const free = (cur.freeElements || []).map(f => f.id === role ? { ...f, text } : f)
          next.slides[idx] = { ...cur, freeElements: free }
        } else {
          const slotKey = ROLE_TO_SLOT_KEY[role] || role
          next.slides[idx] = { ...cur, slots: { ...cur.slots, [slotKey]: text } as never }
        }
        setPres(next)
        return
      }

      if (ev.data.type === 'gamma-delete-free') {
        const { role } = ev.data as { role: string }
        const next = { ...pres, slides: [...pres.slides] }
        next.slides[idx] = { ...cur, freeElements: (cur.freeElements || []).filter(f => f.id !== role) }
        setPres(next)
        return
      }

      if (ev.data.type === 'gamma-selected') {
        setSelectedRole(ev.data.role || null)
        return
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [pres, idx])

  // Upload media to Supabase Storage and add as free element
  async function uploadFile(file: File, kind: 'image' | 'video') {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const res = await fetch('/api/gamma-prototype/upload', { method: 'POST', body: fd })
    const json = await res.json()
    if (!json.url) { alert('Upload failed: ' + (json.error || 'unknown')); return }
    addFreeMedia(kind, json.url)
  }

  // Slot mutations
  function updateSlot(key: string, value: unknown) {
    if (!pres) return
    const next = { ...pres, slides: [...pres.slides] }
    next.slides[idx] = { ...next.slides[idx], slots: { ...next.slides[idx].slots, [key]: value } as never }
    setPres(next)
  }

  function moveSlide(from: number, to: number) {
    if (!pres) return
    if (to < 0 || to >= pres.slides.length) return
    const slides = [...pres.slides]
    const [m] = slides.splice(from, 1)
    slides.splice(to, 0, m)
    setPres({ ...pres, slides })
    setIdx(to)
  }

  function deleteSlide() {
    if (!pres || pres.slides.length <= 1) return
    if (!confirm('למחוק את השקף?')) return
    const slides = pres.slides.filter((_, i) => i !== idx)
    setPres({ ...pres, slides })
    setIdx(Math.min(idx, slides.length - 1))
  }

  function addSlide(layout: LayoutId) {
    if (!pres) return
    const fresh: StructuredSlide = {
      slideType: layout,
      layout,
      slots: defaultSlotsFor(layout) as never,
    }
    const slides = [...pres.slides]
    slides.splice(idx + 1, 0, fresh)
    setPres({ ...pres, slides })
    setIdx(idx + 1)
  }

  function addFreeMedia(kind: FreeElement['kind'], value: string) {
    if (!pres) return
    const id = `free-${kind}-${Date.now()}`
    const el: FreeElement = kind === 'text'
      ? { id, kind, text: value }
      : { id, kind, src: value }
    appendFreeElement(el)
  }

  function appendFreeElement(el: FreeElement) {
    if (!pres) return
    const next = { ...pres, slides: [...pres.slides] }
    const cur = next.slides[idx]
    next.slides[idx] = { ...cur, freeElements: [...(cur.freeElements || []), el] }
    setPres(next)
  }

  function addShape(shape: 'rect' | 'circle' | 'line') {
    if (!pres) return
    const id = `free-shape-${Date.now()}`
    const primary = pres.designSystem.colors.primary
    const baseStyle = shape === 'line'
      ? 'position:absolute; left:660px; top:520px; width:600px; height:4px; z-index:50;'
      : 'position:absolute; left:760px; top:440px; width:400px; height:400px; z-index:50;'
    appendFreeElement({
      id, kind: 'shape', shape,
      fill: shape === 'line' ? primary : primary + '40',
      stroke: shape === 'line' ? primary : primary,
      style: baseStyle,
    })
  }

  function setSlideBg(bg: { color?: string; image?: string } | undefined) {
    if (!pres) return
    const next = { ...pres, slides: [...pres.slides] }
    next.slides[idx] = { ...next.slides[idx], bg }
    setPres(next)
  }

  async function regenerateSlide() {
    if (!pres || !slide) return
    const instruction = prompt('איך לשפר את השקף? (אופציונלי — ריק = עיצוב מחדש כללי)') || undefined
    setRegenBusy(true)
    try {
      const res = await fetch('/api/gamma-prototype/regenerate-slide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slide, instruction, presentation: pres }),
      })
      const json = await res.json()
      if (!json.slide) { alert('רגן נכשל: ' + (json.error || 'unknown')); return }
      const next = { ...pres, slides: [...pres.slides] }
      next.slides[idx] = { ...json.slide, elementStyles: {}, freeElements: [], hiddenRoles: [] }
      setPres(next)
    } finally { setRegenBusy(false) }
  }

  function selectLayerInIframe(role: string) {
    const frame = document.querySelector('iframe') as HTMLIFrameElement | null
    frame?.contentWindow?.postMessage({ type: 'gamma-select', role }, '*')
  }

  async function exportPdf() {
    try {
      const res = await fetch('/api/gamma-prototype/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: params.id, presentation: pres }),
      })
      const json = await res.json()
      if (json.pdfUrl) window.open(json.pdfUrl, '_blank')
      else alert('PDF failed: ' + (json.error || 'unknown'))
    } catch (e) { alert('PDF error: ' + (e instanceof Error ? e.message : 'unknown')) }
  }

  async function aiRewrite(key: string, mode: 'shorter' | 'dramatic' | 'formal') {
    if (!slide) return
    const value = (slide.slots as unknown as Record<string, unknown>)[key]
    if (typeof value !== 'string' || !value.trim()) return
    setAiBusy(key)
    try {
      const res = await fetch('/api/gamma-prototype/rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, mode, context: { slideType: slide.slideType, field: key } }),
      })
      const json = await res.json()
      if (json.text) updateSlot(key, json.text)
    } finally { setAiBusy(null) }
  }

  const [zoom, setZoom] = useState(0.6667)

  const selectedFreeEl = selectedRole?.startsWith('free-')
    ? slide?.freeElements?.find(f => f.id === selectedRole)
    : undefined

  function updateFreeElement(id: string, patch: Partial<FreeElement>) {
    if (!pres || !slide) return
    const next = { ...pres, slides: [...pres.slides] }
    next.slides[idx] = {
      ...slide,
      freeElements: (slide.freeElements || []).map(f => f.id === id ? { ...f, ...patch } : f),
    }
    setPres(next)
  }

  return (
    <div style={{ background: '#0f0f10', color: '#eee', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Heebo, system-ui, sans-serif', overflow: 'hidden' }} dir="rtl">
      {/* ─── Header ──────────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid #1f1f22', background: '#15151a', height: 56, flexShrink: 0 }}>
        <button onClick={() => history.back()} style={{ ...iconBtn(), padding: 6 }} title="חזרה">
          <ChevronLeft size={18} />
        </button>
        <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{pres?.brandName || 'עורך מצגת'}</h1>
        <span style={{ fontSize: 11, color: saving === 'saving' ? '#fbbf24' : saving === 'saved' ? '#4ade80' : '#666' }}>
          {saving === 'saving' ? '• שומר…' : saving === 'saved' ? '✓ נשמר' : ''}
        </span>

        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <ToolbarGroup>
            <IconBtn onClick={undo} disabled={historyRef.current.length === 0} title="בטל (⌘Z)"><Undo2 size={16} /></IconBtn>
            <IconBtn onClick={redo} disabled={futureRef.current.length === 0} title="חזור (⇧⌘Z)"><Redo2 size={16} /></IconBtn>
          </ToolbarGroup>
          <ToolbarGroup>
            <IconBtn onClick={() => setGrid(g => !g)} active={grid} title="רשת"><Grid3x3 size={16} /></IconBtn>
            <IconBtn onClick={() => setSnap(s => !s)} active={snap} title="הצמד לרשת"><Magnet size={16} /></IconBtn>
            <IconBtn onClick={duplicateSlide} title="שכפל שקף (⌘D)"><Copy size={16} /></IconBtn>
          </ToolbarGroup>
          <ToolbarGroup>
            <IconBtn onClick={() => setChatOpen(c => !c)} active={chatOpen} title="צ'אט AI"><MessageSquare size={16} /></IconBtn>
            <IconBtn onClick={regenerateSlide} disabled={regenBusy} title="עצב מחדש את השקף (AI)">
              <Sparkles size={16} />
            </IconBtn>
            <IconBtn onClick={generate} disabled={loading} title="ייצר מצגת מחדש (הכל)">
              <RefreshCw size={16} />
            </IconBtn>
          </ToolbarGroup>
          <ToolbarGroup>
            <IconBtn onClick={() => setPresenting(true)} title="הצג במסך מלא"><Play size={16} /></IconBtn>
            <IconBtn onClick={exportPdf} title="הורד PDF"><Download size={16} /></IconBtn>
            <button onClick={() => setShareOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0ea5e9', color: '#fff', border: 0, borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <Share2 size={14} /> שיתוף
            </button>
          </ToolbarGroup>
        </div>
      </header>

      {err && <div style={{ background: '#40141a', padding: 10, margin: 10, borderRadius: 6, fontSize: 13 }}>⚠ {err}</div>}

      {pres && slide && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* ─── Far left: slide thumbnails strip ─────── */}
          <aside style={{ width: 140, borderInlineEnd: '1px solid #1f1f22', overflow: 'auto', padding: 8, background: '#141416' }}>
            {pres.slides.map((s, i) => (
              <SlideThumb key={i} slide={s} ds={pres.designSystem} index={i}
                active={i === idx} onClick={() => setIdx(i)} />
            ))}
            <button onClick={() => addSlide('hero-cover')}
              style={{ width: '100%', padding: '10px 6px', marginTop: 8, background: '#1f1f22',
                color: '#888', border: '1px dashed #333', borderRadius: 6, cursor: 'pointer',
                fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Plus size={14} /> שקף
            </button>
          </aside>

          {/* ─── Left: Elements panel ─────────────────── */}
          <aside style={{ width: 240, borderInlineEnd: '1px solid #1f1f22', overflow: 'auto', background: '#18181b' }}>
            <ElementsPanel
              onAddText={() => addFreeMedia('text', 'טקסט חדש — לחץ פעמיים לעריכה')}
              onAddImage={() => setMediaPicker('image')}
              onAddVideo={() => setMediaPicker('video')}
              onAddShape={addShape}
              layouts={LAYOUTS}
              onChangeLayout={(layout) => {
                if (!pres || !slide) return
                const next = { ...pres, slides: [...pres.slides] }
                next.slides[idx] = { ...slide, layout, elementStyles: {}, freeElements: [], hiddenRoles: [] } as StructuredSlide
                setPres(next)
              }}
              currentLayout={slide.layout}
            />
          </aside>

          {/* ─── Center: canvas ──────────────────────── */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0f0f10' }}>
            {/* Slide ops bar */}
            <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid #1f1f22', alignItems: 'center' }}>
              <IconBtn onClick={() => moveSlide(idx, idx - 1)} disabled={idx === 0} title="הזז קודם"><ArrowRight size={16} /></IconBtn>
              <IconBtn onClick={() => moveSlide(idx, idx + 1)} disabled={idx === pres.slides.length - 1} title="הזז אחרי"><ArrowLeft size={16} /></IconBtn>
              <IconBtn onClick={deleteSlide} disabled={pres.slides.length <= 1} title="מחק שקף" danger><Trash2 size={16} /></IconBtn>
              <span style={{ fontSize: 12, color: '#888', marginInlineStart: 12 }}>
                שקף {idx + 1} / {pres.slides.length} · <span style={{ color: '#aaa' }}>{slide.layout}</span>
              </span>
              <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconBtn onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="הקטן"><Minus size={14} /></IconBtn>
                <span style={{ fontSize: 11, color: '#888', width: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <IconBtn onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="הגדל"><Plus size={14} /></IconBtn>
                <button onClick={() => setZoom(0.6667)} style={{ fontSize: 11, color: '#888', background: 'transparent', border: '1px solid #333', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>Fit</button>
              </div>
            </div>

            {/* Floating text format toolbar */}
            {selectedFreeEl?.kind === 'text' && (
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #1f1f22' }}>
                <TextFormatToolbar element={selectedFreeEl} ds={pres.designSystem}
                  onChange={(fmt) => updateFreeElement(selectedFreeEl.id, { format: { ...selectedFreeEl.format, ...fmt } })} />
              </div>
            )}

            {/* Canvas */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div style={{
                width: 1920 * zoom, height: 1080 * zoom, position: 'relative',
                background: '#000', borderRadius: 8, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
              }}>
                <iframe srcDoc={html} style={{
                  width: 1920, height: 1080, border: 0,
                  transform: `scale(${zoom})`, transformOrigin: 'top left',
                  position: 'absolute', top: 0, left: 0,
                }} />
              </div>
            </div>
          </main>

          {/* ─── Right: contextual properties + layers ─ */}
          <aside style={{ width: 340, borderInlineStart: '1px solid #1f1f22', overflow: 'auto', background: '#18181b', display: 'flex', flexDirection: 'column' }}>
            <PropertiesPanel
              slide={slide}
              pres={pres}
              selectedRole={selectedRole}
              selectedFreeEl={selectedFreeEl}
              onUpdateFreeElement={updateFreeElement}
              onUpdateSlot={updateSlot}
              onAiRewrite={aiRewrite}
              aiBusy={aiBusy}
              onSetBg={setSlideBg}
              onResetOverrides={() => {
                if (!pres) return
                const next = { ...pres, slides: [...pres.slides] }
                next.slides[idx] = { ...next.slides[idx], elementStyles: {} }
                setPres(next)
              }}
              onDeleteFreeElement={(id) => {
                if (!pres || !slide) return
                const next = { ...pres, slides: [...pres.slides] }
                next.slides[idx] = { ...slide, freeElements: (slide.freeElements || []).filter(f => f.id !== id) }
                setPres(next)
                setSelectedRole(null)
              }}
            />

            <div style={{ borderTop: '1px solid #1f1f22', padding: 12, flexShrink: 0 }}>
              <LayersPanel
                html={html}
                slide={slide}
                onSelect={(role) => selectLayerInIframe(role)}
                onToggleHide={(role) => {
                  if (!pres) return
                  const hidden = new Set(slide.hiddenRoles || [])
                  if (hidden.has(role)) hidden.delete(role); else hidden.add(role)
                  const next = { ...pres, slides: [...pres.slides] }
                  next.slides[idx] = { ...slide, hiddenRoles: Array.from(hidden) }
                  setPres(next)
                }}
                onResetElement={(role) => {
                  if (!pres) return
                  const styles = { ...(slide.elementStyles || {}) }
                  delete styles[role]
                  const next = { ...pres, slides: [...pres.slides] }
                  next.slides[idx] = { ...slide, elementStyles: styles }
                  setPres(next)
                }}
              />
            </div>
          </aside>
        </div>
      )}

      {loading && !pres && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          <Sparkles size={20} style={{ marginInlineEnd: 10 }} /> טוען / מייצר…
        </div>
      )}

      <ShareDialog
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        documentId={params.id as string}
      />

      {chatOpen && pres && (
        <AIChatPanel
          presentation={pres}
          onApply={(next) => setPres(next)}
          onClose={() => setChatOpen(false)}
        />
      )}

      {presenting && pres && (
        <PresentationMode
          presentation={pres}
          startIndex={idx}
          onClose={() => setPresenting(false)}
        />
      )}

      {mediaPicker && (
        <MediaPicker
          kind={mediaPicker}
          onClose={() => setMediaPicker(null)}
          onPick={(url) => { addFreeMedia(mediaPicker, url); setMediaPicker(null) }}
          documentId={params.id as string}
        />
      )}
    </div>
  )
}

function btn(bg: string): React.CSSProperties {
  return { padding: '6px 12px', background: bg, color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer', fontSize: 12 }
}

function iconBtn(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, background: 'transparent', color: '#bbb',
    border: 0, borderRadius: 6, cursor: 'pointer',
  }
}

function IconBtn({ children, onClick, disabled, title, active, danger }: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  active?: boolean
  danger?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        ...iconBtn(),
        background: active ? '#E94560' : 'transparent',
        color: disabled ? '#444' : danger ? '#f87171' : active ? '#fff' : '#bbb',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled && !active) (e.currentTarget.style.background = '#27272a') }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget.style.background = 'transparent') }}>
      {children}
    </button>
  )
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 2, paddingInline: 6, borderInlineEnd: '1px solid #27272a' }}>
      {children}
    </div>
  )
}

// ─── Elements panel (left sidebar) ──────────────────────

function ElementsPanel({
  onAddText, onAddImage, onAddVideo, onAddShape, layouts, onChangeLayout, currentLayout,
}: {
  onAddText: () => void
  onAddImage: () => void
  onAddVideo: () => void
  onAddShape: (s: 'rect' | 'circle' | 'line') => void
  layouts: readonly LayoutId[]
  onChangeLayout: (l: LayoutId) => void
  currentLayout: LayoutId
}) {
  const [tab, setTab] = useState<'elements' | 'layouts'>('elements')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #27272a' }}>
        {(['elements', 'layouts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: 10, background: tab === t ? '#27272a' : 'transparent',
              color: tab === t ? '#fff' : '#888', border: 0, fontSize: 12, cursor: 'pointer',
              borderBottom: tab === t ? '2px solid #E94560' : '2px solid transparent',
              fontWeight: tab === t ? 600 : 400, fontFamily: 'inherit',
            }}>
            {t === 'elements' ? 'רכיבים' : 'פריסות'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {tab === 'elements' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ElementCard icon={<Type size={22} />} label="טקסט" onClick={onAddText} />
            <ElementCard icon={<ImageIcon size={22} />} label="תמונה" onClick={onAddImage} />
            <ElementCard icon={<Video size={22} />} label="וידאו" onClick={onAddVideo} />
            <ElementCard icon={<Square size={22} />} label="מלבן" onClick={() => onAddShape('rect')} />
            <ElementCard icon={<Circle size={22} />} label="עיגול" onClick={() => onAddShape('circle')} />
            <ElementCard icon={<Minus size={22} />} label="קו" onClick={() => onAddShape('line')} />
          </div>
        )}

        {tab === 'layouts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>לחץ לבחירת פריסה לשקף הנוכחי</div>
            {layouts.map(l => (
              <button key={l} onClick={() => onChangeLayout(l)}
                style={{
                  padding: '8px 10px', background: l === currentLayout ? '#E94560' : '#1f1f22',
                  color: l === currentLayout ? '#fff' : '#bbb',
                  border: 0, borderRadius: 5, cursor: 'pointer', fontSize: 11,
                  textAlign: 'right', fontFamily: 'inherit', fontWeight: l === currentLayout ? 600 : 400,
                }}>{layoutLabel(l)}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ElementCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: '16px 8px', background: '#1f1f22', color: '#bbb',
        border: '1px solid #27272a', borderRadius: 6, cursor: 'pointer', fontSize: 11,
        fontFamily: 'inherit', transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2f'; e.currentTarget.style.color = '#fff' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#1f1f22'; e.currentTarget.style.color = '#bbb' }}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function layoutLabel(l: LayoutId): string {
  const map: Record<LayoutId, string> = {
    'hero-cover': 'שער',
    'full-bleed-image-text': 'תמונה מלאה + טקסט',
    'split-image-text': 'פיצול תמונה/טקסט',
    'centered-insight': 'תובנה מרכזית',
    'three-pillars-grid': '3 עמודים',
    'numbered-stats': 'נתונים ממוספרים',
    'influencer-grid': 'גריד משפיענים',
    'closing-cta': 'סיום + CTA',
  }
  return map[l] || l
}

// ─── Properties panel (contextual right sidebar) ────────

function PropertiesPanel({
  slide, pres, selectedRole, selectedFreeEl,
  onUpdateFreeElement, onUpdateSlot, onAiRewrite, aiBusy,
  onSetBg, onResetOverrides, onDeleteFreeElement,
}: {
  slide: StructuredSlide
  pres: StructuredPresentation
  selectedRole: string | null
  selectedFreeEl?: FreeElement
  onUpdateFreeElement: (id: string, patch: Partial<FreeElement>) => void
  onUpdateSlot: (k: string, v: unknown) => void
  onAiRewrite: (k: string, mode: 'shorter' | 'dramatic' | 'formal') => void
  aiBusy: string | null
  onSetBg: (bg: { color?: string; image?: string } | undefined) => void
  onResetOverrides: () => void
  onDeleteFreeElement: (id: string) => void
}) {
  const ds = pres.designSystem

  // Nothing selected → slide settings
  if (!selectedRole) {
    return (
      <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
        <PanelHeader icon={<Settings size={14} />} title="הגדרות שקף" />

        <Section label="רקע השקף">
          <ColorRow label="צבע" value={slide.bg?.color || ds.colors.background}
            palette={[ds.colors.background, ds.colors.primary, ds.colors.secondary, ds.colors.accent, '#0a0a0a', '#ffffff']}
            onChange={(c) => onSetBg({ ...(slide.bg || {}), color: c })} />
          {slide.bg && (
            <button onClick={() => onSetBg(undefined)} style={ghostBtn()}>
              <RotateCcw size={12} /> אפס רקע
            </button>
          )}
        </Section>

        <Section label="מיקומים">
          <button onClick={onResetOverrides} style={ghostBtn()}>
            <RotateCcw size={12} /> אפס כל המיקומים בשקף
          </button>
        </Section>

        <Section label="שדות תוכן">
          <SlotEditor
            slots={slide.slots as unknown as Record<string, unknown>}
            onChange={onUpdateSlot}
            onAiRewrite={onAiRewrite}
            aiBusy={aiBusy}
          />
        </Section>
      </div>
    )
  }

  // Free element selected
  if (selectedFreeEl) {
    return (
      <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
        <PanelHeader icon={iconForFreeKind(selectedFreeEl.kind)} title={labelForFreeKind(selectedFreeEl.kind)} />

        {selectedFreeEl.kind === 'text' && (
          <Section label="תוכן">
            <textarea
              value={selectedFreeEl.text || ''}
              onChange={(e) => onUpdateFreeElement(selectedFreeEl.id, { text: e.target.value })}
              rows={4}
              style={inputStyle()} />
          </Section>
        )}

        {(selectedFreeEl.kind === 'image' || selectedFreeEl.kind === 'video') && (
          <Section label="מקור">
            <input value={selectedFreeEl.src || ''}
              onChange={(e) => onUpdateFreeElement(selectedFreeEl.id, { src: e.target.value })}
              style={inputStyle()} />
            {selectedFreeEl.src && selectedFreeEl.kind === 'image' && (
              <img src={selectedFreeEl.src} alt="" style={{ marginTop: 8, maxWidth: '100%', borderRadius: 4 }} />
            )}
          </Section>
        )}

        {selectedFreeEl.kind === 'shape' && (
          <>
            <Section label="מילוי">
              <ColorRow label="צבע" value={selectedFreeEl.fill || ds.colors.primary}
                palette={[ds.colors.primary + '40', ds.colors.primary, ds.colors.accent + '40', ds.colors.accent, '#ffffff40', '#00000040']}
                onChange={(c) => onUpdateFreeElement(selectedFreeEl.id, { fill: c })} />
            </Section>
            <Section label="מסגרת">
              <ColorRow label="צבע" value={selectedFreeEl.stroke || ''}
                palette={[ds.colors.primary, ds.colors.accent, ds.colors.secondary, '#ffffff', 'transparent']}
                onChange={(c) => onUpdateFreeElement(selectedFreeEl.id, { stroke: c })} />
            </Section>
          </>
        )}

        <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid #27272a' }}>
          <button onClick={() => onDeleteFreeElement(selectedFreeEl.id)}
            style={{ ...ghostBtn(), color: '#f87171' }}>
            <Trash2 size={12} /> מחק אלמנט
          </button>
        </div>
      </div>
    )
  }

  // Slot/decor role selected — just show layer info + reset
  return (
    <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
      <PanelHeader icon={<Eye size={14} />} title={`נבחר: ${selectedRole}`} />
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
        גרור בתצוגה להזיז. לחץ פעמיים לערוך טקסט.
      </div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>
        משנה שדות תוכן? בטל את הבחירה וגלול לתחתית.
      </div>
    </div>
  )
}

function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #27272a' }}>
      <span style={{ color: '#888' }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  )
}

function ColorRow({ value, palette, onChange }: { label: string; value: string; palette: string[]; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {palette.map(c => (
        <button key={c} onClick={() => onChange(c)} title={c}
          style={{
            width: 26, height: 26, background: c, borderRadius: 4, cursor: 'pointer',
            border: value === c ? '2px solid #fff' : '1px solid #333',
          }} />
      ))}
      <input type="color" value={value.startsWith('#') && value.length === 7 ? value : '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 32, height: 26, background: 'transparent', border: '1px solid #333', borderRadius: 4, cursor: 'pointer' }} />
    </div>
  )
}

function ghostBtn(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', background: '#1f1f22', color: '#bbb',
    border: '1px solid #2a2a2f', borderRadius: 5, cursor: 'pointer',
    fontSize: 11, fontFamily: 'inherit',
  }
}

function iconForFreeKind(k: FreeElement['kind']): React.ReactNode {
  if (k === 'text') return <Type size={14} />
  if (k === 'image') return <ImageIcon size={14} />
  if (k === 'video') return <Video size={14} />
  return <Square size={14} />
}

function labelForFreeKind(k: FreeElement['kind']): string {
  if (k === 'text') return 'טקסט'
  if (k === 'image') return 'תמונה'
  if (k === 'video') return 'וידאו'
  return 'צורה'
}

// ─── Slot editor ──────────────────────────────────────────

function SlotEditor({
  slots, onChange, onAiRewrite, aiBusy,
}: {
  slots: Record<string, unknown>
  onChange: (k: string, v: unknown) => void
  onAiRewrite: (k: string, mode: 'shorter' | 'dramatic' | 'formal') => void
  aiBusy: string | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Object.entries(slots).map(([key, value]) => (
        <Field key={key} fieldKey={key} value={value} onChange={onChange} onAiRewrite={onAiRewrite} aiBusy={aiBusy} />
      ))}
    </div>
  )
}

function Field({
  fieldKey, value, onChange, onAiRewrite, aiBusy,
}: {
  fieldKey: string
  value: unknown
  onChange: (k: string, v: unknown) => void
  onAiRewrite: (k: string, mode: 'shorter' | 'dramatic' | 'formal') => void
  aiBusy: string | null
}) {
  const label = (
    <label style={{ display: 'block', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{fieldKey}</label>
  )

  // Strings
  if (typeof value === 'string' || value == null) {
    const s = String(value ?? '')
    const isLong = s.length > 60 || /\n/.test(s)
    const isImage = /^https?:\/\//.test(s) && /(image|pic|bg|photo|img)/i.test(fieldKey)
    return (
      <div>
        {label}
        {isLong ? (
          <textarea value={s} onChange={(e) => onChange(fieldKey, e.target.value)} rows={4}
            style={inputStyle()} />
        ) : (
          <input value={s} onChange={(e) => onChange(fieldKey, e.target.value)} style={inputStyle()} />
        )}
        {isImage && s && (
          <img src={s} alt="" style={{ maxWidth: '100%', maxHeight: 100, marginTop: 6, borderRadius: 4 }} />
        )}
        {typeof value === 'string' && s.trim() && !isImage && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {(['shorter', 'dramatic', 'formal'] as const).map(m => (
              <button key={m} onClick={() => onAiRewrite(fieldKey, m)} disabled={aiBusy === fieldKey}
                style={{ padding: '3px 8px', background: '#1f3a4d', color: '#9cf', border: 0, borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
                {aiBusy === fieldKey ? '…' : `AI: ${m}`}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Booleans
  if (typeof value === 'boolean') {
    return (
      <div>
        {label}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={value} onChange={(e) => onChange(fieldKey, e.target.checked)} />
          {fieldKey}
        </label>
      </div>
    )
  }

  // Arrays
  if (Array.isArray(value)) {
    return (
      <div>
        {label}
        <ArrayField fieldKey={fieldKey} arr={value} onChange={(v) => onChange(fieldKey, v)} />
      </div>
    )
  }

  // Fallback (objects → JSON)
  return (
    <div>
      {label}
      <textarea value={JSON.stringify(value, null, 2)} rows={6}
        onChange={(e) => { try { onChange(fieldKey, JSON.parse(e.target.value)) } catch {} }}
        style={{ ...inputStyle(), fontFamily: 'monospace', fontSize: 11 }} />
    </div>
  )
}

function ArrayField({ arr, onChange }: { fieldKey: string; arr: unknown[]; onChange: (v: unknown[]) => void }) {
  function updateItem(i: number, v: unknown) {
    const next = [...arr]; next[i] = v; onChange(next)
  }
  function deleteItem(i: number) { onChange(arr.filter((_, j) => j !== i)) }
  function addItem() {
    const sample = arr[0]
    if (typeof sample === 'string') onChange([...arr, ''])
    else if (sample && typeof sample === 'object') {
      const blank = Object.fromEntries(Object.keys(sample as object).map(k => [k, '']))
      onChange([...arr, blank])
    } else onChange([...arr, ''])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {arr.map((item, i) => (
        <div key={i} style={{ background: '#141414', padding: 8, borderRadius: 4, position: 'relative' }}>
          <button onClick={() => deleteItem(i)}
            style={{ position: 'absolute', top: 4, insetInlineStart: 4, background: '#5a1a1a', color: '#fff', border: 0, borderRadius: 3, fontSize: 10, cursor: 'pointer', padding: '2px 6px' }}>×</button>
          {typeof item === 'string' ? (
            <input value={item} onChange={(e) => updateItem(i, e.target.value)} style={inputStyle()} />
          ) : item && typeof item === 'object' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                <div key={k}>
                  <label style={{ fontSize: 10, opacity: 0.5, display: 'block' }}>{k}</label>
                  <input
                    value={String(v ?? '')}
                    onChange={(e) => updateItem(i, { ...(item as object), [k]: e.target.value })}
                    style={inputStyle()}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      <button onClick={addItem}
        style={{ padding: '6px', background: '#1a3a1a', color: '#9f9', border: 0, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
        + הוסף פריט
      </button>
    </div>
  )
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%', background: '#1a1a1a', color: '#eee', border: '1px solid #333',
    borderRadius: 4, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit',
    direction: 'rtl' as const,
  }
}

// ─── Default slots per layout ─────────────────────────────

function defaultSlotsFor(layout: LayoutId): unknown {
  switch (layout) {
    case 'hero-cover': return { brandName: '', title: 'כותרת', subtitle: '', tagline: '', eyebrowLabel: '' }
    case 'full-bleed-image-text': return { image: '', eyebrowLabel: '', title: 'כותרת', subtitle: '', body: '' }
    case 'split-image-text': return { image: '', imageSide: 'left', eyebrowLabel: '', title: 'כותרת', bodyText: '', bullets: [] }
    case 'centered-insight': return { eyebrowLabel: '', title: 'תובנה', dataPoint: '', dataLabel: '', source: '' }
    case 'three-pillars-grid': return { eyebrowLabel: '', title: 'כותרת', pillars: [
      { number: '01', title: '', description: '' },
      { number: '02', title: '', description: '' },
      { number: '03', title: '', description: '' },
    ] }
    case 'numbered-stats': return { eyebrowLabel: '', title: 'נתונים', stats: [{ value: '', label: '' }] }
    case 'influencer-grid': return { eyebrowLabel: '', title: 'משפיענים', subtitle: '', influencers: [{ name: '', handle: '', followers: '', engagement: '' }] }
    case 'closing-cta': return { brandName: '', title: 'בואו נתחיל', tagline: '' }
  }
}

// ─── Layers panel ─────────────────────────────────────────

const DECOR_LABELS: Record<string, string> = {
  'decor-atm-1': '✨ זוהר אטמוספרי',
  'decor-stripe-top': '▔ פס עליון',
  'decor-stripe-bottom': '▁ פס תחתון',
  'decor-corner-tl': '◤ פינה שמאל-עליון',
  'decor-corner-br': '◢ פינה ימין-תחתון',
  'decor-slide-num': '# מספר שקף',
  'decor-img-bleed': '🖼 תמונת רקע',
  'decor-img-overlay': '▦ שכבת כהוי',
}

function LayersPanel({
  html, slide, onSelect, onToggleHide, onResetElement,
}: {
  html: string
  slide: StructuredSlide
  onSelect: (role: string) => void
  onToggleHide: (role: string) => void
  onResetElement: (role: string) => void
}) {
  // Extract all data-role values from rendered HTML
  const roles = useMemo(() => {
    const found = new Set<string>()
    const re = /data-role="([^"]+)"/g
    let m
    while ((m = re.exec(html)) !== null) found.add(m[1])
    return Array.from(found)
  }, [html])

  const hidden = new Set(slide.hiddenRoles || [])
  const overridden = new Set(Object.keys(slide.elementStyles || {}))
  const decor = roles.filter(r => r.startsWith('decor-'))
  const free = roles.filter(r => r.startsWith('free-'))
  const content = roles.filter(r => !r.startsWith('decor-') && !r.startsWith('free-'))

  function Row({ role, label }: { role: string; label: string }) {
    const isHidden = hidden.has(role)
    const isOverridden = overridden.has(role)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', background: '#141414', borderRadius: 3, marginBottom: 2 }}>
        <button onClick={() => !isHidden && onSelect(role)}
          style={{ flex: 1, textAlign: 'right', background: 'transparent', color: isHidden ? '#555' : '#ddd', border: 0, cursor: isHidden ? 'default' : 'pointer', fontSize: 11, padding: 0 }}>
          {label} {isOverridden && <span style={{ color: '#E94560', fontSize: 9 }}>●</span>}
        </button>
        {isOverridden && !isHidden && (
          <button onClick={() => onResetElement(role)} title="אפס מיקום"
            style={{ background: '#2a2a2a', color: '#888', border: 0, borderRadius: 2, cursor: 'pointer', fontSize: 10, padding: '2px 5px' }}>↺</button>
        )}
        <button onClick={() => onToggleHide(role)} title={isHidden ? 'הצג' : 'הסתר'}
          style={{ background: '#2a2a2a', color: isHidden ? '#E94560' : '#888', border: 0, borderRadius: 2, cursor: 'pointer', fontSize: 10, padding: '2px 5px' }}>
          {isHidden ? '◌' : '◉'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>שכבות</div>
      {content.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>תוכן</div>
          {content.map(r => <Row key={r} role={r} label={r} />)}
        </div>
      )}
      {free.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>אלמנטים חופשיים</div>
          {free.map(r => <Row key={r} role={r} label={r.replace(/^free-/, '') + ' ✎'} />)}
        </div>
      )}
      {decor.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4 }}>קישוטים</div>
          {decor.map(r => <Row key={r} role={r} label={DECOR_LABELS[r] || r} />)}
        </div>
      )}
    </div>
  )
}

// ─── AI chat panel ────────────────────────────────────────

function AIChatPanel({ presentation, onApply, onClose }: {
  presentation: StructuredPresentation
  onApply: (next: StructuredPresentation) => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([])

  async function send() {
    if (!input.trim() || busy) return
    const instruction = input.trim()
    setLog(l => [...l, { role: 'user', text: instruction }])
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/gamma-prototype/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presentation, instruction }),
      })
      const json = await res.json()
      if (!json.presentation) throw new Error(json.error || 'chat failed')
      onApply(json.presentation)
      setLog(l => [...l, { role: 'ai', text: '✓ עדכנתי את המצגת' }])
    } catch (e) {
      setLog(l => [...l, { role: 'ai', text: '❌ ' + (e instanceof Error ? e.message : 'error') }])
    } finally { setBusy(false) }
  }

  const quick = [
    'קצר את כל הטקסטים',
    'הפוך את הטון לדרמטי יותר',
    'תרגם הכל לאנגלית',
    'שנה את הפלטה לצבעים חמים',
  ]

  return (
    <div style={{ position: 'fixed', bottom: 16, insetInlineStart: 16, width: 360, background: '#141414', border: '1px solid #333', borderRadius: 10, zIndex: 80, display: 'flex', flexDirection: 'column', maxHeight: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #222' }}>
        <strong style={{ fontSize: 13, color: '#eee' }}>💬 צ'אט AI — שינויים רוחביים</strong>
        <button onClick={onClose} style={{ marginInlineStart: 'auto', background: 'transparent', color: '#888', border: 0, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ padding: 10, flex: 1, overflow: 'auto', fontSize: 12, color: '#ddd' }}>
        {log.length === 0 && (
          <div style={{ opacity: 0.6, marginBottom: 8 }}>
            כתוב/י מה לשנות במצגת כולה.
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} style={{ marginBottom: 8, padding: 8, background: m.role === 'user' ? '#1f2937' : '#1a1a1a', borderRadius: 6 }}>
            <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 2 }}>{m.role === 'user' ? 'אתה' : 'AI'}</div>
            {m.text}
          </div>
        ))}
        {busy && <div style={{ opacity: 0.7 }}>⏳ AI עובד…</div>}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid #222' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {quick.map(q => (
            <button key={q} onClick={() => setInput(q)} disabled={busy}
              style={{ padding: '3px 8px', background: '#222', color: '#aaa', border: 0, borderRadius: 3, cursor: 'pointer', fontSize: 10 }}>
              {q}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={busy}
            placeholder="לדוגמה: 'הפוך את כל הכותרות למינימליסטיות'"
            style={{ flex: 1, background: '#0a0a0a', color: '#eee', border: '1px solid #333', borderRadius: 4, padding: '6px 8px', fontSize: 12 }} />
          <button onClick={send} disabled={busy || !input.trim()} style={{ ...btn('#E94560'), padding: '6px 12px' }}>שלח</button>
        </div>
      </div>
    </div>
  )
}

// ─── Text formatting toolbar (for selected free text) ────

function TextFormatToolbar({ element, ds, onChange }: {
  element: FreeElement
  ds: StructuredPresentation['designSystem']
  onChange: (fmt: NonNullable<FreeElement['format']>) => void
}) {
  const fmt = element.format || {}
  const palette = [ds.colors.text, ds.colors.primary, ds.colors.accent, ds.colors.secondary, ds.colors.muted, '#ffffff', '#000000']
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 8, background: '#1a1a1a', borderRadius: 6, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, opacity: 0.6, marginInlineEnd: 6 }}>טקסט:</span>
      <button onClick={() => onChange({ fontWeight: fmt.fontWeight === '800' ? '400' : '800' })}
        style={{ ...btn(fmt.fontWeight === '800' ? '#E94560' : '#333'), fontWeight: 'bold' }}>B</button>
      <button onClick={() => onChange({ fontStyle: fmt.fontStyle === 'italic' ? 'normal' : 'italic' })}
        style={{ ...btn(fmt.fontStyle === 'italic' ? '#E94560' : '#333'), fontStyle: 'italic' }}>I</button>
      <button onClick={() => onChange({ textDecoration: fmt.textDecoration === 'underline' ? 'none' : 'underline' })}
        style={{ ...btn(fmt.textDecoration === 'underline' ? '#E94560' : '#333'), textDecoration: 'underline' }}>U</button>
      <div style={{ width: 1, height: 20, background: '#333' }} />
      <input type="number" value={fmt.fontSize || 32} min={8} max={300}
        onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        style={{ width: 60, background: '#0a0a0a', color: '#eee', border: '1px solid #333', borderRadius: 3, padding: '4px 6px', fontSize: 12 }} />
      <span style={{ fontSize: 10, opacity: 0.5 }}>px</span>
      <div style={{ width: 1, height: 20, background: '#333' }} />
      {(['right','center','left'] as const).map(a => (
        <button key={a} onClick={() => onChange({ textAlign: a })}
          style={btn(fmt.textAlign === a ? '#E94560' : '#333')}>
          {a === 'right' ? '⇥' : a === 'center' ? '☰' : '⇤'}
        </button>
      ))}
      <div style={{ width: 1, height: 20, background: '#333' }} />
      <span style={{ fontSize: 11, opacity: 0.6 }}>צבע:</span>
      {palette.map(c => (
        <button key={c} onClick={() => onChange({ color: c })}
          title={c}
          style={{ width: 22, height: 22, background: c, border: fmt.color === c ? '2px solid #fff' : '1px solid #444', borderRadius: 3, cursor: 'pointer' }} />
      ))}
      <input type="color" value={fmt.color || '#ffffff'}
        onChange={(e) => onChange({ color: e.target.value })}
        style={{ width: 30, height: 22, background: 'transparent', border: '1px solid #444', borderRadius: 3, cursor: 'pointer' }} />
    </div>
  )
}

// ─── Background picker ────────────────────────────────────

function BgPickerButton({ slide, ds, onChange }: {
  slide: StructuredSlide
  ds: StructuredPresentation['designSystem']
  onChange: (bg: { color?: string; image?: string } | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const palette = [ds.colors.background, ds.colors.primary, ds.colors.secondary, ds.colors.accent, '#0a0a0a', '#ffffff']
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={btn('#333')} title="רקע שקף">🎨 רקע</button>
      {open && (
        <div style={{ position: 'absolute', top: 36, insetInlineEnd: 0, background: '#1a1a1a', padding: 12, borderRadius: 6, border: '1px solid #333', zIndex: 50, minWidth: 220 }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>מהפלטה:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {palette.map(c => (
              <button key={c} onClick={() => { onChange({ color: c }); setOpen(false) }}
                style={{ width: 32, height: 32, background: c, border: '1px solid #444', borderRadius: 4, cursor: 'pointer' }} />
            ))}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>צבע חופשי:</div>
          <input type="color" defaultValue={slide.bg?.color || ds.colors.background}
            onChange={(e) => onChange({ color: e.target.value })}
            style={{ width: '100%', height: 32, background: 'transparent', border: 0, cursor: 'pointer' }} />
          <button onClick={() => { onChange(undefined); setOpen(false) }}
            style={{ ...btn('#222'), width: '100%', marginTop: 8 }}>אפס רקע</button>
        </div>
      )}
    </div>
  )
}

// ─── Slide thumbnail ──────────────────────────────────────

function SlideThumb({ slide, ds, index, active, onClick }: {
  slide: StructuredSlide
  ds: StructuredPresentation['designSystem']
  index: number
  active: boolean
  onClick: () => void
}) {
  const html = useMemo(() => renderStructuredSlide(slide, ds), [slide, ds])
  return (
    <div onClick={onClick}
      style={{
        marginBottom: 8,
        border: active ? '2px solid #E94560' : '2px solid #222',
        borderRadius: 4, cursor: 'pointer', overflow: 'hidden',
        background: '#000', position: 'relative',
      }}>
      <div style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative', overflow: 'hidden' }}>
        <iframe srcDoc={html} tabIndex={-1}
          style={{
            width: 1920, height: 1080, border: 0, pointerEvents: 'none',
            transform: 'scale(0.1)', transformOrigin: 'top left',
            position: 'absolute', top: 0, left: 0,
          }}
          sandbox="allow-same-origin"
        />
      </div>
      <div style={{ padding: '4px 8px', fontSize: 10, color: active ? '#fff' : '#999', background: active ? '#E94560' : '#141414', display: 'flex', justifyContent: 'space-between' }}>
        <span>{index + 1}</span>
        <span style={{ opacity: 0.8 }}>{slide.slideType}</span>
      </div>
    </div>
  )
}

// ─── Presentation mode ────────────────────────────────────

function PresentationMode({ presentation, startIndex, onClose }: {
  presentation: StructuredPresentation
  startIndex: number
  onClose: () => void
}) {
  const [i, setI] = useState(startIndex)
  const html = useMemo(() => {
    const s = presentation.slides[i]
    return s ? renderStructuredSlide(s, presentation.designSystem) : ''
  }, [presentation, i])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (['ArrowRight','PageDown',' '].includes(e.key)) setI(x => Math.min(x + 1, presentation.slides.length - 1))
      else if (['ArrowLeft','PageUp'].includes(e.key)) setI(x => Math.max(x - 1, 0))
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(presentation.slides.length - 1)
    }
    window.addEventListener('keydown', onKey)
    // Try native fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => {
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [onClose, presentation.slides.length])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9' }}>
          <iframe
            srcDoc={html}
            style={{
              width: 1920, height: 1080, border: 0,
              transform: `scale(calc(min(100vw, 100vh * 16 / 9) / 1920))`,
              transformOrigin: 'top left',
              position: 'absolute', top: 0, left: 0,
            }}
          />
        </div>
      </div>
      <div style={{ padding: 8, color: '#888', fontSize: 12, display: 'flex', alignItems: 'center', gap: 14, background: '#0a0a0a', borderTop: '1px solid #222' }}>
        <button onClick={onClose} style={{ padding: '4px 10px', background: '#333', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}>✕ סגור (Esc)</button>
        <button onClick={() => setI(x => Math.max(x - 1, 0))} disabled={i === 0} style={{ padding: '4px 10px', background: '#222', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}>◀</button>
        <button onClick={() => setI(x => Math.min(x + 1, presentation.slides.length - 1))} disabled={i === presentation.slides.length - 1} style={{ padding: '4px 10px', background: '#222', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer' }}>▶</button>
        <span>{i + 1} / {presentation.slides.length}</span>
        <span style={{ marginInlineStart: 'auto', opacity: 0.5 }}>⌨ חצים / רווח / Home / End</span>
      </div>
    </div>
  )
}

// ─── Media picker modal ───────────────────────────────────

function MediaPicker({ kind, onClose, onPick, documentId }: {
  kind: 'image' | 'video'
  onClose: () => void
  onPick: (url: string) => void
  documentId: string
}) {
  const [tab, setTab] = useState<'upload' | 'url' | 'ai'>(kind === 'image' ? 'ai' : 'upload')
  const [url, setUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [genUrl, setGenUrl] = useState<string | null>(null)

  async function doUpload(file: File) {
    setBusy('העלאה…'); setErr(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('kind', kind)
      const res = await fetch('/api/gamma-prototype/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.url) throw new Error(json.error || 'Upload failed')
      onPick(json.url)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed') }
    finally { setBusy(null) }
  }

  async function doGenerate() {
    if (!prompt.trim()) return
    setBusy('מייצר תמונה…'); setErr(null); setGenUrl(null)
    try {
      const res = await fetch('/api/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, documentId }),
      })
      const json = await res.json()
      if (!json.imageUrl) throw new Error(json.error || 'Generation failed')
      setGenUrl(json.imageUrl)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Generation failed') }
    finally { setBusy(null) }
  }

  const tabs: Array<{ id: 'upload' | 'url' | 'ai'; label: string; show: boolean }> = [
    { id: 'ai', label: '✨ ייצר עם AI', show: kind === 'image' },
    { id: 'upload', label: '⬆ מהמחשב', show: true },
    { id: 'url', label: '🔗 כתובת', show: true },
  ]

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: '#141414', borderRadius: 10, padding: 20, width: 520, maxHeight: '90vh', overflow: 'auto', direction: 'rtl', color: '#eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{kind === 'image' ? 'הוספת תמונה' : 'הוספת וידאו'}</h3>
          <button onClick={onClose} style={{ marginInlineStart: 'auto', background: 'transparent', color: '#888', border: 0, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #333' }}>
          {tabs.filter(t => t.show).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '8px 14px', background: 'transparent', color: tab === t.id ? '#E94560' : '#888',
                border: 0, borderBottom: tab === t.id ? '2px solid #E94560' : '2px solid transparent',
                cursor: 'pointer', fontSize: 13 }}>{t.label}</button>
          ))}
        </div>

        {err && <div style={{ background: '#40141a', padding: 8, borderRadius: 4, marginBottom: 12, fontSize: 12 }}>{err}</div>}
        {busy && <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 12 }}>⏳ {busy}</div>}

        {tab === 'ai' && kind === 'image' && (
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              תיאור התמונה (באנגלית או עברית, ככל שמפורט יותר — טוב יותר):
            </div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="לדוגמה: אישה צעירה יושבת בקפה בתל אביב, אור שמש רך של אחר הצהריים, מצולם כאילו מאינסטגרם"
              rows={4} style={inputStyle()} />
            <button onClick={doGenerate} disabled={!!busy || !prompt.trim()}
              style={{ ...btn('#E94560'), marginTop: 10, width: '100%', padding: '10px' }}>
              ✨ ייצר תמונה
            </button>
            {genUrl && (
              <div style={{ marginTop: 14 }}>
                <img src={genUrl} alt="" style={{ width: '100%', borderRadius: 6 }} />
                <button onClick={() => onPick(genUrl)}
                  style={{ ...btn('#1a3a1a'), marginTop: 8, width: '100%' }}>השתמש בתמונה הזאת</button>
                <button onClick={() => { setGenUrl(null); setPrompt('') }}
                  style={{ ...btn('#333'), marginTop: 6, width: '100%' }}>ייצר שוב עם תיאור אחר</button>
              </div>
            )}
          </div>
        )}

        {tab === 'upload' && (
          <div>
            <label style={{ display: 'block', border: '2px dashed #444', borderRadius: 8, padding: 40, textAlign: 'center', cursor: 'pointer', background: '#0a0a0a' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{kind === 'image' ? '🖼️' : '🎬'}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>לחץ לבחירת קובץ או גרור לכאן</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                {kind === 'image' ? 'JPG / PNG / WebP' : 'MP4 / WebM — עד 50MB'}
              </div>
              <input type="file" accept={kind === 'image' ? 'image/*' : 'video/*'} style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f) }} />
            </label>
          </div>
        )}

        {tab === 'url' && (
          <div>
            <label style={{ fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 6 }}>כתובת URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..." style={inputStyle()} />
            <button onClick={() => url.trim() && onPick(url.trim())}
              disabled={!url.trim()}
              style={{ ...btn('#1a3a1a'), marginTop: 10, width: '100%', padding: '10px' }}>
              הוסף
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
