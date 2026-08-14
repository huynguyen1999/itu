import { Coins, Gift, Pencil, Zap } from 'lucide-react';
import type { GrowthShopReward, GrowthSkill } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { GrowthIconMark, growthSolidColorClasses } from '@/shared/ui/GrowthIcons';

export function GrowthRewardSummary({
  selectedEntries,
  selectedItems,
  xp,
  coins,
  accountXp,
  itemQuantities,
  onEdit,
}: {
  selectedEntries: GrowthSkill[];
  selectedItems: GrowthShopReward[];
  xp: Record<string, string>;
  coins: string;
  accountXp: string;
  itemQuantities: Record<string, string>;
  onEdit: () => void;
}) {
  const rewardCount = selectedEntries.length + selectedItems.length + (Number(coins) > 0 ? 1 : 0);
  const xpGroups = Array.from(
    selectedEntries.reduce((groups, entry) => {
      const amount = Number(xp[entry.id]) || 0;
      const current = groups.get(amount) ?? [];
      current.push(entry);
      groups.set(amount, current);
      return groups;
    }, new Map<number, GrowthSkill[]>()),
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
            {rewardCount ? `${rewardCount} reward ${rewardCount === 1 ? 'type' : 'types'} on completion` : 'No Growth rewards'}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="min-h-11 gap-2" onClick={onEdit}>
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
