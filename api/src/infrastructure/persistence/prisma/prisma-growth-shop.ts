import { Injectable } from '@nestjs/common';
import { GrowthCurrency, GrowthLedgerKind, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';

@Injectable()
export class PrismaGrowthShop {
  constructor(private readonly db: PrismaService) {}

  // ─── Shop Rewards ──────────────────────────────────────────────────────────

  async listRewards(userId: string, includeArchived = false) {
    return this.db.growthShopReward.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: { category: true, _count: { select: { redemptions: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createReward(userId: string, input: any) {
    if (input.categoryId) {
      const category = await this.db.growthItemCategory.findFirst({
        where: { id: input.categoryId, userId, archivedAt: null },
      });
      if (!category) throw new Error('Item category not found');
    }
    const listedInShop = input.listedInShop ?? input.price != null;
    if (listedInShop && input.price == null) throw new Error('A shop item requires a price');
    return this.db.growthShopReward.create({
      data: {
        id: createUlid(),
        userId,
        name: input.name.trim(),
        description: input.description ?? '',
        icon: input.icon ?? 'GIFT',
        color: input.color ?? 'ROSE',
        price: input.price ?? null,
        listedInShop,
        repeatable: input.repeatable ?? true,
        sortOrder: input.sortOrder ?? 0,
        categoryId: input.categoryId ?? null,
      },
      include: { category: true, _count: { select: { redemptions: true } } },
    });
  }

  async updateReward(userId: string, id: string, input: any) {
    const existing = await this.db.growthShopReward.findFirst({ where: { id, userId } });
    if (!existing) return null;
    if (input.categoryId) {
      const category = await this.db.growthItemCategory.findFirst({
        where: { id: input.categoryId, userId, archivedAt: null },
      });
      if (!category) throw new Error('Item category not found');
    }
    const listedInShop = input.listedInShop ?? existing.listedInShop;
    const price = input.price === undefined ? existing.price : input.price;
    if (listedInShop && price == null) throw new Error('A shop item requires a price');
    return this.db.growthShopReward.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        icon: input.icon,
        color: input.color,
        price,
        listedInShop,
        repeatable: input.repeatable,
        sortOrder: input.sortOrder,
        categoryId: input.categoryId,
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
      },
      include: { category: true, _count: { select: { redemptions: true } } },
    });
  }

  async deleteReward(userId: string, id: string) {
    const deleted = await this.db.growthShopReward.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async reorderRewards(userId: string, rewardIds: string[]) {
    const owned = await this.db.growthShopReward.findMany({
      where: { userId, id: { in: rewardIds } },
      select: { id: true },
    });
    const ids = new Set(owned.map((item) => item.id));
    await this.db.$transaction(
      rewardIds
        .filter((id) => ids.has(id))
        .map((id, index) => this.db.growthShopReward.update({ where: { id }, data: { sortOrder: index } })),
    );
    return this.listRewards(userId, true);
  }

  // ─── Item Categories ───────────────────────────────────────────────────────

  async listCategories(userId: string, includeArchived = false) {
    return this.db.growthItemCategory.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: { _count: { select: { items: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createCategory(userId: string, input: any) {
    return this.db.growthItemCategory.create({
      data: { id: createUlid(), userId, name: input.name.trim(), sortOrder: input.sortOrder ?? 0 },
    });
  }

  async updateCategory(userId: string, id: string, input: any) {
    const existing = await this.db.growthItemCategory.findFirst({ where: { id, userId } });
    if (!existing) return null;
    return this.db.growthItemCategory.update({
      where: { id },
      data: {
        name: input.name,
        sortOrder: input.sortOrder,
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
        version: { increment: 1 },
      },
    });
  }

  async reorderCategories(userId: string, categoryIds: string[]) {
    const owned = await this.db.growthItemCategory.findMany({
      where: { userId, id: { in: categoryIds } },
      select: { id: true },
    });
    const ids = new Set(owned.map((category) => category.id));
    await this.db.$transaction(
      categoryIds
        .filter((id) => ids.has(id))
        .map((id, index) => this.db.growthItemCategory.update({ where: { id }, data: { sortOrder: index } })),
    );
    return this.listCategories(userId, true);
  }

  // ─── Redemptions ───────────────────────────────────────────────────────────

  async listRedemptions(userId: string, options?: any) {
    return this.db.growthRewardRedemption.findMany({
      where: { userId },
      include: { reward: { select: { name: true, icon: true, color: true } } },
      orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
      take: options?.limit ?? 50,
    });
  }

  async redeemReward(userId: string, rewardId: string) {
    return this.withSerializableRetry(async (tx) => {
      const reward = await tx.growthShopReward.findFirst({
        where: { id: rewardId, userId, archivedAt: null, listedInShop: true },
      });
      if (!reward) throw new Error('Reward not found');
      if (reward.price == null) throw new Error('This item is not available for purchase');
      if (!reward.repeatable) {
        const priorPurchase = await tx.growthRewardRedemption.findFirst({ where: { userId, rewardId } });
        if (priorPurchase) throw new Error('This item can only be purchased once');
      }
      const balance = await tx.growthLedgerEntry.aggregate({
        where: { userId, currency: GrowthCurrency.COIN },
        _sum: { amount: true },
      });
      if ((balance._sum.amount ?? 0) < reward.price) throw new Error('Insufficient coins');

      const entryId = createUlid();
      const redemptionId = createUlid();
      const profile = await tx.growthProfile.findUnique({ where: { userId } });
      await tx.growthLedgerEntry.create({
        data: {
          id: entryId,
          userId,
          currency: GrowthCurrency.COIN,
          amount: -reward.price,
          kind: GrowthLedgerKind.REWARD_PURCHASE,
          sourceType: 'REWARD_REDEMPTION',
          sourceId: rewardId,
          entryKey: `redeem:${redemptionId}`,
          cycleId: profile?.activeCycleId ?? null,
          titleSnapshot: `Redeemed ${reward.name}`,
        },
      });

      const redemption = await tx.growthRewardRedemption.create({
        data: {
          id: redemptionId,
          userId,
          rewardId,
          ledgerEntryId: entryId,
          rewardNameSnapshot: reward.name,
          descriptionSnapshot: reward.description ?? '',
          priceSnapshot: reward.price,
        },
        include: { reward: { select: { name: true, icon: true, color: true } } },
      });

      await tx.growthInventoryTransaction.create({
        data: {
          id: createUlid(),
          userId,
          itemId: reward.id,
          quantity: 1,
          kind: 'PURCHASE',
          sourceType: 'REWARD_REDEMPTION',
          sourceId: redemption.id,
          entryKey: `inventory:purchase:${redemption.id}`,
        },
      });
      const inventory = await tx.growthInventoryTransaction.aggregate({
        where: { userId, itemId: reward.id },
        _sum: { quantity: true },
      });
      return {
        ...redemption,
        coinBalance: (balance._sum.amount ?? 0) - reward.price,
        inventoryQuantity: inventory._sum.quantity ?? 0,
      };
    });
  }

  // ─── Inventory ─────────────────────────────────────────────────────────────

  async listInventory(userId: string) {
    const balances = await this.db.growthInventoryTransaction.groupBy({
      by: ['itemId'],
      where: { userId },
      _sum: { quantity: true },
    });
    const positive = balances.filter((balance) => (balance._sum.quantity ?? 0) > 0);
    const items = await this.db.growthShopReward.findMany({
      where: { userId, id: { in: positive.map((balance) => balance.itemId) } },
      include: { category: true },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));
    return positive
      .map((balance) => ({ item: itemById.get(balance.itemId), quantity: balance._sum.quantity ?? 0 }))
      .filter((balance) => balance.item)
      .sort((a, b) => (a.item?.sortOrder ?? 0) - (b.item?.sortOrder ?? 0));
  }

  async listInventoryHistory(userId: string, options?: any) {
    return this.db.growthInventoryTransaction.findMany({
      where: { userId },
      include: { item: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options?.limit ?? 50,
    });
  }

  async consumeInventoryItem(userId: string, itemId: string, idempotencyKey: string) {
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.growthShopReward.findFirst({ where: { id: itemId, userId, archivedAt: null } });
      if (!item) throw new Error('Inventory item not found');
      const entryKey = `inventory:consume:${itemId}:${idempotencyKey}`;
      const existing = await tx.growthInventoryTransaction.findUnique({
        where: { userId_entryKey: { userId, entryKey } },
      });
      const balance = await tx.growthInventoryTransaction.aggregate({
        where: { userId, itemId },
        _sum: { quantity: true },
      });
      if (existing) return { item, quantity: balance._sum.quantity ?? 0, transaction: existing };
      if ((balance._sum.quantity ?? 0) < 1) throw new Error('This item is no longer available in your inventory');
      const transaction = await tx.growthInventoryTransaction.create({
        data: {
          id: createUlid(),
          userId,
          itemId,
          quantity: -1,
          kind: 'CONSUMPTION',
          sourceType: 'INVENTORY',
          sourceId: itemId,
          entryKey,
        },
      });
      return { item, quantity: (balance._sum.quantity ?? 0) - 1, transaction };
    });
  }

  // ─── Shared ────────────────────────────────────────────────────────────────

  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    maxRetries = 5,
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        return await this.db.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < maxRetries - 1
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Unable to complete the inventory operation');
  }
}
