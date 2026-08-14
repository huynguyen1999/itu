import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WeeklyReviewPage } from './WeeklyReviewPage';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
}));

vi.mock('../journalQueries', () => ({
  useJournalEntry: () => ({ data: undefined, isLoading: false }),
  useWeeklySummary: () => ({ data: undefined }),
}));

vi.mock('../journalMutations', () => ({
  useCreateJournalEntryMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateJournalEntryMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../components/JournalMarkdownEditor', () => ({
  JournalMarkdownEditor: () => null,
}));

vi.mock('@/shared/sync/SyncProvider', () => ({
  useSync: () => ({ state: { phase: 'up-to-date' }, pendingMutations: [] }),
}));

describe('WeeklyReviewPage', () => {
  it('does not fabricate summary metrics before the weekly summary loads', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/journal/weekly']}>
        <Routes>
          <Route path="/journal/weekly" element={<WeeklyReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain('done');
    expect(markup).toContain('0h 0m');
    expect(markup).toContain('/0');
    expect(markup).toContain('sess.');
    expect(markup).toContain('₫0');
    expect(markup).not.toContain('12h 20m');
    expect(markup).not.toContain('2,850,000');
    expect(markup).not.toContain('Tiny Experiment');
  });
});
