import type { GrowthOnboardingState, GrowthProgressKind } from '@/shared/api/types';

/* ─── Growth Progress Kind ─── */
export const GROWTH_KIND = {
  ATTRIBUTE: 'ATTRIBUTE',
  SKILL: 'SKILL',
} as const satisfies Record<string, GrowthProgressKind>;

export type GrowthKindValue = (typeof GROWTH_KIND)[keyof typeof GROWTH_KIND];

/* ─── Onboarding State ─── */
export const ONBOARDING_STATE = {
  NOT_STARTED: 'NOT_STARTED',
  SKILLS_OFFERED: 'SKILLS_OFFERED',
  COMPLETED: 'COMPLETED',
} as const satisfies Record<string, GrowthOnboardingState>;

export type OnboardingStateValue = (typeof ONBOARDING_STATE)[keyof typeof ONBOARDING_STATE];
