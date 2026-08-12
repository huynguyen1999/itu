import { Route, Routes, Navigate } from 'react-router-dom';
import { BudgetLayout } from './BudgetLayout';
import { BudgetOverviewPage } from './overview/BudgetOverviewPage';
import { TransactionsPage } from './transactions/TransactionsPage';
import { BudgetPage } from './budgets/BudgetPage';
import { BudgetCategoriesPage } from './BudgetCategoriesPage';

export function BudgetWorkspace() {
  return (
    <Routes>
      <Route element={<BudgetLayout />}>
        <Route index element={<BudgetOverviewPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="budgets" element={<BudgetPage />} />
        <Route path="categories" element={<BudgetCategoriesPage />} />
        <Route path="*" element={<Navigate to="/budget" replace />} />
      </Route>
    </Routes>
  );
}
