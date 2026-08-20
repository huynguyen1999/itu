import { Injectable } from '@nestjs/common';
import { PrismaBudgetMappers } from './prisma-budget-mappers';
import { PaymentMethod as PrismaPaymentMethod, Prisma, RecurringFrequency as PrismaRecurringFrequency } from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { hcmcCurrentPeriod } from '@core/application/utils/calendar';
import { advanceRecurringDate } from '@core/domain/budget/recurrence';
import type {
  BudgetCategorySummaryDomain,
  BudgetReportDomain,
  BudgetStatisticsDomain,
  BudgetSummaryDomain,
  CategoryBudgetLimitDomain,
  ExpenseCategoryDomain,
  ExpenseDomain,
  MonthlyBudgetDomain,
  PaymentMethod,
  RecurringExpenseDomain,
} from '@core/domain/budget/budget.domain';
import type {
  CreateCategoryDto,
  CreateExpenseDto,
  CreateRecurringExpenseDto,
  ExpenseFilters,
  IBudgetRepositoryPort,
  UpdateCategoryDto,
  UpdateExpenseDto,
  UpdateRecurringExpenseDto,
} from '@core/application/ports/out/budget-repository.port';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import { recordSyncChange } from './prisma-sync-mutation.shared';
import {
  BUDGET_CATEGORY_CATALOG,
  asDateOnly,
  asMoney,
  assertBudgetPeriod,
  dateOnlyMonthBounds,
  previousPeriod,
  validatePaymentMethod,
  validateVisuals,
} from './prisma-budget.shared';

@Injectable()
export class PrismaBudgetRepository extends PrismaBudgetMappers implements IBudgetRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }


  private async category(userId: string, id: string, tx = this.prisma) {
    const category = await tx.expenseCategory.findFirst({ where: { id, userId } });
    if (!category) throw new EntityNotFoundException('Expense category', id);
    return category;
  }

  private async ensureDefaultCategories(userId: string): Promise<void> {
    const count = await this.prisma.expenseCategory.count({ where: { userId } });
    if (count > 0) return;
    await this.prisma.expenseCategory.createMany({
      data: BUDGET_CATEGORY_CATALOG.map((category, sortOrder) => ({
        id: createUlid(), userId, name: category.name, icon: category.icon, color: category.color, sortOrder,
      })),
      skipDuplicates: true,
    });
  }

  async getCategories(userId: string) {
    await this.ensureDefaultCategories(userId);
    const values = await this.prisma.expenseCategory.findMany({ where: { userId, archivedAt: null }, orderBy: { sortOrder: 'asc' } });
    return values.map((value) => this.mapCategory(value));
  }

  async createCategory(userId: string, dto: CreateCategoryDto) {
    validateVisuals(dto.icon, dto.color);
    const count = await this.prisma.expenseCategory.count({ where: { userId } });
    const value = await this.prisma.expenseCategory.create({ data: { id: createUlid(), userId, name: dto.name.trim(), icon: dto.icon ?? null, color: dto.color?.toUpperCase() ?? 'TEAL', sortOrder: dto.sortOrder ?? count } });
    return this.mapCategory(value);
  }

  async updateCategory(userId: string, id: string, dto: UpdateCategoryDto) {
    await this.category(userId, id);
    validateVisuals(dto.icon, dto.color);
    const value = await this.prisma.expenseCategory.update({ where: { id }, data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.icon !== undefined ? { icon: dto.icon } : {}), ...(dto.color !== undefined ? { color: dto.color.toUpperCase() } : {}), ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}), version: { increment: 1 } } });
    return this.mapCategory(value);
  }

  async archiveCategory(userId: string, id: string) {
    await this.category(userId, id);
    const value = await this.prisma.expenseCategory.update({ where: { id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
    return this.mapCategory(value);
  }

  async reorderCategories(userId: string, categoryIds: string[]) {
    await this.prisma.$transaction(categoryIds.map((id, sortOrder) => this.prisma.expenseCategory.updateMany({ where: { id, userId }, data: { sortOrder, version: { increment: 1 } } })));
    return this.getCategories(userId);
  }

  async getMonthlyBudget(userId: string, period: string) {
    assertBudgetPeriod(period);
    const value = await this.prisma.monthlyBudget.upsert({ where: { userId_period: { userId, period } }, create: { id: createUlid(), userId, period }, update: {}, include: { categoryLimits: { include: { category: true } } } });
    return this.mapMonthlyBudget(value);
  }

  async updateMonthlyBudget(userId: string, period: string, overallLimit: string | null) {
    assertBudgetPeriod(period);
    const value = await this.prisma.monthlyBudget.upsert({ where: { userId_period: { userId, period } }, create: { id: createUlid(), userId, period, overallLimit }, update: { overallLimit, version: { increment: 1 } }, include: { categoryLimits: { include: { category: true } } } });
    return this.mapMonthlyBudget(value);
  }

  async updateCategoryLimit(userId: string, period: string, categoryId: string, limit: string) {
    assertBudgetPeriod(period);
    await this.category(userId, categoryId);
    const monthlyBudget = await this.prisma.monthlyBudget.upsert({ where: { userId_period: { userId, period } }, create: { id: createUlid(), userId, period }, update: {} });
    const value = await this.prisma.categoryBudgetLimit.upsert({ where: { monthlyBudgetId_categoryId: { monthlyBudgetId: monthlyBudget.id, categoryId } }, create: { id: createUlid(), monthlyBudgetId: monthlyBudget.id, categoryId, limit }, update: { limit, version: { increment: 1 } }, include: { category: true } });
    return this.mapLimit(value);
  }

  async deleteCategoryLimit(userId: string, period: string, categoryId: string) {
    assertBudgetPeriod(period);
    const monthlyBudget = await this.prisma.monthlyBudget.findUnique({ where: { userId_period: { userId, period } } });
    if (monthlyBudget) await this.prisma.categoryBudgetLimit.deleteMany({ where: { monthlyBudgetId: monthlyBudget.id, categoryId } });
  }

  async getExpenses(userId: string, filters: ExpenseFilters = {}) {
    const where: Prisma.ExpenseWhereInput = { userId, deletedAt: null };
    if (filters.period) { assertBudgetPeriod(filters.period); const bounds = dateOnlyMonthBounds(filters.period); where.expenseDate = { gte: bounds.start, lt: bounds.end }; }
    if (filters.from || filters.to) where.expenseDate = { ...(where.expenseDate as Prisma.DateTimeFilter ?? {}), ...(filters.from ? { gte: asDateOnly(filters.from) } : {}), ...(filters.to ? { lte: asDateOnly(filters.to) } : {}) };
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod as PrismaPaymentMethod;
    const search = filters.search ?? filters.merchant;
    if (search) where.OR = [{ merchant: { contains: search, mode: 'insensitive' } }, { note: { contains: search, mode: 'insensitive' } }];
    const values = await this.prisma.expense.findMany({ where, include: { category: true }, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }] });
    return values.map((value) => this.mapExpense(value));
  }

  async getExpense(userId: string, id: string, includeDeleted = false) {
    const value = await this.prisma.expense.findFirst({ where: { id, userId, ...(includeDeleted ? {} : { deletedAt: null }) }, include: { category: true } });
    return value ? this.mapExpense(value) : null;
  }

  async createExpense(userId: string, dto: CreateExpenseDto) {
    await this.category(userId, dto.categoryId);
    const value = await this.prisma.expense.create({ data: { id: createUlid(), userId, categoryId: dto.categoryId, amount: dto.amount, merchant: dto.merchant ?? null, paymentMethod: validatePaymentMethod(dto.paymentMethod) as PrismaPaymentMethod, expenseDate: asDateOnly(dto.expenseDate), note: dto.note ?? null, recurringExpenseId: dto.recurringExpenseId, recurringOccurrenceDate: dto.recurringOccurrenceDate ? asDateOnly(dto.recurringOccurrenceDate) : undefined }, include: { category: true } });
    return this.mapExpense(value);
  }

  async updateExpense(userId: string, id: string, dto: UpdateExpenseDto) {
    const existing = await this.prisma.expense.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw new EntityNotFoundException('Expense', id);
    if (dto.categoryId) await this.category(userId, dto.categoryId);
    const value = await this.prisma.expense.update({ where: { id }, data: { ...(dto.amount !== undefined ? { amount: dto.amount } : {}), ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}), ...(dto.merchant !== undefined ? { merchant: dto.merchant } : {}), ...(dto.paymentMethod !== undefined ? { paymentMethod: validatePaymentMethod(dto.paymentMethod) as PrismaPaymentMethod } : {}), ...(dto.expenseDate !== undefined ? { expenseDate: asDateOnly(dto.expenseDate) } : {}), ...(dto.note !== undefined ? { note: dto.note } : {}), version: { increment: 1 } }, include: { category: true } });
    return this.mapExpense(value);
  }

  async deleteExpense(userId: string, id: string) {
    const result = await this.prisma.expense.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    if (!result.count) throw new EntityNotFoundException('Expense', id);
  }

  async restoreExpense(userId: string, id: string) {
    const result = await this.prisma.expense.updateMany({ where: { id, userId, deletedAt: { not: null } }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } } });
    if (!result.count) return null;
    return this.getExpense(userId, id);
  }

  async getRecurringExpenses(userId: string) {
    const values = await this.prisma.recurringExpense.findMany({ where: { userId, archivedAt: null }, include: { category: true }, orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }] });
    return values.map((value) => this.mapRecurring(value));
  }

  async createRecurringExpense(userId: string, dto: CreateRecurringExpenseDto) {
    await this.category(userId, dto.categoryId);
    const startDate = asDateOnly(dto.startDate);
    const value = await this.prisma.recurringExpense.create({ data: { id: createUlid(), userId, name: dto.name ?? null, categoryId: dto.categoryId, amount: dto.amount, merchant: dto.merchant ?? null, paymentMethod: validatePaymentMethod(dto.paymentMethod) as PrismaPaymentMethod, note: dto.note ?? null, frequency: dto.frequency as PrismaRecurringFrequency, startDate, nextDueDate: dto.nextDueDate ? asDateOnly(dto.nextDueDate) : startDate }, include: { category: true } });
    return this.mapRecurring(value);
  }

  async updateRecurringExpense(userId: string, id: string, dto: UpdateRecurringExpenseDto) {
    const existing = await this.prisma.recurringExpense.findFirst({ where: { id, userId, archivedAt: null } });
    if (!existing) throw new EntityNotFoundException('Recurring expense', id);
    if (dto.categoryId) await this.category(userId, dto.categoryId);
    const value = await this.prisma.recurringExpense.update({ where: { id }, data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}), ...(dto.amount !== undefined ? { amount: dto.amount } : {}), ...(dto.merchant !== undefined ? { merchant: dto.merchant } : {}), ...(dto.paymentMethod !== undefined ? { paymentMethod: validatePaymentMethod(dto.paymentMethod) as PrismaPaymentMethod } : {}), ...(dto.note !== undefined ? { note: dto.note } : {}), ...(dto.frequency !== undefined ? { frequency: dto.frequency as PrismaRecurringFrequency } : {}), ...(dto.startDate !== undefined ? { startDate: asDateOnly(dto.startDate) } : {}), ...(dto.nextDueDate !== undefined ? { nextDueDate: asDateOnly(dto.nextDueDate) } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}), version: { increment: 1 } }, include: { category: true } });
    return this.mapRecurring(value);
  }

  async archiveRecurringExpense(userId: string, id: string) {
    const existing = await this.prisma.recurringExpense.findFirst({ where: { id, userId, archivedAt: null } });
    if (!existing) throw new EntityNotFoundException('Recurring expense', id);
    const value = await this.prisma.recurringExpense.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } }, include: { category: true } });
    return this.mapRecurring(value);
  }

  async confirmRecurringOccurrence(userId: string, id: string, occurrenceDate?: Date) {
    return this.prisma.$transaction(async (tx) => {
      const recurring = await tx.recurringExpense.findFirst({ where: { id, userId, archivedAt: null, isActive: true }, include: { category: true } });
      if (!recurring) throw new EntityNotFoundException('Recurring expense', id);
      const date = asDateOnly(occurrenceDate ?? recurring.nextDueDate);
      const existing = await tx.expense.findFirst({ where: { userId, recurringExpenseId: id, recurringOccurrenceDate: date }, include: { category: true } });
      if (existing) return this.mapExpense(existing);
      if (date.getTime() !== asDateOnly(recurring.nextDueDate).getTime()) throw new DomainException('Recurring occurrence is no longer current', 'STALE_RECURRING_OCCURRENCE', 409);
      const expense = await tx.expense.create({ data: { id: createUlid(), userId, categoryId: recurring.categoryId, amount: recurring.amount, merchant: recurring.merchant, paymentMethod: recurring.paymentMethod, expenseDate: date, note: recurring.note, recurringExpenseId: recurring.id, recurringOccurrenceDate: date }, include: { category: true } });
      const nextDueDate = advanceRecurringDate(date, recurring.frequency, recurring.startDate);
      const updated = await tx.recurringExpense.update({ where: { id }, data: { nextDueDate, version: { increment: 1 } }, include: { category: true } });
      await recordSyncChange(tx, userId, 'expense', expense.id, 'UPSERT', expense);
      await recordSyncChange(tx, userId, 'recurringexpense', updated.id, 'UPSERT', updated);
      return this.mapExpense(expense);
    });
  }

  async skipRecurringOccurrence(userId: string, id: string, occurrenceDate?: Date) {
    return this.prisma.$transaction(async (tx) => {
      const recurring = await tx.recurringExpense.findFirst({ where: { id, userId, archivedAt: null, isActive: true }, include: { category: true } });
      if (!recurring) throw new EntityNotFoundException('Recurring expense', id);
      const date = asDateOnly(occurrenceDate ?? recurring.nextDueDate);
      if (date.getTime() !== asDateOnly(recurring.nextDueDate).getTime()) throw new DomainException('Recurring occurrence is no longer current', 'STALE_RECURRING_OCCURRENCE', 409);
      const nextDueDate = advanceRecurringDate(date, recurring.frequency, recurring.startDate);
      const updated = await tx.recurringExpense.update({ where: { id }, data: { nextDueDate, version: { increment: 1 } }, include: { category: true } });
      await recordSyncChange(tx, userId, 'recurringexpense', updated.id, 'UPSERT', updated);
      return this.mapRecurring(updated);
    });
  }

  private async comparisonExpenses(userId: string, period: string, previous: string) {
    const currentPeriod = hcmcCurrentPeriod();
    if (period !== currentPeriod) return this.getExpenses(userId, { period: previous });
    const today = new Date();
    const day = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit' }).format(today));
    const { start, end } = dateOnlyMonthBounds(previous);
    const previousEnd = new Date(Math.min(end.getTime() - 86_400_000, start.getTime() + Math.max(day - 1, 0) * 86_400_000));
    return this.getExpenses(userId, { from: start, to: previousEnd });
  }

  async getSummary(userId: string, period: string): Promise<BudgetSummaryDomain> {
    assertBudgetPeriod(period);
    const previous = previousPeriod(period);
    const [budget, categories, expenses, previousExpenses, recurring] = await Promise.all([this.getMonthlyBudget(userId, period), this.getCategories(userId), this.getExpenses(userId, { period }), this.comparisonExpenses(userId, period, previous), this.getRecurringExpenses(userId)]);
    const total = expenses.reduce((sum, value) => sum.add(value.amount), new Prisma.Decimal(0));
    const previousTotal = previousExpenses.reduce((sum, value) => sum.add(value.amount), new Prisma.Decimal(0));
    const categoryTotals = new Map<string, Prisma.Decimal>();
    for (const expense of expenses) categoryTotals.set(expense.categoryId, (categoryTotals.get(expense.categoryId) ?? new Prisma.Decimal(0)).add(expense.amount));
    const limits = new Map(budget.categoryLimits.map((limit) => [limit.categoryId, limit.limit]));
    const categorySummary: BudgetCategorySummaryDomain[] = categories.map((category) => {
      const spent = categoryTotals.get(category.id) ?? new Prisma.Decimal(0);
      const limit = limits.get(category.id) ?? null;
      const limitDecimal = limit == null ? null : new Prisma.Decimal(limit);
      return { category, limit, spent: spent.toFixed(2), remaining: limitDecimal?.sub(spent).toFixed(2) ?? null, percentage: limitDecimal && !limitDecimal.isZero() ? Math.round(spent.div(limitDecimal).toNumber() * 1000) / 10 : null };
    });
    const overall = budget.overallLimit == null ? null : new Prisma.Decimal(budget.overallLimit);
    const change = total.sub(previousTotal);
    return { period, spent: total.toFixed(2), overallLimit: budget.overallLimit, remaining: overall?.sub(total).toFixed(2) ?? null, previousSpent: previousTotal.toFixed(2), changeAmount: change.toFixed(2), changePercentage: previousTotal.isZero() ? null : Math.round(change.div(previousTotal).toNumber() * 1000) / 10, categories: categorySummary, recentExpenses: expenses.slice(0, 5), dueRecurring: recurring.filter((value) => value.isActive && value.nextDueDate <= new Date()) };
  }

  async getReport(userId: string, period: string): Promise<BudgetReportDomain> {
    assertBudgetPeriod(period);
    const previous = previousPeriod(period);
    const [expenses, previousExpenses] = await Promise.all([this.getExpenses(userId, { period }), this.comparisonExpenses(userId, period, previous)]);
    const byDate = new Map<string, Prisma.Decimal>();
    const byCategory = new Map<string, { name: string; amount: Prisma.Decimal; count: number }>();
    const byMerchant = new Map<string, { amount: Prisma.Decimal; count: number }>();
    for (const expense of expenses) {
      const date = expense.expenseDate.toISOString().slice(0, 10);
      byDate.set(date, (byDate.get(date) ?? new Prisma.Decimal(0)).add(expense.amount));
      const category = byCategory.get(expense.categoryId) ?? { name: expense.category, amount: new Prisma.Decimal(0), count: 0 };
      category.amount = category.amount.add(expense.amount); category.count += 1; byCategory.set(expense.categoryId, category);
      if (expense.merchant?.trim()) { const merchant = expense.merchant.trim(); const item = byMerchant.get(merchant) ?? { amount: new Prisma.Decimal(0), count: 0 }; item.amount = item.amount.add(expense.amount); item.count += 1; byMerchant.set(merchant, item); }
    }
    const dates = [...byDate.keys()].sort(); let cumulative = new Prisma.Decimal(0);
    const spendingOverTime = dates.map((date) => { const amount = byDate.get(date)!; cumulative = cumulative.add(amount); return { date, amount: amount.toFixed(2), cumulative: cumulative.toFixed(2) }; });
    const total = expenses.reduce((sum, value) => sum.add(value.amount), new Prisma.Decimal(0));
    const categoryBreakdown = [...byCategory.entries()].sort((a, b) => b[1].amount.comparedTo(a[1].amount)).map(([categoryId, value]) => ({ categoryId, category: value.name, amount: value.amount.toFixed(2), percentage: total.isZero() ? 0 : Math.round(value.amount.div(total).toNumber() * 1000) / 10 }));
    const weekly = new Map<string, Prisma.Decimal>();
    for (const [date, amount] of byDate) { const day = Number(date.slice(8, 10)); const bucket = `week-${Math.ceil(day / 7)}`; weekly.set(bucket, (weekly.get(bucket) ?? new Prisma.Decimal(0)).add(amount)); }
    const previousTotal = previousExpenses.reduce((sum, value) => sum.add(value.amount), new Prisma.Decimal(0));
    const difference = total.sub(previousTotal);
    return { period, spendingOverTime, categoryBreakdown, monthlyOutflow: [...weekly.entries()].map(([bucket, amount]) => ({ bucket, amount: amount.toFixed(2) })), previousMonthComparison: { current: total.toFixed(2), previous: previousTotal.toFixed(2), difference: difference.toFixed(2), percentage: previousTotal.isZero() ? null : Math.round(difference.div(previousTotal).toNumber() * 1000) / 10 }, topMerchants: [...byMerchant.entries()].sort((a, b) => b[1].amount.comparedTo(a[1].amount)).slice(0, 5).map(([merchant, value]) => ({ merchant, amount: value.amount.toFixed(2), count: value.count })), topCategories: [...byCategory.entries()].sort((a, b) => b[1].amount.comparedTo(a[1].amount)).slice(0, 5).map(([categoryId, value]) => ({ categoryId, category: value.name, amount: value.amount.toFixed(2), count: value.count })) };
  }

  async getStatistics(userId: string, from: Date, to: Date): Promise<BudgetStatisticsDomain> {
    const dayCount = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
    const previousFrom = new Date(from.getTime() - dayCount * 86_400_000);
    const [current, previous] = await Promise.all([
      this.aggregateStatistics(userId, from, to),
      this.aggregateStatistics(userId, previousFrom, from),
    ]);
    const end = new Date(to.getTime() - 86_400_000);
    return {
      from: from.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      spent: current.total.toFixed(2),
      expenseCount: current.count,
      previousSpent: previous.total.toFixed(2),
      changeAmount: current.total.sub(previous.total).toFixed(2),
      trend: current.trend,
    };
  }

  private async aggregateStatistics(userId: string, from: Date, to: Date) {
    const where = { userId, deletedAt: null, expenseDate: { gte: from, lt: to } };
    const [totals, daily] = await Promise.all([
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.expense.groupBy({ by: ['expenseDate'], where, _sum: { amount: true } }),
    ]);
    return {
      total: new Prisma.Decimal(totals._sum.amount ?? 0),
      count: totals._count._all,
      trend: daily
        .sort((a, b) => a.expenseDate.getTime() - b.expenseDate.getTime())
        .map((entry) => ({ date: entry.expenseDate.toISOString().slice(0, 10), amount: new Prisma.Decimal(entry._sum.amount ?? 0).toFixed(2) })),
    };
  }
}

export { BUDGET_CATEGORY_CATALOG } from './prisma-budget.shared';
