/**
 * Israeli Market Image Generator
 * Uses Gemini 3 Pro Image for creating images optimized for the Israeli market
 * with proper Hebrew text support and local aesthetics
 */

import { GoogleGenAI } from '@google/genai'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Nano Banana Pro - Gemini 3 Pro Image model
const IMAGE_MODEL = 'gemini-3-pro-image-preview'

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY_BASE = 1000 // 1 second

export interface IsraeliImage {
  type: 'cover' | 'lifestyle' | 'infographic' | 'social' | 'hero' | 'product' | 'team'
  imageData: Buffer
  mimeType: string
  prompt: string
  aspectRatio: string
}

export interface ImageGenerationConfig {
  aspectRatio?: '16:9' | '1:1' | '4:5' | '9:16'
  resolution?: '2K' | '4K'
  style?: 'photorealistic' | 'illustration' | 'minimal' | 'bold'
  includeHebrewText?: boolean
  hebrewText?: string
  brandColors?: string[]
  referenceImages?: string[] // Up to 14 reference images
}

/**
 * Generate image with retry logic using generateContent with imageConfig
 * This is the correct API for Nano Banana Pro (gemini-3-pro-image-preview)
 */
async function generateWithRetry(
  prompt: string,
  aspectRatio: string = '16:9'
): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Israeli Image] Attempt ${attempt}/${MAX_RETRIES} with generateContent`)
      
      // Use generateContent with imageConfig for Nano Banana Pro
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as '16:9' | '1:1' | '4:5' | '9:16',
            imageSize: '2K',
          },
        },
      })

      // Extract image from response parts
      const parts = response.candidates?.[0]?.content?.parts
      if (parts) {
        for (const part of parts) {
          const inlineData = part.inlineData
          if (inlineData?.data) {
            console.log(`[Israeli Image] Success on attempt ${attempt}`)
            return Buffer.from(inlineData.data, 'base64')
          }
        }
      }
      
      console.log(`[Israeli Image] No image data on attempt ${attempt}`)
    } catch (error) {
      console.error(`[Israeli Image] Attempt ${attempt} failed:`, error)
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_BASE * attempt
        console.log(`[Israeli Image] Waiting ${delay}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  console.log(`[Israeli Image] All ${MAX_RETRIES} attempts failed`)
  return null
}

/**
 * Generate a cover/hero image for Israeli market
 */
export async function generateIsraeliCoverImage(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  config: ImageGenerationConfig = {}
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating cover for ${brandResearch.brandName}`)
  
  const industry = brandResearch.industry || 'lifestyle'
  const audience = brandResearch.targetDemographics?.primaryAudience
  const mood = brandResearch.brandPersonality?.join(', ') || 'modern, professional'
  
  // Build Israeli-focused prompt
  const prompt = `
Create a stunning hero image for an Israeli brand presentation.

Brand: ${brandResearch.brandName}
Industry: ${industry}
Target Audience: Israeli ${audience?.gender || 'adults'}, age ${audience?.ageRange || '25-45'}
Brand Personality: ${mood}
Primary Colors: ${brandColors.primary}, ${brandColors.secondary || brandColors.accent}

Style Requirements:
- Modern Israeli aesthetic
- Mediterranean vibes with urban sophistication
- Warm, inviting lighting typical of Tel Aviv
- Clean composition with space for text overlay on the right side (RTL layout)
- Professional but approachable feel
- Lifestyle imagery showing Israeli diversity
${config.style === 'photorealistic' ? '- Photorealistic, high-end advertising quality' : ''}
${config.style === 'minimal' ? '- Minimalist, lots of white space, elegant' : ''}

Technical:
- Aspect ratio: ${config.aspectRatio || '16:9'}
- High resolution, crisp details
- Brand colors incorporated subtly in the scene

CRITICAL REQUIREMENT - NO TEXT:
- Generate ONLY a visual/photographic image
- Do NOT include ANY text, letters, words, logos, or typography
- Do NOT include brand names, slogans, or captions
- The image must be purely visual - text will be overlaid separately
- If you see text in your output, regenerate without it

DO NOT include: generic stock photo feel, cold/sterile environments, non-Israeli aesthetics, any text or writing
`.trim()

  const imageData = await generateWithRetry(prompt, config.aspectRatio || '16:9')
  
  if (imageData) {
    return {
      type: 'cover',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: config.aspectRatio || '16:9',
    }
  }
  
  return null
}

/**
 * Generate lifestyle image showing Israeli audience
 */
export async function generateIsraeliLifestyleImage(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  scenario: 'urban' | 'beach' | 'home' | 'work' | 'social' = 'urban'
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating ${scenario} lifestyle image`)
  
  const audience = brandResearch.targetDemographics?.primaryAudience
  const interests = audience?.interests?.slice(0, 3).join(', ') || 'lifestyle, wellness'
  
  const scenarios = {
    urban: 'Tel Aviv street scene, trendy coffee shop, modern Israeli urban lifestyle',
    beach: 'Mediterranean beach atmosphere, Israeli coastal lifestyle, relaxed but sophisticated',
    home: 'Modern Israeli apartment, warm family setting, contemporary home design',
    work: 'Israeli startup office, collaborative workspace, tech-savvy professionals',
    social: 'Friends gathering, Israeli social scene, diverse group having fun',
  }
  
  const prompt = `
Create an authentic Israeli lifestyle photograph.

Setting: ${scenarios[scenario]}
People: Israeli ${audience?.gender || 'mixed'}, ${audience?.ageRange || '25-40'} years old
Interests: ${interests}
Mood: ${brandResearch.brandPersonality?.join(', ') || 'warm, authentic, aspirational'}

Visual Style:
- Natural, authentic Israeli look (not American or European)
- Mediterranean lighting - warm, golden hour feel
- Diverse Israeli faces (Ashkenazi, Mizrachi, Ethiopian, etc.)
- Casual elegance typical of Israeli urban culture
- Real, relatable moments
- Colors inspired by: ${brandColors.primary}, ${brandColors.accent}

Technical:
- 16:9 aspect ratio
- High quality, editorial style
- Depth of field with subject focus

CRITICAL - NO TEXT: Generate a purely visual/photographic image with absolutely NO text, letters, words, logos, brand names, watermarks, or typography of any kind.

Avoid: staged/fake looking, cold lighting, homogeneous looks, any text or writing
`.trim()

  const imageData = await generateWithRetry(prompt, '16:9')
  
  if (imageData) {
    return {
      type: 'lifestyle',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: '16:9',
    }
  }
  
  return null
}

/**
 * Generate infographic with Hebrew text
 */
export async function generateIsraeliInfographic(
  title: string,
  dataPoints: { label: string; value: string }[],
  brandColors: BrandColors,
  style: 'stats' | 'process' | 'comparison' = 'stats'
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating ${style} infographic`)
  
  const dataText = dataPoints.map(d => `${d.label}: ${d.value}`).join('\n')
  
  const prompt = `
Create a professional Hebrew infographic for a business presentation.

Type: ${style === 'stats' ? 'Statistics/KPIs display' : style === 'process' ? 'Process flow' : 'Comparison chart'}

Data to display (in Hebrew):
${dataText}

Design Requirements:
- Right-to-left layout (Hebrew)
- Primary color: ${brandColors.primary}
- Accent color: ${brandColors.accent || brandColors.secondary}
- Clean, modern design
- Large, readable Hebrew typography
- Professional business aesthetic
- Icons or simple illustrations for each data point

Style:
- Minimalist with bold accents
- White or light background
- Strong visual hierarchy
- Easy to read from a distance (presentation slide)

Aspect ratio: 16:9
Resolution: High quality for presentations

IMPORTANT: Hebrew text must be accurate and properly rendered, reading right-to-left.
`.trim()

  const imageData = await generateWithRetry(prompt, '16:9')
  
  if (imageData) {
    return {
      type: 'infographic',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: '16:9',
    }
  }
  
  return null
}

/**
 * Generate social media style image
 */
export async function generateIsraeliSocialImage(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  platform: 'instagram' | 'facebook' | 'linkedin' = 'instagram'
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating ${platform} social image`)
  
  const aspectRatios = {
    instagram: '1:1' as const,
    facebook: '16:9' as const,
    linkedin: '16:9' as const,
  }
  
  const prompt = `
Create an engaging social media image for an Israeli brand.

Brand: ${brandResearch.brandName}
Industry: ${brandResearch.industry}
Platform: ${platform}

Style:
- Trendy, scroll-stopping design
- Israeli social media aesthetic
- Bold use of brand color: ${brandColors.primary}
- Modern, clean composition
- Lifestyle feel with product/service integration
- Aspirational but authentic

Technical:
- ${platform === 'instagram' ? 'Square format, Instagram-ready' : 'Horizontal format'}
- Vibrant but not oversaturated
- Mobile-first design
- High contrast for small screens

CRITICAL - NO TEXT: Generate a purely visual/photographic image with absolutely NO text, letters, words, logos, brand names, or typography of any kind. Text will be overlaid separately.
`.trim()

  const imageData = await generateWithRetry(prompt, aspectRatios[platform])
  
  if (imageData) {
    return {
      type: 'social',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: aspectRatios[platform],
    }
  }
  
  return null
}

/**
 * Generate a complete set of images for a proposal
 */
export async function generateIsraeliProposalImages(
  brandResearch: BrandResearch,
  brandColors: BrandColors
): Promise<{
  cover: IsraeliImage | null
  lifestyle: IsraeliImage | null
  audience: IsraeliImage | null
  activity: IsraeliImage | null
}> {
  console.log(`[Israeli Image] Generating full proposal image set for ${brandResearch.brandName}`)
  
  // Generate all images in parallel
  const [cover, lifestyle, audience, activity] = await Promise.all([
    generateIsraeliCoverImage(brandResearch, brandColors, { style: 'photorealistic' }),
    generateIsraeliLifestyleImage(brandResearch, brandColors, 'urban'),
    generateIsraeliLifestyleImage(brandResearch, brandColors, 'social'),
    generateIsraeliLifestyleImage(brandResearch, brandColors, 'work'),
  ])
  
  console.log(`[Israeli Image] Generated: cover=${!!cover}, lifestyle=${!!lifestyle}, audience=${!!audience}, activity=${!!activity}`)
  
  return { cover, lifestyle, audience, activity }
}

/**
 * Convert IsraeliImage to data URL for embedding in HTML
 */
export function israeliImageToDataUrl(image: IsraeliImage): string {
  return `data:${image.mimeType};base64,${image.imageData.toString('base64')}`
}
