import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

export interface PdfOptions {
  format?: 'A4' | '16:9'
  landscape?: boolean
}

/**
 * Get browser instance for Vercel serverless
 */
async function getBrowser() {
  // Check if running on Vercel/AWS Lambda
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL

  if (isServerless) {
    // Use @sparticuz/chromium for serverless environments
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  } else {
    // Local development - try to use local Chrome
    const executablePath = process.platform === 'darwin' 
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/google-chrome'

    return puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
}

/**
 * Generate PDF from HTML content
 */
export async function generatePdf(
  html: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  const browser = await getBrowser()

  try {
    const page = await browser.newPage()

    // Set content
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Wait for fonts to load
    await page.evaluate(() => document.fonts?.ready)

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
    await browser.close()
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

  try {
    const page = await browser.newPage()
    
    await page.setViewport({
      width: options.width || 1200,
      height: options.height || 800,
    })

    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts?.ready)

    const screenshot = await page.screenshot({ 
      fullPage: true,
      type: 'png',
    })
    return Buffer.from(screenshot)
  } finally {
    await browser.close()
  }
}
