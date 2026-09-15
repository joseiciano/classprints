export const SUBSCRIPTION_LIMITS = {
  free: {
    arrangementsPerWeek: 2,
    maxResultsPerRun: 1,
    visibilityDays: 30,
    canSaveProfiles: false,
    canExportCsv: false,
  },
  plus: {
    arrangementsPerWeek: 10,
    maxResultsPerRun: 5,
    visibilityDays: null, // Unlimited
    canSaveProfiles: true,
    canExportCsv: true,
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_LIMITS;
