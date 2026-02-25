'use client'

import { useReducer, useCallback, useRef } from 'react'
import type {
  Presentation,
  Slide,
  SlideElement,
  SlideBackground,
} from '@/types/presentation'

// ─── Action Types ────────────────────────────────────

type EditorAction =
  | { type: 'SELECT_SLIDE'; index: number }
  | { type: 'SELECT_ELEMENT'; elementId: string | null }
  | { type: 'UPDATE_ELEMENT'; slideIndex: number; elementId: string; changes: Partial<SlideElement> }
  | { type: 'ADD_ELEMENT'; slideIndex: number; element: SlideElement }
  | { type: 'DELETE_ELEMENT'; slideIndex: number; elementId: string }
  | { type: 'UPDATE_SLIDE_BACKGROUND'; slideIndex: number; background: SlideBackground }
  | { type: 'REPLACE_SLIDE'; slideIndex: number; slide: Slide }
  | { type: 'SET_PRESENTATION'; presentation: Presentation }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED' }

// ─── State ───────────────────────────────────────────

interface EditorState {
  presentation: Presentation
  selectedSlideIndex: number
  selectedElementId: string | null
  undoStack: Presentation[]
  redoStack: Presentation[]
  isDirty: boolean
}

const MAX_UNDO = 30

// ─── Reducer ─────────────────────────────────────────

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SELECT_SLIDE':
      return {
        ...state,
        selectedSlideIndex: action.index,
        selectedElementId: null,
      }

    case 'SELECT_ELEMENT':
      return {
        ...state,
        selectedElementId: action.elementId,
      }

    case 'UPDATE_ELEMENT': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      const elIndex = slide.elements.findIndex(e => e.id === action.elementId)
      if (elIndex === -1) return state

      slide.elements[elIndex] = { ...slide.elements[elIndex], ...action.changes } as SlideElement

      return {
        ...state,
        presentation: newPresentation,
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), state.presentation],
        redoStack: [],
        isDirty: true,
      }
    }

    case 'ADD_ELEMENT': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      slide.elements.push(action.element)

      return {
        ...state,
        presentation: newPresentation,
        selectedElementId: action.element.id,
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), state.presentation],
        redoStack: [],
        isDirty: true,
      }
    }

    case 'DELETE_ELEMENT': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      slide.elements = slide.elements.filter(e => e.id !== action.elementId)

      return {
        ...state,
        presentation: newPresentation,
        selectedElementId: state.selectedElementId === action.elementId ? null : state.selectedElementId,
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), state.presentation],
        redoStack: [],
        isDirty: true,
      }
    }

    case 'UPDATE_SLIDE_BACKGROUND': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      slide.background = action.background

      return {
        ...state,
        presentation: newPresentation,
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), state.presentation],
        redoStack: [],
        isDirty: true,
      }
    }

    case 'REPLACE_SLIDE': {
      const newPresentation = structuredClone(state.presentation)
      newPresentation.slides[action.slideIndex] = action.slide

      return {
        ...state,
        presentation: newPresentation,
        selectedElementId: null,
        undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), state.presentation],
        redoStack: [],
        isDirty: true,
      }
    }

    case 'SET_PRESENTATION':
      return {
        ...state,
        presentation: action.presentation,
        selectedSlideIndex: 0,
        selectedElementId: null,
        undoStack: [],
        redoStack: [],
        isDirty: false,
      }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state
      const prev = state.undoStack[state.undoStack.length - 1]
      return {
        ...state,
        presentation: prev,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.presentation],
        isDirty: true,
      }
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state
      const next = state.redoStack[state.redoStack.length - 1]
      return {
        ...state,
        presentation: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.presentation],
        isDirty: true,
      }
    }

    case 'MARK_SAVED':
      return { ...state, isDirty: false }

    default:
      return state
  }
}

// ─── Hook ────────────────────────────────────────────

export function usePresentationEditor(initialPresentation: Presentation) {
  const [state, dispatch] = useReducer(editorReducer, {
    presentation: initialPresentation,
    selectedSlideIndex: 0,
    selectedElementId: null,
    undoStack: [],
    redoStack: [],
    isDirty: false,
  })

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Computed values
  const selectedSlide = state.presentation.slides[state.selectedSlideIndex] || null
  const selectedElement = selectedSlide?.elements.find(e => e.id === state.selectedElementId) || null

  // ─── Actions
  const selectSlide = useCallback((index: number) => {
    dispatch({ type: 'SELECT_SLIDE', index })
  }, [])

  const selectElement = useCallback((elementId: string | null) => {
    dispatch({ type: 'SELECT_ELEMENT', elementId })
  }, [])

  const updateElement = useCallback((elementId: string, changes: Partial<SlideElement>) => {
    dispatch({
      type: 'UPDATE_ELEMENT',
      slideIndex: state.selectedSlideIndex,
      elementId,
      changes,
    })
  }, [state.selectedSlideIndex])

  const addElement = useCallback((element: SlideElement) => {
    dispatch({
      type: 'ADD_ELEMENT',
      slideIndex: state.selectedSlideIndex,
      element,
    })
  }, [state.selectedSlideIndex])

  const deleteElement = useCallback((elementId: string) => {
    dispatch({
      type: 'DELETE_ELEMENT',
      slideIndex: state.selectedSlideIndex,
      elementId,
    })
  }, [state.selectedSlideIndex])

  const updateSlideBackground = useCallback((background: SlideBackground) => {
    dispatch({
      type: 'UPDATE_SLIDE_BACKGROUND',
      slideIndex: state.selectedSlideIndex,
      background,
    })
  }, [state.selectedSlideIndex])

  const replaceSlide = useCallback((slideIndex: number, slide: Slide) => {
    dispatch({ type: 'REPLACE_SLIDE', slideIndex, slide })
  }, [])

  const setPresentation = useCallback((presentation: Presentation) => {
    dispatch({ type: 'SET_PRESENTATION', presentation })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  // ─── Save (debounced 2s)
  const save = useCallback(async (documentId: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _presentation: state.presentation }),
        })
        dispatch({ type: 'MARK_SAVED' })
        console.log('[PresentationEditor] Saved to Supabase')
      } catch (err) {
        console.error('[PresentationEditor] Save failed:', err)
      }
    }, 2000)
  }, [state.presentation])

  const saveNow = useCallback(async (documentId: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    try {
      await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _presentation: state.presentation }),
      })
      dispatch({ type: 'MARK_SAVED' })
    } catch (err) {
      console.error('[PresentationEditor] Save failed:', err)
    }
  }, [state.presentation])

  return {
    // State
    presentation: state.presentation,
    selectedSlideIndex: state.selectedSlideIndex,
    selectedElementId: state.selectedElementId,
    selectedSlide,
    selectedElement,
    isDirty: state.isDirty,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,

    // Actions
    selectSlide,
    selectElement,
    updateElement,
    addElement,
    deleteElement,
    updateSlideBackground,
    replaceSlide,
    setPresentation,
    undo,
    redo,
    save,
    saveNow,
  }
}
