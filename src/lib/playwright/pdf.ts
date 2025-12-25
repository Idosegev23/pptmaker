import { chromium, type Browser, type Page } from 'playwright'

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  return browser
}

export interface PdfOptions {
  format?: 'A4' | '16:9'
  landscape?: boolean
}

/**
 * Generate PDF from HTML content
 */
export async function generatePdf(
  html: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  const browser = await getBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Set content
    await page.setContent(html, { waitUntil: 'networkidle' })

    // Wait for fonts to load
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => document.fonts.ready)

    // Generate PDF
    const pdfOptions = options.format === '16:9' 
      ? {
          width: '1920px',
          height: '1080px',
          printBackground: true,
          preferCSSPageSize: true,
        }
      : {
          format: 'A4' as const,
          printBackground: true,
          preferCSSPageSize: true,
        }

    const pdfBuffer = await page.pdf(pdfOptions)
    return Buffer.from(pdfBuffer)
  } finally {
    await context.close()
  }
}

/**
 * Generate multi-page PDF from array of HTML pages
 */
export async function generateMultiPagePdf(
  htmlPages: string[],
  options: PdfOptions = {}
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib')
  
  const mergedPdf = await PDFDocument.create()

  for (const html of htmlPages) {
    const pageBuffer = await generatePdf(html, options)
    const pagePdf = await PDFDocument.load(pageBuffer)
    const copiedPages = await mergedPdf.copyPages(pagePdf, pagePdf.getPageIndices())
    copiedPages.forEach(page => mergedPdf.addPage(page))
  }

  const mergedBuffer = await mergedPdf.save()
  return Buffer.from(mergedBuffer)
}

/**
 * Generate screenshot from HTML (for preview)
 */
export async function generateScreenshot(
  html: string,
  options: { width?: number; height?: number } = {}
): Promise<Buffer> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: {
      width: options.width || 1200,
      height: options.height || 800,
    },
  })
  const page = await context.newPage()

  try {
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => document.fonts.ready)

    const screenshot = await page.screenshot({ 
      fullPage: true,
      type: 'png',
    })
    return Buffer.from(screenshot)
  } finally {
    await context.close()
  }
}

/**
 * Cleanup browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close()
    browser = null
  }
}




