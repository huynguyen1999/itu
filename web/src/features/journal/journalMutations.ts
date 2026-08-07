import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import { createUlid } from '../../shared/sync/syncIdentity';

export interface CreateJournalEntryParams {
  id?: string;
  kind: 'NOTE' | 'WEEKLY_REVIEW' | 'EXPENSE' | 'WORKOUT';
  title: string;
  contentMarkdown?: string;
  entryDate: string;
  timezone?: string;
  templateId?: string | null;
  tagIds?: string[];
  weeklyReview?: any;
  expense?: any;
  workout?: any;
}

export function useCreateJournalEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateJournalEntryParams) => {
      const id = params.id || createUlid();
      const payload = {
        id,
        kind: params.kind,
        title: params.title,
        contentMarkdown: params.contentMarkdown || '',
        entryDate: params.entryDate,
        timezone: params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        templateId: params.templateId || null,
        tagIds: params.tagIds || [],
        weeklyReview: params.weeklyReview,
        expense: params.expense,
        workout: params.workout,
      };

      const optimisticEntry = {
        id,
        userId: 'local',
        kind: params.kind,
        title: params.title,
        contentMarkdown: params.contentMarkdown || '',
        entryDate: params.entryDate,
        timezone: payload.timezone,
        templateId: params.templateId || null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        weeklyReview: params.weeklyReview || null,
        expense: params.expense || null,
        workout: params.workout || null,
        tags: [],
        attachments: [],
      };

      return api.enqueueOfflineMutation(
        {
          kind: 'journal.create',
          entityId: id,
          payload,
          optimistic: optimisticEntry,
        },
        async () => {
          const res = await api.post('/journal/entries', payload);
          return res.data;
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
}

export function useUpdateJournalEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      version,
      baseValues,
      ...data
    }: {
      id: string;
      version?: number;
      baseValues?: Record<string, unknown>;
      title?: string;
      contentMarkdown?: string;
      entryDate?: string;
      timezone?: string;
      templateId?: string | null;
      tagIds?: string[];
      weeklyReview?: any;
      expense?: any;
      workout?: any;
    }) => {
      const payload: Record<string, unknown> = { ...data };

      return api.enqueueOfflineMutation(
        {
          kind: 'journal.update',
          entityId: id,
          baseVersion: version,
          baseValues,
          payload,
          optimistic: { id, ...data, updatedAt: new Date().toISOString() },
        },
        async () => {
          const res = await api.patch(`/journal/entries/${id}`, data);
          return res.data;
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
}

export function useDeleteJournalEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version?: number }) => {
      return api.enqueueOfflineMutation(
        {
          kind: 'journal.delete',
          entityId: id,
          baseVersion: version,
          payload: { id },
          optimistic: { id, deletedAt: new Date().toISOString() },
        },
        async () => {
          const res = await api.delete(`/journal/entries/${id}`);
          return res.data;
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

export function useRestoreJournalEntryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.enqueueOfflineMutation(
        {
          kind: 'journal.restore',
          entityId: id,
          payload: { id },
          optimistic: { id, deletedAt: null },
        },
        async () => {
          const res = await api.post(`/journal/entries/${id}/restore`);
          return res.data;
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
  });
}

export function useRestoreJournalRevisionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId, revisionId }: { entryId: string; revisionId: string }) => {
      const res = await api.post(`/journal/entries/${entryId}/revisions/${revisionId}/restore`);
      return res.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['journal-entries', 'revisions', variables.entryId] });
    },
  });
}

export function useCreateJournalTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      entryKind: 'NOTE' | 'WEEKLY_REVIEW' | 'EXPENSE' | 'WORKOUT';
      titleTemplate?: string;
      bodyMarkdown?: string;
      defaults?: Record<string, unknown>;
    }) => {
      const id = createUlid();
      const payload = { id, ...params };
      return api.enqueueOfflineMutation(
        {
          kind: 'journal_template.create',
          entityId: id,
          payload,
          optimistic: { id, userId: 'local', builtIn: false, version: 1, ...params },
        },
        async () => {
          const res = await api.post('/journal/templates', payload);
          return res.data;
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-templates'] });
    },
  });
}

export function useUpdateJournalTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; bodyMarkdown?: string; titleTemplate?: string }) => {
      return api.enqueueOfflineMutation(
        {
          kind: 'journal_template.update',
          entityId: id,
          payload: data,
          optimistic: { id, ...data },
        },
        async () => {
          const res = await api.patch(`/journal/templates/${id}`, data);
          return res.data;
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-templates'] });
    },
  });
}

export function useDeleteJournalTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.enqueueOfflineMutation(
        {
          kind: 'journal_template.delete',
          entityId: id,
          payload: { id },
          optimistic: { id, archivedAt: new Date().toISOString() },
        },
        async () => {
          const res = await api.delete(`/journal/templates/${id}`);
          return res.data;
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-templates'] });
    },
  });
}

export function useCreateExerciseDefinitionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/journal/exercises', { name });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercise-definitions'] });
    },
  });
}

