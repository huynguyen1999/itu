import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import type {
  JournalEntry,
  JournalEntryRevision,
  JournalTag,
  JournalTemplate,
  SearchJournalFilter,
} from './journal.types';

export const journalQueries = {
  entries: (filter?: SearchJournalFilter) =>
    queryOptions({
      queryKey: ['journal-entries', filter ?? {}],
      queryFn: async (): Promise<JournalEntry[]> => {
        const res = await api.get<JournalEntry[]>('/journal/entries', { params: filter });
        return filter?.includeDeleted ? res.data : res.data.filter((entry) => !entry.deletedAt);
      },
    }),

  entryDetail: (id: string, isNew = false) =>
    queryOptions({
      queryKey: ['journal-entries', 'detail', id],
      queryFn: async (): Promise<JournalEntry> => {
        const res = await api.get<JournalEntry>(`/journal/entries/${id}`);
        return res.data;
      },
      enabled: Boolean(id) && !isNew,
    }),

  revisions: (entryId: string) =>
    queryOptions({
      queryKey: ['journal-entries', 'revisions', entryId],
      queryFn: async (): Promise<JournalEntryRevision[]> => {
        const res = await api.get<JournalEntryRevision[]>(`/journal/entries/${entryId}/revisions`);
        return res.data;
      },
      enabled: Boolean(entryId),
    }),

  templates: () =>
    queryOptions({
      queryKey: ['journal-templates'],
      queryFn: async (): Promise<JournalTemplate[]> => {
        const res = await api.get<JournalTemplate[]>('/journal/templates');
        return res.data;
      },
    }),

  tags: () =>
    queryOptions({
      queryKey: ['journal-tags'],
      queryFn: async (): Promise<JournalTag[]> => {
        const res = await api.get<JournalTag[]>('/journal/tags');
        return res.data;
      },
    }),

  weeklySummary: (periodStart: string, periodEnd: string) =>
    queryOptions({
      queryKey: ['journal-weekly-summary', periodStart, periodEnd],
      queryFn: async () => {
        const res = await api.get<Record<string, any>>('/journal/weekly-summary', { params: { periodStart, periodEnd } });
        return res.data;
      },
      enabled: Boolean(periodStart && periodEnd),
    }),
};

export function useJournalEntries(filter?: SearchJournalFilter) {
  return useQuery(journalQueries.entries(filter));
}

export function useJournalEntry(id: string, isNew = false) {
  return useQuery(journalQueries.entryDetail(id, isNew));
}

export function useJournalRevisions(entryId: string) {
  return useQuery(journalQueries.revisions(entryId));
}

export function useJournalTemplates() {
  return useQuery(journalQueries.templates());
}

export function useJournalTags() {
  return useQuery(journalQueries.tags());
}

export function useWeeklySummary(periodStart: string, periodEnd: string) {
  return useQuery(journalQueries.weeklySummary(periodStart, periodEnd));
}
