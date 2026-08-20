import type { CategoryBudgetLimitDomain, ExpenseCategoryDomain, ExpenseDomain, MonthlyBudgetDomain, RecurringExpenseDomain } from '@core/domain/budget/budget.domain';
import { asMoney } from './prisma-budget.shared';

export class PrismaBudgetMappers {
  protected mapCategory(value: any): ExpenseCategoryDomain {
    return { id: value.id, userId: value.userId, name: value.name, icon: value.icon, color: value.color, sortOrder: value.sortOrder, archivedAt: value.archivedAt, createdAt: value.createdAt, updatedAt: value.updatedAt, version: value.version ?? 1 };
  }

  protected mapExpense(value: any): ExpenseDomain {
    return { id: value.id, userId: value.userId, amount: asMoney(value.amount)!, category: value.category?.name ?? 'Other', categoryId: value.categoryId, merchant: value.merchant, paymentMethod: value.paymentMethod, expenseDate: value.expenseDate, note: value.note, recurringExpenseId: value.recurringExpenseId, recurringOccurrenceDate: value.recurringOccurrenceDate, version: value.version ?? 1, createdAt: value.createdAt, updatedAt: value.updatedAt, deletedAt: value.deletedAt, deletedByDeviceId: value.deletedByDeviceId };
  }

  protected mapRecurring(value: any): RecurringExpenseDomain {
    return { id: value.id, userId: value.userId, name: value.name, category: value.category?.name ?? 'Other', categoryId: value.categoryId, amount: asMoney(value.amount)!, merchant: value.merchant, paymentMethod: value.paymentMethod, note: value.note, frequency: value.frequency, startDate: value.startDate, nextDueDate: value.nextDueDate, isActive: value.isActive, archivedAt: value.archivedAt, createdAt: value.createdAt, updatedAt: value.updatedAt, version: value.version ?? 1 };
  }

  protected mapLimit(value: any): CategoryBudgetLimitDomain {
    return { id: value.id, monthlyBudgetId: value.monthlyBudgetId, categoryId: value.categoryId, limit: asMoney(value.limit)!, createdAt: value.createdAt, updatedAt: value.updatedAt, version: value.version ?? 1, category: value.category ? this.mapCategory(value.category) : undefined };
  }

  protected mapMonthlyBudget(value: any): MonthlyBudgetDomain {
    return { id: value.id, userId: value.userId, period: value.period, overallLimit: asMoney(value.overallLimit), createdAt: value.createdAt, updatedAt: value.updatedAt, version: value.version ?? 1, categoryLimits: (value.categoryLimits ?? []).map((limit: any) => this.mapLimit(limit)) };
  }

}
