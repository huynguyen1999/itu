import { describe, expect, it } from 'vitest';
import type { GrowthLedgerEntry } from '@/shared/api/types';
import {
  groupLedgerEntries,
  growthLedgerXpKind,
  growthLedgerXpLabel,
  isDerivedAttributeLedgerEntry,
} from './GrowthPage';

function ledgerEntry(overrides: Partial<GrowthLedgerEntry>): GrowthLedgerEntry {
  return {
    id: 'entry-1',
    currency: 'SKILL_XP',
    skillId: 'skill-1',
    amount: 80,
    kind: 'ACTIVITY_AWARD',
    sourceType: 'TASK',
    sourceId: 'task-1',
    titleSnapshot: 'Complete task',
    createdAt: '2026-08-03T10:00:00.000Z',
    skill: { name: 'Strength', kind: 'SKILL', icon: 'STAR', color: 'TEAL' },
    ...overrides,
  };
}

describe('growth ledger grouping', () => {
  it('keeps derived attribute XP separate from direct skill XP at the same amount', () => {
    const direct = ledgerEntry({ id: 'skill-xp', metadata: { awardType: 'SKILL' } });
    const derived = ledgerEntry({
      id: 'attribute-xp',
      skillId: 'attribute-1',
      metadata: { awardType: 'ATTRIBUTE', derivedFromSkillId: 'skill-1' },
      skill: { name: 'Strength', kind: 'ATTRIBUTE', icon: 'STAR', color: 'TEAL' },
    });

    expect(isDerivedAttributeLedgerEntry(direct)).toBe(false);
    expect(isDerivedAttributeLedgerEntry(derived)).toBe(true);
    expect(growthLedgerXpKind(direct)).toBe('SKILL');
    expect(growthLedgerXpKind(ledgerEntry({ metadata: { awardType: 'ATTRIBUTE' } }))).toBe('ATTRIBUTE');
    expect(growthLedgerXpLabel('ATTRIBUTE')).toBe('Attribute XP');
    expect(growthLedgerXpLabel('DERIVED_ATTRIBUTE')).toBe('Derived Attribute XP');

    const [group] = groupLedgerEntries([direct, derived]);
    expect(group.xpGroups).toHaveLength(2);
    expect(group.xpGroups.map(({ xpKind, entries }) => [xpKind, entries.map(({ id }) => id)])).toEqual([
      ['SKILL', ['skill-xp']],
      ['DERIVED_ATTRIBUTE', ['attribute-xp']],
    ]);
  });
});
