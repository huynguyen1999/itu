import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Coins, Gift, Pencil, Search, TrendingUp, X, Zap } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthEarningRule, GrowthScalingMode, GrowthSourceType } from '@/shared/api/types';
import { growthSkillWeightsTotal, selectGrowthRewardWeights } from '@/shared/growthRewardMath';
import { isSelectableGrowthEntry } from '@/shared/growthEntryFilters';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/lib/utils';
import { GrowthIconMark, growthSolidColorClasses } from '@/shared/ui/GrowthIcons';

export interface GrowthRewardEditorHandle {
  savePendingChanges: () => Promise<void>;
}

export const GrowthRewardEditor = forwardRef<
  GrowthRewardEditorHandle,
  { sourceType: GrowthSourceType; sourceId: string }
>(function GrowthRewardEditor({ sourceType, sourceId }, ref) {
  const entries = useQuery({ queryKey: ['growth', 'skills'], queryFn: () => api.growthSkills() });
  const items = useQuery({ queryKey: ['growth', 'items'], queryFn: () => api.growthItems() });
  const rules = useQuery({
    queryKey: ['growth', 'rules', sourceType, sourceId],
    queryFn: () => api.growthRules(sourceType, sourceId),
  });
  const rule = rules.data?.[0];
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [coins, setCoins] = useState('0');
  const [accountXp, setAccountXp] = useState('100');
  const [xp, setXp] = useState<Record<string, string>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});
  const [scalingMode, setScalingMode] = useState<GrowthScalingMode>('FIXED');
  const [maxRewardCap, setMaxRewardCap] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const awards = rule?.skillAwards ?? [];
    setCoins(String(rule?.coinReward ?? 0));
    setAccountXp(String(rule?.accountXp ?? 100));
    const loadedWeights = selectGrowthRewardWeights(
      awards.map((award) => ({ skillId: award.skillId, xpReward: award.xpReward })),
    );
    const weights = growthSkillWeightsTotal(loadedWeights) === 100
      ? loadedWeights.map((award) => award.xpReward)
      : defaultGrowthWeights(Math.min(3, loadedWeights.length));
    setXp(Object.fromEntries(loadedWeights.slice(0, 3).map((award, index) => [award.skillId, String(weights[index] ?? 0)])));
    setItemQuantities(
      Object.fromEntries((rule?.itemAwards ?? []).map((award) => [award.itemId, String(award.quantity)])),
    );
    setScalingMode(rule?.scalingMode ?? (sourceType === 'REVIEW_DECK' ? 'LINEAR' : 'FIXED'));
    setMaxRewardCap(rule?.maxRewardCap ? String(rule.maxRewardCap) : '');
  }, [rule, sourceType]);

  const selectedEntries = useMemo(
    () => (entries.data ?? []).filter(isSelectableGrowthEntry).filter((entry) => growthRewardValueIsSelected(xp, entry.id)),
    [entries.data, xp],
  );
  const selectedItems = useMemo(
    () => (items.data ?? []).filter((item) => growthRewardValueIsSelected(itemQuantities, item.id)),
    [itemQuantities, items.data],
  );
  const totalWeight = growthSkillWeightsTotal(
    selectedEntries.map((entry) => ({ skillId: entry.id, xpReward: Number(xp[entry.id]) || 0 })),
  );
  const filteredEntries = (entries.data ?? []).filter(isSelectableGrowthEntry).filter((entry) =>
    `${entry.name} ${entry.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  const draftRule = useMemo(
    () =>
      buildGrowthRuleDraft({
        sourceType,
        sourceId,
        ruleId: rule?.id,
        coins,
        accountXp,
        scalingMode,
        maxRewardCap,
        selectedEntries,
        selectedItems,
        xp,
        itemQuantities,
      }),
    [
      coins,
      accountXp,
      itemQuantities,
      maxRewardCap,
      rule?.id,
      scalingMode,
      selectedEntries,
      selectedItems,
      sourceId,
      sourceType,
      xp,
    ],
  );
  const ruleIsDirty = useMemo(() => {
    if (!editing) return false;
    return JSON.stringify(growthRuleComparable(draftRule.optimistic)) !== JSON.stringify(growthRuleComparable(rule));
  }, [draftRule, editing, rule]);

  const save = useMutation({
    mutationFn: () => api.saveGrowthRule(draftRule.payload, draftRule.optimistic),
    onSuccess: () => {
      setEditing(false);
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      savePendingChanges: async () => {
        if (!ruleIsDirty) return;
        if (selectedEntries.length > 0 && totalWeight !== 100) {
          throw new Error('Skill weights must total 100% before saving growth rewards.');
        }
        await save.mutateAsync();
      },
    }),
    [ruleIsDirty, save, selectedEntries.length, totalWeight],
  );

  const toggleEntry = (entryId: string) => {
    setXp((current) => {
      if (!growthRewardValueIsSelected(current, entryId)) {
        const selectedIds = Object.entries(current)
          .filter(([, value]) => positiveRewardValue(value))
          .map(([id]) => id);
        if (selectedIds.length >= 3) return current;
        if (selectedIds.length === 0) return { [entryId]: '100' };
        const next = { ...current };
        const weights = defaultGrowthWeights(selectedIds.length + 1);
        selectedIds.forEach((id, index) => {
          next[id] = String(weights[index]);
        });
        next[entryId] = String(weights[selectedIds.length]);
        return next;
      }
      const next = { ...current };
      delete next[entryId];
      return next;
    });
  };

  const toggleItem = (itemId: string) => {
    setItemQuantities((current) => {
      if (!growthRewardValueIsSelected(current, itemId)) {
        return { ...current, [itemId]: '1' };
      }
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  };

  // ── Collapsed view ──────────────────────────────────────────────
  if (!editing) {
    const rewardCount = selectedEntries.length + selectedItems.length + (Number(coins) > 0 ? 1 : 0);
    const xpGroups = Array.from(
      selectedEntries.reduce((groups, entry) => {
        const amount = Number(xp[entry.id]) || 0;
        const current = groups.get(amount) ?? [];
        current.push(entry);
        groups.set(amount, current);
        return groups;
      }, new Map<number, typeof selectedEntries>()),
    ).sort(([leftAmount], [rightAmount]) => rightAmount - leftAmount);

    return (
      <section className="rounded-xl border border-violet-300/40 bg-gradient-to-br from-violet-500/7 to-teal-400/7 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-violet-500" />
              <h3 className="text-xs font-bold uppercase tracking-[0.14em]">Growth rewards</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {rewardCount
                ? `${rewardCount} reward ${rewardCount === 1 ? 'type' : 'types'} on completion`
                : 'No Growth rewards'}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => {
              setEditing(true);
              // focus search when opening editor
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
        {rewardCount ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {xpGroups.map(([amount, groupedEntries]) => (
              <span
                key={`${amount}:${groupedEntries.map((entry) => entry.id).join(':')}`}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-teal-300/50 bg-teal-500/10 px-2.5 text-xs font-bold text-teal-800 dark:text-teal-200"
                title={`${groupedEntries.map((entry) => entry.name).join(', ')} +${amount} XP`}
              >
                <span className="inline-flex -space-x-1.5">
                  {groupedEntries.slice(0, 4).map((entry) => {
                    const colorClass = growthSolidColorClasses[entry.color] ?? growthSolidColorClasses.TEAL;
                    return (
                      <span
                        key={entry.id}
                        className={`relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full ring-2 ring-background ${colorClass}`}
                      >
                        <GrowthIconMark icon={entry.icon} className="h-3 w-3" />
                      </span>
                    );
                  })}
                </span>
                {groupedEntries.length > 4 ? <span>+{groupedEntries.length - 4}</span> : null}
                <span>+{amount} XP</span>
              </span>
            ))}
            {Number(coins) > 0 ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-400/10 px-2.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                <Coins className="h-3.5 w-3.5" />+{coins}
              </span>
            ) : null}
            {selectedItems.map((item) => (
              <span
                key={item.id}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-500/10 px-2.5 text-xs font-bold text-violet-800 dark:text-violet-200"
              >
                <GrowthIconMark icon={item.icon} className="h-3.5 w-3.5" />×{itemQuantities[item.id]}
              </span>
            ))}
          </div>
        ) : null}
        {Number(accountXp) > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-teal-300/50 bg-teal-500/10 px-2.5 text-xs font-bold text-teal-800 dark:text-teal-200">
              <Zap className="h-3.5 w-3.5" />+{accountXp} Account XP
            </span>
          </div>
        ) : null}
      </section>
    );
  }

  // ── Editing view ────────────────────────────────────────────────
  const totalSelected = selectedEntries.length + selectedItems.length;
  const hasSearchQuery = search.trim().length > 0;
  const noResults = hasSearchQuery && filteredEntries.length === 0;

  return (
    <section className="flex max-h-[min(70vh,42rem)] min-h-0 flex-col space-y-0 overflow-hidden rounded-xl border border-violet-300/40 bg-gradient-to-br from-violet-500/5 to-teal-400/5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-violet-500" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.14em]">Edit Growth rewards</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose what improves when this task is completed.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sourceType === 'REVIEW_DECK' ? (
            <label className="flex items-center gap-2 text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-violet-500" />
              <select
                value={scalingMode}
                onChange={(event) => setScalingMode(event.target.value as GrowthScalingMode)}
                className="h-9 rounded-lg border bg-background px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="LINEAR">Per reviewed card</option>
                <option value="FIXED">Once per session</option>
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search attributes and skills"
            className="h-10 pl-9"
          />
        </div>

        {/* Fixed Account XP budget and skill allocation weights */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="h-4 w-4 text-teal-600" />
            <span className="flex-1">Account XP budget</span>
            <Input aria-label="Account XP budget" type="number" min="0" value={accountXp} onChange={(event) => setAccountXp(event.target.value)} className="h-9 w-24 text-center" />
          </label>
          <span className={`text-xs font-semibold ${selectedEntries.length > 0 && totalWeight !== 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
            Skill weights: {totalWeight}/100
          </span>
        </div>

        {/* Attribute / Skill cards */}
        {(['ATTRIBUTE', 'SKILL'] as const).map((kind) => {
          const group = filteredEntries.filter((entry) => entry.kind === kind);
          if (!group.length && hasSearchQuery) return null;
          const selectedCount = group.filter((entry) => growthRewardValueIsSelected(xp, entry.id)).length;
          return (
            <div key={kind} className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  {kind === 'ATTRIBUTE' ? 'Attributes' : 'Skills'}
                </h4>
                <span className="text-xs text-muted-foreground">{selectedCount}/3 selected</span>
              </div>
              {group.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No {kind === 'ATTRIBUTE' ? 'attributes' : 'skills'} found.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.map((entry) => {
                    const selected = growthRewardValueIsSelected(xp, entry.id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={!selected && selectedEntries.length >= 3}
                        onClick={() => toggleEntry(entry.id)}
                        className={cn(
                          'group relative flex min-h-[52px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-150',
                          selected
                            ? 'border-violet-400/70 bg-violet-500/8 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.08)]'
                            : 'border-border/60 bg-card hover:border-border hover:bg-accent/30',
                        )}
                      >
                        {/* Checkmark circle */}
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-150',
                            selected
                              ? 'border-violet-500 bg-violet-500 text-white'
                              : 'border-muted-foreground/25 text-transparent group-hover:border-muted-foreground/40',
                          )}
                        >
                          {selected ? '✓' : ''}
                        </span>

                        {/* Icon */}
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-sm">
                          <GrowthIconMark icon={entry.icon} className="h-4 w-4" />
                        </span>

                        {/* Name + Level */}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold leading-tight">{entry.name}</span>
                        </span>

                        {/* Per-entry weight input */}
                        {selected ? (
                          <span onClick={(e) => e.stopPropagation()}>
                            <Input
                              aria-label={`${entry.name} skill weight`}
                              type="number"
                              min="0"
                              max="100"
                              value={xp[entry.id] ?? '0'}
                              onChange={(event) =>
                                setXp((current) => clampWeightValue(current, entry.id, event.target.value))
                              }
                              className="h-8 w-[60px] text-center text-xs"
                            />
                            <span className="ml-1 text-xs text-muted-foreground">%</span>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {noResults && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No matching attributes or skills.</p>
          </div>
        )}
        {selectedEntries.length > 0 && totalWeight !== 100 ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            Skill weights must total 100% before saving.
          </p>
        ) : null}

        {/* Coin reward + scaling cap */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 text-sm">
            <Coins className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="flex-1 font-semibold">Coins</span>
            <Input
              aria-label="Coin reward"
              type="number"
              min="0"
              value={coins}
              onChange={(event) => setCoins(event.target.value)}
              className="h-9 w-20 text-center"
            />
          </label>
          {scalingMode === 'LINEAR' ? (
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 text-sm">
              <span className="flex-1 font-semibold">Maximum reward</span>
              <Input
                aria-label="Max reward cap"
                type="number"
                min="1"
                placeholder="No cap"
                value={maxRewardCap}
                onChange={(event) => setMaxRewardCap(event.target.value)}
                className="h-9 w-20 text-center"
              />
            </label>
          ) : null}
        </div>

        {/* Item rewards */}
        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-violet-500" />
            <p className="text-sm font-bold">Item rewards</p>
          </div>
          {!items.data?.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Create an item in Growth before attaching it to a task.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {items.data.map((item) => {
                const selected = growthRewardValueIsSelected(itemQuantities, item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={cn(
                      'group flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-all duration-150',
                      selected
                        ? 'border-violet-400/70 bg-violet-500/8'
                        : 'border-border/60 bg-card hover:border-border hover:bg-accent/30',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-150',
                        selected
                          ? 'border-violet-500 bg-violet-500 text-white'
                          : 'border-muted-foreground/25 text-transparent group-hover:border-muted-foreground/40',
                      )}
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{item.name}</span>
                    {selected ? (
                      <span onClick={(e) => e.stopPropagation()}>
                        <Input
                          aria-label={`${item.name} quantity`}
                          type="number"
                          min="0"
                          value={itemQuantities[item.id] ?? '0'}
                          onChange={(event) => setRewardValue(setItemQuantities, item.id, event.target.value)}
                          className="h-8 w-14 text-center text-xs"
                        />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="hidden text-xs text-muted-foreground sm:block">
            <strong className="text-foreground">{totalSelected} selected</strong>
            {' · '}
            <span>{accountXp} Account XP · {totalWeight}% skill weights</span>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => save.mutate()} disabled={save.isPending || !ruleIsDirty || (selectedEntries.length > 0 && totalWeight !== 100)}>
              {save.isPending ? 'Saving…' : 'Save rewards'}
            </Button>
          </div>
        </div>
        {save.error instanceof Error ? <p className="pt-2 text-xs text-destructive">{save.error.message}</p> : null}
      </div>
    </section>
  );
});

export function growthAwardsUseSharedXp(awards: Array<{ xpReward: number }>): boolean {
  return awards.length < 2 || awards.every((award) => award.xpReward === awards[0]?.xpReward);
}

export function growthRewardValueIsSelected(values: Record<string, string>, id: string): boolean {
  return positiveRewardValue(values[id]);
}

function positiveRewardValue(value: string | undefined): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function setRewardValue(
  setter: Dispatch<SetStateAction<Record<string, string>>>,
  id: string,
  value: string,
) {
  setter((current) => {
    if (value === '') return { ...current, [id]: value };
    if (positiveRewardValue(value)) return { ...current, [id]: value };
    const next = { ...current };
    delete next[id];
    return next;
  });
}

/**
 * Clamp an entered skill weight so the combined weights never exceed 100.
 * When the typed value would push the total over 100, it falls back to the
 * largest value that keeps the total at 100. Empty/non-positive inputs
 * deselect the entry (same behaviour as `setRewardValue`).
 */
export function clampWeightValue(
  current: Record<string, string>,
  id: string,
  value: string,
): Record<string, string> {
  if (value === '') return { ...current, [id]: value };
  if (!positiveRewardValue(value)) {
    const next = { ...current };
    delete next[id];
    return next;
  }
  const otherTotal = Object.entries(current)
    .filter(([key, v]) => key !== id && positiveRewardValue(v))
    .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
  const maxAllowed = Math.max(0, 100 - otherTotal);
  return { ...current, [id]: String(Math.min(Number(value), maxAllowed)) };
}

export function buildGrowthRuleDraft({
  sourceType,
  sourceId,
  ruleId,
  coins,
  accountXp,
  scalingMode,
  maxRewardCap,
  selectedEntries,
  selectedItems,
  xp,
  itemQuantities,
}: {
  sourceType: GrowthSourceType;
  sourceId: string;
  ruleId?: string;
  coins: string;
  accountXp: string;
  scalingMode: GrowthScalingMode;
  maxRewardCap: string;
  selectedEntries: GrowthEarningRule['skillAwards'][number]['skill'][];
  selectedItems: GrowthEarningRule['itemAwards'][number]['item'][];
  xp: Record<string, string>;
  itemQuantities: Record<string, string>;
}) {
  const skillAwards = selectGrowthRewardWeights(
    selectedEntries.map((entry) => ({
      skillId: entry.id,
      xpReward: Math.max(0, Math.trunc(Number(xp[entry.id]) || 0)),
    })),
  );
  const payload = {
    sourceType,
    sourceId,
    ruleId,
    coinReward: Math.max(0, Math.trunc(Number(coins) || 0)),
    accountXp: Math.max(0, Math.trunc(Number(accountXp) || 0)),
    enabled: true,
    scalingMode,
    maxRewardCap: maxRewardCap ? Math.max(1, Number(maxRewardCap) || 0) : null,
    skillAwards,
    itemAwards: selectedItems
      .map((item) => ({
        itemId: item.id,
        quantity: Math.max(0, Math.trunc(Number(itemQuantities[item.id]) || 0)),
      }))
      .filter((award) => award.quantity > 0),
  };

  const optimistic: GrowthEarningRule = {
    id: ruleId ?? `${sourceType}:${sourceId}`,
    sourceType,
    sourceId,
    coinReward: payload.coinReward,
    accountXp: payload.accountXp,
    enabled: true,
    scalingMode,
    maxRewardCap: payload.maxRewardCap,
    version: 1,
    skillAwards: payload.skillAwards.map((award) => ({
      ...award,
      skill: selectedEntries.find((entry) => entry.id === award.skillId)!,
    })),
    itemAwards: payload.itemAwards.map((award) => ({
      ...award,
      item: selectedItems.find((item) => item.id === award.itemId)!,
    })),
  };

  return { payload, optimistic };
}

function growthRuleComparable(
  rule?: Pick<
    GrowthEarningRule,
    'coinReward' | 'accountXp' | 'enabled' | 'scalingMode' | 'maxRewardCap' | 'skillAwards' | 'itemAwards'
  >,
) {
  return {
    coinReward: rule?.coinReward ?? 0,
    accountXp: rule?.accountXp ?? 100,
    enabled: rule?.enabled ?? true,
    scalingMode: rule?.scalingMode ?? 'FIXED',
    maxRewardCap: rule?.maxRewardCap ?? null,
    skillAwards: [...(rule?.skillAwards ?? [])]
      .map((award) => ({ skillId: award.skillId, xpReward: award.xpReward }))
      .sort((left, right) => left.skillId.localeCompare(right.skillId)),
    itemAwards: [...(rule?.itemAwards ?? [])]
      .map((award) => ({ itemId: award.itemId, quantity: award.quantity }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId)),
  };
}

export function defaultGrowthWeights(count: number): number[] {
  if (count <= 1) return [100];
  if (count === 2) return [70, 30];
  return [60, 25, 15];
}

