import {
  BudgetCategoryDomain,
  BudgetPeriodDomain,
  BudgetTransactionDomain,
  BudgetOverviewDomain,
} from '../../../domain/budget/budget.domain';

export interface CreateCategoryDto {
  name: string;
  type?: 'EXPENSE' | 'INCOME';
  icon?: string;
  color?: string;
  sortOrder?: number;
}

export interface UpdateCategoryDto {
  name?: string;
  type?: 'EXPENSE' | 'INCOME';
  icon?: string;
  color?: string;
  sortOrder?: number;
}

export interface CreateTransactionDto {
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  currency?: string;
  categoryId: string;
  merchant?: string;
  paymentMethod?: string;
  transactionAt: Date;
  note?: string;
}

export interface UpdateTransactionDto {
  type?: 'EXPENSE' | 'INCOME';
  amount?: number;
  currency?: string;
  categoryId?: string;
  merchant?: string;
  paymentMethod?: string;
  transactionAt?: Date;
  note?: string;
}

export const BUDGET_REPOSITORY_PORT = Symbol('BUDGET_REPOSITORY_PORT');

export interface IBudgetRepositoryPort {
  getCategories(userId: string): Promise<BudgetCategoryDomain[]>;
  createCategory(userId: string, dto: CreateCategoryDto): Promise<BudgetCategoryDomain>;
  updateCategory(userId: string, id: string, dto: UpdateCategoryDto): Promise<BudgetCategoryDomain>;
  archiveCategory(userId: string, id: string): Promise<BudgetCategoryDomain>;
  reorderCategories(userId: string, categoryIds: string[]): Promise<BudgetCategoryDomain[]>;

  getPeriod(userId: string, periodStr: string): Promise<BudgetPeriodDomain>;
  updatePeriod(userId: string, periodStr: string, overallLimit: number): Promise<BudgetPeriodDomain>;
  updateCategoryLimit(userId: string, periodStr: string, categoryId: string, limit: number): Promise<BudgetPeriodDomain>;
  deleteCategoryLimit(userId: string, periodStr: string, categoryId: string): Promise<BudgetPeriodDomain>;

  getTransactions(userId: string, options?: { period?: string; categoryId?: string; type?: 'EXPENSE' | 'INCOME' }): Promise<BudgetTransactionDomain[]>;
  getTransactionById(userId: string, id: string): Promise<BudgetTransactionDomain | null>;
  createTransaction(userId: string, dto: CreateTransactionDto): Promise<BudgetTransactionDomain>;
  updateTransaction(userId: string, id: string, dto: UpdateTransactionDto): Promise<BudgetTransactionDomain>;
  deleteTransaction(userId: string, id: string): Promise<void>;

  getOverview(userId: string, periodStr: string): Promise<BudgetOverviewDomain>;
}
