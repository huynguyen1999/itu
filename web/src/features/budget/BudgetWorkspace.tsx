import { Route, Routes, Navigate } from 'react-router-dom';
import { BudgetLayout } from './BudgetLayout';
import { BudgetOverviewPage } from './overview/BudgetOverviewPage';
import { TransactionsPage } from './transactions/TransactionsPage';
import { BudgetPage } from './budgets/BudgetPage';
import { BudgetCategoriesPage } from './BudgetCategoriesPage';
import { BudgetRecurringPage } from './recurring/BudgetRecurringPage';
import { BudgetReportsPage } from './reports/BudgetReportsPage';

export function BudgetWorkspace() {
  return (
    <Routes>
      <Route element={<BudgetLayout />}>
        <Route index element={<BudgetOverviewPage />} />
        <Route path="expenses" element={<TransactionsPage />} />
        <Route path="budgets" element={<BudgetPage />} />
        <Route path="recurring" element={<BudgetRecurringPage />} />
        <Route path="reports" element={<BudgetReportsPage />} />
        <Route path="categories" element={<BudgetCategoriesPage />} />
        <Route path="*" element={<Navigate to="/budget" replace />} />
      </Route>
    </Routes>
  );
}
