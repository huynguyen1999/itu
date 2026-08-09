import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  IBudgetRepositoryPort,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateTransactionDto,
  UpdateTransactionDto,
} from '@core/application/ports/out/budget-repository.port';
import {
  BudgetCategoryDomain,
  BudgetPeriodDomain,
  BudgetTransactionDomain,
  BudgetOverviewDomain,
  CategoryOverviewStat,
} from '@core/domain/budget/budget.domain';
import { createUlid } from './ulid';
import { Prisma, TransactionType, PaymentMethod } from '@prisma/client';
import { recordSyncChange } from './prisma-sync-mutation.shared';
import { hcmcMonthBounds } from '@core/application/utils/calendar';

export const BUDGET_CATEGORY_CATALOG = [
  { name: 'Food', icon: 'food', color: 'EMERALD' },
  { name: 'Transport', icon: 'transport', color: 'BLUE' },
  { name: 'Shopping', icon: 'shopping', color: 'VIOLET' },
  { name: 'Bills', icon: 'bills', color: 'AMBER' },
  { name: 'Health', icon: 'health', color: 'ROSE' },
  { name: 'Education', icon: 'education', color: 'INDIGO' },
  { name: 'Entertainment', icon: 'entertainment', color: 'TEAL' },
  { name: 'Fitness', icon: 'fitness', color: 'EMERALD' },
  { name: 'Travel', icon: 'travel', color: 'SLATE' },
  { name: 'Other', icon: 'other', color: 'SLATE' },
];
const CATEGORY_ICONS = new Set(BUDGET_CATEGORY_CATALOG.map((item) => item.icon));
const CATEGORY_COLORS = new Set(['EMERALD', 'BLUE', 'VIOLET', 'AMBER', 'ROSE', 'INDIGO', 'TEAL', 'SLATE']);
function validateCategoryVisuals(icon?: string | null, color?: string | null): void {
  if (icon !== undefined && icon !== null && !CATEGORY_ICONS.has(icon)) throw new Error('Unsupported budget category icon');
  if (color !== undefined && color !== null && !CATEGORY_COLORS.has(color.toUpperCase())) throw new Error('Unsupported budget category color');
}

@Injectable()
export class PrismaBudgetRepository implements IBudgetRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private mapCategory(c: any): BudgetCategoryDomain {
    return {
      id: c.id,
      userId: c.userId,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      sortOrder: c.sortOrder,
      archivedAt: c.archivedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      version: c.version ?? 1,
    };
  }

  private mapTransaction(e: any): BudgetTransactionDomain {
    return {
      id: e.id,
      userId: e.userId,
      type: e.type || 'EXPENSE',
      amount: new Prisma.Decimal(e.amount || 0).toFixed(2),
      currency: e.currency || 'VND',
      category: e.categoryRel?.name || 'OTHER',
      categoryId: e.categoryId || null,
      merchant: e.merchant || null,
      paymentMethod: e.paymentMethod || 'CASH',
      transactionAt: e.transactionAt,
      note: e.note || null,
      version: e.version ?? 1,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      deletedAt: e.deletedAt || null,
    };
  }

  async getCategories(userId: string): Promise<BudgetCategoryDomain[]> {
    let categories = await this.prisma.budgetCategory.findMany({
      where: { userId, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
    });

    return categories.map((c) => this.mapCategory(c));
  }

  async createCategory(userId: string, dto: CreateCategoryDto): Promise<BudgetCategoryDomain> {
    validateCategoryVisuals(dto.icon, dto.color);
    const count = await this.prisma.budgetCategory.count({ where: { userId } });
    const category = await this.prisma.budgetCategory.create({
      data: {
        id: createUlid(),
        userId,
        name: dto.name,
        type: (dto.type as TransactionType) || TransactionType.EXPENSE,
        icon: dto.icon || null,
        color: dto.color ? dto.color.toUpperCase() : 'TEAL',
        sortOrder: dto.sortOrder ?? count,
      },
    });
    return this.mapCategory(category);
  }

  async updateCategory(userId: string, id: string, dto: UpdateCategoryDto): Promise<BudgetCategoryDomain> {
    validateCategoryVisuals(dto.icon, dto.color);
    const existing = await this.prisma.budgetCategory.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new Error(`Category ${id} not found`);
    }

    const category = await this.prisma.budgetCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type as TransactionType } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.color !== undefined ? { color: dto.color.toUpperCase() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        version: { increment: 1 },
      },
    });
    return this.mapCategory(category);
  }

  async archiveCategory(userId: string, id: string): Promise<BudgetCategoryDomain> {
    const existing = await this.prisma.budgetCategory.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new Error(`Category ${id} not found`);
    }

    const category = await this.prisma.budgetCategory.update({
      where: { id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    return this.mapCategory(category);
  }

  async reorderCategories(userId: string, categoryIds: string[]): Promise<BudgetCategoryDomain[]> {
    const userCategories = await this.prisma.budgetCategory.findMany({
      where: { userId, id: { in: categoryIds } },
    });
    const validIds = new Set(userCategories.map((c) => c.id));

    await this.prisma.$transaction(
      categoryIds.filter((id) => validIds.has(id)).map((id, index) =>
        this.prisma.budgetCategory.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getCategories(userId);
  }

  async getPeriod(userId: string, periodStr: string): Promise<BudgetPeriodDomain> {
    let period = await this.prisma.budgetPeriod.findUnique({
      where: { userId_period: { userId, period: periodStr } },
      include: {
        categoryBudgets: {
          include: { category: true },
        },
      },
    });

    if (!period) {
      period = await this.prisma.budgetPeriod.create({
        data: {
          id: createUlid(),
          userId,
          period: periodStr,
          currency: 'VND',
          overallLimit: '0.00',
        },
        include: {
          categoryBudgets: {
            include: { category: true },
          },
        },
      });
    }

    return {
      id: period.id,
      userId: period.userId,
      period: period.period,
      currency: period.currency,
      overallLimit: new Prisma.Decimal(period.overallLimit).toFixed(2),
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
      version: period.version ?? 1,
      categoryBudgets: period.categoryBudgets.map((cb) => ({
        id: cb.id,
        budgetPeriodId: cb.budgetPeriodId,
        categoryId: cb.categoryId,
        limit: new Prisma.Decimal(cb.limit).toFixed(2),
        createdAt: cb.createdAt,
        updatedAt: cb.updatedAt,
        category: cb.category ? this.mapCategory(cb.category) : undefined,
      })),
    };
  }

  async updatePeriod(userId: string, periodStr: string, overallLimit: string): Promise<BudgetPeriodDomain> {
    await this.prisma.budgetPeriod.upsert({
      where: { userId_period: { userId, period: periodStr } },
      create: {
        id: createUlid(),
        userId,
        period: periodStr,
        currency: 'VND',
          overallLimit: new Prisma.Decimal(overallLimit),
      },
      update: {
          overallLimit: new Prisma.Decimal(overallLimit),
        version: { increment: 1 },
      },
    });
    return this.getPeriod(userId, periodStr);
  }

  async updateCategoryLimit(userId: string, periodStr: string, categoryId: string, limit: string): Promise<BudgetPeriodDomain> {
    const period = await this.getPeriod(userId, periodStr);
    await this.prisma.budgetCategoryLimit.upsert({
      where: { budgetPeriodId_categoryId: { budgetPeriodId: period.id, categoryId } },
      create: {
        id: createUlid(),
        budgetPeriodId: period.id,
        categoryId,
          limit: new Prisma.Decimal(limit),
      },
      update: {
          limit: new Prisma.Decimal(limit),
      },
    });
    return this.getPeriod(userId, periodStr);
  }

  async deleteCategoryLimit(userId: string, periodStr: string, categoryId: string): Promise<BudgetPeriodDomain> {
    const period = await this.getPeriod(userId, periodStr);
    await this.prisma.budgetCategoryLimit.deleteMany({
      where: { budgetPeriodId: period.id, categoryId },
    });
    return this.getPeriod(userId, periodStr);
  }

  async getTransactions(userId: string, options?: { period?: string; categoryId?: string; type?: 'EXPENSE' | 'INCOME' }): Promise<BudgetTransactionDomain[]> {
    const where: any = { userId, deletedAt: null };

    if (options?.categoryId) {
      where.categoryId = options.categoryId;
    }

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.period) {
      const bounds = hcmcMonthBounds(options.period);
      where.transactionAt = { gte: bounds.start, lt: bounds.end };
    }

    const entries = await this.prisma.budgetTransaction.findMany({
      where,
      include: { categoryRel: true },
      orderBy: { transactionAt: 'desc' },
    });

    return entries.map((e) => this.mapTransaction(e));
  }

  async getTransactionById(userId: string, id: string): Promise<BudgetTransactionDomain | null> {
    const entry = await this.prisma.budgetTransaction.findFirst({
      where: { id, userId, deletedAt: null },
      include: { categoryRel: true },
    });
    return entry ? this.mapTransaction(entry) : null;
  }

  async createTransaction(userId: string, dto: CreateTransactionDto): Promise<BudgetTransactionDomain> {
    const entryId = createUlid();
    const transactionAt = dto.transactionAt ? new Date(dto.transactionAt) : new Date();

    const dbCat = await this.prisma.budgetCategory.findUnique({ where: { id: dto.categoryId } });
    if (!dbCat || dbCat.userId !== userId) throw new Error(`Category ${dto.categoryId} not found`);
    const entry = await this.prisma.budgetTransaction.create({
      data: {
        id: entryId,
        userId,
        type: (dto.type as TransactionType) || TransactionType.EXPENSE,
        amount: dto.amount,
        currency: dto.currency || 'VND',
        categoryId: dto.categoryId,
        merchant: dto.merchant || null,
        paymentMethod: (dto.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
        transactionAt,
        note: dto.note || null,
      },
      include: { categoryRel: true },
    });
    const mapped = this.mapTransaction(entry);
    await this.prisma.$transaction(async (tx) => recordSyncChange(tx, userId, 'budgettransaction', entry.id, 'UPSERT', entry));
    return mapped;
  }

  async updateTransaction(userId: string, id: string, dto: UpdateTransactionDto): Promise<BudgetTransactionDomain> {
    const existing = await this.getTransactionById(userId, id);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }

    const updateData: any = {};

    if (dto.merchant !== undefined) {
      updateData.merchant = dto.merchant;
    }
    if (dto.note !== undefined) {
      updateData.note = dto.note;
    }
    if (dto.transactionAt !== undefined) {
      updateData.transactionAt = new Date(dto.transactionAt);
    }
    if (dto.type !== undefined) updateData.type = dto.type as TransactionType;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.paymentMethod !== undefined) updateData.paymentMethod = dto.paymentMethod as PaymentMethod;
    if (dto.categoryId !== undefined) {
      const dbCat = await this.prisma.budgetCategory.findUnique({ where: { id: dto.categoryId } });
      if (!dbCat || dbCat.userId !== userId) throw new Error(`Category ${dto.categoryId} not found`);
      updateData.categoryId = dto.categoryId;
    }

    const entry = await this.prisma.budgetTransaction.update({
      where: { id },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
      include: { categoryRel: true },
    });
    await this.prisma.$transaction(async (tx) => recordSyncChange(tx, userId, 'budgettransaction', entry.id, 'UPSERT', entry));
    return this.mapTransaction(entry);
  }

  async deleteTransaction(userId: string, id: string): Promise<void> {
    await this.prisma.budgetTransaction.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await this.prisma.$transaction(async (tx) => recordSyncChange(tx, userId, 'budgettransaction', id, 'DELETE', { id }));
  }

  async getOverview(userId: string, periodStr: string): Promise<BudgetOverviewDomain> {
    const period = await this.getPeriod(userId, periodStr);
    const categories = await this.getCategories(userId);
    const transactions = await this.getTransactions(userId, { period: periodStr });

    let totalIncome = new Prisma.Decimal(0);
    let totalSpent = new Prisma.Decimal(0);
    const spentByCategory: Record<string, Prisma.Decimal> = {};

    for (const tx of transactions) {
      if (tx.type === 'INCOME') {
        totalIncome = totalIncome.add(new Prisma.Decimal(tx.amount));
      } else {
        totalSpent = totalSpent.add(new Prisma.Decimal(tx.amount));
        if (tx.categoryId) {
          spentByCategory[tx.categoryId] = (spentByCategory[tx.categoryId] || new Prisma.Decimal(0)).add(new Prisma.Decimal(tx.amount));
        }
      }
    }

    const categoryStats: CategoryOverviewStat[] = categories.map((cat) => {
      const limitObj = period.categoryBudgets.find((cb) => cb.categoryId === cat.id);
      const budget = new Prisma.Decimal(limitObj ? limitObj.limit : 0);
      const spent = spentByCategory[cat.id] || new Prisma.Decimal(0);
      const remaining = budget.sub(spent).greaterThan(0) ? budget.sub(spent) : new Prisma.Decimal(0);
      const percentage = budget.greaterThan(0) ? Math.min(100, Math.round(spent.div(budget).toNumber() * 100 * 10) / 10) : 0;

      return {
        category: cat,
        budget: budget.toFixed(2),
        spent: spent.toFixed(2),
        remaining: remaining.toFixed(2),
        percentage,
      };
    });

    return {
      period: periodStr,
      currency: period.currency || 'VND',
      income: totalIncome.toFixed(2),
      spent: totalSpent.toFixed(2),
      overallBudget: new Prisma.Decimal(period.overallLimit).toFixed(2),
      remainingBudget: (new Prisma.Decimal(period.overallLimit).sub(totalSpent).greaterThan(0) ? new Prisma.Decimal(period.overallLimit).sub(totalSpent) : new Prisma.Decimal(0)).toFixed(2),
      categories: categoryStats,
    };
  }
}
