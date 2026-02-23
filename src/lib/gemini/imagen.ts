/**
 * Gemini 3 Pro Image Generation
 * Creates lifestyle images for proposals based on brand research and colors
 */

import { GoogleGenAI } from '@google/genai'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Model for image generation
const IMAGE_MODEL = 'gemini-3-pro-image-preview'

export interface GeneratedImage {
  base64: string
  mimeType: string
  prompt: string
  type: 'cover' | 'brand' | 'audience' | 'lifestyle'
}

export interface ImageGenerationOptions {
  aspectRatio?: '16:9' | '1:1' | '9:16'
  style?: 'editorial' | 'lifestyle' | 'minimal' | 'vibrant'
  includeColors?: boolean
}

/**
 * Generate a brand-aligned cover image
 */
export async function generateCoverImage(
  brandResearch: BrandResearch,
  brandColors?: BrandColors,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const colorContext = brandColors 
    ? `Use these brand colors as inspiration: ${brandColors.primary}, ${brandColors.secondary}. Style: ${brandColors.style}, mood: ${brandColors.mood}.`
    : ''

  // Get audience info from new or old format
  const primaryAudience = brandResearch.targetDemographics?.primaryAudience
  const audienceGender = primaryAudience?.gender || 'diverse'
  const audienceAge = primaryAudience?.ageRange || '25-45'
  const personality = brandResearch.brandPersonality?.join(', ') || 'modern, professional'

  const prompt = `
Create a premium, editorial-quality cover image for a marketing presentation.

Brand: ${brandResearch.brandName}
Industry: ${brandResearch.industry}
Target audience: ${audienceGender}, ages ${audienceAge}
Brand personality: ${personality}

${colorContext}

Requirements:
- Style: High-end commercial photography, ${options.style || 'editorial'}
- Mood: Professional, aspirational, modern
- Composition: Full bleed, suitable as presentation background
- Real people in authentic situations (if applicable)
- Modern, premium aesthetic
- NO text, NO logos, NO overlays, NO graphics
- Aspect ratio: ${options.aspectRatio || '16:9'} (widescreen)
- Resolution: 4K quality
- Should feel aligned with the brand's identity

The image should be sophisticated enough to work as a cover slide background with text overlaid.
`

  return generateImage(prompt, 'cover')
}

/**
 * Generate a brand lifestyle image
 */
export async function generateBrandImage(
  brandResearch: BrandResearch,
  brandColors?: BrandColors,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const colorContext = brandColors
    ? `Color palette inspiration: ${brandColors.palette?.join(', ') || brandColors.primary}. Mood: ${brandColors.mood}.`
    : ''

  // Get values from new or old format
  const primaryAudience = brandResearch.targetDemographics?.primaryAudience
  const audienceGender = primaryAudience?.gender || 'diverse'
  const audienceAge = primaryAudience?.ageRange || '25-45'
  const interests = primaryAudience?.interests?.join(', ') || 'lifestyle, quality'
  const brandValues = brandResearch.brandValues?.join(', ') || 'quality, innovation'

  const prompt = `
Create a lifestyle photograph that represents the essence of the brand "${brandResearch.brandName}".

Industry: ${brandResearch.industry}
Brand values: ${brandValues}
Market position: ${brandResearch.marketPosition || 'premium'}
Target audience: ${audienceGender}, ages ${audienceAge}
Interests: ${interests}

${colorContext}

Requirements:
- Style: ${options.style || 'lifestyle'}, authentic, natural
- Show the brand's world and aesthetic
- Feature real people if relevant to the industry
- Natural lighting, candid feel
- Modern, aspirational setting
- NO text, NO logos
- Aspect ratio: ${options.aspectRatio || '16:9'}
- 4K quality
`

  return generateImage(prompt, 'brand')
}

/**
 * Generate a target audience image
 */
export async function generateAudienceImage(
  brandResearch: BrandResearch,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  // Get values from new or old format
  const primaryAudience = brandResearch.targetDemographics?.primaryAudience
  const genderRaw = primaryAudience?.gender || 'נשים וגברים'
  const gender = genderRaw === 'נשים' ? 'women' :
                 genderRaw === 'גברים' ? 'men' :
                 'mixed group of people'
  const ageRange = primaryAudience?.ageRange || '25-45'
  const socioeconomic = primaryAudience?.socioeconomic || 'middle-upper class'
  const interests = primaryAudience?.interests?.join(', ') || 'lifestyle, quality products'
  const behavior = brandResearch.targetDemographics?.behavior || 'active consumers'

  const prompt = `
Create a lifestyle photograph showing the target audience for "${brandResearch.brandName}".

Demographics:
- ${gender}, ages ${ageRange}
- Socioeconomic: ${socioeconomic}
- Interests: ${interests}
- Behavior: ${behavior}

Requirements:
- Style: ${options.style || 'lifestyle'}, Instagram-worthy, authentic
- Show people in real-life situations
- Positive, engaged, connected vibe
- Modern, relatable setting
- Natural lighting
- NO text, NO logos
- Aspect ratio: ${options.aspectRatio || '16:9'}
- 4K quality
`

  return generateImage(prompt, 'audience')
}

/**
 * Generate a generic lifestyle image for a specific theme
 */
export async function generateLifestyleImage(
  theme: string,
  brandColors?: BrandColors,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const colorContext = brandColors
    ? `Color inspiration: ${brandColors.palette.join(', ')}.`
    : ''

  const prompt = `
Create a premium lifestyle photograph with the theme: "${theme}"

${colorContext}

Requirements:
- Style: ${options.style || 'lifestyle'}, high-quality, editorial
- Modern, aspirational aesthetic
- Natural lighting
- Authentic, not staged
- NO text, NO logos, NO graphics
- Aspect ratio: ${options.aspectRatio || '16:9'}
- 4K quality
`

  return generateImage(prompt, 'lifestyle')
}

/**
 * Core image generation function
 */
async function generateImage(
  prompt: string,
  type: GeneratedImage['type']
): Promise<GeneratedImage | null> {
  console.log(`[Gemini Image] Generating ${type} image...`)
  
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: {
        responseModalities: ['image', 'text'],
      }
    })

    // Extract image from response
    const candidates = response.candidates || []
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || []
      for (const part of parts) {
        if (part.inlineData) {
          console.log(`[Gemini Image] Generated ${type} image successfully`)
          return {
            base64: part.inlineData.data || '',
            mimeType: part.inlineData.mimeType || 'image/png',
            prompt,
            type,
          }
        }
      }
    }

    console.log('[Gemini Image] No image in response')
    return null
  } catch (error) {
    console.error('[Gemini Image] Generation error:', error)
    return null
  }
}

/**
 * Generate all proposal images in parallel
 */
export async function generateProposalImages(
  brandResearch: BrandResearch,
  brandColors?: BrandColors
): Promise<{
  coverImage?: GeneratedImage
  brandImage?: GeneratedImage
  audienceImage?: GeneratedImage
}> {
  console.log(`[Gemini Image] Generating all images for ${brandResearch.brandName}`)
  
  const [coverImage, brandImage, audienceImage] = await Promise.all([
    generateCoverImage(brandResearch, brandColors),
    generateBrandImage(brandResearch, brandColors),
    generateAudienceImage(brandResearch),
  ])
  
  const results = {
    coverImage: coverImage || undefined,
    brandImage: brandImage || undefined,
    audienceImage: audienceImage || undefined,
  }
  
  console.log(`[Gemini Image] Generated ${Object.values(results).filter(Boolean).length}/3 images`)
  
  return results
}

/**
 * Convert generated image to data URL
 */
export function imageToDataUrl(image: GeneratedImage): string {
  return `data:${image.mimeType};base64,${image.base64}`
}

/**
 * Upload generated image to storage and get URL
 */
export async function uploadGeneratedImage(
  image: GeneratedImage,
  documentId: string,
  supabaseClient: { storage: { from: (bucket: string) => { upload: (path: string, buffer: Buffer, options: { contentType: string; upsert: boolean }) => Promise<{ error: Error | null }>; getPublicUrl: (path: string) => { data: { publicUrl: string } } } } }
): Promise<string | null> {
  try {
    const buffer = Buffer.from(image.base64, 'base64')
    const extension = image.mimeType.split('/')[1] || 'png'
    const fileName = `proposal_${documentId}_${image.type}_${Date.now()}.${extension}`
    
    const { error } = await supabaseClient.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: image.mimeType,
        upsert: true,
      })
    
    if (error) {
      console.error('[Upload] Error:', error)
      return null
    }
    
    const { data } = supabaseClient.storage
      .from('assets')
      .getPublicUrl(fileName)
    
    return data.publicUrl
  } catch (error) {
    console.error('[Upload] Error:', error)
    return null
  }
}

