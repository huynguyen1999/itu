import { NavLink } from 'react-router-dom';
import { LayoutDashboard, History, Dumbbell, Play } from 'lucide-react';
import type { GymWorkout } from './gymQueries';

const gymTabs = [
  { to: '/gym', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/gym/history', label: 'History', icon: History, end: false },
  { to: '/gym/exercises', label: 'Exercises', icon: Dumbbell, end: false },
] as const;

export function findActiveGymWorkout(workouts: GymWorkout[] | undefined): GymWorkout | null {
  return workouts?.find((workout) => workout.status === 'IN_PROGRESS' || workout.status === 'ACTIVE') ?? null;
}

export function GymLocalNav({
  mobile = false,
  activeWorkout = null,
}: {
  mobile?: boolean;
  activeWorkout?: GymWorkout | null;
}) {
  return (
    <nav
      className={
        mobile ? 'flex min-w-0 items-center gap-1 overflow-x-auto border-b border-border/60 pb-2' : 'itu-secondary-rail__nav'
      }
      aria-label="Gym sub-navigation"
    >
      {activeWorkout && (
        <NavLink
          to={`/gym/workouts/${activeWorkout.id}`}
          className={`${mobile ? 'flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2.5 text-sm font-semibold text-[var(--itu-teal-400)] whitespace-nowrap' : 'itu-secondary-nav-link bg-primary/10 text-primary font-semibold'}`}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Continue workout</span>
        </NavLink>
      )}
      {gymTabs.map(({ icon: Icon, ...tab }) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `${mobile ? 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white whitespace-nowrap' : 'itu-secondary-nav-link'} ${
              isActive ? 'bg-white/15 text-[var(--itu-teal-400)] font-semibold' : ''
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
