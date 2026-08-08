import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ReceiptText, PieChart, Calendar } from 'lucide-react';

const moneyTabs = [
  { to: '/journal/money', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/journal/money/transactions', label: 'Transactions', icon: ReceiptText, end: false },
  { to: '/journal/money/budgets', label: 'Budgets', icon: PieChart, end: false },
  { to: '/journal/money/calendar', label: 'Calendar', icon: Calendar, end: false },
] as const;

export function MoneyLocalNav() {
  return (
    <nav className="flex items-center gap-1 border-b border-border/60 pb-2 mb-6 overflow-x-auto" aria-label="Money sub-navigation">
      {moneyTabs.map(({ icon: Icon, ...tab }) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
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
