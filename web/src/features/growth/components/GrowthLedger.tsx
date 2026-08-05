import { useState } from 'react';
import { Coins, Zap } from 'lucide-react';
import type { GrowthLedgerEntry, GrowthOverview } from '@/shared/api/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { GrowthIconMark, growthSolidColorClasses } from '@/shared/ui/GrowthIcons';

export function Ledger({ entries, compact = false }: { entries: GrowthOverview['recentLedger']; compact?: boolean }) {
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [selectedGroup, setSelectedGroup] = useState<LedgerGroup | null>(null);

  const filteredEntries = entries.filter((e) => {
    if (currencyFilter !== 'ALL' && e.currency !== currencyFilter) return false;
    return true;
  });
  const groups = groupLedgerEntries(filteredEntries);

  return (
    <div className={`growth-ledger ${compact ? 'is-compact' : ''}`}>
      {!compact && (
        <div className="flex items-center justify-between border-b border-border/60 p-4 bg-muted/20">
          <h3 className="text-sm font-bold">Transaction History</h3>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setCurrencyFilter('ALL')}
              className={`rounded-lg px-2.5 py-1 font-semibold ${currencyFilter === 'ALL' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
            >
              All
            </button>
            <button
              onClick={() => setCurrencyFilter('SKILL_XP')}
              className={`rounded-lg px-2.5 py-1 font-semibold ${currencyFilter === 'SKILL_XP' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              XP Only
            </button>
            <button
              onClick={() => setCurrencyFilter('ACCOUNT_XP')}
              className={`rounded-lg px-2.5 py-1 font-semibold ${currencyFilter === 'ACCOUNT_XP' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              Account XP
            </button>
            <button
              onClick={() => setCurrencyFilter('COIN')}
              className={`rounded-lg px-2.5 py-1 font-semibold ${currencyFilter === 'COIN' ? 'bg-amber-500 text-white' : 'hover:bg-muted'}`}
            >
              Coins Only
            </button>
          </div>
        </div>
      )}

      {!groups.length && <p className="p-6 text-sm text-muted-foreground">No matching XP or coin entries.</p>}
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          className="growth-ledger__record"
          aria-label={`View ledger details for ${group.title}`}
          onClick={() => setSelectedGroup(group)}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{group.title}</p>
            <p className="text-xs text-muted-foreground">
              {ledgerKindLabel(group.kind)} • {group.sourceType.toLowerCase()}
            </p>
          </div>
          <div className="growth-ledger__rewards">
            {group.xpGroups.map((xpGroup) => (
              <LedgerXpChip
                key={`${group.key}:${xpGroup.amount}:${xpGroup.xpKind}`}
                amount={xpGroup.amount}
                entries={xpGroup.entries}
              />
            ))}
            {group.accountXp !== 0 ? <LedgerAccountXpChip amount={group.accountXp} /> : null}
            {group.totalCoin !== 0 ? <LedgerCoinChip amount={group.totalCoin} /> : null}
          </div>
        </button>
      ))}

      <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-md">
          {selectedGroup ? (
            <>
              <DialogHeader>
                <p className="itu-eyebrow">Ledger record</p>
                <DialogTitle>{selectedGroup.title}</DialogTitle>
                <DialogDescription>
                  {ledgerKindLabel(selectedGroup.kind)} • {selectedGroup.sourceType.toLowerCase()} •{' '}
                  {new Date(selectedGroup.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                {selectedGroup.xpGroups.map((xpGroup) => (
                  <LedgerXpChip
                    key={`${selectedGroup.key}:detail:${xpGroup.amount}:${xpGroup.xpKind}`}
                    amount={xpGroup.amount}
                    entries={xpGroup.entries}
                  />
                ))}
                {selectedGroup.accountXp !== 0 ? <LedgerAccountXpChip amount={selectedGroup.accountXp} /> : null}
                {selectedGroup.totalCoin !== 0 ? <LedgerCoinChip amount={selectedGroup.totalCoin} /> : null}
              </div>

              <div className="overflow-hidden rounded-[var(--itu-radius-m)] border border-border">
                {selectedGroup.entries.map((entry) => {
                  const isCoin = entry.currency === 'COIN';
                  const isAccountXp = entry.currency === 'ACCOUNT_XP';
                  const xpKind = growthLedgerXpKind(entry);
                  const colorClass =
                    growthSolidColorClasses[entry.skill?.color ?? 'TEAL'] ?? growthSolidColorClasses.TEAL;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0"
                    >
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          isCoin ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : colorClass
                        }`}
                      >
                        {isCoin ? (
                          <Coins className="h-4 w-4" />
                        ) : (
                          <GrowthIconMark icon={entry.skill?.icon ?? 'SPARKLES'} className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {entry.skill?.name ?? (isCoin ? 'Coins' : 'Account XP')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isCoin
                            ? 'Coin balance'
                            : isAccountXp
                              ? 'Account progress'
                              : xpKind === 'DERIVED_ATTRIBUTE'
                                ? 'Derived Attribute progress'
                                : xpKind === 'ATTRIBUTE'
                                  ? 'Attribute progress'
                                  : 'Skill progress'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-bold ${
                          entry.amount < 0
                            ? 'text-[var(--itu-coral-600)]'
                            : isCoin
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-[var(--itu-teal-700)] dark:text-[var(--itu-teal-400)]'
                        }`}
                      >
                        {signedAmount(entry.amount)}{' '}
                        {isCoin ? 'coins' : isAccountXp ? 'Account XP' : growthLedgerXpLabel(xpKind)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export type GrowthLedgerXpKind = 'SKILL' | 'ATTRIBUTE' | 'DERIVED_ATTRIBUTE';

export function growthLedgerXpKind(entry: GrowthLedgerEntry): GrowthLedgerXpKind {
  if (entry.currency !== 'SKILL_XP') return 'SKILL';
  const isDerived =
    entry.metadata?.awardType === 'ATTRIBUTE' &&
    (typeof entry.metadata.derivedFromSkillId === 'string' || (entry.metadata.mappingSnapshot?.length ?? 0) > 0);
  if (isDerived) return 'DERIVED_ATTRIBUTE';
  if (entry.metadata?.awardType === 'ATTRIBUTE' || (!entry.metadata?.awardType && entry.skill?.kind === 'ATTRIBUTE')) {
    return 'ATTRIBUTE';
  }
  return 'SKILL';
}

export function isDerivedAttributeLedgerEntry(entry: GrowthLedgerEntry) {
  return growthLedgerXpKind(entry) === 'DERIVED_ATTRIBUTE';
}

export function growthLedgerXpLabel(kind: GrowthLedgerXpKind) {
  return kind === 'DERIVED_ATTRIBUTE' ? 'Derived Attribute XP' : kind === 'ATTRIBUTE' ? 'Attribute XP' : 'Skill XP';
}

function LedgerXpChip({ amount, entries }: { amount: number; entries: GrowthLedgerEntry[] }) {
  const visibleEntries = entries.slice(0, 4);
  const hiddenCount = entries.length - visibleEntries.length;
  const names = entries.map((entry) => entry.skill?.name ?? 'Account').join(', ');
  const xpKind = growthLedgerXpKind(entries[0]);
  const label = growthLedgerXpLabel(xpKind);

  return (
    <span
      className={`growth-ledger-chip is-xp ${amount < 0 ? 'is-negative' : ''}`}
      title={`${names} ${signedAmount(amount)} ${label}`}
      aria-label={`${names} ${amount >= 0 ? 'plus' : 'minus'} ${Math.abs(amount)} ${label}`}
    >
      <span className="inline-flex -space-x-1.5">
        {visibleEntries.map((entry) => {
          const colorClass = growthSolidColorClasses[entry.skill?.color ?? 'TEAL'] ?? growthSolidColorClasses.TEAL;
          return (
            <span
              key={entry.id}
              className={`relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full ring-2 ring-background ${colorClass}`}
            >
              <GrowthIconMark icon={entry.skill?.icon ?? 'SPARKLES'} className="h-3 w-3" />
            </span>
          );
        })}
      </span>
      {hiddenCount > 0 ? <span>+{hiddenCount}</span> : null}
      <span>
        {signedAmount(amount)} {label}
      </span>
    </span>
  );
}

function LedgerCoinChip({ amount }: { amount: number }) {
  return (
    <span
      className={`growth-ledger-chip is-coin ${amount < 0 ? 'is-negative' : ''}`}
      aria-label={`${amount >= 0 ? 'plus' : 'minus'} ${Math.abs(amount)} coins`}
    >
      <Coins className="h-3.5 w-3.5" />
      {signedAmount(amount)}
    </span>
  );
}

function LedgerAccountXpChip({ amount }: { amount: number }) {
  return (
    <span
      className={`growth-ledger-chip is-xp ${amount < 0 ? 'is-negative' : ''}`}
      aria-label={`${amount >= 0 ? 'plus' : 'minus'} ${Math.abs(amount)} Account XP`}
    >
      <Zap className="h-3.5 w-3.5" />
      {signedAmount(amount)} Account XP
    </span>
  );
}

export function groupLedgerEntries(entries: GrowthLedgerEntry[]) {
  const groups = new Map<
    string,
    {
      key: string;
      title: string;
      kind: GrowthLedgerEntry['kind'];
      sourceType: string;
      createdAt: string;
      totalCoin: number;
      accountXp: number;
      xpGroups: Array<{ amount: number; xpKind: GrowthLedgerXpKind; entries: GrowthLedgerEntry[] }>;
      entries: GrowthLedgerEntry[];
    }
  >();

  for (const entry of entries) {
    const key = `${entry.sourceType}:${entry.sourceId}:${entry.kind}:${entry.titleSnapshot}:${entry.createdAt.slice(0, 16)}`;
    const group = groups.get(key) ?? {
      key,
      title: entry.titleSnapshot,
      kind: entry.kind,
      sourceType: entry.sourceType,
      createdAt: entry.createdAt,
      totalCoin: 0,
      accountXp: 0,
      xpGroups: [],
      entries: [],
    };
    if (entry.currency === 'COIN') {
      group.totalCoin += entry.amount;
    } else if (entry.currency === 'ACCOUNT_XP') {
      group.accountXp += entry.amount;
    } else {
      const xpKind = growthLedgerXpKind(entry);
      const xpGroup = group.xpGroups.find(
        (candidate) => candidate.amount === entry.amount && candidate.xpKind === xpKind,
      );
      if (xpGroup) xpGroup.entries.push(entry);
      else group.xpGroups.push({ amount: entry.amount, xpKind, entries: [entry] });
    }
    group.entries.push(entry);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      xpGroups: group.xpGroups.sort((left, right) => right.amount - left.amount),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

type LedgerGroup = ReturnType<typeof groupLedgerEntries>[number];

function signedAmount(value: number) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function ledgerKindLabel(kind: GrowthLedgerEntry['kind']) {
  return kind.replaceAll('_', ' ').toLowerCase();
}
