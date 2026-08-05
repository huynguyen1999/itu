import { defaultShouldDehydrateQuery, type Query, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { GrowthAwardReceipt } from '../api/types';
import type { SyncResponse } from './syncQueue';

const QUERY_PREFIXES: Record<string, string[]> = {
  task: ['tasks', 'trash', 'study-calendar', 'dashboard'],
  tasklist: ['task-lists', 'projects'],
  deck: ['deck', 'decks', 'dashboard', 'trash', 'study-calendar'],
  card: ['cards', 'deck', 'decks', 'deck-stats', 'due', 'dashboard', 'trash', 'study-calendar'],
  cardimage: ['cards', 'deck', 'decks', 'deck-stats', 'trash'],
  session: ['session-history', 'session-details', 'dashboard', 'study-calendar'],
  studysession: ['session-history', 'session-details', 'dashboard', 'study-calendar'],
  review: ['due', 'dashboard', 'study-calendar', 'session-details'],
  reviewstate: ['due', 'dashboard', 'study-calendar', 'session-details'],
  reviewlog: ['session-history', 'session-details', 'dashboard', 'study-calendar'],
  aijob: ['session-feedback'],
  aisessionfeedback: ['session-feedback'],
  focuspreset: ['focus-presets'],
  focussession: ['focus', 'dashboard', 'study-calendar'],
  focussound: ['focus', 'sounds'],
  focussoundpreference: ['focus', 'sounds'],
  habit: ['habits', 'habit-occurrences', 'habit-stats', 'study-calendar'],
  habitoccurrence: ['habits', 'habit-occurrences', 'habit-stats', 'study-calendar'],
  growthskill: ['growth'],
  growthearningrule: ['growth'],
  growthledgerentry: ['growth'],
  growthshopreward: ['growth'],
  growthrewardredemption: ['growth'],
  growthitemcategory: ['growth'],
  growthinventorytransaction: ['growth'],
  growthprofile: ['growth'],
  growthcycle: ['growth'],
  growthreset: ['growth'],
  growthrewardpresetsetting: ['growth'],
  growthtaskrewarddefault: ['growth'],
  growthattributemapping: ['growth'],
};

const OPTIMISTIC_INSERT_PREFIXES: Record<string, string[]> = {
  task: ['tasks'],
  tasklist: ['task-lists', 'projects'],
  deck: ['deck', 'decks'],
  card: ['cards'],
  habit: ['habits'],
};

export function applySyncChanges(queryClient: QueryClient, response: SyncResponse): void {
  for (const change of response.changes) {
    applyOptimisticChange(queryClient, change);
  }
}

function applyOptimisticChange(queryClient: QueryClient, change: SyncResponse['changes'][number]): void {
  if (change.entityType === 'growthattributemapping') {
    applyGrowthAttributeMappingChange(queryClient, change);
    return;
  }
  if (change.entityType === 'growthearningrule') {
    applyGrowthEarningRuleChange(queryClient, change);
    return;
  }

  const insertPrefixes = new Set(OPTIMISTIC_INSERT_PREFIXES[change.entityType] ?? []);
  for (const prefix of insertPrefixes) {
    queryClient.setQueriesData({ queryKey: [prefix] }, (current) =>
      updateCachedValue(current, change.entityId, change.data, change.deleted),
    );
  }

  for (const prefix of QUERY_PREFIXES[change.entityType] ?? []) {
    if (insertPrefixes.has(prefix)) continue;
    queryClient.setQueriesData({ queryKey: [prefix] }, (current) =>
      updateCachedEntity(current, change.entityId, change.data, change.deleted, false, false),
    );
  }
}

function applyGrowthAttributeMappingChange(queryClient: QueryClient, change: SyncResponse['changes'][number]): void {
  if (!Array.isArray(change.data)) return;
  const skillId = change.entityId;
  queryClient.setQueriesData({ queryKey: ['growth', 'attribute-mappings', skillId] }, () => change.data);
}

function applyGrowthEarningRuleChange(queryClient: QueryClient, change: SyncResponse['changes'][number]): void {
  if (!isRecord(change.data)) return;
  const sourceType = change.data.sourceType;
  const sourceId = change.data.sourceId;

  for (const query of queryClient.getQueryCache().findAll({ queryKey: ['growth', 'rules'] })) {
    const requestedSourceType = query.queryKey[2];
    const requestedSourceId = query.queryKey[3];
    if (typeof requestedSourceType === 'string' && requestedSourceType !== sourceType) continue;
    if (typeof requestedSourceId === 'string' && requestedSourceId !== sourceId) continue;
    queryClient.setQueryData(query.queryKey, (current: unknown) =>
      updateCollection(current, change.entityId, change.data, change.deleted),
    );
  }
}

export function applyOptimisticGrowthReceipt(queryClient: QueryClient, receipt: GrowthAwardReceipt): void {
  const accountXpDelta = receipt.accountAward
    ? receipt.reverted
      ? -receipt.accountAward.amount
      : receipt.accountAward.amount
    : 0;
  const coinDelta = receipt.coinAward ? (receipt.reverted ? -receipt.coinAward.amount : receipt.coinAward.amount) : 0;

  queryClient.setQueriesData({ queryKey: ['growth'] }, (current) => {
    const updated = updateGrowthProgress(current, receipt);
    if (!isRecord(updated) || !isRecord(updated.account) || (!receipt.accountAward && !receipt.coinAward))
      return updated;
    return {
      ...updated,
      account: {
        ...growthLevelProgress(
          numeric(updated.account.currentXp) + accountXpDelta,
          numeric(updated.account.baseXp) || 100,
        ),
        coinBalance: Math.max(0, numeric(updated.account.coinBalance) + coinDelta),
      },
    };
  });
}

function updateGrowthProgress(current: unknown, receipt: GrowthAwardReceipt): unknown {
  if (Array.isArray(current)) return current.map((value) => updateGrowthProgress(value, receipt));
  if (!isRecord(current)) return current;

  const award = receipt.progressAwards.find((item) => item.progressId === current.id);
  if (award && typeof current.currentXp === 'number') {
    const delta = receipt.reverted ? -award.xpGained : award.xpGained;
    return {
      ...current,
      ...growthLevelProgress(current.currentXp + delta, numeric(current.baseXp) || 100),
    };
  }

  let changed = false;
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(current)) {
    const updated = updateGrowthProgress(value, receipt);
    if (updated !== value) {
      next[key] = updated;
      changed = true;
    }
  }
  return changed ? next : current;
}

function growthLevelProgress(xp: number, baseXp: number) {
  const safeBaseXp = Math.max(10, Math.min(10_000, Math.trunc(baseXp)));
  const currentXp = Math.max(0, Math.trunc(xp));
  const level = Math.floor(Math.sqrt(currentXp / safeBaseXp)) + 1;
  const levelStartXp = safeBaseXp * (level - 1) ** 2;
  const nextLevelXp = safeBaseXp * level ** 2;
  return {
    level,
    currentXp,
    levelStartXp,
    nextLevelXp,
    progressXp: currentXp - levelStartXp,
    requiredXp: nextLevelXp - levelStartXp,
    baseXp: safeBaseXp,
  };
}

export async function invalidateSyncChanges(queryClient: QueryClient, response: SyncResponse): Promise<void> {
  const fallbackPrefixes = new Set<string>();
  const exactKeys = response.conflicts
    .filter((conflict) => conflict.entityType === 'growthattributemapping')
    .map((conflict) => ['growth', 'attribute-mappings', conflict.entityId] as QueryKey);
  for (const change of response.changes) {
    if (change.complete && ['task', 'tasklist', 'habit', 'deck', 'card'].includes(change.entityType)) {
      applyCompleteChange(queryClient, change, fallbackPrefixes);
      continue;
    }
    for (const prefix of QUERY_PREFIXES[change.entityType] ?? []) fallbackPrefixes.add(prefix);
  }
  await Promise.all([
    ...exactKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false })),
    ...[...fallbackPrefixes].map((prefix) =>
      queryClient.invalidateQueries({ queryKey: [prefix], refetchType: 'active' }, { cancelRefetch: false }),
    ),
  ]);
}

function applyCompleteChange(
  queryClient: QueryClient,
  change: SyncResponse['changes'][number],
  fallbackPrefixes: Set<string>,
): void {
  if (change.entityType === 'task') {
    updateTaskQueries(queryClient, change);
    // task-lists carries per-list open-task counts used by the planning sidebar.
    ['trash', 'study-calendar', 'dashboard', 'task-lists'].forEach((prefix) => fallbackPrefixes.add(prefix));
    return;
  }
  if (change.entityType === 'tasklist') {
    updateFlatQueries(queryClient, 'task-lists', change);
    return;
  }
  if (change.entityType === 'habit') {
    updateFlatQueries(queryClient, 'habits', change);
    ['habit-occurrences', 'habit-stats', 'study-calendar'].forEach((prefix) => fallbackPrefixes.add(prefix));
    return;
  }
  if (change.entityType === 'deck') {
    updateInfiniteQueries(queryClient, 'decks', change, 1);
    queryClient.setQueryData(['deck', change.entityId], change.deleted ? undefined : change.data);
    ['dashboard', 'trash', 'study-calendar'].forEach((prefix) => fallbackPrefixes.add(prefix));
    return;
  }
  if (change.entityType === 'card') {
    updateInfiniteQueries(queryClient, 'cards', change, 2);
    ['deck', 'decks', 'deck-stats', 'due', 'dashboard', 'trash', 'study-calendar'].forEach((prefix) =>
      fallbackPrefixes.add(prefix),
    );
  }
}

function updateFlatQueries(queryClient: QueryClient, prefix: string, change: SyncResponse['changes'][number]): void {
  queryClient.setQueriesData({ queryKey: [prefix] }, (current) =>
    updateCollection(current, change.entityId, change.data, change.deleted),
  );
}

function updateTaskQueries(queryClient: QueryClient, change: SyncResponse['changes'][number]): void {
  const queries = queryClient.getQueryCache().findAll({ queryKey: ['tasks'] });
  for (const query of queries) {
    const key = query.queryKey;
    if (!isTaskQueryData(query.state.data)) {
      void queryClient.invalidateQueries({ queryKey: key, exact: true }, { cancelRefetch: false });
      continue;
    }
    const search = typeof key[4] === 'string' ? key[4] : '';
    if (search) {
      void queryClient.invalidateQueries({ queryKey: key, exact: true }, { cancelRefetch: false });
      continue;
    }
    queryClient.setQueryData(key, (current: unknown) => {
      if (!isTaskQueryData(current)) return current;
      const items = Array.isArray(current) ? current : current.data;
      const without = items.filter((item) => !isEntity(item, change.entityId));
      if (change.deleted || !isRecord(change.data) || !matchesTaskQuery(change.data, key)) {
        return Array.isArray(current) ? without : { ...current, data: without };
      }
      const existing = items.find((item) => isEntity(item, change.entityId));
      if (isRecord(existing) && isNewer(existing, change.data)) return current;
      const data = [...without, mergeForCache(existing, change.data)].sort(compareTasks);
      return Array.isArray(current) ? data : { ...current, data };
    });
  }
}

function isTaskQueryData(value: unknown): value is unknown[] | { data: unknown[] } {
  return Array.isArray(value) || (isRecord(value) && Array.isArray(value.data));
}

function matchesTaskQuery(task: Record<string, unknown>, queryKey: QueryKey): boolean {
  const view = typeof queryKey[1] === 'string' ? queryKey[1] : 'all';
  const taskListId = typeof queryKey[2] === 'string' && queryKey[2] ? queryKey[2] : null;
  const tagId = typeof queryKey[3] === 'string' && queryKey[3] ? queryKey[3] : null;
  if (taskListId && (task.taskListId ?? task.projectId) !== taskListId) return false;
  if (tagId && !taskHasTag(task, tagId)) return false;
  const status = typeof task.status === 'string' ? task.status : '';
  if (!['all', 'focusable', 'all-subtasks'].includes(view) && ['ARCHIVED', 'CANCELED'].includes(status)) return false;
  const dayEnd = new Date();
  dayEnd.setUTCHours(23, 59, 59, 999);
  if (view === 'today') {
    return dateAtOrBefore(task.scheduledStartAt, dayEnd) || dateAtOrBefore(task.dueAt, dayEnd);
  }
  if (view === 'upcoming') return dateAfter(task.scheduledStartAt, dayEnd);
  if (view === 'inbox') {
    return !task.taskListId && !task.projectId && !task.scheduledStartAt && status === 'INBOX';
  }
  return true;
}

function taskHasTag(task: Record<string, unknown>, tagId: string): boolean {
  return (
    Array.isArray(task.tags) &&
    task.tags.some((assignment) => {
      if (!isRecord(assignment)) return false;
      if (assignment.id === tagId) return true;
      return isRecord(assignment.tag) && assignment.tag.id === tagId;
    })
  );
}

function dateAtOrBefore(value: unknown, boundary: Date): boolean {
  return typeof value === 'string' && new Date(value) <= boundary;
}

function dateAfter(value: unknown, boundary: Date): boolean {
  return typeof value === 'string' && new Date(value) > boundary;
}

function compareTasks(left: unknown, right: unknown): number {
  if (!isRecord(left) || !isRecord(right)) return 0;
  const completed = compareNullableDatesAscending(left.completedAt, right.completedAt);
  if (completed !== 0) return completed;
  const order = numeric(left.sortOrder) - numeric(right.sortOrder);
  if (order !== 0) return order;
  return nullableDate(right.createdAt) - nullableDate(left.createdAt);
}

function compareNullableDatesAscending(left: unknown, right: unknown): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return nullableDate(left) - nullableDate(right);
}

function nullableDate(value: unknown): number {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function numeric(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function updateInfiniteQueries(
  queryClient: QueryClient,
  prefix: string,
  change: SyncResponse['changes'][number],
  searchIndex: number,
): void {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [prefix] })) {
    const search = typeof query.queryKey[searchIndex] === 'string' ? query.queryKey[searchIndex] : '';
    if (search && search !== 'move-options') {
      void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: false });
      continue;
    }
    const belongs =
      prefix !== 'cards' ||
      (isRecord(change.data) && typeof change.data.deckId === 'string' && change.data.deckId === query.queryKey[1]);
    queryClient.setQueryData(query.queryKey, (current: unknown) =>
      updateInfiniteData(current, change, belongs, prefix),
    );
  }
}

function updateInfiniteData(
  current: unknown,
  change: SyncResponse['changes'][number],
  belongs: boolean,
  prefix: string,
): unknown {
  if (!isRecord(current) || !Array.isArray(current.pages)) return current;
  let found = false;
  const pages = current.pages.map((page) => {
    if (!isRecord(page) || !Array.isArray(page.data)) return page;
    if (page.data.some((item) => isEntity(item, change.entityId))) found = true;
    const data = updateCollection(page.data, change.entityId, change.data, change.deleted || !belongs, false);
    return {
      ...page,
      data: Array.isArray(data) ? [...data].sort((left, right) => compareLibraryItems(left, right, prefix)) : data,
    };
  });
  if (
    belongs &&
    !found &&
    !change.deleted &&
    isRecord(change.data) &&
    isRecord(pages[0]) &&
    Array.isArray(pages[0].data)
  ) {
    pages[0] = {
      ...pages[0],
      data: [change.data, ...pages[0].data].sort((left, right) => compareLibraryItems(left, right, prefix)),
    };
  }
  return { ...current, pages };
}

function compareLibraryItems(left: unknown, right: unknown, prefix: string): number {
  if (!isRecord(left) || !isRecord(right)) return 0;
  if (prefix === 'decks' && Boolean(left.isDefault) !== Boolean(right.isDefault)) {
    return Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault));
  }
  const created = nullableDate(right.createdAt) - nullableDate(left.createdAt);
  if (created !== 0) return created;
  return String(right.id ?? '').localeCompare(String(left.id ?? ''));
}

function updateCollection(
  current: unknown,
  entityId: string,
  data: unknown,
  deleted: boolean,
  allowInsert = true,
): unknown {
  if (!Array.isArray(current)) return current;
  const existing = current.find((item) => isEntity(item, entityId));
  if (deleted) return current.filter((item) => !isEntity(item, entityId));
  if (!isRecord(data)) return current;
  if (isRecord(existing) && isNewer(existing, data)) return current;
  const next = current.map((item) => (isEntity(item, entityId) ? mergeForCache(item, data) : item));
  if (!existing && allowInsert) next.unshift(data);
  return next;
}

function mergeForCache(existing: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(existing)) return incoming;
  const merged = { ...existing, ...incoming };
  if (existing.studyStats && incoming.studyStats) merged.studyStats = existing.studyStats;
  return merged;
}

function isNewer(existing: Record<string, unknown>, incoming: Record<string, unknown>): boolean {
  return (
    typeof existing.version === 'number' && typeof incoming.version === 'number' && existing.version > incoming.version
  );
}

function updateCachedValue(current: unknown, entityId: string, data: unknown, deleted: boolean): unknown {
  return updateCachedEntity(current, entityId, data, deleted, true, true);
}

function updateCachedEntity(
  current: unknown,
  entityId: string,
  data: unknown,
  deleted: boolean,
  allowInsert: boolean,
  insertIntoDataArrays: boolean,
): unknown {
  if (Array.isArray(current)) {
    const found = current.some((item) => isEntity(item, entityId));
    const updated = current
      .filter((item) => !(deleted && isEntity(item, entityId)))
      .map((item) =>
        isEntity(item, entityId) && !deleted
          ? mergeEntity(item, data)
          : updateCachedEntity(item, entityId, data, deleted, false, insertIntoDataArrays),
      );
    if (allowInsert && !deleted && !found && isRecord(data)) updated.push(data);
    return updated;
  }
  if (!isRecord(current)) return current;
  if (current.id === entityId) return deleted ? undefined : mergeEntity(current, data);
  let changed = false;
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(current)) {
    const updated = updateCachedEntity(
      value,
      entityId,
      data,
      deleted,
      insertIntoDataArrays && key === 'data',
      insertIntoDataArrays,
    );
    if (updated !== value) {
      next[key] = updated;
      changed = true;
    }
  }
  return changed ? next : current;
}

function mergeEntity(current: Record<string, unknown>, data: unknown): unknown {
  if (isRecord(data) && isNewer(current, data)) return current;
  return isRecord(data) ? { ...current, ...data } : current;
}

function isEntity(value: unknown, id: string): value is Record<string, unknown> {
  return isRecord(value) && value.id === id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function shouldPersistQuery(queryKey: QueryKey): boolean {
  const prefix = queryKey[0];
  return typeof prefix === 'string' && !['notifications'].includes(prefix);
}

export function shouldDehydrateOfflineQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && shouldPersistQuery(query.queryKey);
}
