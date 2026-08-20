import { commitmentFeatureEnabled } from '@core/application/use-cases/habit-commitments';

export function configuredCommitmentFeatureEnabled(): boolean {
  return commitmentFeatureEnabled(process.env.COMMITMENT_FEATURE_ENABLED);
}
