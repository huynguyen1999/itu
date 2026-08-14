import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DailyReviewPage } from './DailyReviewPage';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
}));

vi.mock('../journalQueries', () => ({
  useJournalEntry: () => ({ data: undefined, isLoading: false }),
  useDailySummary: () => ({ data: undefined, isLoading: false }),
  useJournalEntries: () => ({ data: [], isLoading: false }),
}));

vi.mock('../journalMutations', () => ({
  useCreateJournalEntryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateJournalEntryMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/shared/sync/SyncProvider', () => ({
  useSync: () => ({ state: { phase: 'up-to-date' }, pendingMutations: [] }),
}));

describe('DailyReviewPage', () => {
  it('renders ledger and entry questions properly', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/journal/review/daily/new']}>
        <Routes>
          <Route path="/journal/review/daily/:entryId" element={<DailyReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain('ledger');
    expect(markup).toContain('four questions');
    expect(markup).toContain('What went well?');
    expect(markup).toContain('What felt difficult or distracting?');
    expect(markup).toContain('What did I learn or notice?');
    expect(markup).toContain('AI insights');
  });
});
