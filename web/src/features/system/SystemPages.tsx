import { Bell, Check, TriangleAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Button } from '@/shared/ui/button';
import { useSync } from '@/shared/sync/SyncProvider';

export function ConflictsPage() {
  const { conflicts, keepServer, keepMine } = useSync();

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="System"
        title="Conflicts"
        description="Review changes that need a decision before synchronization can finish."
      />
      {conflicts.length === 0 ? (
        <div className="grid min-h-40 place-content-center rounded-xl border border-dashed p-8 text-center">
          <Check className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-3 font-semibold">No sync conflicts</p>
          <p className="mt-1 text-sm text-muted-foreground">Your local changes are reconciled.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conflicts.map((conflict) => (
            <article key={conflict.mutationId} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{conflict.entityType} conflict</h2>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {conflict.reason.replaceAll('_', ' ').toLowerCase()} · {conflict.entityId}
                  </p>
                  {conflict.conflictingFields?.length ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Changed fields: {conflict.conflictingFields.join(', ')}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void keepServer(conflict.mutationId)}>
                      Use server
                    </Button>
                    <Button size="sm" onClick={() => void keepMine(conflict.mutationId)}>
                      Keep local
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api.notifications() });
  const readOne = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const items = notifications.data ?? [];
  const unreadCount = items.filter((notification) => !notification.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="System"
        title="Notifications"
        description="Delivered reminders and updates from your workspace."
      >
        {unreadCount > 0 && (
          <Button variant="outline" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            Mark all read
          </Button>
        )}
      </PageHeader>
      {notifications.isLoading && <p className="text-sm text-muted-foreground">Loading notifications…</p>}
      {notifications.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <span>Could not load notifications.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void notifications.refetch()}
            disabled={notifications.isRefetching}
          >
            {notifications.isRefetching ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}
      {!notifications.isLoading && !notifications.isError && items.length === 0 && (
        <div className="grid min-h-40 place-content-center rounded-xl border border-dashed p-8 text-center">
          <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 font-semibold">No notifications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">New reminders and updates will appear here.</p>
        </div>
      )}
      <div className="space-y-2">
        {items.map((notification) => (
          <Link
            key={notification.id}
            to={notification.actionUrl}
            className={`block rounded-xl border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              notification.readAt ? 'opacity-65' : 'border-primary/30 bg-primary/5'
            }`}
            onClick={() => {
              if (!notification.readAt) readOne.mutate(notification.id);
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-semibold">{notification.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={notification.createdAt}>
                {formatNotificationDate(notification.createdAt)}
              </time>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
