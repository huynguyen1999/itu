import type { GrowthAttributeMappingsInput, IGrowthRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';

export class GrowthService {
  constructor(
    private readonly repo: IGrowthRepository,
    private readonly invalidationNotifier?: ISyncInvalidationNotifier,
    private readonly devices?: ISyncDeviceRepository,
  ) {}

  overview(userId: string) {
    return this.repo.overview(userId);
  }

  getProfile(userId: string) {
    return this.repo.getOrCreateProfile(userId);
  }

  updateProfile(userId: string, data: any) {
    return this.repo.updateProfile(userId, data);
  }

  completeOnboarding(userId: string, selectedSkills: any[]) {
    return this.repo.completeOnboarding(userId, selectedSkills);
  }

  applyPreset(userId: string, preset: any) {
    return this.repo.applyPreset(userId, preset);
  }

  getRewardPresets(userId: string) {
    return this.repo.getRewardPresets(userId);
  }

  updateRewardPreset(userId: string, preset: any, rules: any) {
    return this.repo.updateRewardPreset(userId, preset, rules);
  }

  listTaskRewardDefaults(userId: string) {
    return this.repo.listTaskRewardDefaults(userId);
  }

  upsertTaskRewardDefault(userId: string, input: any) {
    return this.repo.upsertTaskRewardDefault(userId, input);
  }

  previewReset(userId: string, scope: any, skillId?: string) {
    return this.repo.previewReset(userId, scope, skillId);
  }

  executeReset(userId: string, data: any) {
    return this.repo.executeReset(userId, data);
  }

  listSkills(userId: string, includeArchived = false, kind?: any) {
    return this.repo.listSkills(userId, includeArchived, kind);
  }

  createSkill(userId: string, input: any) {
    return this.repo.createSkill(userId, input);
  }

  updateSkill(userId: string, id: string, input: any) {
    return this.repo.updateSkill(userId, id, input);
  }

  deleteSkill(userId: string, id: string) {
    return this.repo.deleteSkill(userId, id);
  }

  reorderSkills(userId: string, skillIds: string[]) {
    return this.repo.reorderSkills(userId, skillIds);
  }

  listAttributeMappings(userId: string, skillId?: string) {
    return this.repo.listAttributeMappings(userId, skillId);
  }

  upsertAttributeMappings(userId: string, input: GrowthAttributeMappingsInput) {
    return this.repo.upsertAttributeMappings(userId, input);
  }

  listRules(userId: string, sourceType?: any, sourceId?: string) {
    return this.repo.listEarningRules(userId, sourceType, sourceId);
  }

  upsertRule(userId: string, input: any) {
    return this.repo.upsertEarningRule(userId, input);
  }

  listLedger(userId: string, options?: any) {
    return this.repo.listLedger(userId, options);
  }

  statistics(userId: string, from: Date, to: Date) {
    return this.repo.growthStatistics(userId, from, to);
  }

  listRewards(userId: string, includeArchived = false) {
    return this.repo.listShopRewards(userId, includeArchived);
  }

  createReward(userId: string, input: any) {
    return this.repo.createShopReward(userId, input);
  }

  updateReward(userId: string, id: string, input: any) {
    return this.repo.updateShopReward(userId, id, input);
  }

  deleteReward(userId: string, id: string) {
    return this.repo.deleteShopReward(userId, id);
  }

  redeemReward(userId: string, rewardId: string) {
    return this.repo.redeemShopReward(userId, rewardId);
  }

  listRedemptions(userId: string, options?: any) {
    return this.repo.listRedemptions(userId, options);
  }

  listItemCategories(userId: string, includeArchived = false) {
    return this.repo.listItemCategories(userId, includeArchived);
  }

  createItemCategory(userId: string, input: any) {
    return this.repo.createItemCategory(userId, input);
  }

  updateItemCategory(userId: string, id: string, input: any) {
    return this.repo.updateItemCategory(userId, id, input);
  }

  reorderItemCategories(userId: string, categoryIds: string[]) {
    return this.repo.reorderItemCategories(userId, categoryIds);
  }

  reorderItems(userId: string, itemIds: string[]) {
    return this.repo.reorderShopRewards(userId, itemIds);
  }

  listInventory(userId: string) {
    return this.repo.listInventory(userId);
  }

  listInventoryHistory(userId: string, options?: any) {
    return this.repo.listInventoryHistory(userId, options);
  }

  consumeInventoryItem(userId: string, itemId: string, idempotencyKey: string) {
    return this.repo.consumeInventoryItem(userId, itemId, idempotencyKey);
  }
}
