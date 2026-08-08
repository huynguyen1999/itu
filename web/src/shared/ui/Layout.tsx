import {
  Brain,
  Bell,
  BarChart3,
  CalendarDays,
  CheckSquare2,
  Focus,
  LogOut,
  Moon,
  Settings,
  Sun,
  Trash2,
  Repeat2,
  Grid2X2,
  Home,
  Cloud,
  CloudOff,
  RefreshCw,
  TriangleAlert,
  Sprout,
  Inbox,
  CircleDot,
  MoreHorizontal,
  User,
  BookOpen,
  WalletCards,
  Dumbbell,
} from 'lucide-react';
import {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from './ThemeProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSync } from '../sync/SyncProvider';
import type { ClientSyncMutation, SyncState } from '../sync/syncQueue';

const SYNCING_STATUS_DELAY_MS = 200;
const WORKSPACE_NAVIGATION_ORDER_KEY = 'itu.workspace-navigation-order';

export const workspaceNavigation = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/plan', label: 'Plan', icon: CheckSquare2, end: false },
  { to: '/matrix', label: 'Matrix', icon: Grid2X2, end: false },
  { to: '/focus', label: 'Focus', icon: Focus, end: false },
  { to: '/habits', label: 'Habits', icon: Repeat2, end: false },
  { to: '/statistics', label: 'Statistics', icon: BarChart3, end: false },
  { to: '/budget', label: 'Budget', icon: WalletCards, end: false },
  { to: '/gym', label: 'Gym', icon: Dumbbell, end: false },
  { to: '/journal', label: 'Journal', icon: BookOpen, end: false },
  { to: '/learn', label: 'Learn', icon: Brain, end: false },
  { to: '/growth', label: 'Growth', icon: Sprout, end: false },
  { to: '/trash', label: 'Trash', icon: Trash2, end: false },
] as const;

type WorkspaceNavigationItem = (typeof workspaceNavigation)[number];
type WorkspaceNavigationDropPosition = 'before' | 'after';

const planningNavigation = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, end: false },
  { to: '/plan/today', label: 'Today', icon: CalendarDays, end: false },
  { to: '/upcoming', label: 'Next 7 Days', icon: CircleDot, end: false },
] as const;

const CORE_PRODUCTIVITY_PATHS = new Set(['/', '/plan', '/matrix', '/focus']);
const TRACKING_PATHS = new Set(['/habits', '/statistics', '/budget', '/gym']);

function groupWorkspaceNavigation(items: readonly WorkspaceNavigationItem[]) {
  const productivity = items.filter((item) => CORE_PRODUCTIVITY_PATHS.has(item.to));
  const tracking = items.filter((item) => TRACKING_PATHS.has(item.to));
  const knowledge = items.filter((item) => !CORE_PRODUCTIVITY_PATHS.has(item.to) && !TRACKING_PATHS.has(item.to));

  return [
    { title: 'Productivity', items: productivity },
    { title: 'Tracking', items: tracking },
    { title: 'Knowledge', items: knowledge },
  ].filter((group) => group.items.length > 0);
}

export function Layout({
  planningSidebar,
  globalFocusTimer,
}: {
  planningSidebar?: ReactNode;
  globalFocusTimer?: ReactNode;
}) {
  const auth = useAuth();
  const theme = useTheme();
  const location = useLocation();
  const [railWidth, setRailWidth] = useStoredNumber('itu.app-rail-width', 236);
  const [orderedWorkspaceNavigation, setOrderedWorkspaceNavigation] = useStoredWorkspaceNavigation();
  const [draggedWorkspaceNavigationItem, setDraggedWorkspaceNavigationItem] = useState<string | null>(null);
  const [workspaceNavigationDropTarget, setWorkspaceNavigationDropTarget] = useState<{
    to: string;
    position: WorkspaceNavigationDropPosition;
  } | null>(null);
  const railCompact = railWidth < 132;
  const userLabel = auth.user?.displayName || auth.user?.email || 'Profile';
  const ThemeIcon = theme.theme === 'dark' ? Sun : Moon;
  const growth = useQuery({ queryKey: ['growth', 'overview'], queryFn: () => api.growthOverview(), retry: 1 });

  const isPlanningWorkspace = ['/plan', '/inbox', '/upcoming'].some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  );
  const isLearnWorkspace = location.pathname === '/learn' || location.pathname.startsWith('/learn/');
  const isGrowthWorkspace = location.pathname === '/growth' || location.pathname.startsWith('/growth/');
  const isJournalWorkspace = location.pathname === '/journal' || location.pathname.startsWith('/journal/');
  const isBudgetWorkspace = location.pathname === '/budget' || location.pathname.startsWith('/budget/');
  const isGymWorkspace = location.pathname === '/gym' || location.pathname.startsWith('/gym/');
  const isFullBleedWorkspace =
    isPlanningWorkspace ||
    isLearnWorkspace ||
    isGrowthWorkspace ||
    isJournalWorkspace ||
    isBudgetWorkspace ||
    isGymWorkspace;
  const moreNavigationActive =
    orderedWorkspaceNavigation.slice(5).some((item) => location.pathname.startsWith(item.to)) ||
    planningNavigation.some((item) => location.pathname === item.to) ||
    location.pathname === '/profile' ||
    location.pathname === '/settings';

  function beginRailResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = railWidth;
    let nextWidth = startWidth;
    const resize = (pointerEvent: PointerEvent) => {
      nextWidth = Math.min(320, Math.max(72, startWidth + pointerEvent.clientX - startX));
      setRailWidth(nextWidth);
    };
    const finish = () => {
      setRailWidth(nextWidth < 160 ? 72 : Math.max(184, nextWidth));
      document.body.classList.remove('itu-is-resizing');
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', finish);
    };
    document.body.classList.add('itu-is-resizing');
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', finish, { once: true });
  }

  function moveWorkspaceNavigationItem(targetTo: string, position: WorkspaceNavigationDropPosition) {
    if (!draggedWorkspaceNavigationItem || draggedWorkspaceNavigationItem === targetTo) return;
    setOrderedWorkspaceNavigation((items) =>
      reorderWorkspaceNavigation(items, draggedWorkspaceNavigationItem, targetTo, position),
    );
  }

  function handleWorkspaceNavigationDragStart(event: ReactDragEvent<HTMLElement>, item: WorkspaceNavigationItem) {
    setDraggedWorkspaceNavigationItem(item.to);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.to);
  }

  function handleWorkspaceNavigationDragOver(event: ReactDragEvent<HTMLElement>, targetTo: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setWorkspaceNavigationDropTarget(
      draggedWorkspaceNavigationItem && draggedWorkspaceNavigationItem !== targetTo
        ? {
            to: targetTo,
            position: getWorkspaceNavigationDropPosition(event.currentTarget.getBoundingClientRect(), event.clientY),
          }
        : null,
    );
  }

  return (
    <div className="itu-app-shell min-h-screen md:flex">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[10000] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to main content
      </a>
      <aside
        className={`itu-app-rail ${railCompact ? 'is-compact' : ''}`}
        style={{ '--itu-app-rail-width': `${railWidth}px` } as CSSProperties}
      >
        <div className="itu-app-rail__brand">
          <Brand compact={railCompact} />
        </div>

        <nav
          className="itu-app-rail__nav space-y-3"
          aria-label="Primary navigation"
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setWorkspaceNavigationDropTarget(null);
            }
          }}
        >
          {groupWorkspaceNavigation(orderedWorkspaceNavigation).map((group) => (
            <div key={group.title} className="itu-app-rail__group">
              {!railCompact && (
                <div className="px-3 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground/60 select-none">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <div
                    key={item.to}
                    className={`itu-primary-nav-item${draggedWorkspaceNavigationItem === item.to ? ' is-dragging' : ''}${
                      workspaceNavigationDropTarget?.to === item.to
                        ? ` is-drop-target is-drop-target-${workspaceNavigationDropTarget.position}`
                        : ''
                    }`}
                    draggable
                    onDragStart={(event) => handleWorkspaceNavigationDragStart(event, item)}
                    onDragOver={(event) => handleWorkspaceNavigationDragOver(event, item.to)}
                    onDrop={(event) => {
                      event.preventDefault();
                      moveWorkspaceNavigationItem(
                        item.to,
                        getWorkspaceNavigationDropPosition(event.currentTarget.getBoundingClientRect(), event.clientY),
                      );
                      setWorkspaceNavigationDropTarget(null);
                    }}
                    onDragEnd={() => {
                      setDraggedWorkspaceNavigationItem(null);
                      setWorkspaceNavigationDropTarget(null);
                    }}
                  >
                    <NavigationLink {...item} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="itu-app-rail__footer">
          <SyncStatus compact={railCompact} />
          <NotificationMenu />
          <AccountMenu userLabel={userLabel} account={growth.data?.account} compact={railCompact} onLogout={auth.logout} />
        </div>
        <button
          className="itu-app-rail__resizer hidden md:block"
          aria-label="Resize primary navigation"
          title="Drag to resize primary navigation"
          onPointerDown={beginRailResize}
        />
      </aside>

      <div className={`flex min-h-screen min-w-0 flex-1 ${isPlanningWorkspace ? 'flex-col lg:flex-row' : 'flex-col'}`}>
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={theme.toggleTheme} aria-label="Toggle dark mode">
              <ThemeIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={auth.logout} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {isPlanningWorkspace && planningSidebar}

        <main
          id="main-content"
          tabIndex={-1}
          className={
            isFullBleedWorkspace
              ? 'min-h-0 flex-1 pb-20 lg:h-screen lg:overflow-hidden lg:pb-0'
              : 'flex-1 px-4 py-6 pb-24 sm:px-6 md:px-8 md:py-8 md:pb-8'
          }
        >
          <div className={isFullBleedWorkspace ? 'h-full w-full' : 'mx-auto w-full max-w-6xl'}>
            <Outlet />
          </div>
        </main>
        {globalFocusTimer}

        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur md:hidden"
          aria-label="Primary navigation"
        >
          {orderedWorkspaceNavigation.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More navigation"
                className={`flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  moreNavigationActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span>More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-56">
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {orderedWorkspaceNavigation.slice(5).map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Planning views</DropdownMenuLabel>
              {planningNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </div>
  );
}

function SyncStatus({ compact, iconOnly = false }: { compact: boolean; iconOnly?: boolean }) {
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

function NotificationMenu({ iconOnly = false }: { iconOnly?: boolean }) {
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

function AccountMenu({
  userLabel,
  account,
  compact,
  onLogout,
}: {
  userLabel: string;
  account?: {
    level: number;
    progressXp: number;
    requiredXp: number;
  };
  compact: boolean;
  onLogout: () => void;
}) {
  const progressPercent = account
    ? Math.min(100, Math.max(0, (account.progressXp / Math.max(1, account.requiredXp)) * 100))
    : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`itu-app-rail__account-trigger ${compact ? 'is-compact' : ''} w-full flex items-center gap-2 text-left`}
          aria-label="Account menu"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-white">
            {userLabel.charAt(0).toUpperCase()}
          </span>
          {!compact && (
            <span className="min-w-0 flex-1 flex flex-col justify-center">
              <span className="flex items-center justify-between gap-1 w-full">
                <span className="truncate text-xs font-semibold text-white leading-none">{userLabel}</span>
                {account && (
                  <span className="shrink-0 text-[9px] font-bold font-mono text-[#2ebd85] bg-[#2ebd85]/15 px-1.5 py-0.5 rounded-full leading-none">
                    Lv {account.level}
                  </span>
                )}
              </span>
              {account && (
                <span className="flex flex-col gap-1 mt-1.5">
                  <span className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <span 
                      className="block h-full bg-gradient-to-r from-[#2ebd85] to-[#0ea5e9]"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </span>
                  <span className="flex text-[9px] font-medium font-mono leading-none mt-0.5">
                    <span className="text-white/60">{account.progressXp}</span>
                    <span className="text-white/35"> / {account.requiredXp} XP</span>
                  </span>
                </span>
              )}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-48">
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User className="h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`itu-brand${compact ? ' is-compact' : ''}`} title="iTu">
      <span className="itu-brand__mark">
        <Brain className="h-4 w-4" />
      </span>
      {!compact && <span className="itu-brand__name">iTu</span>}
    </Link>
  );
}

function NavigationLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof CalendarDays;
  end: boolean;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `itu-primary-nav-link${isActive ? ' is-active' : ''}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="itu-app-rail__label">{label}</span>
    </NavLink>
  );
}

export function orderWorkspaceNavigation(
  items: readonly WorkspaceNavigationItem[],
  storedOrder: readonly string[] | null,
) {
  if (!storedOrder?.length) return [...items];

  const byPath = new Map<string, WorkspaceNavigationItem>(items.map((item) => [item.to, item]));
  const seen = new Set<string>();
  const ordered: WorkspaceNavigationItem[] = [];

  for (const path of storedOrder) {
    const item = byPath.get(path);
    if (!item || seen.has(path)) continue;
    ordered.push(item);
    seen.add(path);
  }

  for (const item of items) {
    if (!seen.has(item.to)) ordered.push(item);
  }

  return ordered;
}

export function reorderWorkspaceNavigation(
  items: readonly WorkspaceNavigationItem[],
  sourceTo: string,
  targetTo: string,
  position: WorkspaceNavigationDropPosition = 'before',
) {
  const next = [...items];
  const sourceIndex = next.findIndex((item) => item.to === sourceTo);
  if (sourceIndex < 0 || sourceTo === targetTo) return next;

  const [source] = next.splice(sourceIndex, 1);
  const targetIndex = next.findIndex((item) => item.to === targetTo);
  if (targetIndex < 0) return [...items];

  next.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, source);
  return next;
}

export function getWorkspaceNavigationDropPosition(
  targetBounds: Pick<DOMRect, 'top' | 'height'>,
  pointerY: number,
): WorkspaceNavigationDropPosition {
  return pointerY >= targetBounds.top + targetBounds.height / 2 ? 'after' : 'before';
}

function useStoredWorkspaceNavigation() {
  const [items, setItems] = useState(() =>
    orderWorkspaceNavigation(workspaceNavigation, readWorkspaceNavigationOrder()),
  );

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_NAVIGATION_ORDER_KEY, JSON.stringify(items.map((item) => item.to)));
  }, [items]);

  return [items, setItems] as const;
}

function readWorkspaceNavigationOrder() {
  const stored = window.localStorage.getItem(WORKSPACE_NAVIGATION_ORDER_KEY);
  if (!stored) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : null;
  } catch {
    return null;
  }
}

function useStoredNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  });
  useEffect(() => window.localStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue] as const;
}
