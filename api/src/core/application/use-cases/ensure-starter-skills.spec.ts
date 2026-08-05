import { Prisma } from '@prisma/client';
import { ensureStarterSkills } from './ensure-starter-skills';

describe('ensureStarterSkills attribute routes', () => {
  it('creates the documented primary/secondary starter weights, including Fitness 70/30', async () => {
    const skills: Array<Record<string, unknown>> = [];
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      skills.push(data);
      return data;
    });
    const findMany = jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      return skills.filter((entry) => {
        if (where?.userId && entry.userId !== where.userId) return false;
        if (where?.kind && entry.kind !== where.kind) return false;
        if (where?.archivedAt === null && entry.archivedAt !== undefined) return false;
        return true;
      });
    });
    const storedMappings: Array<Record<string, unknown>> = [];
    const mappings = {
      findMany: jest.fn(async () => storedMappings),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        storedMappings.push(...data);
        return { count: data.length };
      }),
    };
    const tx = {
      growthSkill: { findMany, create },
      growthAttributeMapping: mappings,
    } as unknown as Prisma.TransactionClient;

    await ensureStarterSkills(tx, 'user-1', 'cycle-1');

    const byKey = new Map(skills.map((entry) => [entry.starterKey, entry.id]));
    const created = mappings.createMany.mock.calls[0]?.[0]?.data as Array<{
      skillId: string;
      attributeId: string;
      slot: string;
      weight: number;
    }>;
    expect(created).toHaveLength(10);
    const expectedRoutes: Array<[string, string, number, string, number]> = [
      ['skill-programming', 'attribute-intelligence', 80, 'attribute-creativity', 20],
      ['skill-writing', 'attribute-creativity', 70, 'attribute-charisma', 30],
      ['skill-fitness', 'attribute-strength', 70, 'attribute-resilience', 30],
      ['skill-cooking', 'attribute-dexterity', 70, 'attribute-creativity', 30],
      ['skill-language', 'attribute-intelligence', 70, 'attribute-charisma', 30],
    ];
    for (const [skillKey, primaryKey, primaryWeight, secondaryKey, secondaryWeight] of expectedRoutes) {
      expect(created).toEqual(expect.arrayContaining([
        expect.objectContaining({ skillId: byKey.get(skillKey), attributeId: byKey.get(primaryKey), slot: 'PRIMARY', weight: primaryWeight }),
        expect.objectContaining({ skillId: byKey.get(skillKey), attributeId: byKey.get(secondaryKey), slot: 'SECONDARY', weight: secondaryWeight }),
      ]));
    }

    // A user may intentionally keep only the primary route. Re-running the
    // starter seeding helper must not resurrect an optional secondary route.
    const programmingId = byKey.get('skill-programming');
    storedMappings.splice(
      0,
      storedMappings.length,
      ...storedMappings.filter((mapping) => !(mapping.skillId === programmingId && mapping.slot === 'SECONDARY')),
    );
    mappings.createMany.mockClear();
    await ensureStarterSkills(tx, 'user-1', 'cycle-1');
    expect(mappings.createMany).not.toHaveBeenCalled();
  });
});
