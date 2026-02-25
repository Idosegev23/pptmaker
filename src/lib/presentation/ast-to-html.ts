/**
 * AST → HTML Converter
 * Converts Presentation AST to self-contained HTML slides for PDF export.
 * This is the ONLY place in the app that generates HTML from the AST.
 */

import type {
  Presentation,
  Slide,
  SlideElement,
  TextElement,
  ImageElement,
  ShapeElement,
  DesignSystem,
} from '@/types/presentation'

const W = 1920
const H = 1080

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

function renderBackground(bg: Slide['background']): string {
  switch (bg.type) {
    case 'solid':
      return `background: ${bg.value};`
    case 'gradient':
      return `background: ${bg.value};`
    case 'image':
      return `background: url('${bg.value}') center/cover no-repeat;`
    default:
      return 'background: #1a1a2e;'
  }
}

function renderTextElement(el: TextElement): string {
  const styles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
    `font-size: ${el.fontSize}px`,
    `font-weight: ${el.fontWeight}`,
    `color: ${el.color}`,
    `text-align: ${el.textAlign}`,
    `white-space: pre-wrap`,
    `word-wrap: break-word`,
    `overflow: hidden`,
    `direction: rtl`,
    `font-family: 'Heebo', sans-serif`,
  ]

  if (el.lineHeight) styles.push(`line-height: ${el.lineHeight}`)
  if (el.letterSpacing) styles.push(`letter-spacing: ${el.letterSpacing}px`)
  if (el.textDecoration && el.textDecoration !== 'none') styles.push(`text-decoration: ${el.textDecoration}`)
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  if (el.rotation) styles.push(`transform: rotate(${el.rotation}deg)`)
  if (el.backgroundColor) styles.push(`background-color: ${el.backgroundColor}`)
  if (el.borderRadius) styles.push(`border-radius: ${el.borderRadius}px`)
  if (el.padding) styles.push(`padding: ${el.padding}px`)

  return `<div style="${styles.join('; ')}">${escapeHtml(el.content)}</div>`
}

function renderImageElement(el: ImageElement): string {
  const containerStyles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
    `overflow: hidden`,
  ]

  if (el.borderRadius) containerStyles.push(`border-radius: ${el.borderRadius}px`)
  if (el.clipPath) containerStyles.push(`clip-path: ${el.clipPath}`)
  if (el.border) containerStyles.push(`border: ${el.border}`)
  if (el.opacity !== undefined && el.opacity !== 1) containerStyles.push(`opacity: ${el.opacity}`)
  if (el.rotation) containerStyles.push(`transform: rotate(${el.rotation}deg)`)

  const imgStyles = [
    `width: 100%`,
    `height: 100%`,
    `object-fit: ${el.objectFit}`,
    `display: block`,
  ]

  return `<div style="${containerStyles.join('; ')}"><img src="${el.src}" alt="${el.alt || ''}" style="${imgStyles.join('; ')}" onerror="this.style.display='none'" /></div>`
}

function renderShapeElement(el: ShapeElement): string {
  const styles = [
    `position: absolute`,
    `left: ${el.x}px`,
    `top: ${el.y}px`,
    `width: ${el.width}px`,
    `height: ${el.height}px`,
    `z-index: ${el.zIndex}`,
  ]

  // Fill can be a color or gradient
  if (el.fill.includes('gradient') || el.fill.includes('linear') || el.fill.includes('radial')) {
    styles.push(`background: ${el.fill}`)
  } else {
    styles.push(`background-color: ${el.fill}`)
  }

  if (el.borderRadius) styles.push(`border-radius: ${el.borderRadius}px`)
  if (el.clipPath) styles.push(`clip-path: ${el.clipPath}`)
  if (el.border) styles.push(`border: ${el.border}`)
  if (el.opacity !== undefined && el.opacity !== 1) styles.push(`opacity: ${el.opacity}`)
  if (el.rotation) styles.push(`transform: rotate(${el.rotation}deg)`)

  return `<div style="${styles.join('; ')}"></div>`
}

function renderElement(el: SlideElement): string {
  switch (el.type) {
    case 'text':
      return renderTextElement(el)
    case 'image':
      return renderImageElement(el)
    case 'shape':
      return renderShapeElement(el)
    default:
      return ''
  }
}

/**
 * Convert a single Slide AST to a self-contained HTML document.
 */
export function slideToHtml(slide: Slide, designSystem: DesignSystem): string {
  const fontFamily = designSystem.fonts.heading || 'Heebo'
  const bgCSS = renderBackground(slide.background)
  const elementsHtml = slide.elements
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(renderElement)
    .join('\n    ')

  return `<!DOCTYPE html>
<html dir="${designSystem.direction}" lang="he">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: ${W}px ${H}px; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: '${fontFamily}', sans-serif;
      direction: ${designSystem.direction};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      width: ${W}px;
      height: ${H}px;
      overflow: hidden;
    }
    .slide {
      width: ${W}px;
      height: ${H}px;
      position: relative;
      overflow: hidden;
      ${bgCSS}
    }
  </style>
</head>
<body>
  <div class="slide">
    ${elementsHtml}
  </div>
</body>
</html>`
}

/**
 * Convert all slides in a Presentation to HTML strings.
 * Used for PDF export via Puppeteer.
 */
export function presentationToHtmlSlides(presentation: Presentation): string[] {
  return presentation.slides.map(slide =>
    slideToHtml(slide, presentation.designSystem)
  )
}
