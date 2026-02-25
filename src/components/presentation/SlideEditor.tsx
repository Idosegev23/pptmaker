'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import type { Slide, SlideElement, DesignSystem } from '@/types/presentation'
import { CANVAS_WIDTH, CANVAS_HEIGHT, isTextElement } from '@/types/presentation'
import ElementRenderer from './ElementRenderer'

interface SlideEditorProps {
  slide: Slide
  designSystem: DesignSystem
  scale: number
  selectedElementId: string | null
  onElementSelect: (id: string | null) => void
  onElementUpdate: (id: string, changes: Partial<SlideElement>) => void
  onElementDelete?: (id: string) => void
  onDuplicateElement?: (id: string) => void
}

function getBackgroundStyle(bg: Slide['background']): React.CSSProperties {
  switch (bg.type) {
    case 'solid':
      return { background: bg.value }
    case 'gradient':
      return { background: bg.value }
    case 'image':
      return { background: `url('${bg.value}') center/cover no-repeat` }
    default:
      return { background: '#1a1a2e' }
  }
}

export default function SlideEditor({
  slide,
  designSystem,
  scale,
  selectedElementId,
  onElementSelect,
  onElementUpdate,
  onElementDelete,
  onDuplicateElement,
}: SlideEditorProps) {
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const sortedElements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return // Don't handle keys while editing text

      // Delete/Backspace — delete selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        const el = slide.elements.find(el => el.id === selectedElementId)
        if (el && !el.locked) {
          e.preventDefault()
          onElementDelete?.(selectedElementId)
        }
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        onElementSelect(null)
        setEditingTextId(null)
      }

      // Ctrl+D — duplicate selected element
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedElementId) {
        e.preventDefault()
        onDuplicateElement?.(selectedElementId)
      }

      // Arrow keys — nudge selected element
      if (selectedElementId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const el = slide.elements.find(el => el.id === selectedElementId)
        if (el && !el.locked) {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const changes: Partial<SlideElement> = {}
          switch (e.key) {
            case 'ArrowUp': changes.y = el.y - step; break
            case 'ArrowDown': changes.y = el.y + step; break
            case 'ArrowLeft': changes.x = el.x - step; break
            case 'ArrowRight': changes.x = el.x + step; break
          }
          onElementUpdate(selectedElementId, changes)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedElementId, editingTextId, slide.elements, onElementSelect, onElementDelete, onDuplicateElement, onElementUpdate])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvas === 'true') {
      onElementSelect(null)
      setEditingTextId(null)
    }
  }, [onElementSelect])

  const handleElementClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onElementSelect(id)
    setEditingTextId(null)
  }, [onElementSelect])

  const handleElementDoubleClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const element = slide.elements.find(el => el.id === id)
    if (element && isTextElement(element) && !element.locked) {
      setEditingTextId(id)
      onElementSelect(id)
    }
  }, [slide.elements, onElementSelect])

  const handleTextChange = useCallback((id: string, content: string) => {
    onElementUpdate(id, { content } as Partial<SlideElement>)
    setEditingTextId(null)
  }, [onElementUpdate])

  return (
    <div
      ref={containerRef}
      style={{
        width: CANVAS_WIDTH * scale,
        height: CANVAS_HEIGHT * scale,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Scaled inner container */}
      <div
        data-canvas="true"
        onClick={handleCanvasClick}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          position: 'relative',
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          fontFamily: `'${designSystem.fonts.heading}', sans-serif`,
          direction: designSystem.direction,
          cursor: 'default',
          ...getBackgroundStyle(slide.background),
        }}
      >
        {sortedElements.map((element) => {
          const isSelected = selectedElementId === element.id
          const isEditingText = editingTextId === element.id
          const isLocked = element.locked

          return (
            <Rnd
              key={element.id}
              size={{ width: element.width, height: element.height }}
              position={{ x: element.x, y: element.y }}
              scale={scale}
              disableDragging={isLocked || isEditingText}
              enableResizing={!isLocked && !isEditingText && isSelected}
              onDragStop={(_e, d) => {
                onElementUpdate(element.id, {
                  x: Math.round(d.x),
                  y: Math.round(d.y),
                } as Partial<SlideElement>)
              }}
              onResizeStop={(_e, _direction, ref, _delta, position) => {
                onElementUpdate(element.id, {
                  width: Math.round(parseFloat(ref.style.width)),
                  height: Math.round(parseFloat(ref.style.height)),
                  x: Math.round(position.x),
                  y: Math.round(position.y),
                } as Partial<SlideElement>)
              }}
              bounds="parent"
              style={{
                zIndex: element.zIndex,
                opacity: element.opacity ?? 1,
                transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                outline: isSelected ? '2px solid #3b82f6' : 'none',
                outlineOffset: '2px',
                cursor: isLocked ? 'default' : isEditingText ? 'text' : 'move',
              }}
              resizeHandleStyles={{
                topLeft: handleStyle,
                topRight: handleStyle,
                bottomLeft: handleStyle,
                bottomRight: handleStyle,
                top: { ...barStyle, top: -3, left: '20%', width: '60%', height: 6 },
                bottom: { ...barStyle, bottom: -3, left: '20%', width: '60%', height: 6 },
                left: { ...barStyle, left: -3, top: '20%', width: 6, height: '60%' },
                right: { ...barStyle, right: -3, top: '20%', width: 6, height: '60%' },
              }}
            >
              <div
                style={{ width: '100%', height: '100%', position: 'relative' }}
                onClick={(e) => handleElementClick(element.id, e)}
                onDoubleClick={(e) => handleElementDoubleClick(element.id, e)}
              >
                <ElementRenderer
                  element={element}
                  designSystem={designSystem}
                  isEditing={isEditingText}
                  onTextChange={(content) => handleTextChange(element.id, content)}
                />
              </div>
            </Rnd>
          )
        })}
      </div>
    </div>
  )
}

// Styles for resize handles
const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#3b82f6',
  borderRadius: '50%',
  border: '2px solid white',
  zIndex: 999,
}

const barStyle: React.CSSProperties = {
  background: 'transparent',
  cursor: 'default',
  zIndex: 998,
}
