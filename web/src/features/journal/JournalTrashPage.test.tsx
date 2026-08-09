import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JournalTrashPage } from './JournalTrashPage';

const journalQueryMocks = vi.hoisted(() => ({
  useJournalEntries: vi.fn(() => ({
    data: [
      { id: 'deleted-1', title: 'Deleted note', kind: 'NOTE', deletedAt: '2026-08-10' },
      { id: 'active-1', title: 'Active note', kind: 'NOTE', deletedAt: null },
    ],
    isLoading: false,
    isError: false,
  })),
}));

vi.mock('./journalQueries', () => journalQueryMocks);
vi.mock('./journalMutations', () => ({
  useRestoreJournalEntryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

describe('JournalTrashPage', () => {
  it('lists deleted entries only and offers restore', () => {
    const markup = renderToStaticMarkup(<JournalTrashPage />);

    expect(journalQueryMocks.useJournalEntries).toHaveBeenCalledWith({ includeDeleted: true });
    expect(markup).toContain('Deleted note');
    expect(markup).toContain('Restore');
    expect(markup).not.toContain('Active note');
  });
});
