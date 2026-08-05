import { Coins, Zap } from 'lucide-react';
import type { GrowthEarningRule } from '@/shared/api/types';
import { splitGrowthAccountXp } from '@/shared/growthRewardMath';
import { GrowthIconMark, growthColorClasses, growthSolidColorClasses } from './GrowthIcons';

export type GrowthRewardChipModel =
  | {
      kind: 'account';
      key: string;
      accountXp: number;
    }
  | {
      kind: 'progress';
      key: string;
      xpReward: number;
      awards: GrowthEarningRule['skillAwards'];
      weights?: number[];
    }
  | {
      kind: 'coins';
      key: string;
      amount: number;
    }
  | {
      kind: 'item';
      key: string;
      award: GrowthEarningRule['itemAwards'][number];
    };

export function groupedGrowthRewardChips(rule: GrowthEarningRule): GrowthRewardChipModel[] {
  const progressGroups = new Map<number, GrowthEarningRule['skillAwards']>();
  const skillAwards = (Array.isArray(rule.skillAwards) ? rule.skillAwards : [])
    .filter((award) => Number.isFinite(award.xpReward) && award.xpReward > 0)
    .sort((left, right) => left.skillId.localeCompare(right.skillId))
    .slice(0, 3);
  const itemAwards = Array.isArray(rule.itemAwards) ? rule.itemAwards : [];
  const coinReward = Number(rule.coinReward) || 0;
  const accountXp = Math.max(0, Math.trunc(Number(rule.accountXp) || 0));
  const allocations = splitGrowthAccountXp(accountXp, skillAwards);

  skillAwards.forEach((award, index) => {
    const allocation = allocations[index] ?? 0;
    if (allocation <= 0) return;
    const current = progressGroups.get(allocation) ?? [];
    current.push(award);
    progressGroups.set(allocation, current);
  });

  return [
    ...(accountXp > 0 ? [{ kind: 'account' as const, key: 'account-xp', accountXp }] : []),
    ...[...progressGroups.entries()]
      .sort(([leftXp], [rightXp]) => rightXp - leftXp)
      .map(([xpReward, awards]) => ({
        kind: 'progress' as const,
        key: `progress-${xpReward}-${awards.map((award) => award.skillId).join('-')}`,
        xpReward,
        awards,
        weights: awards.map((award) => award.xpReward),
      })),
    ...(coinReward > 0 ? [{ kind: 'coins' as const, key: 'coins', amount: coinReward }] : []),
    ...itemAwards
      .filter((award) => award.quantity > 0)
      .map((award) => ({
        kind: 'item' as const,
        key: `item-${award.itemId}`,
        award,
      })),
  ];
}

export function GrowthRewardChip({ chip }: { chip: GrowthRewardChipModel }) {
  if (chip.kind === 'account') {
    return (
      <span className="itu-reward-chip is-xp" title={`+${chip.accountXp} Account XP`} aria-label={`plus ${chip.accountXp} Account XP`}>
        <Zap />+{chip.accountXp} XP
      </span>
    );
  }

  if (chip.kind === 'coins') {
    return (
      <span className="itu-reward-chip is-coins">
        <Coins />+{chip.amount}
      </span>
    );
  }

  if (chip.kind === 'item') {
    const colorClass = growthColorClasses[chip.award.item.color] ?? growthColorClasses.VIOLET;
    return (
      <span
        className="itu-reward-chip is-item"
        title={`${chip.award.item.name} x${chip.award.quantity}`}
        aria-label={`${chip.award.item.name} x${chip.award.quantity}`}
      >
        <span className={`itu-reward-chip__mark ${colorClass}`}>
          <GrowthIconMark icon={chip.award.item.icon} />
        </span>
        x{chip.award.quantity}
      </span>
    );
  }

  const visibleAwards = chip.awards.slice(0, 4);
  const hiddenCount = chip.awards.length - visibleAwards.length;
  const weightLabel = chip.weights?.length ? `${chip.weights.join('/')}% weight` : '';
  return (
    <span
      className="itu-reward-chip is-xp"
      title={`${chip.awards.map((award) => award.skill.name).join(', ')} +${chip.xpReward} Skill XP${weightLabel ? ` (${weightLabel})` : ''}`}
      aria-label={`${chip.awards.map((award) => award.skill.name).join(', ')} plus ${chip.xpReward} Skill XP${weightLabel ? `, ${weightLabel}` : ''}`}
    >
      <span className="itu-reward-chip__stack">
        {visibleAwards.map((award) => {
          const colorClass = growthSolidColorClasses[award.skill.color] ?? growthSolidColorClasses.TEAL;
          return (
            <span key={award.skillId} className={`itu-reward-chip__mark ${colorClass}`}>
              <GrowthIconMark icon={award.skill.icon} />
            </span>
          );
        })}
      </span>
      {hiddenCount > 0 ? <span>+{hiddenCount}</span> : null}
      <span>+{chip.xpReward}</span>
    </span>
  );
}
