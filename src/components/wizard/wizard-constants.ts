import type { WizardStepId, WizardStepMeta, StepStatus } from '@/types/wizard'

export const WIZARD_STEPS: WizardStepMeta[] = [
  {
    id: 'brief',
    label: 'בריף ורקע',
    labelShort: 'בריף',
    description: 'רקע על המותג והבריף שהתקבל',
    required: true,
    order: 1,
  },
  {
    id: 'research',
    label: 'מחקר מותג',
    labelShort: 'מחקר',
    description: 'מחקר מעמיק על המותג, שוק ומשפיענים',
    required: false,
    order: 2,
  },
  {
    id: 'goals',
    label: 'מטרות',
    labelShort: 'מטרות',
    description: 'מטרות הקמפיין',
    required: true,
    order: 3,
  },
  {
    id: 'target_audience',
    label: 'קהל יעד',
    labelShort: 'קהל',
    description: 'קהלי היעד של הקמפיין',
    required: true,
    order: 4,
  },
  {
    id: 'key_insight',
    label: 'תובנה',
    labelShort: 'תובנה',
    description: 'תובנה מרכזית מבוססת מחקר',
    required: true,
    order: 5,
  },
  {
    id: 'strategy',
    label: 'אסטרטגיה',
    labelShort: 'אסטרטגיה',
    description: 'הגישה האסטרטגית והפעולות',
    required: true,
    order: 6,
  },
  {
    id: 'creative',
    label: 'קריאייטיב',
    labelShort: 'קריאייטיב',
    description: 'כיוון קריאייטיבי ורפרנסים',
    required: false,
    order: 7,
  },
  {
    id: 'deliverables',
    label: 'תוצרים',
    labelShort: 'תוצרים',
    description: 'מסגרת התוצרים והתכנים',
    required: true,
    order: 8,
  },
  {
    id: 'quantities',
    label: 'כמויות',
    labelShort: 'כמויות',
    description: 'סיכום כמויות תוצרים ומשפיענים',
    required: true,
    order: 9,
  },
  {
    id: 'media_targets',
    label: 'יעדי מדיה',
    labelShort: 'יעדים',
    description: 'תקציב, צפיות, מעורבות ו-CPE',
    required: true,
    order: 10,
  },
  {
    id: 'influencers',
    label: 'משפיענים',
    labelShort: 'משפיענים',
    description: 'פרופילי משפיענים מומלצים',
    required: true,
    order: 11,
  },
]

export const WIZARD_STEP_ORDER: WizardStepId[] = WIZARD_STEPS.map((s) => s.id)

export function getStepMeta(id: WizardStepId): WizardStepMeta {
  return WIZARD_STEPS.find((s) => s.id === id)!
}

export function getStepIndex(id: WizardStepId): number {
  return WIZARD_STEP_ORDER.indexOf(id)
}

export function getNextStep(id: WizardStepId): WizardStepId | null {
  const idx = getStepIndex(id)
  return idx < WIZARD_STEP_ORDER.length - 1 ? WIZARD_STEP_ORDER[idx + 1] : null
}

export function getPrevStep(id: WizardStepId): WizardStepId | null {
  const idx = getStepIndex(id)
  return idx > 0 ? WIZARD_STEP_ORDER[idx - 1] : null
}

export function getInitialStatuses(): Record<WizardStepId, StepStatus> {
  const statuses = {} as Record<WizardStepId, StepStatus>
  for (const step of WIZARD_STEP_ORDER) {
    statuses[step] = 'pending'
  }
  return statuses
}
