/**
 * Slide validation, auto-fix, and visual consistency checks.
 */

import type {
  Slide,
  TextElement,
  ImageElement,
  SlideElement,
} from '@/types/presentation'
import { isTextElement } from '@/types/presentation'
import type {
  PremiumDesignSystem,
  PacingDirective,
  ValidationResult,
  ValidationIssue,
  BoundingBox,
} from './types'
import { contrastRatio, adjustLightness } from './color-utils'
import {
  boxesOverlap,
  isImageElement,
  computeOccupiedArea,
  computeBalanceScore,
  findBestImagePlacement,
} from './spatial-utils'

export function validateSlide(
  slide: Slide,
  designSystem: PremiumDesignSystem,
  pacing: PacingDirective,
  expectedImageUrl?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []
  let score = 100

  const elements: SlideElement[] = slide.elements || []
  const textElements = elements.filter(isTextElement)
  const imageElements = elements.filter(isImageElement)
  const contentTexts = textElements.filter(el => el.role !== 'decorative')
  const allBoxes: BoundingBox[] = elements.map(e => ({ x: e.x || 0, y: e.y || 0, width: e.width || 0, height: e.height || 0 }))

  // Contrast check
  for (const el of contentTexts) {
    const color = el.color
    if (color && !color.includes('transparent')) {
      const bgColor = designSystem.colors.background
      const cr = contrastRatio(color.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7), bgColor)
      const fontSize = el.fontSize || 20
      const minContrast = fontSize >= 48 ? 3 : 4.5
      if (cr < minContrast) {
        issues.push({
          severity: 'critical', category: 'contrast',
          message: `contrast ${cr.toFixed(1)}:1 (min ${minContrast}:1)`,
          elementId: el.id, autoFixable: true,
        })
        score -= 15
      }
    }
  }

  // Element count
  if (elements.length > pacing.maxElements) {
    issues.push({ severity: 'warning', category: 'density', message: `${elements.length} elements (max ${pacing.maxElements})`, autoFixable: false })
    score -= 10
  }

  // Whitespace
  const whitespace = 1 - computeOccupiedArea(allBoxes)
  if (whitespace < pacing.minWhitespace) {
    issues.push({ severity: 'warning', category: 'whitespace', message: `Whitespace ${Math.round(whitespace * 100)}% (min ${Math.round(pacing.minWhitespace * 100)}%)`, autoFixable: false })
    score -= 8
  }

  // Safe zone
  for (const el of contentTexts) {
    if (el.x < 60 || (el.x + el.width) > 1860 || el.y < 60 || (el.y + el.height) > 1020) {
      issues.push({ severity: 'warning', category: 'safe-zone', message: 'Content outside safe zone', elementId: el.id, autoFixable: true })
      score -= 5
    }
  }

  // Scale contrast
  const fontSizes = contentTexts.map(e => e.fontSize || 20).filter(s => s > 0)
  if (fontSizes.length >= 2) {
    const ratio = Math.max(...fontSizes) / Math.min(...fontSizes)
    const minRatio = pacing.energy === 'peak' ? 8 : 4
    if (ratio < minRatio) {
      issues.push({ severity: 'suggestion', category: 'scale', message: `Font ratio ${ratio.toFixed(1)}:1 (recommend ≥${minRatio}:1)`, autoFixable: false })
      score -= 5
    }
  }

  // Hierarchy
  const titles = contentTexts.filter(e => e.role === 'title')
  if (titles.length === 0 && slide.slideType !== 'cover') {
    issues.push({ severity: 'warning', category: 'hierarchy', message: 'No title element', autoFixable: false })
    score -= 10
  }

  // Image validation
  if (expectedImageUrl && imageElements.length === 0) {
    issues.push({ severity: 'warning', category: 'missing-image', message: 'Slide has imageUrl but no image element', autoFixable: true })
    score -= 20
  }

  for (const img of imageElements) {
    const ix = img.x || 0, iy = img.y || 0, iw = img.width || 0, ih = img.height || 0
    if (ix < -10 || iy < -10 || ix + iw > 1930 || iy + ih > 1090) {
      issues.push({ severity: 'warning', category: 'image-bounds', message: `Image "${img.id}" out of canvas bounds`, elementId: img.id, autoFixable: true })
      score -= 10
    }

    const imgArea = iw * ih
    const canvasArea = 1920 * 1080
    if (imgArea > 0 && imgArea < canvasArea * 0.15) {
      issues.push({ severity: 'suggestion', category: 'image-small', message: `Image "${img.id}" is only ${Math.round(imgArea / canvasArea * 100)}% of canvas`, elementId: img.id, autoFixable: true })
      score -= 5
    }

    const imgBox: BoundingBox = { x: ix, y: iy, width: iw, height: ih }
    for (const title of titles) {
      const titleBox: BoundingBox = { x: title.x || 0, y: title.y || 0, width: title.width || 0, height: title.height || 0 }
      if (boxesOverlap(imgBox, titleBox)) {
        issues.push({ severity: 'warning', category: 'image-overlap-title', message: `Image "${img.id}" overlaps title "${title.id}"`, elementId: img.id, autoFixable: true })
        score -= 12
      }
    }
  }

  // Text-text overlap detection
  for (let a = 0; a < contentTexts.length; a++) {
    for (let b = a + 1; b < contentTexts.length; b++) {
      const elA = contentTexts[a], elB = contentTexts[b]
      const boxA: BoundingBox = { x: elA.x || 0, y: elA.y || 0, width: elA.width || 0, height: elA.height || 0 }
      const boxB: BoundingBox = { x: elB.x || 0, y: elB.y || 0, width: elB.width || 0, height: elB.height || 0 }
      if (boxesOverlap(boxA, boxB)) {
        const overlapX = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x)
        const overlapY = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y)
        const overlapArea = overlapX * overlapY
        const smallerArea = Math.min(boxA.width * boxA.height, boxB.width * boxB.height)
        const overlapRatio = smallerArea > 0 ? overlapArea / smallerArea : 0
        if (overlapRatio > 0.15) {
          issues.push({
            severity: overlapRatio > 0.5 ? 'critical' : 'warning',
            category: 'text-text-overlap',
            message: `Text "${elA.id}" overlaps "${elB.id}" (${Math.round(overlapRatio * 100)}%)`,
            elementId: elB.id,
            autoFixable: true,
          })
          score -= overlapRatio > 0.5 ? 15 : 8
        }
      }
    }
  }

  // Text overflow detection — check if text fits in its bounding box
  for (const el of contentTexts) {
    const fontSize = el.fontSize || 20
    const content = el.content || ''
    if (content.length > 0 && el.width > 0) {
      // Hebrew characters are roughly 0.55-0.65 × fontSize wide
      const estCharWidth = fontSize * 0.6
      const estTextWidth = content.length * estCharWidth
      // Account for line wrapping: how many lines can fit?
      const lineHeight = (el.lineHeight || 1.2) * fontSize
      const maxLines = Math.max(1, Math.floor(el.height / lineHeight))
      const effectiveWidth = el.width * maxLines
      if (estTextWidth > effectiveWidth * 1.3) {
        // Text is likely overflowing — needs wider box or smaller font
        issues.push({
          severity: 'warning', category: 'text-overflow',
          message: `Text "${el.id}" likely overflows: ${content.length} chars at ${fontSize}px in ${el.width}px (est. needs ${Math.round(estTextWidth / maxLines)}px)`,
          elementId: el.id, autoFixable: true,
        })
        score -= 8
      }
    }
  }

  // Balance
  const balance = computeBalanceScore(allBoxes)
  if (balance < 0.3) {
    issues.push({ severity: 'suggestion', category: 'balance', message: `Balance ${(balance * 100).toFixed(0)}/100`, autoFixable: false })
    score -= 5
  }

  // === V2 Validation Checks ===

  // V2-1: Element count 6-15 per slide
  if (elements.length < 6) {
    issues.push({ severity: 'suggestion', category: 'element-count-low', message: `Only ${elements.length} elements (min recommended: 6)`, autoFixable: false })
    score -= 3
  }
  if (elements.length > 15) {
    issues.push({ severity: 'warning', category: 'element-count-high', message: `${elements.length} elements (max recommended: 15)`, autoFixable: false })
    score -= 5
  }

  // V2-2: Title fontSize >= headingSize (hero slides: >= displaySize)
  const heroSlideTypes = new Set(['cover', 'bigIdea', 'insight', 'closing'])
  const isHeroSlide = heroSlideTypes.has(slide.slideType)
  const headingSize = designSystem.typography?.headingSize || 56
  const minTitleSize = isHeroSlide
    ? Math.max(headingSize, designSystem.typography?.displaySize || 96)
    : headingSize
  for (const title of titles) {
    if ((title.fontSize || 48) < minTitleSize) {
      issues.push({ severity: 'warning', category: 'title-too-small', message: `Title "${title.id}" fontSize ${title.fontSize}px (min: ${minTitleSize}px for ${isHeroSlide ? 'hero' : 'regular'} slide)`, elementId: title.id, autoFixable: true })
      score -= isHeroSlide ? 12 : 8
    }
  }

  // V2-8: Title position — titles pushed to bottom (y > 700) on non-closing slides
  const bottomThreshold = 700
  for (const title of titles) {
    if ((title.y || 0) > bottomThreshold && slide.slideType !== 'closing') {
      issues.push({ severity: 'warning', category: 'title-too-low', message: `Title "${title.id}" at y=${title.y} (max: ${bottomThreshold} for non-closing slides)`, elementId: title.id, autoFixable: true })
      score -= 10
    }
  }

  // V2-3: Font ratio >= 4:1 hard floor
  if (fontSizes.length >= 2) {
    const hardRatio = Math.max(...fontSizes) / Math.min(...fontSizes)
    if (hardRatio < 4) {
      // Find the title element to mark as fixable
      const titleEl = titles[0]
      issues.push({ severity: 'warning', category: 'font-ratio-low', message: `Font ratio ${hardRatio.toFixed(1)}:1 (minimum 4:1)`, elementId: titleEl?.id, autoFixable: !!titleEl })
      score -= 5
    }
  }

  // V2-4: Text-on-image overlay check
  for (const txt of contentTexts) {
    const txtBox: BoundingBox = { x: txt.x || 0, y: txt.y || 0, width: txt.width || 0, height: txt.height || 0 }
    for (const img of imageElements) {
      const imgBox: BoundingBox = { x: img.x || 0, y: img.y || 0, width: img.width || 0, height: img.height || 0 }
      if (boxesOverlap(txtBox, imgBox)) {
        const imgZ = (img as SlideElement).zIndex || 0
        const txtZ = (txt as SlideElement).zIndex || 0
        const hasOverlay = elements.some(el =>
          el.type === 'shape' &&
          (el.zIndex || 0) > imgZ &&
          (el.zIndex || 0) < txtZ &&
          boxesOverlap(imgBox, { x: el.x || 0, y: el.y || 0, width: el.width || 0, height: el.height || 0 })
        )
        if (!hasOverlay) {
          issues.push({ severity: 'warning', category: 'text-on-image', message: `Text "${txt.id}" on image "${(img as SlideElement).id}" without overlay`, elementId: txt.id, autoFixable: false })
          score -= 8
        }
      }
    }
  }

  // V2-5: Body width <= 700
  for (const el of contentTexts) {
    if (el.role === 'body' && (el.width || 0) > 700) {
      issues.push({ severity: 'suggestion', category: 'body-too-wide', message: `Body "${el.id}" width ${el.width}px (max: 700px)`, elementId: el.id, autoFixable: true })
      score -= 3
    }
  }

  // V2-6: RTL textAlign check
  for (const el of contentTexts) {
    if (el.textAlign && el.textAlign !== 'right') {
      issues.push({ severity: 'warning', category: 'rtl-align', message: `Text "${el.id}" textAlign="${el.textAlign}" (must be "right")`, elementId: el.id, autoFixable: true })
      score -= 5
    }
  }

  // V2-7: Content element canvas bounds (non-decorative only)
  for (const el of contentTexts) {
    const right = (el.x || 0) + (el.width || 0)
    const bottom = (el.y || 0) + (el.height || 0)
    if (right > 1920 || bottom > 1080) {
      issues.push({ severity: 'warning', category: 'canvas-overflow', message: `Text "${el.id}" extends beyond canvas (r:${right}, b:${bottom})`, elementId: el.id, autoFixable: true })
      score -= 5
    }
  }

  // V2-9: Low decoration — content slides need at least 2 decorative shapes
  const nonHeroTypes = new Set(['cover', 'closing'])
  if (!nonHeroTypes.has(slide.slideType)) {
    const decorativeShapes = elements.filter(e =>
      e.type === 'shape' && ((e as import('@/types/presentation').ShapeElement).shapeType === 'decorative' ||
        (e as import('@/types/presentation').ShapeElement).shapeType === 'divider')
    )
    const decorativeTexts = textElements.filter(e => e.role === 'decorative')
    const totalDecorative = decorativeShapes.length + decorativeTexts.length
    if (totalDecorative < 2) {
      issues.push({ severity: 'suggestion', category: 'low-decoration', message: `Only ${totalDecorative} decorative elements (min: 2)`, autoFixable: true })
      score -= 5
    }
  }

  return { valid: issues.filter(i => i.severity === 'critical').length === 0, score: Math.max(0, score), issues }
}

export function autoFixSlide(slide: Slide, issues: ValidationIssue[], designSystem: PremiumDesignSystem, expectedImageUrl?: string): Slide {
  const fixed = { ...slide, elements: [...slide.elements] }

  for (const issue of issues) {
    if (!issue.autoFixable) continue

    // Missing image — find best placement by analyzing existing layout
    if (issue.category === 'missing-image' && expectedImageUrl) {
      const placement = findBestImagePlacement(fixed.elements, designSystem.colors.background)
      const imgElement: ImageElement = {
        id: `autofix-img-${slide.id}`, type: 'image',
        x: placement.x, y: placement.y,
        width: placement.width, height: placement.height,
        zIndex: placement.fullBleed ? 1 : 5,
        src: expectedImageUrl, objectFit: 'cover',
        borderRadius: placement.fullBleed ? 0 : 16,
        opacity: placement.fullBleed ? 0.4 : 1,
      }
      fixed.elements.push(imgElement)

      if (placement.fullBleed) {
        fixed.elements.push({
          id: `autofix-overlay-${slide.id}`, type: 'shape' as const,
          x: 0, y: 0, width: 1920, height: 1080, zIndex: 2,
          shapeType: 'background' as const,
          fill: `linear-gradient(180deg, ${designSystem.colors.background}CC 0%, ${designSystem.colors.background}40 40%, ${designSystem.colors.background}CC 100%)`,
          opacity: 1,
        })
      }
      continue
    }

    if (!issue.elementId) continue
    const elIndex = fixed.elements.findIndex(e => e.id === issue.elementId)
    if (elIndex === -1) continue

    if (issue.category === 'contrast') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        let color = updated.color || '#ffffff'
        let attempts = 0
        while (contrastRatio(color, designSystem.colors.background) < 4.5 && attempts < 20) {
          color = adjustLightness(color, 0.05)
          attempts++
        }
        updated.color = color
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'safe-zone') {
      const el = fixed.elements[elIndex]
      const updated = { ...el }
      updated.x = Math.max(80, Math.min(updated.x, 1920 - 80 - (updated.width || 200)))
      updated.y = Math.max(80, Math.min(updated.y, 1080 - 80 - (updated.height || 60)))
      fixed.elements[elIndex] = updated
    }

    if (issue.category === 'image-bounds') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        updated.x = Math.max(0, updated.x)
        updated.y = Math.max(0, updated.y)
        if (updated.x + updated.width > 1920) updated.width = 1920 - updated.x
        if (updated.y + updated.height > 1080) updated.height = 1080 - updated.y
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'image-small') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        const targetArea = 1920 * 1080 * 0.25
        const currentArea = updated.width * updated.height
        if (currentArea > 0 && currentArea < targetArea) {
          const scale = Math.sqrt(targetArea / currentArea)
          updated.width = Math.min(1920, Math.round(updated.width * scale))
          updated.height = Math.min(1080, Math.round(updated.height * scale))
          if (updated.x + updated.width > 1920) updated.x = 1920 - updated.width
          if (updated.y + updated.height > 1080) updated.y = 1080 - updated.height
          updated.x = Math.max(0, updated.x)
          updated.y = Math.max(0, updated.y)
        }
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'image-overlap-title') {
      const el = fixed.elements[elIndex]
      if (isImageElement(el)) {
        const updated: ImageElement = { ...el }
        const titleEls = fixed.elements.filter(e => isTextElement(e) && e.role === 'title') as TextElement[]
        if (titleEls.length > 0) {
          const titleCenterX = (titleEls[0].x || 0) + (titleEls[0].width || 0) / 2
          if (titleCenterX > 960) {
            updated.x = 80
          } else {
            updated.x = 1920 - updated.width - 80
          }
        }
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'text-overflow') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        const fontSize = updated.fontSize || 20
        const content = updated.content || ''
        const estCharWidth = fontSize * 0.6
        const estTextWidth = content.length * estCharWidth
        const lineHeight = (updated.lineHeight || 1.2) * fontSize

        // Strategy 1: Widen the box if there's room on canvas
        const maxWidth = 1840 - Math.max(80, updated.x)
        if (estTextWidth <= maxWidth * 1.1) {
          // Single line can fit if we widen
          updated.width = Math.min(maxWidth, Math.round(estTextWidth * 1.15))
        } else {
          // Strategy 2: Allow more lines by increasing height, or reduce font
          const neededLines = Math.ceil(estTextWidth / maxWidth)
          const neededHeight = neededLines * lineHeight + 20
          if (neededHeight <= 800 && updated.y + neededHeight <= 1040) {
            updated.width = maxWidth
            updated.height = Math.round(neededHeight)
          } else {
            // Strategy 3: Reduce font size to fit
            const targetWidth = Math.max(updated.width, maxWidth)
            const maxLines = Math.max(1, Math.floor(600 / lineHeight))
            const targetCharWidth = (targetWidth * maxLines) / content.length
            const newFontSize = Math.max(14, Math.round(targetCharWidth / 0.6))
            updated.fontSize = newFontSize
            updated.width = Math.min(maxWidth, Math.max(updated.width, targetWidth))
            const newLineHeight = (updated.lineHeight || 1.2) * newFontSize
            const newLines = Math.ceil(content.length * newFontSize * 0.6 / updated.width)
            updated.height = Math.max(updated.height, Math.round(newLines * newLineHeight + 20))
          }
        }
        // Keep in canvas bounds
        if (updated.x + updated.width > 1880) updated.x = Math.max(40, 1880 - updated.width)
        if (updated.y + updated.height > 1040) updated.height = 1040 - updated.y
        fixed.elements[elIndex] = updated
      }
    }

    // V2 auto-fixes
    if (issue.category === 'title-too-small') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        const heroTypes = new Set(['cover', 'bigIdea', 'insight', 'closing'])
        const hSize = designSystem.typography?.headingSize || 56
        const targetSize = heroTypes.has(slide.slideType)
          ? Math.max(hSize, designSystem.typography?.displaySize || 96)
          : hSize
        updated.fontSize = Math.max(targetSize, updated.fontSize || 48)
        // Ensure the title fits: if bumped significantly, widen the box
        if (updated.fontSize >= 80 && updated.width < 800) {
          updated.width = Math.min(1760, updated.width * 1.5)
        }
        if (updated.fontSize >= 80) {
          updated.height = Math.max(updated.height, updated.fontSize * 1.3)
        }
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'body-too-wide') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        updated.width = 680
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'rtl-align') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        updated.textAlign = 'right'
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'title-too-low') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        // Move title to top area (y: 80-200 range)
        const oldY = updated.y
        updated.y = Math.min(200, Math.max(80, updated.y))
        // If other elements were positioned relative to the title, we need to shift content zone
        // Find body/bullet elements that were near the old title position and shift them proportionally
        const shift = oldY - updated.y
        if (shift > 200) {
          for (let j = 0; j < fixed.elements.length; j++) {
            if (j === elIndex) continue
            const other = fixed.elements[j]
            if (isTextElement(other) && other.role !== 'decorative' && other.role !== 'title') {
              if ((other.y || 0) > 400) {
                const shifted = { ...other }
                shifted.y = Math.max(updated.y + (updated.height || 120) + 40, (shifted.y || 0) - shift * 0.5)
                fixed.elements[j] = shifted
              }
            }
          }
        }
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'font-ratio-low') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el) && el.role === 'title') {
        const updated: TextElement = { ...el }
        // Find smallest font size on this slide to compute target
        const allFontSizes = fixed.elements
          .filter((e): e is TextElement => isTextElement(e) && e.role !== 'decorative')
          .map(e => e.fontSize || 20)
          .filter(s => s > 0)
        const minFs = Math.min(...allFontSizes)
        const targetTitle = Math.max(updated.fontSize || 48, minFs * 4)
        updated.fontSize = Math.min(targetTitle, 140) // cap at 140px
        if (updated.fontSize >= 80 && updated.width < 800) {
          updated.width = Math.min(1760, updated.width * 1.5)
        }
        if (updated.fontSize >= 80) {
          updated.height = Math.max(updated.height, updated.fontSize * 1.3)
        }
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'canvas-overflow') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        if (updated.x + updated.width > 1920) updated.width = 1920 - updated.x - 40
        if (updated.y + updated.height > 1080) updated.height = 1080 - updated.y - 40
        fixed.elements[elIndex] = updated
      }
    }

    if (issue.category === 'low-decoration') {
      // Inject accent line + gradient blob
      const accentColor = designSystem.colors.accent || '#ff3366'
      fixed.elements.push({
        id: `autofix-accent-line-${slide.id}`, type: 'shape' as const,
        x: 80, y: 140, width: 3, height: 600, zIndex: 2,
        shapeType: 'decorative' as const,
        fill: accentColor, opacity: 0.8,
      })
      fixed.elements.push({
        id: `autofix-blob-${slide.id}`, type: 'shape' as const,
        x: -120, y: -80, width: 500, height: 500, zIndex: 1,
        shapeType: 'decorative' as const,
        fill: `radial-gradient(circle, ${accentColor}15 0%, transparent 70%)`,
        borderRadius: 250, opacity: 0.15,
      })
      continue
    }

    if (issue.category === 'text-text-overlap') {
      const el = fixed.elements[elIndex]
      if (isTextElement(el)) {
        const updated: TextElement = { ...el }
        const otherTexts = fixed.elements.filter(
          (e, idx) => idx !== elIndex && isTextElement(e) && e.role !== 'decorative'
        ) as TextElement[]
        for (const other of otherTexts) {
          const myBox: BoundingBox = { x: updated.x, y: updated.y, width: updated.width, height: updated.height }
          const otherBox: BoundingBox = { x: other.x, y: other.y, width: other.width, height: other.height }
          if (boxesOverlap(myBox, otherBox)) {
            updated.y = other.y + other.height + 20
            if (updated.y + updated.height > 1020) {
              updated.y = other.y
              updated.x = other.x + other.width + 40
              if (updated.x + updated.width > 1860) {
                updated.x = other.x - updated.width - 40
              }
            }
            break
          }
        }
        fixed.elements[elIndex] = updated
      }
    }
  }

  return fixed
}

export function checkVisualConsistency(slides: Slide[], _designSystem: PremiumDesignSystem): Slide[] {
  const allTitles: { slideIndex: number; x: number; y: number; fontSize: number; element: TextElement }[] = []

  slides.forEach((slide, si) => {
    const titles = (slide.elements || []).filter(
      (e): e is TextElement => isTextElement(e) && e.role === 'title'
    )
    for (const t of titles) {
      allTitles.push({ slideIndex: si, x: t.x || 0, y: t.y || 0, fontSize: t.fontSize || 48, element: t })
    }
  })

  if (allTitles.length < 3) return slides

  const regularTitles = allTitles.filter(t =>
    slides[t.slideIndex]?.slideType !== 'cover' && slides[t.slideIndex]?.slideType !== 'closing'
  )

  if (regularTitles.length > 0) {
    // Normalize heading font sizes — snap outliers to the median
    const headingSizes = regularTitles.map(t => t.element.fontSize || 48)
    const sorted = [...headingSizes].sort((a, b) => a - b)
    const medianSize = sorted[Math.floor(sorted.length / 2)]
    for (const t of regularTitles) {
      const diff = Math.abs((t.element.fontSize || 48) - medianSize)
      // If more than 10px off from median, snap to median (catches both drifts like 56 vs 88)
      if (diff > 10) {
        t.element.fontSize = medianSize
        // Ensure the box is big enough for the new size
        if (medianSize >= 80 && (t.element.width || 0) < 800) {
          t.element.width = Math.min(1760, (t.element.width || 800) * 1.5)
        }
        if (medianSize >= 80) {
          t.element.height = Math.max(t.element.height || 100, medianSize * 1.3)
        }
      }
    }

    // === Layout variety — break runs of 3+ titles in same quadrant ===
    const getQuadrant = (x: number, y: number): string => {
      const h = x > 960 ? 'R' : 'L'
      const v = y < 400 ? 'T' : y > 600 ? 'B' : 'M'
      return `${h}${v}`
    }

    // Predefined alternative positions for variety
    const altPositions: Array<{ x: number; y: number }> = [
      { x: 1200, y: 120 },  // right-top
      { x: 120, y: 120 },   // left-top
      { x: 120, y: 480 },   // left-middle
      { x: 1200, y: 480 },  // right-middle
      { x: 120, y: 780 },   // left-bottom
    ]

    for (let i = 2; i < regularTitles.length; i++) {
      const q0 = getQuadrant(regularTitles[i - 2].element.x, regularTitles[i - 2].element.y)
      const q1 = getQuadrant(regularTitles[i - 1].element.x, regularTitles[i - 1].element.y)
      const q2 = getQuadrant(regularTitles[i].element.x, regularTitles[i].element.y)

      if (q0 === q1 && q1 === q2) {
        // 3 consecutive same quadrant — move the third to a different position
        const currentQ = q2
        const alt = altPositions.find(p => getQuadrant(p.x, p.y) !== currentQ)
        if (alt) {
          regularTitles[i].element.x = alt.x
          regularTitles[i].element.y = alt.y
        }
      }
    }
  }

  // === Break runs of 4+ consecutive solid backgrounds ===
  const colors = _designSystem.colors
  let solidRun = 0
  for (let i = 0; i < slides.length; i++) {
    const bg = slides[i].background
    if (bg.type === 'solid') {
      solidRun++
      if (solidRun >= 4) {
        // Convert this slide's background to a subtle gradient
        const gradStart = colors.gradientStart || colors.background || '#1a1a2e'
        const gradEnd = colors.gradientEnd || colors.primary || '#16213e'
        slides[i] = {
          ...slides[i],
          background: {
            type: 'gradient',
            value: `linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%)`,
          },
        }
        solidRun = 0 // reset run
      }
    } else {
      solidRun = 0
    }
  }

  return slides
}
