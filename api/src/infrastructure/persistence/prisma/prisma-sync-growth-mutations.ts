import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import {
  GrowthAttributeMappingSlot,
  GrowthProgressKind,
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthSourceType,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { createUlid } from './ulid';
import { STARTER_SKILLS } from '@core/application/use-cases/growth-starter-skills';
import { REWARD_PRESETS } from '@core/application/use-cases/growth-reward-presets';
import {
  assertClientId,
  awardsArray,
  enumValue,
  fieldConflict,
  notFound,
  optionalString,
  requiredString,
  validatedGrowthInt,
} from './prisma-sync.helpers';

import { PrismaSyncGrowthPresets } from './prisma-sync-growth-presets';

export class PrismaSyncGrowthMutations extends PrismaSyncGrowthPresets {
  readonly kinds: readonly string[] = ["growth.onboarding","growthprofile.update","growthskill.create","growthskill.update","growthattributemapping.upsert","growthearningrule.upsert","growthshopreward.create","growthshopreward.update","growthshopreward.redeem","growthitemcategory.create","growthitemcategory.update","growthinventory.consume","growthrewardpreset.update","growthtaskrewarddefault.upsert","growthpreset.apply"];
  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
      case 'growth.onboarding': {
        const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
        const skills = Array.isArray(payload.skills) ? payload.skills : [];
        const existing = await tx.growthSkill.findMany({ where: { userId }, select: { starterKey: true } });
        const existingKeys = new Set(existing.map((skill) => skill.starterKey).filter(Boolean));
        for (const item of skills) {
          if (typeof item !== 'object' || item === null) continue;
          const key = (item as { key?: unknown }).key;
          if (typeof key !== 'string' || existingKeys.has(key)) continue;
          const starter = STARTER_SKILLS.find((entry) => entry.key === key);
          if (!starter) continue;
          const skill = await tx.growthSkill.create({
            data: {
              id: createUlid(),
              userId,
              cycleId: profile.activeCycleId,
              kind: starter.kind,
              starterKey: starter.key,
              name: optionalString(item as Record<string, unknown>, 'customName') ?? starter.name,
              description: starter.description,
              icon: starter.icon,
              color: starter.color,
              baseXp: 100,
              sortOrder: STARTER_SKILLS.findIndex((entry) => entry.key === starter.key),
            },
          });
          await recordSyncChange(tx, userId, 'growthskill', skill.id, 'UPSERT', skill);
        }
        const updatedProfile = await tx.growthProfile.update({
          where: { id: profile.id },
          data: { onboardingState: 'COMPLETED' },
        });
        await recordSyncChange(tx, userId, 'growthprofile', updatedProfile.id, 'UPSERT', updatedProfile);
        return null;
      }
      case 'growthprofile.update': {
        const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
        const updated = await tx.growthProfile.update({
          where: { id: profile.id },
          data: {
            accountBaseXp:
              typeof payload.accountBaseXp === 'number'
                ? Math.max(10, Math.min(10000, Math.trunc(payload.accountBaseXp)))
                : profile.accountBaseXp,
            rewardPreset:
              payload.rewardPreset === undefined
                ? profile.rewardPreset
                : enumValue(GrowthRewardPreset, payload.rewardPreset, 'rewardPreset'),
          },
        });
        await recordSyncChange(tx, userId, 'growthprofile', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthskill.create': {
        assertClientId(mutation.entityId);
        const profile = await this.getOrCreateGrowthProfileInTx(tx, userId);
        const skill = await tx.growthSkill.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            cycleId: profile.activeCycleId,
            kind:
              payload.kind === undefined
                ? GrowthProgressKind.SKILL
                : enumValue(GrowthProgressKind, payload.kind, 'kind'),
            name: requiredString(payload, 'name'),
            description: optionalString(payload, 'description') ?? '',
            icon: optionalString(payload, 'icon') ?? 'SPARKLES',
            color: optionalString(payload, 'color') ?? 'TEAL',
            baseXp:
              typeof payload.baseXp === 'number' ? Math.max(10, Math.min(10000, Math.trunc(payload.baseXp))) : 100,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
          },
          update: {},
        });
        await recordSyncChange(tx, userId, 'growthskill', skill.id, 'UPSERT', skill);
        return null;
      }
      case 'growthskill.update': {
        const skill = await tx.growthSkill.findFirst({ where: { id: mutation.entityId, userId } });
        if (!skill) return notFound(mutation, 'growthskill');
        const conflict = fieldConflict(mutation, 'growthskill', skill);
        if (conflict) return conflict;
        const updated = await tx.growthSkill.update({
          where: { id: skill.id },
          data: {
            name: optionalString(payload, 'name') ?? skill.name,
            description:
              payload.description === undefined ? skill.description : (optionalString(payload, 'description') ?? ''),
            icon: optionalString(payload, 'icon') ?? skill.icon,
            color: optionalString(payload, 'color') ?? skill.color,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : skill.sortOrder,
            baseXp:
              typeof payload.baseXp === 'number'
                ? Math.max(10, Math.min(10000, Math.trunc(payload.baseXp)))
                : skill.baseXp,
            kind: payload.kind === undefined ? skill.kind : enumValue(GrowthProgressKind, payload.kind, 'kind'),
            archivedAt:
              typeof payload.archived === 'boolean' ? (payload.archived ? new Date() : null) : skill.archivedAt,
            version: { increment: 1 },
          },
        });
        await recordSyncChange(tx, userId, 'growthskill', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthattributemapping.upsert':
        return this.applyGrowthAttributeMappings(tx, userId, mutation);
      case 'growthearningrule.upsert':
        return this.applyGrowthEarningRule(tx, userId, mutation);
      case 'growthshopreward.create': {
        assertClientId(mutation.entityId);
        const reward = await tx.growthShopReward.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            name: requiredString(payload, 'name'),
            description: optionalString(payload, 'description') ?? '',
            icon: optionalString(payload, 'icon') ?? 'GIFT',
            color: optionalString(payload, 'color') ?? 'ROSE',
            price: typeof payload.price === 'number' ? Math.trunc(payload.price) : null,
            listedInShop: typeof payload.listedInShop === 'boolean' ? payload.listedInShop : payload.price != null,
            repeatable: typeof payload.repeatable === 'boolean' ? payload.repeatable : true,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
            categoryId: optionalString(payload, 'categoryId'),
          },
          update: {},
          include: { category: true, _count: { select: { redemptions: true } } },
        });
        await recordSyncChange(tx, userId, 'growthshopreward', reward.id, 'UPSERT', reward);
        return null;
      }
      case 'growthshopreward.update': {
        const reward = await tx.growthShopReward.findFirst({ where: { id: mutation.entityId, userId } });
        if (!reward) return notFound(mutation, 'growthshopreward');
        const conflict = fieldConflict(mutation, 'growthshopreward', reward);
        if (conflict) return conflict;
        const updated = await tx.growthShopReward.update({
          where: { id: reward.id },
          data: {
            name: optionalString(payload, 'name') ?? reward.name,
            description:
              payload.description === undefined ? reward.description : (optionalString(payload, 'description') ?? ''),
            icon: optionalString(payload, 'icon') ?? reward.icon,
            color: optionalString(payload, 'color') ?? reward.color,
            price:
              payload.price === undefined
                ? reward.price
                : typeof payload.price === 'number'
                  ? Math.trunc(payload.price)
                  : null,
            listedInShop: typeof payload.listedInShop === 'boolean' ? payload.listedInShop : reward.listedInShop,
            repeatable: typeof payload.repeatable === 'boolean' ? payload.repeatable : reward.repeatable,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : reward.sortOrder,
            categoryId: payload.categoryId === undefined ? reward.categoryId : optionalString(payload, 'categoryId'),
            archivedAt:
              typeof payload.archived === 'boolean' ? (payload.archived ? new Date() : null) : reward.archivedAt,
            version: { increment: 1 },
          },
          include: { category: true, _count: { select: { redemptions: true } } },
        });
        await recordSyncChange(tx, userId, 'growthshopreward', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthshopreward.redeem':
        await this.applyGrowthRewardRedemption(tx, userId, mutation);
        return null;
      case 'growthitemcategory.create': {
        assertClientId(mutation.entityId);
        const category = await tx.growthItemCategory.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            name: requiredString(payload, 'name'),
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
          },
          update: {},
          include: { _count: { select: { items: true } } },
        });
        await recordSyncChange(tx, userId, 'growthitemcategory', category.id, 'UPSERT', category);
        return null;
      }
      case 'growthitemcategory.update': {
        const category = await tx.growthItemCategory.findFirst({ where: { id: mutation.entityId, userId } });
        if (!category) return notFound(mutation, 'growthitemcategory');
        const conflict = fieldConflict(mutation, 'growthitemcategory', category);
        if (conflict) return conflict;
        const updated = await tx.growthItemCategory.update({
          where: { id: category.id },
          data: {
            name: optionalString(payload, 'name') ?? category.name,
            sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : category.sortOrder,
            archivedAt:
              typeof payload.archived === 'boolean' ? (payload.archived ? new Date() : null) : category.archivedAt,
            version: { increment: 1 },
          },
          include: { _count: { select: { items: true } } },
        });
        await recordSyncChange(tx, userId, 'growthitemcategory', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'growthinventory.consume':
        await this.applyGrowthInventoryConsume(tx, userId, mutation);
        return null;
      case 'growthrewardpreset.update':
        await this.applyGrowthRewardPresetUpdate(tx, userId, mutation);
        return null;
      case 'growthtaskrewarddefault.upsert':
        await this.applyGrowthTaskRewardDefault(tx, userId, mutation);
        return null;
      case 'growthpreset.apply':
        await this.applyGrowthPreset(tx, userId, mutation);
        return null;
      default:
        return undefined;
    }
  }


}
