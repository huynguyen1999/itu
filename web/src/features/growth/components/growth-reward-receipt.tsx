import { useEffect } from 'react';
import { ArrowRight, CheckCheck, Coins, Gift, TrendingUp, X, Zap } from 'lucide-react';
import type { GrowthAwardReceipt } from '@/shared/api/types';
import { useSync } from '@/shared/sync/SyncProvider';
import { Button } from '@/shared/ui/button';
import { GrowthIconMark, growthColorClasses } from '@/shared/ui/GrowthIcons';

const SINGLE_RECEIPT_VISIBLE_MS = 2800;
const BATCH_RECEIPT_IDLE_MS = 2500;

type ReceiptXpKind = 'SKILL' | 'ATTRIBUTE' | 'DERIVED_ATTRIBUTE';

export function growthReceiptXpKind(award: GrowthAwardReceipt['progressAwards'][number]): ReceiptXpKind {
  if (
    award.awardType === 'ATTRIBUTE' &&
    (typeof award.derivedFromSkillId === 'string' || (award.mappingSnapshot?.length ?? 0) > 0)
  ) {
    return 'DERIVED_ATTRIBUTE';
  }
  if (award.awardType === 'ATTRIBUTE' || (!award.awardType && award.kind === 'ATTRIBUTE')) return 'ATTRIBUTE';
  return 'SKILL';
}

export function growthReceiptXpLabel(kind: ReceiptXpKind) {
  return kind === 'DERIVED_ATTRIBUTE' ? 'Derived Attribute XP' : kind === 'ATTRIBUTE' ? 'Attribute XP' : 'Skill XP';
}

export function GrowthRewardReceiptHost() {
  const { growthReceipts, dismissGrowthReceipt, dismissAllGrowthReceipts } = useSync();
  const receipt = growthReceipts[0];
  if (!receipt) return null;

  if (growthReceipts.length > 1) {
    return <GrowthRewardBatchReceipt receipts={growthReceipts} onDismiss={dismissAllGrowthReceipts} />;
  }

  return (
    <GrowthRewardReceipt receipt={receipt} current={1} total={growthReceipts.length} onDismiss={dismissGrowthReceipt} />
  );
}

export function GrowthRewardReceipt({
  receipt,
  current,
  total,
  onDismiss,
}: {
  receipt: GrowthAwardReceipt;
  current: number;
  total: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, SINGLE_RECEIPT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, receipt.sourceId]);

  const reverted = Boolean(receipt.reverted);
  const amountPrefix = reverted ? '-' : '+';
  const skillXp = receipt.progressAwards
    .filter((award) => growthReceiptXpKind(award) === 'SKILL')
    .reduce((sum, award) => sum + award.xpGained, 0);
  const attributeXp = receipt.progressAwards
    .filter((award) => growthReceiptXpKind(award) === 'ATTRIBUTE')
    .reduce((sum, award) => sum + award.xpGained, 0);
  const derivedAttributeXp = receipt.progressAwards
    .filter((award) => growthReceiptXpKind(award) === 'DERIVED_ATTRIBUTE')
    .reduce((sum, award) => sum + award.xpGained, 0);
  const accountXp = receipt.accountAward?.amount ?? 0;

  return (
    <div
      className={`fixed bottom-5 left-5 z-50 w-[min(calc(100vw-2.5rem),340px)] overflow-hidden rounded-xl border bg-background shadow-2xl shadow-slate-950/12 ${
        reverted ? 'border-rose-300/50' : 'border-teal-300/50'
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`border-b border-border/60 px-4 py-3 ${
          reverted
            ? 'bg-gradient-to-r from-rose-500/12 via-amber-500/10 to-slate-400/12'
            : 'bg-gradient-to-r from-teal-500/12 via-violet-500/10 to-amber-400/12'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background/80 shadow-sm ${
                reverted ? 'border-rose-300/60 text-rose-700' : 'border-teal-300/60 text-teal-700'
              }`}
            >
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black tracking-tight">{reverted ? 'Growth reverted' : 'Growth earned'}</p>
              <p className="truncate text-xs text-muted-foreground">{receipt.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1 text-muted-foreground hover:bg-background/70 hover:text-foreground"
            aria-label="Dismiss growth reward"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {accountXp > 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-teal-300/50 bg-teal-500/10 px-3 text-xs font-black text-teal-800 dark:text-teal-200">
              <Zap className="h-3.5 w-3.5" /> {amountPrefix}
              {accountXp} Account XP
            </span>
          ) : null}
          {skillXp > 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-teal-300/50 bg-teal-500/10 px-3 text-xs font-black text-teal-800 dark:text-teal-200">
              <Zap className="h-3.5 w-3.5" /> {amountPrefix}
              {skillXp} Skill XP
            </span>
          ) : null}
          {attributeXp > 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-500/10 px-3 text-xs font-black text-violet-800 dark:text-violet-200">
              <TrendingUp className="h-3.5 w-3.5" /> {amountPrefix}
              {attributeXp} Attribute XP
            </span>
          ) : null}
          {derivedAttributeXp > 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-500/10 px-3 text-xs font-black text-violet-800 dark:text-violet-200">
              <TrendingUp className="h-3.5 w-3.5" /> {amountPrefix}
              {derivedAttributeXp} Derived Attribute XP
            </span>
          ) : null}
          {receipt.coinAward ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-400/10 px-3 text-xs font-black text-amber-800 dark:text-amber-200">
              <Coins className="h-3.5 w-3.5" /> {amountPrefix}
              {receipt.coinAward.amount} Coins
            </span>
          ) : null}
          {receipt.itemAwards.map((award) => (
            <span
              key={award.itemId}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-500/10 px-3 text-xs font-black text-violet-800 dark:text-violet-200"
            >
              <Gift className="h-3.5 w-3.5" /> {amountPrefix}
              {award.quantity} {award.name || 'Items'}
            </span>
          ))}
        </div>

        {receipt.progressAwards.length ? (
          <div className="grid gap-2">
            {receipt.progressAwards.slice(0, 2).map((award) => {
              const progress = Math.min(100, Math.max(0, (award.afterXp / Math.max(1, award.nextLevelXp)) * 100));
              const levelUp = award.afterLevel > award.beforeLevel;
              const colorClass = growthColorClasses[award.color] ?? growthColorClasses.TEAL;
              return (
                <div key={award.progressId} className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ${colorClass}`}
                    >
                      <GrowthIconMark icon={award.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold">{award.name}</span>
                        <span
                          className={`shrink-0 text-xs font-black ${
                            reverted ? 'text-rose-700 dark:text-rose-300' : 'text-teal-700 dark:text-teal-300'
                          }`}
                        >
                          {amountPrefix}
                          {award.xpGained} {growthReceiptXpLabel(growthReceiptXpKind(award))}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-teal-500" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                  {levelUp && !reverted ? (
                    <p className="pl-9 text-xs font-bold text-amber-700 dark:text-amber-300">
                      Level up: {award.beforeLevel} <ArrowRight className="inline h-3 w-3" /> {award.afterLevel}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {receipt.progressAwards.length > 2 ? (
              <p className="text-xs font-semibold text-muted-foreground">
                +{receipt.progressAwards.length - 2} more progress awards
              </p>
            ) : null}
          </div>
        ) : null}

        {total > 1 ? (
          <Button variant="outline" size="sm" className="h-8 w-full rounded-xl" onClick={onDismiss}>
            Next reward ({current}/{total})
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function GrowthRewardBatchReceipt({ receipts, onDismiss }: { receipts: GrowthAwardReceipt[]; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, BATCH_RECEIPT_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, receipts.length]);

  const totals = summarizeReceipts(receipts);
  const hasReverted = receipts.some((receipt) => receipt.reverted);
  const heading = batchHeading(totals);

  return (
    <div
      className={`fixed bottom-5 left-5 z-50 w-[min(calc(100vw-2.5rem),340px)] overflow-hidden rounded-xl border bg-background shadow-2xl shadow-slate-950/12 animate-in slide-in-from-bottom-3 fade-in duration-200 ${
        hasReverted ? 'border-rose-300/50' : 'border-teal-300/50'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm ${
              hasReverted
                ? 'border-rose-300/60 bg-rose-500/10 text-rose-700'
                : 'border-teal-300/60 bg-teal-500/10 text-teal-700'
            }`}
          >
            <CheckCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black tracking-tight">{heading}</p>
            <p className="truncate text-xs text-muted-foreground">{batchSubheading(totals)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Dismiss growth rewards"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 border-t border-border/60 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {totals.totalAccountXp !== 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-teal-300/50 bg-teal-500/10 px-3 text-xs font-black text-teal-800 dark:text-teal-200">
              <Zap className="h-3.5 w-3.5" /> {signedAmount(totals.totalAccountXp)} Account XP
            </span>
          ) : null}
          {totals.totalSkillXp !== 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-teal-300/50 bg-teal-500/10 px-3 text-xs font-black text-teal-800 dark:text-teal-200">
              <Zap className="h-3.5 w-3.5" /> {signedAmount(totals.totalSkillXp)} Skill XP
            </span>
          ) : null}
          {totals.totalDirectAttributeXp !== 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-500/10 px-3 text-xs font-black text-violet-800 dark:text-violet-200">
              <TrendingUp className="h-3.5 w-3.5" /> {signedAmount(totals.totalDirectAttributeXp)} Attribute XP
            </span>
          ) : null}
          {totals.totalAttributeXp !== 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-500/10 px-3 text-xs font-black text-violet-800 dark:text-violet-200">
              <TrendingUp className="h-3.5 w-3.5" /> {signedAmount(totals.totalAttributeXp)} Derived Attribute XP
            </span>
          ) : null}
          {totals.totalCoins !== 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-400/10 px-3 text-xs font-black text-amber-800 dark:text-amber-200">
              <Coins className="h-3.5 w-3.5" /> {signedAmount(totals.totalCoins)} Coins
            </span>
          ) : null}
          {totals.totalItems !== 0 ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-500/10 px-3 text-xs font-black text-violet-800 dark:text-violet-200">
              <Gift className="h-3.5 w-3.5" /> {signedAmount(totals.totalItems)} Items
            </span>
          ) : null}
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            key={receipts.length}
            className={`h-full rounded-full ${
              hasReverted ? 'bg-rose-500' : 'bg-teal-500'
            } motion-safe:animate-[growth-receipt-timeout_2500ms_linear_forwards]`}
          />
        </div>
      </div>
    </div>
  );
}

function summarizeReceipts(receipts: GrowthAwardReceipt[]) {
  const earnedCount = receipts.filter((receipt) => !receipt.reverted).length;
  const revertedCount = receipts.length - earnedCount;
  const totalAccountXp = receipts.reduce(
    (sum, receipt) => sum + receiptSign(receipt) * (receipt.accountAward?.amount ?? 0),
    0,
  );
  const totalSkillXp = receipts.reduce(
    (sum, receipt) =>
      sum +
      receiptSign(receipt) *
        receipt.progressAwards
          .filter((award) => growthReceiptXpKind(award) === 'SKILL')
          .reduce((awardSum, award) => awardSum + award.xpGained, 0),
    0,
  );
  const totalAttributeXp = receipts.reduce(
    (sum, receipt) =>
      sum +
      receiptSign(receipt) *
        receipt.progressAwards
          .filter((award) => growthReceiptXpKind(award) === 'DERIVED_ATTRIBUTE')
          .reduce((awardSum, award) => awardSum + award.xpGained, 0),
    0,
  );
  const totalCoins = receipts.reduce(
    (sum, receipt) => sum + receiptSign(receipt) * (receipt.coinAward?.amount ?? 0),
    0,
  );
  const totalItems = receipts.reduce(
    (sum, receipt) =>
      sum + receiptSign(receipt) * receipt.itemAwards.reduce((awardSum, award) => awardSum + award.quantity, 0),
    0,
  );
  const titles = receipts.slice(0, 2).map((receipt) => receipt.title);
  const exampleTitles = receipts.length > 2 ? `${titles.join(', ')} +${receipts.length - 2} more` : titles.join(', ');
  const totalDirectAttributeXp = receipts.reduce(
    (sum, receipt) =>
      sum +
      receiptSign(receipt) *
        receipt.progressAwards
          .filter((award) => growthReceiptXpKind(award) === 'ATTRIBUTE')
          .reduce((awardSum, award) => awardSum + award.xpGained, 0),
    0,
  );
  return {
    earnedCount,
    revertedCount,
    totalAccountXp,
    totalSkillXp,
    totalAttributeXp,
    totalDirectAttributeXp,
    totalCoins,
    totalItems,
    exampleTitles,
  };
}

function batchHeading(totals: ReturnType<typeof summarizeReceipts>) {
  if (totals.earnedCount > 0 && totals.revertedCount > 0)
    return `${totals.earnedCount} earned, ${totals.revertedCount} reverted`;
  if (totals.revertedCount > 0) return `${totals.revertedCount} growth reverted`;
  return `${totals.earnedCount} rewards earned`;
}

function batchSubheading(totals: ReturnType<typeof summarizeReceipts>) {
  if (totals.exampleTitles) return totals.exampleTitles;
  return 'Growth totals updated';
}

function receiptSign(receipt: GrowthAwardReceipt) {
  return receipt.reverted ? -1 : 1;
}

function signedAmount(amount: number) {
  return amount > 0 ? `+${amount}` : String(amount);
}
