'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AutoProposalChat } from '@/components/chat/auto-proposal-chat'
import type { BrandResearch } from '@/lib/gemini/brand-research'
import type { BrandColors } from '@/lib/gemini/color-extractor'
import type { ProposalContent } from '@/lib/openai/proposal-writer'
import type { InfluencerStrategy } from '@/lib/gemini/influencer-research'

/**
 * Deep stringify any value to a string or string array
 * Handles nested objects and arrays properly - never returns [object Object]
 */
function deepStringify(value: unknown): string | string[] {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  
  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'object' && v !== null) {
        // Object inside array - convert to structured text
        return Object.entries(v)
          .filter(([, val]) => val !== null && val !== undefined && val !== '')
          .map(([k, val]) => {
            const strVal = deepStringify(val)
            return `${k}: ${Array.isArray(strVal) ? strVal.join(', ') : strVal}`
          })
          .join(', ')
      }
      const result = deepStringify(v)
      return Array.isArray(result) ? result.join(', ') : result
    })
  }
  
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => {
        const strVal = deepStringify(v)
        return `${k}: ${Array.isArray(strVal) ? strVal.join(', ') : strVal}`
      })
      .join('; ')
  }
  
  return String(value)
}

/**
 * Safely stringify for display (never returns [object Object])
 */
function safeStringify(value: unknown): string {
  const result = deepStringify(value)
  return Array.isArray(result) ? result.join(', ') : result
}

/**
 * Convert an array of objects to an array of strings
 */
function objectArrayToStrings<T extends Record<string, unknown>>(
  arr: T[] | undefined,
  formatter: (item: T) => string
): string[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.map(item => {
    if (typeof item === 'string') return item
    return formatter(item)
  })
}

// Scraped influencer type
interface ScrapedInfluencerData {
  name?: string
  username?: string
  profileUrl?: string
  profilePicUrl?: string
  followers?: number
  engagementRate?: number
  avgLikes?: number
  avgComments?: number
  bio?: string
  categories?: string[]
  isVerified?: boolean
}

// Extended ProposalContent with additional fields from API
interface ExtendedProposalContent extends ProposalContent {
  _influencerResearch?: InfluencerStrategy
  _scrapedInfluencers?: ScrapedInfluencerData[]
  _images?: {
    coverImage?: string
    brandImage?: string
    audienceImage?: string
    watermark?: string
    pattern?: string
    'hero-background'?: string
  }
  _brandAssets?: {
    analysis?: {
      colors?: { primary?: string; secondary?: string; accent?: string }
      style?: { type?: string; keywords?: string[] }
    }
    designTypes?: string[]
  }
}

// Extended BrandResearch with scraped assets
interface ExtendedBrandResearch extends BrandResearch {
  _scrapedAssets?: {
    logoUrl?: string
    screenshot?: string
    heroImages?: string[]
    productImages?: string[]
    lifestyleImages?: string[]
  }
}

interface ProposalData {
  brandResearch: ExtendedBrandResearch
  brandColors: BrandColors
  proposalContent: ExtendedProposalContent
  userInputs: {
    brandName: string
    websiteUrl: string
    budget: number
    currency: string
    goals: string[]
  }
}

export default function CreateAutoPage() {
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleComplete(data: ProposalData) {
    console.log('Auto proposal data collected:', data)
    setIsGenerating(true)
    
    // Get primary audience data
    const primaryAudience = data.brandResearch.targetDemographics?.primaryAudience
    const targetContent = data.proposalContent.targetAudience
    
    try {
      // Convert to document format - RICH content with proper defaults
      const documentData = {
        // Meta
        brandName: data.userInputs.brandName || 'מותג',
        issueDate: new Date().toISOString().split('T')[0],
        campaignName: data.proposalContent.campaignName || `קמפיין ${data.userInputs.brandName}`,
        campaignSubtitle: data.proposalContent.campaignSubtitle || 'קמפיין משפיענים',
        
        // Goals - Keep as objects for template with defaults
        goals: objectArrayToStrings(
          data.proposalContent.goals,
          (g) => g.title || ''
        ),
        // Keep as objects for template - NOT converted to strings
        goalsDetailed: (data.proposalContent.goals || []).map(g => ({
          title: g.title || '',
          description: g.description || '',
        })),
        
        // Target Audience - Enhanced with defaults
        targetGender: targetContent?.primary?.gender || primaryAudience?.gender || 'נשים וגברים',
        targetAgeRange: targetContent?.primary?.ageRange || primaryAudience?.ageRange || '25-45',
        targetDescription: targetContent?.primary?.description || primaryAudience?.lifestyle || 'קהל יעד המתעניין במותג',
        targetBehavior: targetContent?.behavior || data.brandResearch.targetDemographics?.behavior || 'צרכנים פעילים ברשתות החברתיות',
        targetInsights: targetContent?.insights || ['מושפעים מתוכן אותנטי', 'מחפשים המלצות אמיתיות'],
        targetSecondary: targetContent?.secondary,
        
        // Brand - Rich description with defaults
        brandDescription: data.proposalContent.brandDescription || data.brandResearch.companyDescription || `${data.userInputs.brandName} הוא מותג פעיל בישראל.`,
        brandHighlights: data.proposalContent.brandHighlights || data.brandResearch.uniqueSellingPoints || [],
        brandOpportunity: data.proposalContent.brandOpportunity || 'שיווק משפיענים יאפשר למותג להגיע לקהלים חדשים',
        brandValues: data.brandResearch.brandValues || [],
        brandPersonality: data.brandResearch.brandPersonality || [],
        
        // Activity - Keep objects for template with defaults
        activityTitle: data.proposalContent.activityTitle || 'פעילות משפיענים',
        activityConcept: data.proposalContent.activityConcept || 'שיתוף פעולה עם משפיענים להגברת המודעות למותג',
        activityDescription: data.proposalContent.activityDescription || 'משפיענים יציגו את המותג בסיטואציות אותנטיות',
        // Keep as objects for template - NOT converted to strings
        activityApproach: (data.proposalContent.activityApproach || []).map(a => ({
          title: a.title || '',
          description: a.description || '',
        })),
        activityDifferentiator: data.proposalContent.activityDifferentiator || 'דגש על אותנטיות ותוכן איכותי',
        
        // Deliverables - Keep as objects for template with defaults
        deliverables: objectArrayToStrings(
          data.proposalContent.deliverables || [{ type: 'רילים', quantity: 4 }, { type: 'סטוריז', quantity: 12 }],
          (d) => `${d.quantity || 0} ${d.type || ''}`
        ),
        // Keep original objects for template - NOT converted to strings
        deliverablesDetailed: (data.proposalContent.deliverables || []).map(d => ({
          type: d.type || '',
          quantity: d.quantity || 0,
          description: d.description || '',
          purpose: d.purpose || '',
        })),
        deliverablesSummary: data.proposalContent.deliverablesSummary || 'חבילה מאוזנת של תוכן',
        
        // Metrics with defaults
        budget: data.proposalContent.metrics?.budget || data.userInputs.budget || 0,
        currency: data.proposalContent.metrics?.currency || data.userInputs.currency || '₪',
        potentialReach: data.proposalContent.metrics?.potentialReach || 0,
        potentialEngagement: data.proposalContent.metrics?.potentialEngagement || 0,
        cpe: data.proposalContent.metrics?.cpe || 2.5,
        cpm: data.proposalContent.metrics?.cpm || 15,
        estimatedImpressions: data.proposalContent.metrics?.estimatedImpressions || 0,
        metricsExplanation: data.proposalContent.metricsExplanation || 'המספרים מבוססים על ביצועים ממוצעים בתעשייה',
        
        // Influencer Strategy with defaults
        influencerStrategy: data.proposalContent.influencerStrategy || 'בחירת משפיענים רלוונטיים לקהל היעד',
        influencerCriteria: data.proposalContent.influencerCriteria || ['התאמה לקהל', 'איכות תוכן', 'אותנטיות'],
        contentGuidelines: data.proposalContent.contentGuidelines || ['תוכן טבעי', 'שיתוף חוויה אישית'],
        
        // Influencer Research from AI - keep as object for template
        influencerResearch: data.proposalContent._influencerResearch || null,
        
        // Real scraped influencers
        scrapedInfluencers: data.proposalContent._scrapedInfluencers || [],
        
        // Convert scraped influencers to influencerData format for template
        influencerData: (data.proposalContent._scrapedInfluencers || []).slice(0, 6).map((inf: ScrapedInfluencerData) => ({
          name: inf.name || inf.username || 'משפיען',
          imageUrl: inf.profilePicUrl || '',
          followers: inf.followers || 0,
          avgLikes: inf.avgLikes || 0,
          avgComments: inf.avgComments || 0,
          engagementRate: inf.engagementRate || 0,
        })),
        
        // Closing with defaults - limit text length
        closingHeadline: (data.proposalContent.closingStatement || "LET'S GET STARTED").slice(0, 50),
        // Limit nextSteps to 5 items with max 60 chars each
        nextSteps: (data.proposalContent.nextSteps || ['אישור הצעה', 'בחירת משפיענים', 'תחילת עבודה'])
          .slice(0, 5)
          .map(s => s.slice(0, 60)),
        
        // Generated images - only keep URLs, not base64 data (to avoid payload size issues)
        _generatedImages: data.proposalContent._images ? {
          coverImage: data.proposalContent._images.coverImage?.startsWith('http') ? data.proposalContent._images.coverImage : undefined,
          brandImage: data.proposalContent._images.brandImage?.startsWith('http') ? data.proposalContent._images.brandImage : undefined,
          audienceImage: data.proposalContent._images.audienceImage?.startsWith('http') ? data.proposalContent._images.audienceImage : undefined,
        } : null,
        
        // Brand assets analysis (without images)
        _brandAssetsAnalysis: data.proposalContent._brandAssets ? {
          analysis: data.proposalContent._brandAssets.analysis,
          designTypes: data.proposalContent._brandAssets.designTypes,
        } : null,
        
        // Scraped assets - only URLs, not base64 (to avoid payload size issues)
        _scraped: {
          logoUrl: data.brandResearch._scrapedAssets?.logoUrl?.startsWith('http') ? data.brandResearch._scrapedAssets.logoUrl : undefined,
          // Skip screenshot and large image arrays to reduce payload
        },
        
        // Brand colors only (small data)
        _brandColors: data.brandColors,
        // Skip full brandResearch and proposalContent to reduce payload size
      }

      // Save document to database
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote',
          title: `הצעת מחיר - ${data.userInputs.brandName}`,
          data: documentData,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create document')
      }

      const result = await response.json()
      
      // Redirect to preview
      router.push(`/preview/${result.id}`)
    } catch (error) {
      console.error('Error creating document:', error)
      alert('שגיאה ביצירת המסמך')
      setIsGenerating(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              יצירת הצעת מחיר אוטומטית
            </h1>
            <p className="text-sm text-gray-500">
              מחקר מותג + יצירת תוכן מותאם באמצעות AI
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            ביטול
          </button>
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-hidden p-6">
        <div className="max-w-2xl mx-auto h-full">
          {isGenerating ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">יוצר את ההצעה...</p>
              </div>
            </div>
          ) : (
            <AutoProposalChat onComplete={handleComplete} />
          )}
        </div>
      </main>
    </div>
  )
}

