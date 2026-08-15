export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET' | 'OTHER';
export type RecurringFrequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ExpenseCategoryDomain {
  id: string;
  userId: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface CategoryBudgetLimitDomain {
  id: string;
  monthlyBudgetId: string;
  categoryId: string;
  limit: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  category?: ExpenseCategoryDomain;
}

export interface MonthlyBudgetDomain {
  id: string;
  userId: string;
  period: string;
  overallLimit: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  categoryLimits: CategoryBudgetLimitDomain[];
}

export interface ExpenseDomain {
  id: string;
  userId: string;
  amount: string;
  category: string;
  categoryId: string;
  merchant?: string | null;
  paymentMethod: PaymentMethod;
  expenseDate: Date;
  note?: string | null;
  recurringExpenseId?: string | null;
  recurringOccurrenceDate?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletedByDeviceId?: string | null;
}

export interface RecurringExpenseDomain {
  id: string;
  userId: string;
  name?: string | null;
  category: string;
  categoryId: string;
  amount: string;
  merchant?: string | null;
  paymentMethod: PaymentMethod;
  note?: string | null;
  frequency: RecurringFrequency;
  startDate: Date;
  nextDueDate: Date;
  isActive: boolean;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface BudgetCategorySummaryDomain {
  category: ExpenseCategoryDomain;
  limit: string | null;
  spent: string;
  remaining: string | null;
  percentage: number | null;
}

export interface BudgetSummaryDomain {
  period: string;
  spent: string;
  overallLimit: string | null;
  remaining: string | null;
  previousSpent: string;
  changeAmount: string;
  changePercentage: number | null;
  categories: BudgetCategorySummaryDomain[];
  recentExpenses: ExpenseDomain[];
  dueRecurring: RecurringExpenseDomain[];
}

export interface BudgetReportDomain {
  period: string;
  spendingOverTime: Array<{ date: string; amount: string; cumulative: string }>;
  categoryBreakdown: Array<{ categoryId: string; category: string; amount: string; percentage: number }>;
  monthlyOutflow: Array<{ bucket: string; amount: string }>;
  previousMonthComparison: { current: string; previous: string; difference: string; percentage: number | null };
  topMerchants: Array<{ merchant: string; amount: string; count: number }>;
  topCategories: Array<{ categoryId: string; category: string; amount: string; count: number }>;
}

export interface BudgetStatisticsDomain {
  from: string;
  to: string;
  spent: string;
  expenseCount: number;
  previousSpent: string;
  changeAmount: string;
  trend: Array<{ date: string; amount: string }>;
}
