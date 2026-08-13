import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import { createUlid } from '../../shared/sync/syncIdentity';
import type { JournalDailyReview, JournalTag, JournalWeeklyReview } from './journal.types';

export interface CreateJournalEntryParams {
  id?: string;
  kind: 'NOTE' | 'DAILY_REVIEW' | 'WEEKLY_REVIEW';
  title: string;
  contentMarkdown?: string;
  entryDate: string;
  timezone?: string;
  templateId?: string | null;
  tagIds?: string[];
  weeklyReview?: Partial<JournalWeeklyReview> | null;
  dailyReview?: Partial<JournalDailyReview> | null;
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
        dailyReview: params.dailyReview,
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
        dailyReview: params.dailyReview || null,
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
      weeklyReview?: Partial<JournalWeeklyReview> | null;
      dailyReview?: Partial<JournalDailyReview> | null;
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

export function deleteJournalAttachment(id: string) {
  return api.enqueueOfflineMutation(
    {
      kind: 'journal_attachment.delete',
      entityId: id,
      payload: { id },
      optimistic: { id, deletedAt: new Date().toISOString() },
    },
    async () => {
      const res = await api.delete(`/journal/attachments/${id}`);
      return res.data;
    },
  );
}

export function useDeleteJournalAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteJournalAttachment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
}

export interface CreateJournalTagParams {
  name: string;
  color?: string;
}

export function createJournalTag({ name, color }: CreateJournalTagParams): Promise<JournalTag> {
  const normalizedName = name.trim();
  if (!normalizedName) return Promise.reject(new Error('Tag name is required'));

  const id = createUlid();
  const payload: Record<string, unknown> = {
    id,
    name: normalizedName,
    ...(color ? { color } : {}),
  };
  const now = new Date().toISOString();
  const optimistic: JournalTag = {
    id,
    userId: 'local',
    name: normalizedName.toLowerCase(),
    color: (color || 'SLATE').toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };

  return api.enqueueOfflineMutation(
    {
      kind: 'journal_tag.create',
      entityId: id,
      payload,
      optimistic,
    },
    async () => {
      const res = await api.post<JournalTag>('/journal/tags', { name: normalizedName, ...(color ? { color } : {}) });
      return res.data;
    },
  );
}

export function useCreateJournalTagMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createJournalTag,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journal-tags'] });
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
    mutationFn: restoreJournalRevision,
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['journal-entries', 'revisions', variables.entryId] });
    },
  });
}

export function restoreJournalRevision({
  entryId,
  revisionId,
  snapshot = {},
}: {
  entryId: string;
  revisionId: string;
  snapshot?: Record<string, unknown>;
}) {
  const optimistic = { entryId, id: entryId, ...snapshot };
  return api.enqueueOfflineMutation(
    {
      kind: 'journal_revision.restore',
      entityId: revisionId,
      payload: { entryId, revisionId },
      optimistic,
    },
    async () => {
      const res = await api.post(`/journal/entries/${entryId}/revisions/${revisionId}/restore`);
      return res.data;
    },
  );
}

export function useCreateJournalTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      entryKind: 'NOTE' | 'DAILY_REVIEW' | 'WEEKLY_REVIEW';
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

export interface UpdateJournalTemplateParams {
  id: string;
  name?: string;
  entryKind?: 'NOTE' | 'DAILY_REVIEW' | 'WEEKLY_REVIEW';
  bodyMarkdown?: string;
  titleTemplate?: string;
}

export function updateJournalTemplate({ id, ...data }: UpdateJournalTemplateParams) {
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
}

export function useUpdateJournalTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateJournalTemplate,
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
