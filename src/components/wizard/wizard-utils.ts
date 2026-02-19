import type { WizardStepDataMap, WizardStepId } from '@/types/wizard'
import type { ExtractedBriefData } from '@/types/brief'

/**
 * Convert extracted brief data to wizard step data (pre-populate steps)
 */
export function extractedDataToStepData(
  extracted: ExtractedBriefData
): Partial<WizardStepDataMap> {
  const stepData: Partial<WizardStepDataMap> = {}

  // Brief step
  if (extracted.brand?.name || extracted.brand?.background) {
    stepData.brief = {
      brandName: extracted.brand.name || '',
      brandBrief: extracted.brand.background || '',
      brandPainPoints: extracted.targetAudience?.primary?.painPoints || [],
      brandObjective: extracted.campaignGoals?.[0] || '',
    }
  }

  // Goals step
  if (extracted.campaignGoals?.length) {
    stepData.goals = {
      goals: extracted.campaignGoals.map((g) => ({ title: g, description: '' })),
      customGoals: [],
    }
  }

  // Target audience step
  if (extracted.targetAudience?.primary) {
    const ta = extracted.targetAudience
    stepData.target_audience = {
      targetGender: ta.primary.gender || '',
      targetAgeRange: ta.primary.ageRange || '',
      targetDescription: ta.primary.lifestyle || '',
      targetBehavior: ta.behavior || '',
      targetInsights: ta.primary.interests || [],
      targetSecondary: ta.secondary || undefined,
    }
  }

  // Key insight step
  if (extracted.keyInsight) {
    stepData.key_insight = {
      keyInsight: extracted.keyInsight,
      insightSource: extracted.insightSource || '',
    }
  }

  // Strategy step
  if (extracted.strategyDirection) {
    stepData.strategy = {
      strategyHeadline: extracted.strategyDirection,
      strategyPillars: [],
    }
  }

  // Creative step
  if (extracted.creativeDirection) {
    stepData.creative = {
      activityTitle: '',
      activityConcept: extracted.creativeDirection,
      activityDescription: '',
      activityApproach: [],
      referenceImages: [],
    }
  }

  // Deliverables step
  if (extracted.deliverables?.length) {
    stepData.deliverables = {
      deliverables: extracted.deliverables.map((d) => ({
        type: d.type,
        quantity: d.quantity || 1,
        description: d.description || '',
        purpose: '',
      })),
      referenceImages: [],
    }
  }

  // Media targets step
  if (extracted.budget?.amount) {
    stepData.media_targets = {
      budget: extracted.budget.amount,
      currency: extracted.budget.currency || '₪',
      potentialReach: 0,
      potentialEngagement: 0,
      cpe: 0,
    }
  }

  return stepData
}

/**
 * Convert wizard step data to flat ProposalData for the template
 */
export function wizardDataToProposalData(
  stepData: Partial<WizardStepDataMap>
): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  // Brief
  if (stepData.brief) {
    data.brandName = stepData.brief.brandName
    data.brandBrief = stepData.brief.brandBrief
    data.brandPainPoints = stepData.brief.brandPainPoints
    data.brandObjective = stepData.brief.brandObjective
  }

  // Goals
  if (stepData.goals) {
    data.goalsDetailed = stepData.goals.goals
    data.goals = stepData.goals.goals.map((g) => g.title)
  }

  // Target audience
  if (stepData.target_audience) {
    const ta = stepData.target_audience
    data.targetGender = ta.targetGender
    data.targetAgeRange = ta.targetAgeRange
    data.targetDescription = ta.targetDescription
    data.targetBehavior = ta.targetBehavior
    data.targetInsights = ta.targetInsights
  }

  // Key insight
  if (stepData.key_insight) {
    data.keyInsight = stepData.key_insight.keyInsight
    data.insightSource = stepData.key_insight.insightSource
    data.insightData = stepData.key_insight.insightData
  }

  // Strategy
  if (stepData.strategy) {
    data.strategyHeadline = stepData.strategy.strategyHeadline
    data.strategyDescription = stepData.strategy.strategyDescription
    data.strategyPillars = stepData.strategy.strategyPillars
    data.strategyFlow = stepData.strategy.strategyFlow
  }

  // Creative
  if (stepData.creative) {
    data.activityTitle = stepData.creative.activityTitle
    data.activityConcept = stepData.creative.activityConcept
    data.activityDescription = stepData.creative.activityDescription
    data.activityApproach = stepData.creative.activityApproach
    data.activityDifferentiator = stepData.creative.activityDifferentiator
    data.creativeSlides = [{
      title: stepData.creative.activityTitle,
      description: stepData.creative.activityDescription,
      referenceImages: stepData.creative.referenceImages?.map((r) => r.url),
    }]
  }

  // Deliverables
  if (stepData.deliverables) {
    data.deliverablesDetailed = stepData.deliverables.deliverables
    data.deliverables = stepData.deliverables.deliverables.map((d) => d.type)
    data.deliverablesSummary = stepData.deliverables.deliverablesSummary
  }

  // Quantities
  if (stepData.quantities) {
    data.quantitiesSummary = stepData.quantities
  }

  // Media targets
  if (stepData.media_targets) {
    const mt = stepData.media_targets
    data.budget = mt.budget
    data.currency = mt.currency
    data.potentialReach = mt.potentialReach
    data.potentialEngagement = mt.potentialEngagement
    data.cpe = mt.cpe
    data.cpm = mt.cpm
    data.estimatedImpressions = mt.estimatedImpressions
    data.metricsExplanation = mt.metricsExplanation
  }

  // Influencers
  if (stepData.influencers) {
    data.enhancedInfluencers = stepData.influencers.influencers
    data.influencerStrategy = stepData.influencers.influencerStrategy
    data.influencerCriteria = stepData.influencers.influencerCriteria
    data.influencerNote = stepData.influencers.influencerNote
  }

  return data
}

/**
 * Validate step data - returns errors or null
 */
export function validateStep(
  stepId: WizardStepId,
  data: unknown
): Record<string, string> | null {
  const d = data as Record<string, unknown>
  if (!d) return { _form: 'נדרש למלא נתונים' }

  const errors: Record<string, string> = {}

  switch (stepId) {
    case 'brief':
      if (!d.brandName) errors.brandName = 'שם המותג נדרש'
      if (!d.brandBrief) errors.brandBrief = 'רקע על המותג נדרש'
      break
    case 'goals':
      if (!d.goals || !(d.goals as unknown[]).length) errors.goals = 'נדרשת לפחות מטרה אחת'
      break
    case 'target_audience':
      if (!d.targetGender) errors.targetGender = 'נדרש מגדר קהל יעד'
      if (!d.targetAgeRange) errors.targetAgeRange = 'נדרש טווח גילאים'
      break
    case 'key_insight':
      if (!d.keyInsight) errors.keyInsight = 'נדרשת תובנה'
      break
    case 'strategy':
      if (!d.strategyHeadline) errors.strategyHeadline = 'נדרשת כותרת אסטרטגיה'
      break
    case 'deliverables':
      if (!d.deliverables || !(d.deliverables as unknown[]).length)
        errors.deliverables = 'נדרש לפחות תוצר אחד'
      break
    case 'quantities':
      if (!d.influencerCount) errors.influencerCount = 'נדרש מספר משפיענים'
      break
    case 'media_targets':
      if (!d.budget) errors.budget = 'נדרש תקציב'
      break
    case 'influencers':
      // Influencers can be empty at this stage
      break
    case 'creative':
      // Creative is optional - always valid
      return null
  }

  return Object.keys(errors).length > 0 ? errors : null
}
