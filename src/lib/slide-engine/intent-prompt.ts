/**
 * Intent Prompt — builds the GPT-5.4 prompt for SlideIntent output.
 * GPT picks semantic tokens (composition, size, color). Never pixel values.
 *
 * Slide Engine v5.1 — improved with:
 * - "Think before choosing" block
 * - Reasoning in few-shot examples
 * - Explicit card pattern
 * - Positive variety constraints
 * - Hard rules against monotony
 * - Position enum in schema
 * - Global slide index for narrative arc
 */

import type { PremiumDesignSystem, SlidePlan } from '@/lib/gemini/slide-design/types'
import type { SlideIntent } from './semantic-tokens'
import {
  ALL_COMPOSITION_TOKENS, ALL_BACKGROUND_TOKENS, ALL_MOOD_TOKENS,
  ALL_SIZE_TOKENS, ALL_COLOR_TOKENS, ALL_ELEMENT_TYPES, ALL_ELEMENT_ROLES,
  ALL_POSITION_TOKENS,
} from './semantic-tokens'
import { sampleFewShot } from './few-shot-bank'

// ─── Main Prompt Builder ──────────────────────────────

export function buildIntentPrompt(
  plans: SlidePlan[],
  ds: PremiumDesignSystem,
  images: Record<string, string>,
  brandName: string,
  previousIntents?: SlideIntent[],
  slideOffset: number = 0,
  totalSlides: number = 16,
): string {
  const examples = sampleFewShot(4)
  const examplesWithReasoning = examples.map(e => ({
    _reasoning: e.description,
    ...e.intent,
  }))
  const examplesJson = JSON.stringify(examplesWithReasoning, null, 2)

  return `You are a world-class presentation art director designing a premium Hebrew pitch deck.

## Think Before Choosing
For EACH slide, before picking a composition, ask yourself:
- What is this slide's role in the NARRATIVE ARC? (opening → tension → solution → proof → close)
- What was the PREVIOUS slide's composition? Pick something visually DIFFERENT.
- Is there a dominant visual element (image/stat/quote) or is this text-heavy?
- Would whitespace or density serve the content better?
Then choose accordingly. Do NOT include your reasoning in the output.

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
${ds.creativeDirection ? `Creative Direction: ${ds.creativeDirection.visualMetaphor}\nVisual Tension: ${ds.creativeDirection.visualTension}` : ''}

## Few-Shot Examples (with reasoning — do NOT include _reasoning in your output)
${examplesJson}

## RULES

### Content Rules
1. NEVER output x, y, width, height, fontSize as numbers. Use tokens ONLY.
2. ALL text content MUST be in Hebrew. Copy the EXACT Hebrew text from the slide data below.
3. Every slide MUST have exactly ONE element with weight "dominant" — this is the visual anchor.
4. Maximum 6 elements per slide. Whitespace is design. Less is more.
5. For stat/number slides: the number goes in role="stat", the explanation in role="label".

### Card Pattern (IMPORTANT)
For slides with cards, create TWO elements per card in sequence:
  { type: "text", role: "card-title", content: "כותרת", size: null, weight: null, color: "accent" }
  { type: "text", role: "card-body", content: "תוכן", size: null, weight: null, color: "muted" }
Place them sequentially. The Layout Resolver handles positioning. Max 4 cards (= 8 elements).

### Image Rules
6. If an image URL is provided, ALWAYS include it as type="image" with role="decorative".
7. For full-bleed images, set imageOpacity to 0.25-0.4 (dark overlay applied automatically).
8. For split layouts, set imageOpacity to 1.0.

### Composition Rules
9. cover slide MUST use hero-center, hero-bottom, or hero-left.
10. closing slide MUST use closing-cta or closing-minimal.
11. Do NOT repeat the same composition on consecutive slides.

### Variety Hard Rules
12. No more than 2 slides in this batch may share the same mood.
13. No more than 2 slides in this batch may share the same background.
14. At least ONE slide in this batch must use a light/subtle background (solid-light or gradient-subtle).
15. Use "on-dark" color for dark backgrounds, "on-light" for light backgrounds.

${previousIntents ? buildVarietyConstraints(previousIntents) : '## This is the first batch — establish visual variety from the start. Use at least 4 different compositions.'}

## Slides to Design (${plans.length} slides, part of a ${totalSlides}-slide deck)

${plans.map((plan, i) => {
  const globalIndex = slideOffset + i + 1
  const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
  const narrativePos = globalIndex <= 2 ? 'OPENING' : globalIndex >= totalSlides - 1 ? 'CLOSING' : globalIndex <= totalSlides * 0.4 ? 'TENSION BUILDING' : globalIndex <= totalSlides * 0.7 ? 'SOLUTION & PROOF' : 'WRAP-UP'
  return `### Slide ${globalIndex} of ${totalSlides}: ${plan.slideType} [${narrativePos}]
Title: ${plan.title}
${plan.subtitle ? `Subtitle: ${plan.subtitle}` : ''}
${plan.bodyText ? `Body: ${plan.bodyText}` : ''}
${plan.bulletPoints?.length ? `Points:\n${plan.bulletPoints.map(p => `  • ${p}`).join('\n')}` : ''}
${plan.cards?.length ? `Cards (${plan.cards.length}):\n${plan.cards.map(c => `  - ${c.title}: ${c.body}`).join('\n')}` : ''}
${plan.keyNumber ? `Key Number: ${plan.keyNumber} (${plan.keyNumberLabel || ''})` : ''}
${plan.tagline ? `Tagline: ${plan.tagline}` : ''}
${imageUrl ? `Image URL: ${imageUrl}` : 'No image available'}
Tone: ${plan.emotionalTone || 'professional'}`
}).join('\n\n')}

## Output Format
Return a JSON object: { "slides": [ SlideIntent, ... ] }
Each SlideIntent: { composition, background, mood, elements: [ ElementIntent, ... ] }
Each ElementIntent: { type, role, content (or null), size (or null), weight (or null), position (or null), color (or null), imageUrl (or null), imageOpacity (or null) }

Do NOT include _reasoning or any extra fields. Only the fields above.`
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

  // Find unused compositions for positive constraint
  const unused = ALL_COMPOSITION_TOKENS.filter(c => !usedComps.includes(c))
  const suggested = unused.slice(0, 4)

  return `## Variety Constraints (from previous batches)
Previously used compositions: ${JSON.stringify(usedComps)}
Previously used backgrounds: ${JSON.stringify(usedBgs)}
Previously used moods: ${JSON.stringify(usedMoods)}

MUST NOT reuse: ${overused.length ? overused.join(', ') : 'none restricted yet'}
MUST include at least ONE of these unused compositions: ${suggested.join(', ')}
MUST NOT repeat the same background on consecutive slides.
At least ONE slide must use a composition NOT used in any previous batch.`
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
                position: { type: ['string', 'null'] as const, enum: [...ALL_POSITION_TOKENS, null] },
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
