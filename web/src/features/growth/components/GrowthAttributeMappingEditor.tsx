import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Save } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthAttributeMapping, GrowthAttributeMappingDraft, GrowthSkill } from '@/shared/api/types';
import { isSelectableGrowthEntry } from '@/shared/growthEntryFilters';
import { useSync } from '@/shared/sync/SyncProvider';
import type { ClientSyncMutation } from '@/shared/sync/syncQueue';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { validateGrowthAttributeMappings } from '../growthAttributeMappings';

type MappingEditorProps = { skill: GrowthSkill };

const emptyMapping = (): GrowthAttributeMappingDraft[] => [{ attributeId: '', slot: 'PRIMARY', weight: 100 }];

export function growthMappingSummary(mappings: GrowthAttributeMapping[], activeAttributes: GrowthSkill[]) {
  return mappings
    .map((mapping) => {
      const name =
        mapping.attribute?.name ?? activeAttributes.find((attribute) => attribute.id === mapping.attributeId)?.name;
      return `${name ?? 'Attribute'} ${mapping.weight}%`;
    })
    .join(' · ');
}

export function growthMappingSyncStatus({
  pending,
  errorCode,
  offline,
}: {
  pending: boolean;
  errorCode?: string;
  offline: boolean;
}) {
  if (errorCode) return `Attribute mapping sync failed (${errorCode.toLowerCase().replaceAll('_', ' ')}). Retry sync.`;
  if (pending)
    return offline
      ? 'Attribute mapping queued offline; it will sync when you reconnect.'
      : 'Attribute mapping queued for server sync.';
  return null;
}

export function shouldConfirmGrowthMapping({
  awaitingConfirmation,
  pendingSeen,
  pending,
  errorCode,
}: {
  awaitingConfirmation: boolean;
  pendingSeen: boolean;
  pending: boolean;
  errorCode?: string;
}) {
  return awaitingConfirmation && pendingSeen && !pending && !errorCode;
}

export function selectLatestGrowthMappingMutation(mutations: readonly ClientSyncMutation[], skillId: string) {
  return mutations
    .filter((mutation) => mutation.kind === 'growthattributemapping.upsert' && mutation.entityId === skillId)
    .sort((left, right) => {
      const occurredAt = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      return occurredAt || right.id.localeCompare(left.id);
    })[0];
}

export function GrowthAttributeMappingEditor({ skill }: MappingEditorProps) {
  const { state: syncState, pendingMutations, retryPending } = useSync();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<GrowthAttributeMappingDraft[]>(emptyMapping);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingMappingSeen, setPendingMappingSeen] = useState(false);
  const attributes = useQuery({
    queryKey: ['growth', 'attributes'],
    queryFn: () => api.growthAttributes(),
    enabled: skill.kind === 'SKILL',
  });
  const mappings = useQuery({
    queryKey: ['growth', 'attribute-mappings', skill.id],
    queryFn: () => api.growthAttributeMappings(skill.id),
    enabled: skill.kind === 'SKILL',
  });

  const activeAttributes = useMemo(() => (attributes.data ?? []).filter(isSelectableGrowthEntry), [attributes.data]);
  const pendingMapping = selectLatestGrowthMappingMutation(pendingMutations, skill.id);
  const syncStatus = growthMappingSyncStatus({
    pending: Boolean(pendingMapping),
    errorCode: pendingMapping?.lastErrorCode,
    offline: syncState.phase === 'offline',
  });

  useEffect(() => {
    if (!awaitingConfirmation) return;
    if (pendingMapping) {
      setPendingMappingSeen(true);
      if (pendingMapping.lastErrorCode) setNotice(null);
      return;
    }
    if (!shouldConfirmGrowthMapping({ awaitingConfirmation, pendingSeen: pendingMappingSeen, pending: false })) return;
    setAwaitingConfirmation(false);
    setPendingMappingSeen(false);
    setNotice('Attribute mapping saved and confirmed. History stays unchanged.');
  }, [awaitingConfirmation, pendingMapping, pendingMappingSeen]);

  useEffect(() => {
    if (!mappings.data) return;
    setDraft(
      mappings.data.length
        ? mappings.data.map(({ attributeId, slot, weight }) => ({ attributeId, slot, weight }))
        : emptyMapping(),
    );
  }, [mappings.data]);

  const save = useMutation({
    mutationFn: () => {
      const validation = validateGrowthAttributeMappings(draft);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      return api.upsertGrowthAttributeMappings({ skillId: skill.id, mappings: draft });
    },
    onSuccess: async () => {
      setNotice('Attribute mapping queued. It will apply after the server confirms; history stays unchanged.');
      setAwaitingConfirmation(true);
      setPendingMappingSeen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['growth', 'attribute-mappings', skill.id] }),
        queryClient.invalidateQueries({ queryKey: ['growth', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['growth', 'ledger'] }),
      ]);
    },
  });

  if (skill.kind !== 'SKILL') return null;

  const validation = validateGrowthAttributeMappings(draft);
  const updateMapping = (index: number, patch: Partial<GrowthAttributeMappingDraft>) => {
    setNotice(null);
    setAwaitingConfirmation(false);
    setPendingMappingSeen(false);
    setDraft((current) =>
      current.map((mapping, mappingIndex) => (mappingIndex === index ? { ...mapping, ...patch } : mapping)),
    );
  };

  return (
    <section
      className="mt-4 rounded-xl border border-border/70 bg-background/60 p-3"
      aria-label={`${skill.name} attribute mapping`}
    >
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
          <GitBranch className="h-3.5 w-3.5 text-violet-600" />
          Attribute routing
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{expanded ? 'Hide' : 'Edit'}</span>
      </button>

      {!expanded ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {mappings.data?.length ? growthMappingSummary(mappings.data, activeAttributes) : 'No route configured yet.'}
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {draft.map((mapping, index) => (
            <div key={mapping.slot} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto] sm:items-end">
              <label className="grid gap-1 text-xs font-semibold">
                {mapping.slot === 'PRIMARY' ? 'Primary attribute' : 'Secondary attribute'}
                <select
                  aria-label={`${mapping.slot === 'PRIMARY' ? 'Primary' : 'Secondary'} attribute`}
                  value={mapping.attributeId}
                  onChange={(event) => updateMapping(index, { attributeId: event.target.value })}
                  className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose an attribute</option>
                  {activeAttributes.map((attribute) => (
                    <option key={attribute.id} value={attribute.id}>
                      {attribute.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                Weight
                <span className="flex items-center gap-1">
                  <Input
                    aria-label={`${mapping.slot === 'PRIMARY' ? 'Primary' : 'Secondary'} weight percentage`}
                    type="number"
                    min={mapping.slot === 'PRIMARY' ? 70 : 1}
                    max={mapping.slot === 'PRIMARY' ? 100 : 30}
                    value={mapping.weight}
                    onChange={(event) => updateMapping(index, { weight: event.target.value })}
                    className="h-11"
                  />
                  <span aria-hidden="true" className="text-xs text-muted-foreground">
                    %
                  </span>
                </span>
              </label>
              {mapping.slot === 'SECONDARY' ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}

          {draft.length < 2 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-fit"
              onClick={() => setDraft((current) => [...current, { attributeId: '', slot: 'SECONDARY', weight: 0 }])}
            >
              Add secondary
            </Button>
          ) : null}

          <p
            className={`text-xs ${validation.valid ? 'text-muted-foreground' : 'text-destructive'}`}
            role={validation.valid ? undefined : 'alert'}
          >
            {validation.valid
              ? 'One primary is required. Optional secondary is limited to 30%; weights must total 100%.'
              : validation.errors.join(' ')}
          </p>
          {save.error instanceof Error ? (
            <p className="text-xs text-destructive" role="alert">
              {save.error.message}
            </p>
          ) : null}
          {notice ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300" role="status">
              {notice}
            </p>
          ) : null}
          {syncStatus ? (
            <div
              className="flex flex-wrap items-center gap-2"
              role={pendingMapping?.lastErrorCode ? 'alert' : 'status'}
            >
              <p className="text-xs text-muted-foreground">{syncStatus}</p>
              {pendingMapping?.lastErrorCode ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void retryPending(pendingMapping.id)}
                >
                  Retry sync
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button
            type="button"
            className="min-h-11 w-fit gap-2"
            disabled={save.isPending || !validation.valid}
            onClick={() => save.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> {save.isPending ? 'Saving…' : 'Save mapping'}
          </Button>
        </div>
      )}
    </section>
  );
}
