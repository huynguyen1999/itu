import { createUlid } from '../sync/syncIdentity';
import type { ApiClientContext } from './apiContext';
import type {
  CursorPage,
  GrowthAttributeMapping,
  GrowthAttributeMappingDraft,
  GrowthCurvePreview,
  GrowthEarningRule,
  GrowthInventoryBalance,
  GrowthInventoryTransaction,
  GrowthItemCategory,
  GrowthLedgerEntry,
  GrowthOverview,
  GrowthProfile,
  GrowthProgressKind,
  GrowthResetPreview,
  GrowthResetScope,
  GrowthRewardPreset,
  GrowthScalingMode,
  GrowthShopReward,
  GrowthSkill,
  GrowthSourceType,
  GrowthStatistics,
  GrowthTaskRewardDefault,
} from './types';

export function createGrowthApi(ctx: ApiClientContext) {
  return {
    growthOverview() {
      return ctx.request<GrowthOverview>('/growth/overview');
    },
    growthStatistics(fromDate: string, toDate: string) {
      const query = new URLSearchParams({ fromDate, toDate });
      return ctx.request<GrowthStatistics>(`/growth/statistics?${query}`);
    },
    growthProfile() {
      return ctx.request<GrowthProfile>('/growth/profile');
    },
    updateGrowthProfile(data: { accountBaseXp?: number; rewardPreset?: GrowthRewardPreset }) {
      return ctx.offlineMutation(
        {
          kind: 'growthprofile.update',
          entityId: 'profile',
          payload: data,
          optimistic: { id: 'profile', ...data } as GrowthProfile,
        },
        () => ctx.request<GrowthProfile>('/growth/profile', { method: 'PATCH', body: JSON.stringify(data) }),
      );
    },
    growthCurvePreview(baseXp = 100, fromLevel = 1, count = 10) {
      return ctx.request<GrowthCurvePreview[]>(
        `/growth/curve-preview?baseXp=${baseXp}&fromLevel=${fromLevel}&count=${count}`,
      );
    },
    growthOnboarding() {
      return ctx.request<{
        starterSkills: Array<{ key: string; name: string; description: string; icon: string; color: string }>;
        profile: GrowthProfile;
      }>('/growth/onboarding');
    },
    completeGrowthOnboarding(skills: Array<{ key: string; customName?: string }>) {
      return ctx.offlineMutation(
        {
          kind: 'growth.onboarding',
          entityId: 'onboarding',
          payload: { skills },
          immediate: true,
          optimistic: [] as GrowthSkill[],
        },
        () => ctx.request<GrowthSkill[]>('/growth/onboarding', { method: 'POST', body: JSON.stringify({ skills }) }),
      );
    },
    growthRewardPresets() {
      return ctx.request<
        Record<
          GrowthRewardPreset,
          Record<
            GrowthSourceType,
            {
              coinReward: number;
              accountXp: number;
              xpRewardPerSkill: number;
              scalingMode: GrowthScalingMode;
              maxRewardCap?: number;
            }
          >
        >
      >('/growth/reward-presets');
    },
    growthRewardPresetSettings() {
      return ctx.request<
        Record<
          GrowthRewardPreset,
          Record<
            GrowthSourceType,
            {
              coinReward: number;
              accountXp: number;
              xpRewardPerSkill: number;
              scalingMode: GrowthScalingMode;
              maxRewardCap?: number;
            }
          >
        >
      >('/growth/reward-presets/settings');
    },
    updateGrowthRewardPreset(
      preset: GrowthRewardPreset,
      rules: Array<{
        sourceType: GrowthSourceType;
        coinReward: number;
        accountXp: number;
        xpRewardPerSkill: number;
        scalingMode: GrowthScalingMode;
        maxRewardCap?: number | null;
      }>,
    ) {
      return ctx.offlineMutation(
        {
          kind: 'growthrewardpreset.update',
          entityId: preset,
          payload: { preset, rules },
          optimistic: {} as Record<
            GrowthRewardPreset,
            Record<
              GrowthSourceType,
              {
                coinReward: number;
                accountXp: number;
                xpRewardPerSkill: number;
                scalingMode: GrowthScalingMode;
                maxRewardCap?: number;
              }
            >
          >,
        },
        () =>
          ctx.request<
            Record<
              GrowthRewardPreset,
              Record<
                GrowthSourceType,
                {
                  coinReward: number;
                  accountXp: number;
                  xpRewardPerSkill: number;
                  scalingMode: GrowthScalingMode;
                  maxRewardCap?: number;
                }
              >
            >
          >(`/growth/reward-presets/${preset}`, {
            method: 'PATCH',
            body: JSON.stringify({ rules }),
          }),
      );
    },
    applyGrowthPreset(preset: GrowthRewardPreset) {
      return ctx.offlineMutation(
        {
          kind: 'growthpreset.apply',
          entityId: preset,
          payload: { preset },
          immediate: true,
          optimistic: [] as GrowthEarningRule[],
        },
        () =>
          ctx.request<GrowthEarningRule[]>('/growth/apply-preset', {
            method: 'POST',
            body: JSON.stringify({ preset }),
          }),
      );
    },
    growthTaskRewardDefaults() {
      return ctx.request<GrowthTaskRewardDefault[]>('/growth/task-reward-defaults');
    },
    saveGrowthTaskRewardDefault(data: {
      taskListId?: string | null;
      coinReward: number;
      accountXp: number;
      enabled: boolean;
      skillAwards: Array<{ skillId: string; xpReward: number }>;
      itemAwards?: Array<{ itemId: string; quantity: number }>;
    }) {
      const entityId = data.taskListId ?? 'global';
      return ctx.offlineMutation(
        {
          kind: 'growthtaskrewarddefault.upsert',
          entityId,
          payload: data,
          optimistic: optimisticGrowthTaskRewardDefault(entityId, data),
        },
        () =>
          ctx.request<GrowthTaskRewardDefault>('/growth/task-reward-defaults', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      );
    },
    previewGrowthReset(scope: GrowthResetScope, skillId?: string) {
      return ctx.request<GrowthResetPreview>('/growth/reset/preview', {
        method: 'POST',
        body: JSON.stringify({ scope, skillId }),
      });
    },
    executeGrowthReset(data: {
      scope: GrowthResetScope;
      skillId?: string;
      idempotencyKey: string;
      keepEarningRules?: boolean;
      keepShopRewards?: boolean;
    }) {
      return ctx.request<{ id: string }>('/growth/reset', { method: 'POST', body: JSON.stringify(data) });
    },
    growthSkills(kind?: GrowthProgressKind, includeArchived = false) {
      const query = new URLSearchParams();
      if (kind) query.set('kind', kind);
      if (includeArchived) query.set('includeArchived', 'true');
      return ctx.request<GrowthSkill[]>(`/growth/skills${query.size ? `?${query}` : ''}`);
    },
    growthAttributes(includeArchived = false) {
      return ctx.request<GrowthSkill[]>(`/growth/attributes${includeArchived ? '?includeArchived=true' : ''}`);
    },
    growthAttributeMappings(skillId?: string) {
      const query = skillId ? `?skillId=${encodeURIComponent(skillId)}` : '';
      return ctx.request<GrowthAttributeMapping[]>(`/growth/attribute-mappings${query}`);
    },
    upsertGrowthAttributeMappings(data: { skillId: string; mappings: GrowthAttributeMappingDraft[] }) {
      const payload = {
        ...data,
        mappings: data.mappings.map((mapping) => ({ ...mapping, weight: Math.trunc(Number(mapping.weight)) })),
      };
      return ctx.offlineMutation(
        {
          kind: 'growthattributemapping.upsert',
          entityId: data.skillId,
          payload,
          optimistic: payload.mappings.map((mapping) => ({
            id: `${data.skillId}:${mapping.slot.toLowerCase()}`,
            skillId: data.skillId,
            attributeId: mapping.attributeId,
            slot: mapping.slot,
            weight: mapping.weight,
          })) as GrowthAttributeMapping[],
        },
        () =>
          ctx.request<GrowthAttributeMapping[]>('/growth/attribute-mappings', {
            method: 'POST',
            body: JSON.stringify(payload),
          }),
      );
    },
    createGrowthSkill(data: {
      name: string;
      kind?: GrowthProgressKind;
      description?: string;
      icon?: string;
      color?: string;
      baseXp?: number;
    }) {
      const id = createUlid();
      return ctx.offlineMutation(
        { kind: 'growthskill.create', entityId: id, payload: data, optimistic: optimisticGrowthSkill(id, data) },
        () => ctx.request<GrowthSkill>('/growth/skills', { method: 'POST', body: JSON.stringify(data) }),
      );
    },
    updateGrowthSkill(id: string, data: Partial<GrowthSkill> & { archived?: boolean }) {
      return ctx.offlineMutation(
        {
          kind: 'growthskill.update',
          entityId: id,
          payload: data as Record<string, unknown>,
          baseVersion: data.version,
          optimistic: { id, ...data } as GrowthSkill,
        },
        () => ctx.request<GrowthSkill>(`/growth/skills/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      );
    },
    uploadGrowthSkillIcon(file: File) {
      const form = new FormData();
      form.set('image', file);
      return ctx.request<{ url: string; width: number; height: number }>('/growth/skills/icon', {
        method: 'POST',
        body: form,
      });
    },
    growthRules(sourceType?: GrowthSourceType, sourceId?: string) {
      const query = new URLSearchParams();
      if (sourceType) query.set('sourceType', sourceType);
      if (sourceId) query.set('sourceId', sourceId);
      return ctx.request<GrowthEarningRule[]>(`/growth/earning-rules?${query}`);
    },
    saveGrowthRule(
      data: {
        sourceType: GrowthSourceType;
        sourceId: string;
        ruleId?: string;
        coinReward: number;
        accountXp: number;
        enabled: boolean;
        scalingMode?: GrowthScalingMode;
        maxRewardCap?: number | null;
        skillAwards: Array<{ skillId: string; xpReward: number }>;
        itemAwards?: Array<{ itemId: string; quantity: number }>;
      },
      optimistic?: GrowthEarningRule,
    ) {
      return ctx.offlineMutation(
        {
          kind: 'growthearningrule.upsert',
          entityId: data.ruleId ?? `${data.sourceType}:${data.sourceId}`,
          payload: growthRulePayload(data),
          optimistic: optimistic ?? optimisticGrowthRule(data),
        },
        () =>
          ctx.request<GrowthEarningRule>('/growth/earning-rules', {
            method: 'POST',
            body: JSON.stringify(growthRulePayload(data)),
          }),
      );
    },
    growthRewards() {
      return ctx.request<GrowthShopReward[]>('/growth/rewards');
    },
    growthItems(includeArchived = false) {
      return ctx.request<GrowthShopReward[]>(`/growth/items${includeArchived ? '?includeArchived=true' : ''}`);
    },
    createGrowthReward(data: {
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      price?: number | null;
      listedInShop?: boolean;
      repeatable?: boolean;
      categoryId?: string | null;
    }) {
      const id = createUlid();
      return ctx.offlineMutation(
        { kind: 'growthshopreward.create', entityId: id, payload: data, optimistic: optimisticGrowthReward(id, data) },
        () => ctx.request<GrowthShopReward>('/growth/rewards', { method: 'POST', body: JSON.stringify(data) }),
      );
    },
    updateGrowthItem(id: string, data: Partial<GrowthShopReward> & { archived?: boolean }) {
      return ctx.offlineMutation(
        {
          kind: 'growthshopreward.update',
          entityId: id,
          payload: data as Record<string, unknown>,
          baseVersion: data.version,
          optimistic: { id, ...data } as GrowthShopReward,
        },
        () => ctx.request<GrowthShopReward>(`/growth/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      );
    },
    redeemGrowthReward(id: string) {
      return ctx.offlineMutation(
        { kind: 'growthshopreward.redeem', entityId: id, payload: {}, immediate: true, optimistic: { id } },
        () => ctx.request(`/growth/rewards/${id}/redeem`, { method: 'POST' }),
      );
    },
    growthItemCategories(includeArchived = false) {
      return ctx.request<GrowthItemCategory[]>(
        `/growth/item-categories${includeArchived ? '?includeArchived=true' : ''}`,
      );
    },
    createGrowthItemCategory(data: { name: string; sortOrder?: number }) {
      const id = createUlid();
      return ctx.offlineMutation(
        {
          kind: 'growthitemcategory.create',
          entityId: id,
          payload: data,
          optimistic: { id, name: data.name, sortOrder: data.sortOrder ?? 0, version: 1, _count: { items: 0 } },
        },
        () =>
          ctx.request<GrowthItemCategory>('/growth/item-categories', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      );
    },
    updateGrowthItemCategory(id: string, data: Partial<GrowthItemCategory> & { archived?: boolean }) {
      return ctx.offlineMutation(
        {
          kind: 'growthitemcategory.update',
          entityId: id,
          payload: data as Record<string, unknown>,
          baseVersion: data.version,
          optimistic: { id, ...data } as GrowthItemCategory,
        },
        () =>
          ctx.request<GrowthItemCategory>(`/growth/item-categories/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
          }),
      );
    },
    growthInventory() {
      return ctx.request<GrowthInventoryBalance[]>('/growth/inventory');
    },
    growthInventoryHistory() {
      return ctx.request<GrowthInventoryTransaction[]>('/growth/inventory/history?limit=50');
    },
    consumeGrowthInventoryItem(id: string, idempotencyKey = createUlid()) {
      return ctx.offlineMutation(
        {
          kind: 'growthinventory.consume',
          entityId: id,
          payload: { idempotencyKey },
          immediate: true,
          optimistic: { item: { id } as GrowthShopReward, quantity: 0 },
        },
        () =>
          ctx.request<{ item: GrowthShopReward; quantity: number }>(`/growth/inventory/${id}/consume`, {
            method: 'POST',
            body: JSON.stringify({ idempotencyKey }),
          }),
      );
    },
    growthLedger(params?: {
      cycleId?: string;
      sourceType?: string;
      currency?: string;
      skillId?: string;
      kind?: string;
    }) {
      const query = new URLSearchParams();
      query.set('limit', '50');
      if (params?.cycleId) query.set('cycleId', params.cycleId);
      if (params?.sourceType) query.set('sourceType', params.sourceType);
      if (params?.currency) query.set('currency', params.currency);
      if (params?.skillId) query.set('skillId', params.skillId);
      if (params?.kind) query.set('kind', params.kind);
      return ctx.request<CursorPage<GrowthLedgerEntry>>(`/growth/ledger?${query}`);
    },
  };
}

export type GrowthApi = ReturnType<typeof createGrowthApi>;

function optimisticGrowthSkill(
  id: string,
  data: {
    name: string;
    kind?: GrowthProgressKind;
    description?: string;
    icon?: string;
    color?: string;
    baseXp?: number;
  },
): GrowthSkill {
  const baseXp = data.baseXp ?? 100;
  return {
    id,
    name: data.name,
    kind: data.kind ?? 'SKILL',
    description: data.description ?? '',
    icon: data.icon ?? 'SPARKLES',
    color: data.color ?? 'TEAL',
    sortOrder: Date.now(),
    baseXp,
    level: 1,
    currentXp: 0,
    levelStartXp: 0,
    nextLevelXp: baseXp,
    progressXp: 0,
    requiredXp: baseXp,
    archivedAt: null,
    version: 1,
  };
}

function optimisticGrowthRule(data: {
  sourceType: GrowthSourceType;
  sourceId: string;
  ruleId?: string;
  coinReward: number;
  accountXp: number;
  enabled: boolean;
  scalingMode?: GrowthScalingMode;
  maxRewardCap?: number | null;
  skillAwards: Array<{ skillId: string; xpReward: number }>;
  itemAwards?: Array<{ itemId: string; quantity: number }>;
}): GrowthEarningRule {
  return {
    id: data.ruleId ?? `${data.sourceType}:${data.sourceId}`,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    coinReward: data.coinReward,
    accountXp: data.accountXp,
    enabled: data.enabled,
    scalingMode: data.scalingMode ?? 'FIXED',
    maxRewardCap: data.maxRewardCap ?? null,
    version: 1,
    skillAwards: data.skillAwards.map((award) => ({
      ...award,
      skill: { id: award.skillId, name: 'Skill' } as GrowthSkill,
    })),
    itemAwards: (data.itemAwards ?? []).map((award) => ({
      ...award,
      item: { id: award.itemId, name: 'Reward' } as GrowthShopReward,
    })),
  };
}

function growthRulePayload(data: {
  sourceType: GrowthSourceType;
  sourceId: string;
  ruleId?: string;
  coinReward: number;
  accountXp: number;
  enabled: boolean;
  scalingMode?: GrowthScalingMode;
  maxRewardCap?: number | null;
  skillAwards: Array<{ skillId: string; xpReward: number }>;
  itemAwards?: Array<{ itemId: string; quantity: number }>;
}) {
  const { ruleId: _ruleId, ...payload } = data;
  return payload;
}

function optimisticGrowthTaskRewardDefault(
  id: string,
  data: {
    taskListId?: string | null;
    coinReward: number;
    accountXp: number;
    enabled: boolean;
    skillAwards: Array<{ skillId: string; xpReward: number }>;
    itemAwards?: Array<{ itemId: string; quantity: number }>;
  },
): GrowthTaskRewardDefault {
  return {
    id,
    taskListId: data.taskListId ?? null,
    coinReward: data.coinReward,
    accountXp: data.accountXp,
    enabled: data.enabled,
    skillAwards: data.skillAwards.map((award) => ({
      ...award,
      skill: { id: award.skillId, name: 'Skill' } as GrowthSkill,
    })),
    itemAwards: (data.itemAwards ?? []).map((award) => ({
      ...award,
      item: { id: award.itemId, name: 'Reward' } as GrowthShopReward,
    })),
    taskList: null,
  };
}

function optimisticGrowthReward(
  id: string,
  data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    price?: number | null;
    listedInShop?: boolean;
    repeatable?: boolean;
    categoryId?: string | null;
  },
): GrowthShopReward {
  return {
    id,
    name: data.name,
    description: data.description ?? '',
    icon: data.icon ?? 'GIFT',
    color: data.color ?? 'ROSE',
    price: data.price ?? null,
    listedInShop: data.listedInShop ?? data.price != null,
    repeatable: data.repeatable ?? true,
    sortOrder: Date.now(),
    categoryId: data.categoryId ?? null,
    category: null,
    archivedAt: null,
    version: 1,
    _count: { redemptions: 0 },
  };
}
