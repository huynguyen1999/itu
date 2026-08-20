export interface IGrowthRepository {
  overview(userId: string): Promise<any>;
  getOrCreateProfile(userId: string): Promise<any>;
  updateProfile(userId: string, data: any): Promise<any>;
  completeOnboarding(userId: string, selectedSkills: any[]): Promise<any>;
  applyPreset(userId: string, preset: any): Promise<any>;
  getRewardPresets(userId: string): Promise<any>;
  updateRewardPreset(userId: string, preset: any, rules: any): Promise<any>;
  listTaskRewardDefaults(userId: string): Promise<any[]>;
  upsertTaskRewardDefault(userId: string, data: any): Promise<any>;

  listSkills(userId: string, includeArchived?: boolean, kind?: any): Promise<any[]>;
  findSkillById(userId: string, id: string): Promise<any | null>;
  createSkill(userId: string, data: any): Promise<any>;
  updateSkill(userId: string, id: string, data: any): Promise<any | null>;
  deleteSkill(userId: string, id: string): Promise<boolean>;
  reorderSkills(userId: string, skillIds: string[]): Promise<any[]>;
  listAttributeMappings(userId: string, skillId?: string): Promise<unknown[]>;
  upsertAttributeMappings(userId: string, data: GrowthAttributeMappingsInput): Promise<unknown[]>;

  listEarningRules(userId: string, sourceType?: string, sourceId?: string): Promise<any[]>;
  findEarningRule(userId: string, sourceType: string, sourceId: string): Promise<any | null>;
  upsertEarningRule(userId: string, data: any): Promise<any>;
  listLedger(userId: string, options?: any): Promise<any>;
  growthStatistics(userId: string, from: Date, to: Date): Promise<any>;

  listShopRewards(userId: string, includeArchived?: boolean): Promise<any[]>;
  createShopReward(userId: string, data: any): Promise<any>;
  updateShopReward(userId: string, id: string, data: any): Promise<any | null>;
  deleteShopReward(userId: string, id: string): Promise<boolean>;

  listRedemptions(userId: string, options?: any): Promise<any>;
  redeemShopReward(userId: string, rewardId: string): Promise<any>;
  listItemCategories(userId: string, includeArchived?: boolean): Promise<any[]>;
  createItemCategory(userId: string, data: any): Promise<any>;
  updateItemCategory(userId: string, id: string, data: any): Promise<any | null>;
  reorderItemCategories(userId: string, categoryIds: string[]): Promise<any[]>;
  reorderShopRewards(userId: string, rewardIds: string[]): Promise<any[]>;
  listInventory(userId: string): Promise<any[]>;
  listInventoryHistory(userId: string, options?: any): Promise<any[]>;
  consumeInventoryItem(userId: string, rewardId: string, idempotencyKey: string): Promise<any>;

  previewReset(userId: string, scope: any, skillId?: string): Promise<any>;
  executeReset(userId: string, data: any): Promise<any>;

  awardActivity(
    userId: string,
    sourceType: any,
    ruleSourceId: string,
    title: string,
    metadata?: any,
    activitySourceId?: string,
  ): Promise<boolean>;
  reverseActivity(userId: string, sourceType: any, sourceId: string, title: string): Promise<boolean>;
}

export interface GrowthAttributeMappingsInput {
  skillId: string;
  mappings: Array<{
    attributeId: string;
    slot: 'PRIMARY' | 'SECONDARY';
    weight: number;
  }>;
}
