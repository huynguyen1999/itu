import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DailyReviewsPage } from './DailyReviewsPage';

vi.mock('../journalQueries', () => ({
  useJournalEntries: () => ({ data: [], isLoading: false }),
}));

describe('DailyReviewsPage', () => {
  it('exposes the empty-state action for starting a daily review', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <DailyReviewsPage />
      </MemoryRouter>,
    );

    expect(markup).toContain('Daily reviews');
    expect(markup).toContain('Review today');
  });
});
