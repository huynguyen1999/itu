import { GrowthOnboardingState, GrowthProgressKind } from '@core/domain/enums';
import { createUlid } from '@core/application/ulid';
import type { ApplicationTransactionPort } from '@core/application/ports/out/application-transaction.port';
import {
  STARTER_SKILLS,
  STARTER_SKILL_KEYS,
  STARTER_ATTRIBUTE_MAPPING_ROUTES,
} from './growth-starter-skills';

type Tx = ApplicationTransactionPort;

export async function ensureStarterSkills(
  tx: Tx,
  userId: string,
  cycleId: string,
  options?: { markProfileOnboarding?: { profileId: string } },
): Promise<void> {
  const existing = await tx.growthSkill.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const existingKeys = new Set(existing.map((entry: any) => entry.starterKey).filter(Boolean));
  let sortOrder = existing.reduce((max: number, entry: any) => Math.max(max, entry.sortOrder), -1) + 1;

  const general = existing.filter(
    (entry: any) => entry.kind === GrowthProgressKind.ATTRIBUTE &&
      (entry.starterKey === STARTER_SKILL_KEYS.attributeGeneral || entry.name.toLocaleLowerCase() === 'general'),
  );
  for (const entry of general) {
    if (!entry.archivedAt) await tx.growthSkill.update({ where: { id: entry.id }, data: { archivedAt: new Date() } });
  }

  for (const starter of STARTER_SKILLS) {
    if (existingKeys.has(starter.key)) continue;

    // Migrate legacy 'creativity' key to 'attribute-creativity'
    if (starter.key === STARTER_SKILL_KEYS.attributeCreativity) {
      const legacy = existing.find((entry: any) => entry.starterKey === STARTER_SKILL_KEYS.legacyCreativity);
      if (legacy) {
        await tx.growthSkill.update({
          where: { id: legacy.id },
          data: { kind: GrowthProgressKind.ATTRIBUTE, starterKey: starter.key },
        });
        existingKeys.add(starter.key);
        continue;
      }
    }

    const matchingEntry = existing.find(
      (entry: any) => entry.kind === starter.kind && entry.name.toLocaleLowerCase() === starter.name.toLocaleLowerCase(),
    );
    if (matchingEntry && !matchingEntry.starterKey) {
      await tx.growthSkill.update({
        where: { id: matchingEntry.id },
        data: { starterKey: starter.key, ...(starter.key === STARTER_SKILL_KEYS.attributeGeneral ? { archivedAt: new Date() } : {}) },
      });
      existingKeys.add(starter.key);
      continue;
    }

    await tx.growthSkill.create({
      data: {
        id: createUlid(),
        userId,
        name: starter.name,
        description: starter.description,
        icon: starter.icon,
        color: starter.color,
        kind: starter.kind,
        starterKey: starter.key,
        cycleId,
        baseXp: 100,
        sortOrder: sortOrder++,
        ...(starter.key === STARTER_SKILL_KEYS.attributeGeneral ? { archivedAt: new Date() } : {}),
      },
    });
    existingKeys.add(starter.key);
  }

  // Starter mappings are user-scoped: resolve both ends by starterKey rather
  // than using global IDs so a user can never receive another user's route.
  // The optional guard keeps this helper compatible with older transaction
  // doubles while the additive Prisma migration is being rolled out.
  if (tx.growthAttributeMapping?.findMany && tx.growthAttributeMapping?.createMany) {
    const skills = await tx.growthSkill.findMany({ where: { userId, kind: GrowthProgressKind.SKILL, archivedAt: null } });
    const attributes = await tx.growthSkill.findMany({ where: { userId, kind: GrowthProgressKind.ATTRIBUTE, archivedAt: null } });
    const byKey = new Map<string, any>(attributes.map((entry: any) => [entry.starterKey, entry]));
    const existingMappings = await tx.growthAttributeMapping.findMany({ where: { userId }, select: { skillId: true, slot: true } });
    const mappedSkillIds = new Set(existingMappings.map((entry: { skillId: string }) => entry.skillId));
    const mappings: Array<{ id: string; userId: string; skillId: string; attributeId: string; slot: 'PRIMARY' | 'SECONDARY'; weight: number }> = [];
    for (const route of STARTER_ATTRIBUTE_MAPPING_ROUTES) {
      const skill = skills.find((entry: any) => entry.starterKey === route.skillKey);
      const primary = byKey.get(route.primaryKey);
      const secondary = byKey.get(route.secondaryKey);
      if (!skill || !primary || !secondary) continue;
      // Any existing row means the user has customized this route; do not
      // silently restore an omitted optional secondary slot.
      if (mappedSkillIds.has(skill.id)) continue;
      mappings.push(
        { id: createUlid(), userId, skillId: skill.id, attributeId: primary.id, slot: 'PRIMARY', weight: route.primaryWeight },
        { id: createUlid(), userId, skillId: skill.id, attributeId: secondary.id, slot: 'SECONDARY', weight: route.secondaryWeight },
      );
    }
    if (mappings.length) await tx.growthAttributeMapping.createMany({ data: mappings, skipDuplicates: true });
  }

  if (options?.markProfileOnboarding) {
    await tx.growthProfile.update({
      where: { id: options.markProfileOnboarding.profileId },
      data: { onboardingState: GrowthOnboardingState.COMPLETED },
    });
  }
}
