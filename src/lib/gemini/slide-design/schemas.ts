/**
 * Gemini Structured Output schemas for the Slide Designer.
 */

import { Type } from '@google/genai'

export const DESIGN_SYSTEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    creativeDirection: {
      type: Type.OBJECT,
      properties: {
        visualMetaphor: { type: Type.STRING },
        visualTension: { type: Type.STRING },
        oneRule: { type: Type.STRING },
        colorStory: { type: Type.STRING },
        typographyVoice: { type: Type.STRING },
        emotionalArc: { type: Type.STRING },
        visualMetaphor_translates_to: {
          type: Type.OBJECT,
          properties: {
            whitespace_ratio: { type: Type.STRING },
            max_colors_per_slide: { type: Type.INTEGER },
            text_alignment: { type: Type.STRING },
            image_treatment: { type: Type.STRING },
          },
          required: ['whitespace_ratio', 'max_colors_per_slide', 'text_alignment', 'image_treatment'],
        },
      },
      required: ['visualMetaphor', 'visualTension', 'oneRule', 'colorStory', 'typographyVoice', 'emotionalArc', 'visualMetaphor_translates_to'],
    },
    colors: {
      type: Type.OBJECT,
      properties: {
        primary: { type: Type.STRING }, secondary: { type: Type.STRING },
        accent: { type: Type.STRING }, background: { type: Type.STRING },
        text: { type: Type.STRING }, cardBg: { type: Type.STRING },
        cardBorder: { type: Type.STRING }, gradientStart: { type: Type.STRING },
        gradientEnd: { type: Type.STRING }, muted: { type: Type.STRING },
        highlight: { type: Type.STRING }, auroraA: { type: Type.STRING },
        auroraB: { type: Type.STRING }, auroraC: { type: Type.STRING },
      },
      required: ['primary', 'secondary', 'accent', 'background', 'text', 'cardBg', 'cardBorder',
        'gradientStart', 'gradientEnd', 'muted', 'highlight', 'auroraA', 'auroraB', 'auroraC'],
    },
    fonts: {
      type: Type.OBJECT,
      properties: { heading: { type: Type.STRING }, body: { type: Type.STRING } },
      required: ['heading', 'body'],
    },
    typography: {
      type: Type.OBJECT,
      properties: {
        displaySize: { type: Type.INTEGER }, headingSize: { type: Type.INTEGER },
        subheadingSize: { type: Type.INTEGER }, bodySize: { type: Type.INTEGER },
        captionSize: { type: Type.INTEGER },
        letterSpacingTight: { type: Type.NUMBER }, letterSpacingWide: { type: Type.NUMBER },
        lineHeightTight: { type: Type.NUMBER }, lineHeightRelaxed: { type: Type.NUMBER },
        weightPairs: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
      },
      required: ['displaySize', 'headingSize', 'subheadingSize', 'bodySize', 'captionSize',
        'letterSpacingTight', 'letterSpacingWide', 'lineHeightTight', 'lineHeightRelaxed', 'weightPairs'],
    },
    spacing: {
      type: Type.OBJECT,
      properties: {
        unit: { type: Type.INTEGER }, cardPadding: { type: Type.INTEGER },
        cardGap: { type: Type.INTEGER }, safeMargin: { type: Type.INTEGER },
      },
      required: ['unit', 'cardPadding', 'cardGap', 'safeMargin'],
    },
    effects: {
      type: Type.OBJECT,
      properties: {
        borderRadius: { type: Type.STRING, enum: ['sharp', 'soft', 'pill'] },
        borderRadiusValue: { type: Type.INTEGER },
        decorativeStyle: { type: Type.STRING, enum: ['geometric', 'organic', 'minimal', 'brutalist'] },
        shadowStyle: { type: Type.STRING, enum: ['none', 'fake-3d', 'glow'] },
        auroraGradient: { type: Type.STRING },
      },
      required: ['borderRadius', 'borderRadiusValue', 'decorativeStyle', 'shadowStyle', 'auroraGradient'],
    },
    motif: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING }, opacity: { type: Type.NUMBER },
        color: { type: Type.STRING }, implementation: { type: Type.STRING },
      },
      required: ['type', 'opacity', 'color', 'implementation'],
    },
  },
  required: ['creativeDirection', 'colors', 'fonts', 'typography', 'spacing', 'effects', 'motif'],
}

/** Flat element schema — all element type fields combined, type-specific ones are optional */
const SLIDE_ELEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    type: { type: Type.STRING, enum: ['text', 'shape', 'image'] },
    x: { type: Type.NUMBER }, y: { type: Type.NUMBER },
    width: { type: Type.NUMBER, description: 'Element width in px. Text: ensure width fits content at fontSize' },
    height: { type: Type.NUMBER, description: 'Element height in px. Text: ensure height fits number of lines' },
    zIndex: { type: Type.INTEGER },
    opacity: { type: Type.NUMBER },
    rotation: { type: Type.NUMBER },
    // Text fields — ALWAYS provide color, role, fontSize, fontWeight for text elements
    content: { type: Type.STRING, description: 'Text content (Hebrew). Required for type=text' },
    fontSize: { type: Type.NUMBER, description: 'Font size in px. Required for type=text. Titles: 60-140, body: 18-24, caption: 14-16' },
    fontWeight: { type: Type.INTEGER, description: 'Font weight 100-900. Required for type=text. Titles: 700-900, body: 300-400' },
    color: { type: Type.STRING, description: 'Text color hex. Required for type=text. Must contrast with background' },
    textAlign: { type: Type.STRING, description: 'Text alignment. Always "right" for RTL Hebrew' },
    role: { type: Type.STRING, description: 'Required for type=text: title|subtitle|body|caption|label|decorative' },
    lineHeight: { type: Type.NUMBER },
    letterSpacing: { type: Type.NUMBER },
    textStroke: {
      type: Type.OBJECT,
      properties: { width: { type: Type.NUMBER }, color: { type: Type.STRING } },
      required: ['width', 'color'],
    },
    // Shape fields — ALWAYS provide fill and shapeType for shape elements
    shapeType: { type: Type.STRING, description: 'Required for type=shape: background|decorative|divider|card' },
    fill: { type: Type.STRING, description: 'Required for type=shape. Color hex, gradient, or "transparent"' },
    borderRadius: { type: Type.NUMBER },
    clipPath: { type: Type.STRING },
    border: { type: Type.STRING },
    // Image fields — ALWAYS provide src and objectFit for image elements
    src: { type: Type.STRING, description: 'Image URL. Required for type=image. Use exact URL from content' },
    alt: { type: Type.STRING },
    objectFit: { type: Type.STRING, description: 'Required for type=image: "cover" or "contain"' },
  },
  required: ['id', 'type', 'x', 'y', 'width', 'height', 'zIndex',
    // Force model to always output these — even if empty for non-applicable types
    'color', 'fill', 'role', 'content', 'fontSize', 'fontWeight', 'shapeType', 'src', 'objectFit'],
}

export const SLIDE_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          slideType: { type: Type.STRING },
          archetype: { type: Type.STRING, description: 'Layout archetype used: Typographic Brutalism, Bento Box, Magazine Spread, etc.' },
          label: { type: Type.STRING },
          background: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['solid', 'gradient', 'image'] },
              value: { type: Type.STRING },
            },
            required: ['type', 'value'],
          },
          elements: { type: Type.ARRAY, items: SLIDE_ELEMENT_SCHEMA },
        },
        required: ['id', 'slideType', 'archetype', 'label', 'background', 'elements'],
      },
    },
  },
  required: ['slides'],
}
