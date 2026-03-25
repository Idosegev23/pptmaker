/**
 * Intent Prompt — builds the GPT-5.4 prompt for SlideIntent output.
 * GPT picks semantic tokens (composition, size, color). Never pixel values.
 *
 * Slide Engine v5
 */

import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type { SlideIntent } from './semantic-tokens'
import {
  ALL_COMPOSITION_TOKENS, ALL_BACKGROUND_TOKENS, ALL_MOOD_TOKENS,
  ALL_SIZE_TOKENS, ALL_COLOR_TOKENS, ALL_ELEMENT_TYPES, ALL_ELEMENT_ROLES,
} from './semantic-tokens'
import { sampleFewShot } from './few-shot-bank'

// ─── Main Prompt Builder ──────────────────────────────

export function buildIntentPrompt(
  plans: SlidePlan[],
  ds: PremiumDesignSystem,
  images: Record<string, string>,
  brandName: string,
  previousIntents?: SlideIntent[],
): string {
  const examples = sampleFewShot(4)
  const examplesJson = JSON.stringify(examples.map(e => e.intent), null, 2)

  return `You are a world-class presentation art director.
Your job: choose the BEST visual composition for each slide.
You do NOT decide pixel positions. You choose compositions, sizes, and colors as tokens.

## Available Compositions
${ALL_COMPOSITION_TOKENS.map(c => `- ${c}`).join('\n')}

## Available Tokens
Sizes: ${ALL_SIZE_TOKENS.join(' | ')}
Colors: ${ALL_COLOR_TOKENS.join(' | ')}
Backgrounds: ${ALL_BACKGROUND_TOKENS.join(' | ')}
Moods: ${ALL_MOOD_TOKENS.join(' | ')}
Element types: ${ALL_ELEMENT_TYPES.join(' | ')}
Element roles: ${ALL_ELEMENT_ROLES.join(' | ')}

## Design System for "${brandName}"
Primary: ${ds.colors.primary}
Secondary: ${ds.colors.secondary}
Accent: ${ds.colors.accent}
Background: ${ds.colors.background}
Text: ${ds.colors.text}
Typography: heading=${ds.typography.headingSize}px, body=${ds.typography.bodySize}px
Effects: radius=${ds.effects.borderRadius}, shadow=${ds.effects.shadowStyle}
${ds.creativeDirection ? `Creative Direction: ${ds.creativeDirection.visualMetaphor}` : ''}

## Few-Shot Examples
${examplesJson}

## CRITICAL RULES
1. NEVER output x, y, width, height, fontSize as numbers. Use tokens ONLY.
2. VARY compositions — do NOT repeat the same composition on consecutive slides.
3. Maximum 6 elements per slide. Whitespace is design.
4. Every slide MUST have exactly one element with weight "dominant".
5. ALL text content MUST be in Hebrew. Copy the exact Hebrew text from the slide data below.
6. For stat/number slides: number goes in role="stat", explanation in role="label".
7. Use "on-dark" color for dark backgrounds, "on-light" for light backgrounds.
8. Cards: use pairs of card-title + card-body elements. Max 4 cards.
9. If an image URL is provided, include it as type="image" with role="decorative".
10. cover slide must use hero-center, hero-bottom, or hero-left composition.
11. closing slide must use closing-cta or closing-minimal composition.

${previousIntents ? buildVarietyConstraints(previousIntents) : '## This is the first batch — establish variety from the start.'}

## Slides to Design

${plans.map((plan, i) => {
  const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
  return `### Slide ${i + 1}: ${plan.slideType}
Title: ${plan.title}
${plan.subtitle ? `Subtitle: ${plan.subtitle}` : ''}
${plan.bodyText ? `Body: ${plan.bodyText}` : ''}
${plan.bulletPoints?.length ? `Points: ${plan.bulletPoints.join(' | ')}` : ''}
${plan.cards?.length ? `Cards:\n${plan.cards.map(c => `  - ${c.title}: ${c.body}`).join('\n')}` : ''}
${plan.keyNumber ? `Key Number: ${plan.keyNumber} (${plan.keyNumberLabel || ''})` : ''}
${plan.tagline ? `Tagline: ${plan.tagline}` : ''}
${imageUrl ? `Image URL: ${imageUrl}` : 'No image available'}
Tone: ${plan.emotionalTone || 'professional'}`
}).join('\n\n')}

## Output
Return a JSON object: { "slides": [ SlideIntent, ... ] }
Each SlideIntent: { composition, background, mood, elements: [ ElementIntent, ... ] }
Each ElementIntent: { type, role, content (or null), size (or null), weight (or null), position (or null), color (or null), imageUrl (or null), imageOpacity (or null) }`
}

// ─── Variety Constraints ──────────────────────────────

function buildVarietyConstraints(previous: SlideIntent[]): string {
  const usedComps = previous.map(i => i.composition)
  const usedBgs = previous.map(i => i.background)
  const usedMoods = previous.map(i => i.mood)

  // Count duplicates
  const compCounts: Record<string, number> = {}
  usedComps.forEach(c => { compCounts[c] = (compCounts[c] || 0) + 1 })
  const overused = Object.entries(compCounts).filter(([, n]) => n >= 2).map(([c]) => c)

  return `## Variety Constraints (from previous batches)
Previous compositions: ${JSON.stringify(usedComps)}
Previous backgrounds: ${JSON.stringify(usedBgs)}
Previous moods: ${JSON.stringify(usedMoods)}

MUST NOT use: ${overused.length ? overused.join(', ') : 'none restricted yet'}
MUST NOT repeat the same background on consecutive slides.
Try to use at least 2 different moods in this batch.`
}

// ─── JSON Schema for OpenAI Strict Mode ───────────────

export const SLIDE_INTENT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['slides'],
  properties: {
    slides: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        required: ['composition', 'background', 'mood', 'elements'],
        properties: {
          composition: { type: 'string' as const, enum: [...ALL_COMPOSITION_TOKENS] },
          background: { type: 'string' as const, enum: [...ALL_BACKGROUND_TOKENS] },
          mood: { type: 'string' as const, enum: [...ALL_MOOD_TOKENS] },
          elements: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['type', 'role', 'content', 'size', 'weight', 'position', 'color', 'imageUrl', 'imageOpacity'],
              properties: {
                type: { type: 'string' as const, enum: [...ALL_ELEMENT_TYPES] },
                role: { type: 'string' as const, enum: [...ALL_ELEMENT_ROLES] },
                content: { type: ['string', 'null'] as const },
                size: { type: ['string', 'null'] as const, enum: [...ALL_SIZE_TOKENS, null] },
                weight: { type: ['string', 'null'] as const, enum: ['dominant', 'prominent', 'supporting', 'subtle', null] },
                position: { type: ['string', 'null'] as const },
                color: { type: ['string', 'null'] as const, enum: [...ALL_COLOR_TOKENS, null] },
                imageUrl: { type: ['string', 'null'] as const },
                imageOpacity: { type: ['number', 'null'] as const },
              },
            },
          },
        },
      },
    },
  },
}
