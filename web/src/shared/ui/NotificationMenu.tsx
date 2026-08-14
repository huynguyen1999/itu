import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Button } from './button';

export function NotificationMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications(),
  });
  const unread = (notifications.data ?? []).filter((notification) => !notification.readAt);
  const readOne = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (unread.length && 'Notification' in window && window.Notification.permission === 'granted') {
      const latest = unread[0];
      const key = `itu.notified.${latest.id}`;
      if (!sessionStorage.getItem(key)) {
        new window.Notification(latest.title, {
          body: latest.body,
          icon: '/favicon.ico',
          requireInteraction: true,
          silent: false,
        });
        sessionStorage.setItem(key, '1');
      }
    }
  }, [unread]);

  async function enableBrowserNotifications() {
    if ('Notification' in window) await window.Notification.requestPermission();
  }

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
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Notifications"
        title="Notifications"
      >
        <span className="relative">
          <Bell className="h-4 w-4 shrink-0" />
          {unread.length > 0 && (
            <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] text-white">
              {Math.min(unread.length, 9)}
            </span>
          )}
        </span>
        {!iconOnly && <span className="itu-app-rail__label">Notifications</span>}
      </Button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" aria-hidden="true" onClick={() => setOpen(false)} />
            <div
              className="fixed bottom-4 left-[calc(var(--itu-app-rail-width,236px)+0.75rem)] z-[9999] flex max-h-[calc(100vh-2rem)] w-[min(22rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
              role="dialog"
              aria-label="Notifications"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b bg-background px-4 py-3">
                <strong className="text-sm">Notifications</strong>
                <div className="flex items-center gap-3">
                  {unread.length > 0 && (
                    <button className="text-xs text-primary" onClick={() => readAll.mutate()}>
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setOpen(false);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
              {'Notification' in window && window.Notification.permission === 'default' && (
                <button className="mx-4 my-2 self-start text-xs text-primary" onClick={enableBrowserNotifications}>
                  Enable browser alerts
                </button>
              )}
              <div className="min-h-0 overflow-y-auto bg-background p-2">
                {(notifications.data ?? []).length === 0 && (
                  <div className="grid min-h-32 place-content-center gap-2 px-4 text-center text-muted-foreground">
                    <Bell className="mx-auto h-5 w-5 opacity-50" />
                    <p className="text-sm">No notifications yet.</p>
                  </div>
                )}
                {(notifications.data ?? []).map((notification) => (
                  <Link
                    key={notification.id}
                    to={notification.actionUrl}
                    className={`block rounded-lg px-2 py-2 text-sm hover:bg-muted ${notification.readAt ? 'opacity-60' : 'bg-primary/5'}`}
                    onClick={() => {
                      if (!notification.readAt) readOne.mutate(notification.id);
                      setOpen(false);
                    }}
                  >
                    <span className="block font-medium">{notification.title}</span>
                    <span className="text-xs text-muted-foreground">{notification.body}</span>
                  </Link>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
