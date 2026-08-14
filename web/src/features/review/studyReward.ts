import type { GrowthAwardReceipt } from '@/shared/api/types';

const STUDY_ACCOUNT_XP_CAP = 20;

/** Mirrors the server's correctness-neutral study reward rule. */
export function studyAccountXpForReviewedCount(reviewedCount: number) {
  return Math.min(STUDY_ACCOUNT_XP_CAP, Math.floor(Math.max(0, Math.trunc(reviewedCount)) / 2));
}

export function studyCompletionMessage(reviewedCount: number) {
  const count = Math.max(0, Math.trunc(reviewedCount));
  return `${count} card${count === 1 ? '' : 's'} reviewed. Rewards are based on cards reviewed, not accuracy.`;
}

export function studyReceiptAccountXp(receipt: GrowthAwardReceipt | null | undefined) {
  return receipt?.accountAward?.amount ?? 0;
}
