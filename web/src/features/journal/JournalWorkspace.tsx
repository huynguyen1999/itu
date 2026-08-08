import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { JournalSidebar } from './JournalSidebar';
import { JournalOverviewPage } from './JournalOverviewPage';
import { NotePage } from './components/NotePage';
import { JournalSearchPage } from './JournalSearchPage';
import { WeeklyReviewPage } from './weekly/WeeklyReviewPage';
import { TemplateEditor } from './components/TemplateEditor';

import { MoneyLayout } from './money/MoneyLayout';
import { MoneyOverviewPage } from './money/overview/MoneyOverviewPage';
import { TransactionsPage } from './money/transactions/TransactionsPage';
import { BudgetPage } from './money/budgets/BudgetPage';
import { MoneyCalendarPage } from './money/calendar/MoneyCalendarPage';

import { GymLayout } from './gym/GymLayout';
import { GymOverviewPage } from './gym/overview/GymOverviewPage';
import { RoutinesPage } from './gym/routines/RoutinesPage';
import { WorkoutHistoryPage } from './gym/history/WorkoutHistoryPage';
import { ExerciseLibraryPage } from './gym/exercises/ExerciseLibraryPage';
import { ActiveWorkoutPage } from './gym/active/ActiveWorkoutPage';

export function JournalWorkspace() {
  const navigate = useNavigate();
  const [width, setWidth] = useStoredNumber('itu.journal.sidebar-width', 240);

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const resize = (pointerEvent: PointerEvent) =>
      setWidth(Math.min(360, Math.max(176, startWidth + pointerEvent.clientX - startX)));
    const finish = () => {
      document.body.classList.remove('itu-is-resizing');
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', finish);
    };
    document.body.classList.add('itu-is-resizing');
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', finish, { once: true });
  }

  return (
    <div className="itu-journal-workspace" style={{ '--itu-journal-sidebar-width': `${width}px` } as CSSProperties}>
      <JournalSidebar onPointerDownResizer={beginResize} />
      <section className="itu-journal-content">
        <div className="itu-journal-content__inner">
          <Routes>
            <Route index element={<JournalOverviewPage />} />
            <Route path="daily" element={<NotePage isDaily={true} />} />
            <Route path="daily/:date" element={<NotePage isDaily={true} />} />
            <Route path="weekly" element={<WeeklyReviewPage />} />
            <Route path="weekly/:entryId" element={<WeeklyReviewPage />} />

            {/* Money Specialized Application Routes */}
            <Route path="money" element={<MoneyLayout />}>
              <Route index element={<MoneyOverviewPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="budgets" element={<BudgetPage />} />
              <Route path="calendar" element={<MoneyCalendarPage />} />
            </Route>

            {/* Gym Specialized Application Routes */}
            <Route path="gym" element={<GymLayout />}>
              <Route index element={<GymOverviewPage />} />
              <Route path="routines" element={<RoutinesPage />} />
              <Route path="history" element={<WorkoutHistoryPage />} />
              <Route path="exercises" element={<ExerciseLibraryPage />} />
            </Route>
            <Route path="gym/active/:entryId" element={<ActiveWorkoutPage />} />

            <Route path="notes" element={<JournalSearchPage />} />
            <Route path="notes/:entryId" element={<NotePage isDaily={false} />} />
            <Route path="entry/:id" element={<NotePage isDaily={false} />} />
            <Route path="templates" element={<TemplateEditor isOpen={true} onClose={() => navigate('/journal')} />} />
            <Route path="*" element={<Navigate to="/journal" replace />} />
          </Routes>
        </div>
      </section>
    </div>
  );
}

function useStoredNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  });
  useEffect(() => window.localStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue] as const;
}
