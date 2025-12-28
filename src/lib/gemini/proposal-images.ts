/**
 * Generate images for proposal slides using Gemini 3 Pro Image
 * Model: gemini-3-pro-image-preview
 * Features: 4K resolution, Google Search grounding
 */

import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/server'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

interface ProposalData {
  brandName?: string
  brandDescription?: string
  targetGender?: string
  targetAgeRange?: string
  targetBehavior?: string
  activity?: string
  [key: string]: unknown
}

interface GeneratedImages {
  brandImage?: string
  audienceImage?: string
}

interface ImagePrompt {
  key: keyof GeneratedImages
  prompt: string
}

/**
 * Generate image prompts based on proposal data
 * Creates premium, lifestyle images for the proposal slides
 */
function generateImagePrompts(data: ProposalData): ImagePrompt[] {
  const prompts: ImagePrompt[] = []

  // Brand image - lifestyle representation for cover and brand slide
  const brandInfo = data.brandDescription || data.brandName
  if (brandInfo) {
    prompts.push({
      key: 'brandImage',
      prompt: `Create a premium lifestyle photograph for a brand marketing presentation.

Brand: ${data.brandName || 'modern brand'}
Description: ${data.brandDescription?.slice(0, 300) || 'premium lifestyle brand'}

Requirements:
- Style: Editorial, high-end commercial photography
- Mood: Aspirational, clean, confident
- Lighting: Natural, soft, professional
- Composition: Full bleed, suitable as presentation background
- Real people in authentic situations
- Modern, urban, lifestyle context
- NO text, NO logos, NO overlays, NO graphics
- Aspect ratio: 16:9 (widescreen)
- Resolution: 4K quality
- Color palette: Warm, inviting tones`
    })
  }

  // Audience image - target demographic for goals/audience slide
  if (data.targetGender || data.targetAgeRange) {
    const gender = data.targetGender === 'נשים' ? 'women' : 
                   data.targetGender === 'גברים' ? 'men' : 'mixed group of people'
    const age = data.targetAgeRange || '25-40'
    const behavior = data.targetBehavior || 'active lifestyle'
    
    prompts.push({
      key: 'audienceImage',
      prompt: `Create a lifestyle photograph showing the target audience for a marketing campaign.

Target: ${gender}, ages ${age}
Behavior: ${behavior}

Requirements:
- Scene: Real life situation, not posed
- People: Diverse, relatable, aspirational
- Mood: Positive, engaged, connected
- Style: Instagram-worthy, authentic, natural
- Activity: People enjoying life, socializing, or engaged in daily activities
- NO text, NO logos, NO overlays
- Aspect ratio: 16:9 (widescreen)
- Resolution: 4K quality
- Modern, contemporary setting`
    })
  }

  return prompts
}

/**
 * Generate a single image using Gemini 3 Pro Image
 */
async function generateSingleImage(prompt: string): Promise<string | null> {
  try {
    console.log('[Gemini 3 Pro Image] Generating:', prompt.slice(0, 80) + '...')
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }], // Enable Google Search grounding
        responseModalities: ['image', 'text'],
      }
    })

    // Extract image from response
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64 = part.inlineData.data
        const mimeType = part.inlineData.mimeType || 'image/png'
        console.log('[Gemini 3 Pro Image] Got image, mime:', mimeType)
        return `data:${mimeType};base64,${base64}`
      }
    }

    console.log('[Gemini 3 Pro Image] No image in response')
    return null
  } catch (error) {
    console.error('[Gemini 3 Pro Image] Error:', error)
    return null
  }
}

/**
 * Upload image to Supabase Storage
 */
async function uploadImage(
  base64Data: string, 
  documentId: string, 
  imageKey: string
): Promise<string | null> {
  try {
    const supabase = await createClient()
    
    // Extract mime type and data
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/)
    if (!matches) return null
    
    const mimeType = matches[1]
    const data = matches[2]
    const extension = mimeType.split('/')[1] || 'png'
    
    const buffer = Buffer.from(data, 'base64')
    const fileName = `proposal_${documentId}_${imageKey}_${Date.now()}.${extension}`
    
    const { error } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      })
    
    if (error) {
      console.error('[Upload] Error:', error)
      return null
    }
    
    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName)
    
    console.log('[Upload] Success:', fileName)
    return urlData.publicUrl
  } catch (error) {
    console.error('[Upload] Error:', error)
    return null
  }
}

/**
 * Generate all images for a proposal
 */
export async function generateProposalImages(
  data: ProposalData,
  documentId: string
): Promise<GeneratedImages> {
  console.log('[Gemini] Input data:', {
    brandName: data.brandName,
    brandDescription: data.brandDescription?.slice(0, 50),
    targetGender: data.targetGender,
    targetAgeRange: data.targetAgeRange,
  })
  
  const prompts = generateImagePrompts(data)
  const images: GeneratedImages = {}
  
  console.log(`[Gemini] Generating ${prompts.length} images for proposal...`)
  console.log('[Gemini] Image types:', prompts.map(p => p.key))
  
  // Generate images sequentially to avoid rate limits
  for (const { key, prompt } of prompts) {
    try {
      const base64 = await generateSingleImage(prompt)
      if (base64) {
        const url = await uploadImage(base64, documentId, key)
        if (url) {
          images[key] = url
        }
      }
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error(`[Gemini] Failed to generate ${key}:`, error)
    }
  }
  
  console.log('[Gemini] Generated images:', Object.keys(images))
  
  return images
}

/**
 * Generate placeholder background for missing images
 */
export function getPlaceholderBackground(type: string): string {
  const backgrounds: Record<string, string> = {
    brand: '#F9FAFB',
    audience: '#F3F4F6',
    cover: '#EBECEC',
  }
  return backgrounds[type] || '#F5F5F5'
}
