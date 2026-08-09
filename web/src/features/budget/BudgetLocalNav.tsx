import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ReceiptText, PieChart, Calendar, Tags } from 'lucide-react';

const budgetTabs = [
  { to: '/budget', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/budget/transactions', label: 'Transactions', icon: ReceiptText, end: false },
  { to: '/budget/budgets', label: 'Budgets', icon: PieChart, end: false },
  { to: '/budget/calendar', label: 'Calendar', icon: Calendar, end: false },
  { to: '/budget/categories', label: 'Categories', icon: Tags, end: false },
] as const;

export function BudgetLocalNav({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? 'flex items-center gap-1 overflow-x-auto border-b border-border/60 pb-2' : 'itu-secondary-rail__nav'} aria-label="Budget sub-navigation">
      {budgetTabs.map(({ icon: Icon, ...tab }) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
              `${mobile ? 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground whitespace-nowrap' : 'itu-secondary-nav-link'} ${
              isActive
                ? 'bg-primary/10 text-primary font-semibold'
                : ''
            }`
          }
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
