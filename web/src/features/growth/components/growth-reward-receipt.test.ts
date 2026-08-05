import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { growthReceiptXpKind, growthReceiptXpLabel } from './growth-reward-receipt';

const receiptSource = readFileSync(resolve(__dirname, 'growth-reward-receipt.tsx'), 'utf8');

describe('growth receipt accounting labels', () => {
  it('keeps Account XP separate from Skill and derived Attribute XP', () => {
    expect(receiptSource).toContain('Account XP');
    expect(receiptSource).toContain('Skill XP');
    expect(receiptSource).toContain('Derived Attribute XP');
    expect(receiptSource).toContain('Coins');
    expect(receiptSource).toContain('Items');
    expect(receiptSource).toMatch(/awardType === 'ATTRIBUTE'/);
  });

  it('labels direct and derived attribute awards distinctly', () => {
    const base = {
      progressId: 'attribute-1',
      name: 'Strength',
      kind: 'ATTRIBUTE' as const,
      icon: 'STAR',
      color: 'TEAL',
      xpGained: 10,
      beforeXp: 0,
      afterXp: 10,
      beforeLevel: 1,
      afterLevel: 1,
      nextLevelXp: 100,
    };
    expect(growthReceiptXpLabel(growthReceiptXpKind({ ...base, awardType: 'ATTRIBUTE' }))).toBe('Attribute XP');
    expect(
      growthReceiptXpLabel(growthReceiptXpKind({ ...base, awardType: 'ATTRIBUTE', derivedFromSkillId: 'skill-1' })),
    ).toBe('Derived Attribute XP');
  });
});
