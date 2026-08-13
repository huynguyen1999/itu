export type ReviewKind = 'DAILY' | 'WEEKLY';

export interface ReviewPeriod {
  startDate: string;
  endDate: string;
  timezone: string;
  startInclusive: string;
  endExclusive: string;
}

export interface ReviewCoverage {
  [source: string]: {
    available: boolean;
    coveredDays: number;
    expectedDays: number;
  };
}

export interface ReviewEvidence {
  id: string;
  source: string;
  label: string;
}

export interface ReviewComparison {
  current: number;
  previous: number;
  absoluteDelta: number;
  percentDelta: number | null;
  direction: 'UP' | 'DOWN' | 'UNCHANGED' | 'NEW';
}

export interface ReviewContextV1 {
  version: 1;
  reviewKind: ReviewKind;
  period: ReviewPeriod;
  coverage: ReviewCoverage;
  metrics: Record<string, unknown>;
  details: Record<string, unknown>;
  reflections: Record<string, string>;
  previousPeriod?: {
    period: ReviewPeriod;
    metrics: Record<string, unknown>;
    comparison: Record<string, ReviewComparison>;
  };
  evidence: ReviewEvidence[];
}

export interface ReviewInsightsInput {
  context: ReviewContextV1;
  promptVersion: 'review-insights-v1';
}

export type ReviewInsightType =
  | 'WIN'
  | 'IMPROVEMENT'
  | 'FRICTION'
  | 'PATTERN'
  | 'REFLECTION_ALIGNMENT'
  | 'REFLECTION_TENSION';

export interface ReviewInsight {
  type: ReviewInsightType;
  title: string;
  body: string;
  evidenceIds: string[];
  evidence?: ReviewEvidence[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ReviewInsightsResultV1 {
  version: 1;
  headline: string;
  summary: string;
  insights: ReviewInsight[];
  attentionNext: string[];
}
