import { Outlet } from 'react-router-dom';
import { GymLocalNav } from './GymLocalNav';

export function GymLayout() {
  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      <GymLocalNav />
      <Outlet />
    </div>
  );
}
