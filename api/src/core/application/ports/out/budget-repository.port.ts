import {
  BudgetReportDomain,
  BudgetStatisticsDomain,
  BudgetSummaryDomain,
  CategoryBudgetLimitDomain,
  ExpenseCategoryDomain,
  ExpenseDomain,
  MonthlyBudgetDomain,
  RecurringExpenseDomain,
  PaymentMethod,
  RecurringFrequency,
} from '../../../domain/budget/budget.domain';

export interface CreateCategoryDto { name: string; icon?: string; color?: string; sortOrder?: number; }
export interface UpdateCategoryDto { name?: string; icon?: string; color?: string; sortOrder?: number; }
export interface ExpenseFilters { period?: string; from?: Date; to?: Date; categoryId?: string; paymentMethod?: PaymentMethod; merchant?: string; search?: string; }
export interface CreateExpenseDto { amount: string; categoryId: string; merchant?: string; paymentMethod?: PaymentMethod; expenseDate: Date; note?: string; recurringExpenseId?: string; recurringOccurrenceDate?: Date; }
export type UpdateExpenseDto = Partial<CreateExpenseDto>;
export interface CreateRecurringExpenseDto { name?: string; categoryId: string; amount: string; merchant?: string; paymentMethod?: PaymentMethod; note?: string; frequency: RecurringFrequency; startDate: Date; nextDueDate?: Date; }
export type UpdateRecurringExpenseDto = Partial<CreateRecurringExpenseDto> & { isActive?: boolean };

export const BUDGET_REPOSITORY_PORT = Symbol('BUDGET_REPOSITORY_PORT');

export interface IBudgetRepositoryPort {
  getCategories(userId: string): Promise<ExpenseCategoryDomain[]>;
  createCategory(userId: string, dto: CreateCategoryDto): Promise<ExpenseCategoryDomain>;
  updateCategory(userId: string, id: string, dto: UpdateCategoryDto): Promise<ExpenseCategoryDomain>;
  archiveCategory(userId: string, id: string): Promise<ExpenseCategoryDomain>;
  reorderCategories(userId: string, categoryIds: string[]): Promise<ExpenseCategoryDomain[]>;

  getMonthlyBudget(userId: string, period: string): Promise<MonthlyBudgetDomain>;
  updateMonthlyBudget(userId: string, period: string, overallLimit: string | null): Promise<MonthlyBudgetDomain>;
  updateCategoryLimit(userId: string, period: string, categoryId: string, limit: string): Promise<CategoryBudgetLimitDomain>;
  deleteCategoryLimit(userId: string, period: string, categoryId: string): Promise<void>;

  getExpenses(userId: string, filters?: ExpenseFilters): Promise<ExpenseDomain[]>;
  getExpense(userId: string, id: string, includeDeleted?: boolean): Promise<ExpenseDomain | null>;
  createExpense(userId: string, dto: CreateExpenseDto): Promise<ExpenseDomain>;
  updateExpense(userId: string, id: string, dto: UpdateExpenseDto): Promise<ExpenseDomain>;
  deleteExpense(userId: string, id: string): Promise<void>;
  restoreExpense(userId: string, id: string): Promise<ExpenseDomain | null>;

  getRecurringExpenses(userId: string): Promise<RecurringExpenseDomain[]>;
  createRecurringExpense(userId: string, dto: CreateRecurringExpenseDto): Promise<RecurringExpenseDomain>;
  updateRecurringExpense(userId: string, id: string, dto: UpdateRecurringExpenseDto): Promise<RecurringExpenseDomain>;
  archiveRecurringExpense(userId: string, id: string): Promise<RecurringExpenseDomain>;
  confirmRecurringOccurrence(userId: string, id: string, occurrenceDate?: Date): Promise<ExpenseDomain>;
  skipRecurringOccurrence(userId: string, id: string, occurrenceDate?: Date): Promise<RecurringExpenseDomain>;

  getSummary(userId: string, period: string): Promise<BudgetSummaryDomain>;
  getReport(userId: string, period: string): Promise<BudgetReportDomain>;
  getStatistics(userId: string, from: Date, to: Date): Promise<BudgetStatisticsDomain>;
}
