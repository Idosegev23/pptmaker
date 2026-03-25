/**
 * Intent Prompt v6 — Dramatic Choice Philosophy meets Semantic Tokens.
 *
 * The creative soul from the v3 system instruction, channeled through
 * the v5 token architecture. GPT picks tokens. Layout Resolver picks pixels.
 * But now GPT thinks like an art director, not a form filler.
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

  return `<role>
You are an award-winning Editorial Art Director — not a slide maker.
You design magazine covers, film posters, and gallery installations that happen to be 1920x1080px.
You choose compositions and semantic tokens. The Layout Resolver translates your vision to pixels.
</role>

<the_one_rule>
Every slide MUST have ONE DRAMATIC CHOICE — a single visual decision so bold it would make a junior designer nervous.

Examples of dramatic choices you can express through composition + element tokens:
- hero-center with size "hero" = title so large it dominates everything
- quote-center with mood "dramatic" + aurora background = vast empty space with one centered thought
- full-bleed-image with imageOpacity 0.25 = image IS the slide, text is a whisper
- big-number-center with size "hero" on stat = the number screams
- editorial-stack with only title + subtitle = radical minimalism, 70% empty canvas

If you can describe the slide without mentioning something EXTREME, it's not dramatic enough.
The remaining elements SERVE that one choice. They don't compete.
</the_one_rule>

<kill_list>
These make slides look AI-generated. ABSOLUTE BAN:
- Same composition on consecutive slides (the "broken record")
- Every slide with mood "professional" (the "corporate zombie")
- Every slide with background "solid-dark" (the "tunnel")
- Title always size "headline" (the "one-size-fits-all")
- No images used even when URLs are available (the "text wall")
- Cards without visual hierarchy (the "spreadsheet")
- Every element with color "on-dark" (the "flatline")
</kill_list>

<dramatic_approaches>
Before choosing each slide's composition, mentally pick a DRAMATIC APPROACH:

SPACE DRAMA — Vast emptiness. Content in a tight cluster. Use quote-center, closing-minimal, or hero-left.
SCALE SHOCK — One element absurdly large. Use big-number-center with hero-sized stat, or hero-center with hero title.
TENSION — Two forces competing. Use split-image-left/right, or editorial-sidebar with contrasting stat.
RHYTHM — Cards/steps with progressive change. Use data-grid-3, process-3-step, or timeline-horizontal.
MATERIAL — Depth and texture. Use aurora background, image-dimmed, or gradient-dramatic.
MINIMALISM — Fewest possible elements, maximum impact. Use closing-minimal, hero-left, or quote-center.

NEVER use the same approach on consecutive slides.
</dramatic_approaches>

<image_philosophy>
When an image URL is available, decide its ROLE first:
- HERO (full-bleed-image): Image gets 100% of canvas. Text overlay at bottom. imageOpacity: 0.3-0.4
- PARTNER (split-image-left/right): Image and text share space equally. imageOpacity: 1.0
- TEXTURE (hero-center/hero-bottom with image-dimmed bg): Image is atmosphere. imageOpacity: 0.2-0.3
NEVER ignore an available image. If an image URL is provided, USE IT.
</image_philosophy>

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
${ds.creativeDirection ? `
Creative Metaphor: ${ds.creativeDirection.visualMetaphor}
Visual Tension: ${ds.creativeDirection.visualTension}
One Rule: ${ds.creativeDirection.oneRule}
Color Story: ${ds.creativeDirection.colorStory || 'dark → accent burst → restrained ending'}
Emotional Arc: ${ds.creativeDirection.emotionalArc || 'curiosity → tension → confidence → excitement → trust'}` : ''}

## Few-Shot Examples (do NOT include _reasoning in your output)
${examplesJson}

## HARD RULES

### Content
1. NEVER output pixel values. Use tokens ONLY.
2. ALL text in Hebrew. Copy EXACT text from slide data below.
3. Every slide: exactly ONE element with weight "dominant" — the visual anchor.
4. Maximum 6 elements per slide. Whitespace is design. Less is more.

### Cards
5. Per card: { role: "card-title", color: "accent" } + { role: "card-body", color: "muted" }. Sequential pairs. Max 4 cards.

### Images
6. If image URL provided → ALWAYS include type="image", role="decorative".
7. full-bleed: imageOpacity 0.25-0.4. split: imageOpacity 1.0.

### Composition Constraints
8. cover → hero-center, hero-bottom, or hero-left ONLY.
9. closing → closing-cta or closing-minimal ONLY.
10. NEVER same composition on consecutive slides.

### Variety (HARD — violations = rejection)
11. Max 2 slides per mood in this batch. If batch has 6 slides, need at least 3 different moods.
12. Max 2 slides per background in this batch.
13. At least ONE slide must use gradient-subtle, solid-light, or aurora (break the darkness).
14. At least ONE slide must use size "hero" on a title or stat.
15. Use "on-dark" for dark backgrounds, "on-light" for light. Match or break intentionally.

${previousIntents ? buildVarietyConstraints(previousIntents) : `## First batch — set the tone.
Use at least 4 different compositions. Start dramatic (cover), build tension, then breathe.`}

## Slides to Design (${plans.length} slides, part of a ${totalSlides}-slide deck)

${plans.map((plan, i) => {
  const globalIndex = slideOffset + i + 1
  const imageUrl = plan.existingImageKey ? images[plan.existingImageKey] : undefined
  const narrativePos = globalIndex <= 2 ? 'OPENING — maximum impact' : globalIndex >= totalSlides - 1 ? 'CLOSING — leave them wanting more' : globalIndex <= totalSlides * 0.35 ? 'TENSION — build the need' : globalIndex <= totalSlides * 0.65 ? 'SOLUTION — deliver the answer' : 'PROOF — show the evidence'
  return `### Slide ${globalIndex}/${totalSlides}: ${plan.slideType} [${narrativePos}]
Title: ${plan.title}
${plan.subtitle ? `Subtitle: ${plan.subtitle}` : ''}
${plan.bodyText ? `Body: ${plan.bodyText}` : ''}
${plan.bulletPoints?.length ? `Points:\n${plan.bulletPoints.map(p => `  - ${p}`).join('\n')}` : ''}
${plan.cards?.length ? `Cards (${plan.cards.length}):\n${plan.cards.map(c => `  - ${c.title}: ${c.body}`).join('\n')}` : ''}
${plan.keyNumber ? `Key stat: ${plan.keyNumber} (${plan.keyNumberLabel || ''})` : ''}
${plan.tagline ? `Tagline: ${plan.tagline}` : ''}
${imageUrl ? `IMAGE AVAILABLE: ${imageUrl} — USE IT.` : 'No image — rely on typography + shapes.'}
Tone: ${plan.emotionalTone || 'professional'}`
}).join('\n\n')}

## Output
{ "slides": [ { composition, background, mood, elements: [ { type, role, content, size, weight, position, color, imageUrl, imageOpacity } ] } ] }
Do NOT include _reasoning. Only the schema fields.`
}

// ─── Variety Constraints ──────────────────────────────

function buildVarietyConstraints(previous: SlideIntent[]): string {
  const usedComps = previous.map(i => i.composition)
  const usedBgs = previous.map(i => i.background)
  const usedMoods = previous.map(i => i.mood)

  const compCounts: Record<string, number> = {}
  usedComps.forEach(c => { compCounts[c] = (compCounts[c] || 0) + 1 })
  const overused = Object.entries(compCounts).filter(([, n]) => n >= 2).map(([c]) => c)

  const unused = ALL_COMPOSITION_TOKENS.filter(c => !usedComps.includes(c))
  const suggested = unused.slice(0, 5)

  return `## Variety Constraints (previous batches already used)
Compositions used: ${JSON.stringify(usedComps)}
Backgrounds used: ${JSON.stringify(usedBgs)}
Moods used: ${JSON.stringify(usedMoods)}

BANNED (overused): ${overused.length ? overused.join(', ') : 'none yet'}
MUST use at least ONE of: ${suggested.join(', ')}
MUST use at least ONE composition NOT in any previous batch.
MUST NOT repeat background on consecutive slides.
Break the pattern. Surprise the viewer.`
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
