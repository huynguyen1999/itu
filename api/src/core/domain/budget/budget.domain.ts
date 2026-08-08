export interface BudgetCategoryDomain {
  id: string;
  userId: string;
  name: string;
  type: 'EXPENSE' | 'INCOME';
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface BudgetCategoryLimitDomain {
  id: string;
  budgetPeriodId: string;
  categoryId: string;
  limit: number;
  createdAt: Date;
  updatedAt: Date;
  category?: BudgetCategoryDomain;
}

export interface BudgetPeriodDomain {
  id: string;
  userId: string;
  period: string; // e.g. "2026-08"
  currency: string;
  overallLimit: number;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  categoryBudgets: BudgetCategoryLimitDomain[];
}

export interface BudgetTransactionDomain {
  id: string;
  userId: string;
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  currency: string;
  category: string; // enum string or category name
  categoryId?: string | null;
  merchant?: string | null;
  paymentMethod: string;
  transactionAt: Date;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryOverviewStat {
  category: BudgetCategoryDomain;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
}

export interface BudgetOverviewDomain {
  period: string;
  currency: string;
  income: number;
  spent: number;
  overallBudget: number;
  remainingBudget: number;
  categories: CategoryOverviewStat[];
}
