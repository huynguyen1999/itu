import { Outlet } from 'react-router-dom';
import { MoneyLocalNav } from './MoneyLocalNav';

export function MoneyLayout() {
  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      <MoneyLocalNav />
      <Outlet />
    </div>
  );
}
