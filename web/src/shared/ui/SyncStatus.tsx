import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Button } from '@/shared/ui/button';
import { useSync } from '../sync/SyncProvider';
import type { ClientSyncMutation, SyncState } from '../sync/syncQueue';

const SYNCING_STATUS_DELAY_MS = 200;

export function SyncStatus({ compact, iconOnly = false }: { compact: boolean; iconOnly?: boolean }) {
  const {
    state,
    conflicts,
    pendingMutations,
    flush,
    keepMine,
    keepServer,
    retryPending,
    keepLocalPending,
    discardPending,
    discardAllFailed,
  } = useSync();
  const displayState = useStableSyncStatus(state);
  const [open, setOpen] = useState(false);
  const [discardPendingId, setDiscardPendingId] = useState<string | null>(null);
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const conflictMutationIds = new Set(conflicts.map((conflict) => conflict.mutationId));
  const visiblePendingMutations = pendingMutations.filter((mutation) => !conflictMutationIds.has(mutation.id));
  const failedMutations = visiblePendingMutations.filter((mutation) => mutation.attemptCount || mutation.lastErrorCode);
  const Icon =
    displayState.phase === 'offline'
      ? CloudOff
      : displayState.phase === 'syncing'
        ? RefreshCw
        : displayState.phase === 'conflict'
          ? TriangleAlert
          : Cloud;
  const label = getSyncStatusLabel(displayState);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size={iconOnly ? 'icon' : 'default'}
        className={
          iconOnly
            ? 'h-9 w-9 text-slate-500 hover:text-slate-900'
            : 'w-full justify-start gap-3 text-slate-500 hover:text-slate-900'
        }
        onClick={() => (conflicts.length || pendingMutations.length ? setOpen((value) => !value) : void flush())}
        aria-live="polite"
        aria-expanded={conflicts.length || pendingMutations.length ? open : undefined}
        aria-label={label}
        title={label}
      >
        <Icon className={`h-4 w-4 shrink-0 ${displayState.phase === 'syncing' ? 'animate-spin' : ''}`} />
        {!iconOnly && <span className="itu-app-rail__label">{label}</span>}
      </Button>
      {open &&
        (conflicts.length > 0 || pendingMutations.length > 0) &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" aria-hidden="true" onClick={() => setOpen(false)} />
            <section
              className={`fixed bottom-16 z-[9999] w-96 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 shadow-xl ${
                compact ? 'left-16' : 'left-3'
              }`}
              aria-label="Sync reconciliation"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <strong className="text-sm">Reconcile pending changes</strong>
                <button
                  type="button"
                  className="text-xs text-muted-foreground"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {visiblePendingMutations.map((mutation) => (
                  <article key={mutation.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{pendingMutationLabel(mutation)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{pendingMutationErrorLabel(mutation)}</p>
                      </div>
                      {mutation.attemptCount ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {mutation.attemptCount} {mutation.attemptCount === 1 ? 'attempt' : 'attempts'}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void retryPending(mutation.id)}>
                        Retry
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void keepLocalPending(mutation.id)}>
                        Keep local
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDiscardPendingId(mutation.id)}>
                        Use server
                      </Button>
                    </div>
                  </article>
                ))}
                {conflicts.map((conflict) => (
                  <article key={conflict.mutationId} className="rounded-lg border bg-background p-3">
                    <p className="text-sm font-medium">
                      {conflict.entityType} · {conflict.reason.replaceAll('_', ' ').toLowerCase()}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {conflict.conflictingFields?.length
                        ? `Both versions changed: ${conflict.conflictingFields.join(', ')}. Your offline draft is preserved until you choose.`
                        : 'Your offline draft is preserved until you choose a version.'}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void keepServer(conflict.mutationId)}>
                        Keep server
                      </Button>
                      <Button size="sm" onClick={() => void keepMine(conflict.mutationId)}>
                        Keep mine
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => void flush()}>
                  Retry all
                </Button>
                {failedMutations.length > 0 ? (
                  <Button size="sm" variant="destructive" onClick={() => setConfirmDiscardAllOpen(true)}>
                    Discard failed
                  </Button>
                ) : null}
              </div>
            </section>
          </>,
          document.body,
        )}
      <ConfirmDialog
        open={Boolean(discardPendingId)}
        onOpenChange={(nextOpen) => !nextOpen && setDiscardPendingId(null)}
        title="Use server version?"
        description="This local pending change will be discarded."
        confirmLabel="Use server"
        onConfirm={() => {
          if (!discardPendingId) return;
          void discardPending(discardPendingId);
          setDiscardPendingId(null);
        }}
      />
      <ConfirmDialog
        open={confirmDiscardAllOpen}
        onOpenChange={setConfirmDiscardAllOpen}
        title="Discard failed changes?"
        description={`Discard ${failedMutations.length} failed local change${failedMutations.length === 1 ? '' : 's'} and reload server data?`}
        confirmLabel="Discard failed"
        onConfirm={() => {
          void discardAllFailed();
          setConfirmDiscardAllOpen(false);
        }}
      />
    </div>
  );
}

export function pendingMutationLabel(mutation: ClientSyncMutation): string {
  const [entity, operation] = mutation.kind.split('.');
  const title = typeof mutation.payload.title === 'string' ? mutation.payload.title : null;
  const action = operation === 'create' ? 'Create' : operation === 'delete' ? 'Delete' : 'Update';
  const subject = title ? `“${title}”` : `${entity || 'item'} ${mutation.entityId.slice(0, 8)}`;
  return `${action} ${subject}`;
}

export function pendingMutationErrorLabel(mutation: ClientSyncMutation): string {
  if (!mutation.lastErrorCode) return 'Waiting to sync.';
  return (
    {
      AUTH: 'Sign-in is required before this change can sync.',
      RATE_LIMITED: 'The server is busy. This change will retry automatically.',
      SERVER: 'The server could not apply this change. It will retry automatically.',
      CLIENT: 'The server rejected this change. Choose Keep local or Use server.',
      OFFLINE: 'The API was unreachable when this change last tried to sync.',
      NETWORK_OR_UNKNOWN: 'The API could not be reached or returned an unexpected response.',
    }[mutation.lastErrorCode] ?? `Sync failed: ${mutation.lastErrorCode.toLowerCase().replaceAll('_', ' ')}.`
  );
}

function useStableSyncStatus(state: SyncState): SyncState {
  const [displayState, setDisplayState] = useState(state);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (state.phase === 'syncing') {
      timer.current = setTimeout(() => setDisplayState(state), SYNCING_STATUS_DELAY_MS);
    } else {
      setDisplayState(state);
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  return displayState;
}

export function getSyncStatusLabel(state: SyncState): string {
  if (state.phase === 'offline') {
    return state.pendingCount
      ? `Offline - ${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} pending`
      : 'Offline';
  }
  if (state.phase === 'syncing') return 'Syncing';
  if (state.phase === 'conflict') {
    return `${state.conflictCount} sync conflict${state.conflictCount === 1 ? '' : 's'}`;
  }
  if (state.pendingCount) {
    return `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} pending`;
  }
  return 'Up to date';
}
