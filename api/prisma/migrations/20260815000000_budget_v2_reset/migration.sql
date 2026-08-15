-- Budget v2 is an intentional data reset. No Budget v1 rows are migrated.
DELETE FROM "SyncMutation"
WHERE "kind" LIKE 'budgettransaction.%'
   OR "kind" LIKE 'budget_transaction.%'
   OR "kind" LIKE 'moneycategory.%'
   OR "kind" LIKE 'moneybudgetperiod.%'
   OR "kind" LIKE 'moneycategorybudget.%';

DELETE FROM "SyncChange"
WHERE "entityType" IN ('budgettransaction', 'moneycategory', 'moneybudgetperiod', 'moneycategorybudget');

DROP TABLE IF EXISTS "BudgetTransaction" CASCADE;
DROP TABLE IF EXISTS "MoneyCategoryBudget" CASCADE;
DROP TABLE IF EXISTS "MoneyBudgetPeriod" CASCADE;
DROP TABLE IF EXISTS "MoneyCategory" CASCADE;
DROP TYPE IF EXISTS "TransactionType";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecurringFrequency') THEN
    CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
  END IF;
END $$;

CREATE TABLE "ExpenseCategory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT DEFAULT 'TEAL',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseCategory_userId_name_key" ON "ExpenseCategory"("userId", "name");
CREATE INDEX "ExpenseCategory_userId_archivedAt_idx" ON "ExpenseCategory"("userId", "archivedAt");
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MonthlyBudget" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "overallLimit" DECIMAL(18,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "MonthlyBudget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MonthlyBudget_userId_period_key" ON "MonthlyBudget"("userId", "period");
CREATE INDEX "MonthlyBudget_userId_period_idx" ON "MonthlyBudget"("userId", "period");
ALTER TABLE "MonthlyBudget" ADD CONSTRAINT "MonthlyBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CategoryBudgetLimit" (
  "id" TEXT NOT NULL,
  "monthlyBudgetId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "limit" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "CategoryBudgetLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryBudgetLimit_monthlyBudgetId_categoryId_key" ON "CategoryBudgetLimit"("monthlyBudgetId", "categoryId");
CREATE INDEX "CategoryBudgetLimit_categoryId_idx" ON "CategoryBudgetLimit"("categoryId");
ALTER TABLE "CategoryBudgetLimit" ADD CONSTRAINT "CategoryBudgetLimit_monthlyBudgetId_fkey" FOREIGN KEY ("monthlyBudgetId") REFERENCES "MonthlyBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryBudgetLimit" ADD CONSTRAINT "CategoryBudgetLimit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "categoryId" TEXT NOT NULL,
  "merchant" TEXT,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "expenseDate" DATE NOT NULL,
  "recurringExpenseId" TEXT,
  "recurringOccurrenceDate" DATE,
  "note" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedByDeviceId" TEXT,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_userId_expenseDate_idx" ON "Expense"("userId", "expenseDate");
CREATE INDEX "Expense_userId_deletedAt_idx" ON "Expense"("userId", "deletedAt");
CREATE INDEX "Expense_categoryId_expenseDate_idx" ON "Expense"("categoryId", "expenseDate");
CREATE UNIQUE INDEX "Expense_recurringExpenseId_recurringOccurrenceDate_key" ON "Expense"("recurringExpenseId", "recurringOccurrenceDate");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RecurringExpense" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT,
  "categoryId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "merchant" TEXT,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "note" TEXT,
  "frequency" "RecurringFrequency" NOT NULL,
  "startDate" DATE NOT NULL,
  "nextDueDate" DATE NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecurringExpense_userId_isActive_nextDueDate_idx" ON "RecurringExpense"("userId", "isActive", "nextDueDate");
CREATE INDEX "RecurringExpense_userId_archivedAt_idx" ON "RecurringExpense"("userId", "archivedAt");
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
