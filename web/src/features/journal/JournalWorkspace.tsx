import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { JournalSidebar } from './JournalSidebar';
import { JournalDashboard } from './JournalDashboard';
import { JournalEntryPage } from './JournalEntryPage';
import { NotePage } from './components/NotePage';
import { JournalSearchPage } from './JournalSearchPage';
import { WeeklyReviewPage } from './weekly/WeeklyReviewPage';
import { WeeklyReviewsPage } from './weekly/WeeklyReviewsPage';
import { DailyReviewPage } from './daily/DailyReviewPage';
import { DailyReviewsPage } from './daily/DailyReviewsPage';
import { TemplateEditor } from './components/TemplateEditor';
import { useJournalEntries } from './journalQueries';
import { getLocalTodayDateString } from './journalDate';

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
            <Route index element={<JournalDashboard />} />
            <Route path="daily" element={<DailyNoteRoute />} />
            <Route path="daily/:date" element={<NotePage isDaily={true} />} />
            <Route path="reviews/daily" element={<DailyReviewsPage />} />
            <Route path="review/daily/new" element={<DailyReviewPage />} />
            <Route path="review/daily/:entryId" element={<DailyReviewPage />} />
            <Route path="weekly" element={<WeeklyReviewsPage />} />
            <Route path="weekly/new" element={<WeeklyReviewPage />} />
            <Route path="weekly/:entryId" element={<WeeklyReviewPage />} />

            <Route path="notes" element={<JournalSearchPage />} />
            <Route path="notes/:entryId" element={<NotePage isDaily={false} />} />
            <Route path="entry/:id" element={<JournalEntryPage />} />
            <Route path="templates" element={<TemplateEditor isOpen={true} onClose={() => navigate('/journal')} />} />
            <Route path="*" element={<Navigate to="/journal" replace />} />
          </Routes>
        </div>
      </section>
    </div>
  );
}

function DailyNoteRoute() {
  const navigate = useNavigate();
  const today = getLocalTodayDateString();
  const { data: notes = [], isLoading } = useJournalEntries({ kind: 'NOTE' });

  useEffect(() => {
    if (isLoading) return;
    const todayNote = notes.find((note) => note.entryDate.startsWith(today));
    navigate(todayNote ? `/journal/notes/${todayNote.id}` : `/journal/daily/${today}`, { replace: true });
  }, [isLoading, navigate, notes, today]);

  return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" role="status">Opening today’s note…</div>;
}

function useStoredNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  });
  useEffect(() => window.localStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue] as const;
}
