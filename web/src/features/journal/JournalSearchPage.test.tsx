import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { JournalSearchPage } from './JournalSearchPage';

const journalQueryMocks = vi.hoisted(() => ({
  useJournalEntries: vi.fn(() => ({ data: [], isLoading: false })),
  useJournalTags: vi.fn(() => ({ data: [] })),
}));

vi.mock('./journalQueries', () => journalQueryMocks);

describe('JournalSearchPage', () => {
  it('passes the sidebar query parameter into the journal search filter', () => {
    renderToStaticMarkup(
      <MemoryRouter initialEntries={['/journal/notes?query=morning%20pages']}>
        <Routes>
          <Route path="/journal/notes" element={<JournalSearchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(journalQueryMocks.useJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'morning pages', startDate: undefined, endDate: undefined }),
    );
  });

  it('passes native date filters into the journal search filter', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/journal/notes?startDate=2026-08-01&endDate=2026-08-10']}>
        <Routes>
          <Route path="/journal/notes" element={<JournalSearchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(journalQueryMocks.useJournalEntries).toHaveBeenLastCalledWith(
      expect.objectContaining({ startDate: '2026-08-01', endDate: '2026-08-10' }),
    );
    expect(markup).toContain('Clear Filters');
  });
});
