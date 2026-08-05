import { GrowthProgressKind } from '@prisma/client';
import { STARTER_SKILLS } from './growth-starter-skills';

describe('Growth starter progress entries', () => {
  it('contains the seven default attributes and six default skills with stable unique keys', () => {
    expect(STARTER_SKILLS).toHaveLength(13);
    expect(new Set(STARTER_SKILLS.map((entry) => entry.key)).size).toBe(13);
    expect(
      STARTER_SKILLS.filter((entry) => entry.kind === GrowthProgressKind.ATTRIBUTE).map((entry) => entry.name),
    ).toEqual(['General', 'Intelligence', 'Strength', 'Dexterity', 'Resilience', 'Creativity', 'Charisma']);
    expect(
      STARTER_SKILLS.filter((entry) => entry.kind === GrowthProgressKind.SKILL).map((entry) => entry.name),
    ).toEqual(['Programming', 'Writing', 'Language', 'Art', 'Fitness', 'Cooking']);
  });
});
