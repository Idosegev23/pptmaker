/**
 * JSON AST Types for the Presentation Editor
 * This is the Single Source of Truth for all slide data.
 * No HTML strings — everything is structured JSON.
 */

// ============================================================
// CORE PRESENTATION
// ============================================================

export interface Presentation {
  id: string
  title: string
  designSystem: DesignSystem
  slides: Slide[]
  metadata?: PresentationMetadata
}

export interface PresentationMetadata {
  brandName?: string
  createdAt?: string
  updatedAt?: string
  version: number
}

// ============================================================
// DESIGN SYSTEM
// ============================================================

export interface DesignSystem {
  colors: DesignColors
  fonts: DesignFonts
  direction: 'rtl' | 'ltr'
}

export interface DesignColors {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  cardBg: string
  cardBorder: string
}

export interface DesignFonts {
  heading: string
  body: string
}

// ============================================================
// SLIDE
// ============================================================

export interface Slide {
  id: string
  slideType: SlideType
  label: string
  background: SlideBackground
  elements: SlideElement[]
}

export type SlideType =
  | 'cover'
  | 'brief'
  | 'goals'
  | 'audience'
  | 'insight'
  | 'strategy'
  | 'bigIdea'
  | 'approach'
  | 'deliverables'
  | 'metrics'
  | 'influencerStrategy'
  | 'influencers'
  | 'closing'

export interface SlideBackground {
  type: 'solid' | 'gradient' | 'image'
  value: string
}

// ============================================================
// ELEMENTS
// ============================================================

export interface BaseElement {
  id: string
  type: 'text' | 'image' | 'shape'
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  opacity?: number
  rotation?: number
  locked?: boolean
}

export type TextRole =
  | 'title'
  | 'subtitle'
  | 'body'
  | 'caption'
  | 'metric-value'
  | 'metric-label'
  | 'list-item'
  | 'tag'

export type FontWeight = 300 | 400 | 500 | 600 | 700 | 800 | 900

export interface TextElement extends BaseElement {
  type: 'text'
  content: string
  fontSize: number
  fontWeight: FontWeight
  color: string
  textAlign: 'right' | 'center' | 'left'
  lineHeight?: number
  letterSpacing?: number
  textDecoration?: 'none' | 'underline'
  role?: TextRole
  backgroundColor?: string
  borderRadius?: number
  padding?: number
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  alt?: string
  objectFit: 'cover' | 'contain' | 'fill'
  borderRadius?: number
  clipPath?: string
  border?: string
}

export type ShapeType = 'rectangle' | 'circle' | 'line' | 'decorative'

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shapeType: ShapeType
  fill: string
  borderRadius?: number
  clipPath?: string
  border?: string
}

export type SlideElement = TextElement | ImageElement | ShapeElement

// ============================================================
// TYPE GUARDS
// ============================================================

export function isTextElement(el: SlideElement): el is TextElement {
  return el.type === 'text'
}

export function isImageElement(el: SlideElement): el is ImageElement {
  return el.type === 'image'
}

export function isShapeElement(el: SlideElement): el is ShapeElement {
  return el.type === 'shape'
}

// ============================================================
// CANVAS CONSTANTS
// ============================================================

export const CANVAS_WIDTH = 1920
export const CANVAS_HEIGHT = 1080
export const SAFE_ZONE = 80
