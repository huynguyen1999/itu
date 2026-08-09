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
import { JournalEntryKind, TransactionType, PaymentMethod, ExpenseCategory } from '@prisma/client';

const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: 'Utensils', color: 'EMERALD' },
  { name: 'Transport', icon: 'Car', color: 'BLUE' },
  { name: 'Shopping', icon: 'ShoppingBag', color: 'VIOLET' },
  { name: 'Bills', icon: 'Receipt', color: 'AMBER' },
  { name: 'Health', icon: 'Heart', color: 'ROSE' },
  { name: 'Education', icon: 'GraduationCap', color: 'INDIGO' },
  { name: 'Entertainment', icon: 'Tv', color: 'TEAL' },
  { name: 'Fitness', icon: 'Dumbbell', color: 'EMERALD' },
  { name: 'Travel', icon: 'Plane', color: 'SLATE' },
  { name: 'Other', icon: 'Folder', color: 'SLATE' },
];

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
    const expense = e.expense || {};
    return {
      id: e.id,
      userId: e.userId,
      type: expense.type || 'EXPENSE',
      amount: Number(expense.amount || 0),
      currency: expense.currency || 'VND',
      category: expense.categoryRel?.name || expense.category || 'OTHER',
      categoryId: expense.categoryId || null,
      merchant: expense.merchant || null,
      paymentMethod: expense.paymentMethod || 'CASH',
      transactionAt: expense.transactionAt || e.entryDate,
      note: e.contentMarkdown || null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  async getCategories(userId: string): Promise<BudgetCategoryDomain[]> {
    let categories = await this.prisma.budgetCategory.findMany({
      where: { userId, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
    });

    if (categories.length === 0) {
      // Seed default categories for new user
      await this.prisma.budgetCategory.createMany({
        data: DEFAULT_CATEGORIES.map((cat, idx) => ({
          id: createUlid(),
          userId,
          name: cat.name,
          type: TransactionType.EXPENSE,
          icon: cat.icon,
          color: cat.color,
          sortOrder: idx,
        })),
        skipDuplicates: true,
      });

      categories = await this.prisma.budgetCategory.findMany({
        where: { userId, archivedAt: null },
        orderBy: { sortOrder: 'asc' },
      });
    }

    return categories.map((c) => this.mapCategory(c));
  }

  async createCategory(userId: string, dto: CreateCategoryDto): Promise<BudgetCategoryDomain> {
    const count = await this.prisma.budgetCategory.count({ where: { userId } });
    const category = await this.prisma.budgetCategory.create({
      data: {
        id: createUlid(),
        userId,
        name: dto.name,
        type: (dto.type as TransactionType) || TransactionType.EXPENSE,
        icon: dto.icon || null,
        color: dto.color || 'TEAL',
        sortOrder: dto.sortOrder ?? count,
      },
    });
    return this.mapCategory(category);
  }

  async updateCategory(userId: string, id: string, dto: UpdateCategoryDto): Promise<BudgetCategoryDomain> {
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
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
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
      data: { archivedAt: new Date() },
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
          overallLimit: 0,
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
      overallLimit: Number(period.overallLimit),
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
      version: period.version ?? 1,
      categoryBudgets: period.categoryBudgets.map((cb) => ({
        id: cb.id,
        budgetPeriodId: cb.budgetPeriodId,
        categoryId: cb.categoryId,
        limit: Number(cb.limit),
        createdAt: cb.createdAt,
        updatedAt: cb.updatedAt,
        category: cb.category ? this.mapCategory(cb.category) : undefined,
      })),
    };
  }

  async updatePeriod(userId: string, periodStr: string, overallLimit: number): Promise<BudgetPeriodDomain> {
    await this.prisma.budgetPeriod.upsert({
      where: { userId_period: { userId, period: periodStr } },
      create: {
        id: createUlid(),
        userId,
        period: periodStr,
        currency: 'VND',
        overallLimit,
      },
      update: {
        overallLimit,
      },
    });
    return this.getPeriod(userId, periodStr);
  }

  async updateCategoryLimit(userId: string, periodStr: string, categoryId: string, limit: number): Promise<BudgetPeriodDomain> {
    const period = await this.getPeriod(userId, periodStr);
    await this.prisma.budgetCategoryLimit.upsert({
      where: { budgetPeriodId_categoryId: { budgetPeriodId: period.id, categoryId } },
      create: {
        id: createUlid(),
        budgetPeriodId: period.id,
        categoryId,
        limit,
      },
      update: {
        limit,
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
    const where: any = {
      userId,
      kind: JournalEntryKind.EXPENSE,
      deletedAt: null,
    };

    if (options?.categoryId) {
      where.expense = { categoryId: options.categoryId };
    }

    if (options?.type) {
      where.expense = { ...where.expense, type: options.type };
    }

    if (options?.period) {
      const [year, month] = options.period.split('-').map(Number);
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      where.entryDate = { gte: startDate, lte: endDate };
    }

    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: {
        expense: {
          include: { categoryRel: true },
        },
      },
      orderBy: { entryDate: 'desc' },
    });

    return entries.map((e) => this.mapTransaction(e));
  }

  async getTransactionById(userId: string, id: string): Promise<BudgetTransactionDomain | null> {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, userId, kind: JournalEntryKind.EXPENSE, deletedAt: null },
      include: { expense: { include: { categoryRel: true } } },
    });
    return entry ? this.mapTransaction(entry) : null;
  }

  async createTransaction(userId: string, dto: CreateTransactionDto): Promise<BudgetTransactionDomain> {
    const entryId = createUlid();
    const transactionAt = dto.transactionAt ? new Date(dto.transactionAt) : new Date();

    // Map category string fallback enum
    let enumCat: ExpenseCategory = ExpenseCategory.OTHER;
    if (dto.categoryId) {
      const dbCat = await this.prisma.budgetCategory.findUnique({ where: { id: dto.categoryId } });
      if (dbCat) {
        const catUpper = dbCat.name.toUpperCase();
        if (Object.values(ExpenseCategory).includes(catUpper as any)) {
          enumCat = catUpper as ExpenseCategory;
        }
      }
    }

    const entry = await this.prisma.journalEntry.create({
      data: {
        id: entryId,
        userId,
        kind: JournalEntryKind.EXPENSE,
        title: dto.merchant || 'Expense',
        contentMarkdown: dto.note || '',
        entryDate: transactionAt,
        expense: {
          create: {
            type: (dto.type as TransactionType) || TransactionType.EXPENSE,
            amount: dto.amount,
            currency: dto.currency || 'VND',
            category: enumCat,
            categoryId: dto.categoryId || null,
            merchant: dto.merchant || null,
            paymentMethod: (dto.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
            transactionAt,
          },
        },
      },
      include: { expense: { include: { categoryRel: true } } },
    });

    return this.mapTransaction(entry);
  }

  async updateTransaction(userId: string, id: string, dto: UpdateTransactionDto): Promise<BudgetTransactionDomain> {
    const existing = await this.getTransactionById(userId, id);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }

    const updateData: any = {};
    const expenseData: any = {};

    if (dto.merchant !== undefined) {
      updateData.title = dto.merchant || 'Expense';
      expenseData.merchant = dto.merchant;
    }
    if (dto.note !== undefined) {
      updateData.contentMarkdown = dto.note;
    }
    if (dto.transactionAt !== undefined) {
      updateData.entryDate = new Date(dto.transactionAt);
      expenseData.transactionAt = new Date(dto.transactionAt);
    }
    if (dto.type !== undefined) expenseData.type = dto.type as TransactionType;
    if (dto.amount !== undefined) expenseData.amount = dto.amount;
    if (dto.currency !== undefined) expenseData.currency = dto.currency;
    if (dto.paymentMethod !== undefined) expenseData.paymentMethod = dto.paymentMethod as PaymentMethod;
    if (dto.categoryId !== undefined) {
      expenseData.categoryId = dto.categoryId;
      const dbCat = await this.prisma.budgetCategory.findUnique({ where: { id: dto.categoryId } });
      if (dbCat) {
        const catUpper = dbCat.name.toUpperCase();
        if (Object.values(ExpenseCategory).includes(catUpper as any)) {
          expenseData.category = catUpper as ExpenseCategory;
        }
      }
    }

    const entry = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        ...updateData,
        version: { increment: 1 },
        expense: {
          update: expenseData,
        },
      },
      include: { expense: { include: { categoryRel: true } } },
    });

    return this.mapTransaction(entry);
  }

  async deleteTransaction(userId: string, id: string): Promise<void> {
    await this.prisma.journalEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getOverview(userId: string, periodStr: string): Promise<BudgetOverviewDomain> {
    const period = await this.getPeriod(userId, periodStr);
    const categories = await this.getCategories(userId);
    const transactions = await this.getTransactions(userId, { period: periodStr });

    let totalIncome = 0;
    let totalSpent = 0;
    const spentByCategory: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.type === 'INCOME') {
        totalIncome += tx.amount;
      } else {
        totalSpent += tx.amount;
        if (tx.categoryId) {
          spentByCategory[tx.categoryId] = (spentByCategory[tx.categoryId] || 0) + tx.amount;
        }
      }
    }

    const categoryStats: CategoryOverviewStat[] = categories.map((cat) => {
      const limitObj = period.categoryBudgets.find((cb) => cb.categoryId === cat.id);
      const budget = limitObj ? limitObj.limit : 0;
      const spent = spentByCategory[cat.id] || 0;
      const remaining = Math.max(0, budget - spent);
      const percentage = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100 * 10) / 10) : 0;

      return {
        category: cat,
        budget,
        spent,
        remaining,
        percentage,
      };
    });

    return {
      period: periodStr,
      currency: period.currency || 'VND',
      income: totalIncome,
      spent: totalSpent,
      overallBudget: period.overallLimit,
      remainingBudget: Math.max(0, period.overallLimit - totalSpent),
      categories: categoryStats,
    };
  }
}
