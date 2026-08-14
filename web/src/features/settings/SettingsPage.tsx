import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  Cloud,
  LoaderCircle,
  LockKeyhole,
  Palette,
  KeyRound,
  ShieldCheck,
  Settings,
  UserRound,
} from 'lucide-react';
import { API_BASE_URL, api } from '@/shared/api/client';
import type { AuthSession, UsagePreferences, UserPreferencesResponse } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthProvider';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SettingsCard } from './components/SettingsCard';
import { AiSettingsPanel } from './AiSettingsPanel';
import { UsageDataSettings } from './UsageDataSettings';
import { DeviceSettings } from './DeviceSettings';
import {
  getBrowserNotificationPermission,
  notificationPermissionLabel,
  requestBrowserNotificationPermission,
} from './notificationPermissions';
import { useTheme } from '@/shared/ui/ThemeProvider';
import { useSearchParams } from 'react-router-dom';
import { getStoredFocusSettings, saveStoredFocusSettings } from '@/shared/utils/focusSettings';

export { notificationPermissionLabel } from './notificationPermissions';

type SettingsSection = 'appearance' | 'notifications' | 'profile' | 'security' | 'sync' | 'device' | 'ai';

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Account / Profile', icon: UserRound },
  { id: 'security', label: 'Security', icon: LockKeyhole },
  { id: 'sync', label: 'Sync & Data', icon: Cloud },
  { id: 'device', label: 'Device & Permissions', icon: ShieldCheck },
  { id: 'ai', label: 'AI / Gemini', icon: KeyRound },
];

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const [section, setSection] = useState<SettingsSection>(
    isSettingsSection(requestedSection) ? requestedSection : 'appearance',
  );
  useEffect(() => {
    if (isSettingsSection(requestedSection)) setSection(requestedSection);
  }, [requestedSection]);
  const theme = useTheme();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const preferences = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const updateUsage = useMutation({
    mutationFn: (patch: Partial<UsagePreferences>) => api.updateUsagePreferences(patch),
    onSuccess: (usage) => {
      queryClient.setQueryData<UserPreferencesResponse>(['user-preferences'], (current) =>
        current ? { ...current, usage } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
  const deleteUsage = useMutation({
    mutationFn: (range: { from?: string; to?: string }) => api.deleteUsageSummaries(range),
    onSuccess: () => {
      setDeleteMode(null);
      void queryClient.invalidateQueries({ queryKey: ['usage'] });
      void queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });
  const [browserDsnKey, setBrowserDsnKey] = useState('');
  const generateBrowserDsn = useMutation({
    mutationFn: () => api.generateBrowserExtensionDsn(),
    onSuccess: ({ dsnKey }) => setBrowserDsnKey(dsnKey),
  });
  const today = useMemo(() => localDateKey(new Date()), []);
  const [usageRange, setUsageRange] = useState(() => ({ from: shiftDate(today, -29), to: today }));
  const [deleteMode, setDeleteMode] = useState<'range' | 'all' | null>(null);
  const rangeError = validateUsageRange(usageRange);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        kicker="Preferences & System"
        title="Settings"
        description="Configure appearance, account security, cloud synchronization, and device system permissions."
      />
      <div className="grid gap-5 md:-ml-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border bg-card p-2 lg:sticky lg:top-8 lg:self-start">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                section === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              onClick={() => setSection(id)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </aside>

        <main className="min-w-0 space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">System Settings</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Application Preferences</h1>
          </div>

          {section === 'appearance' && (
            <SettingsCard
              icon={Palette}
              title="Theme"
              description="Switch the application visual theme between light and dark mode."
            >
              <Button onClick={theme.toggleTheme} className="w-fit">
                Use {theme.theme === 'dark' ? 'light' : 'dark'} mode
              </Button>
            </SettingsCard>
          )}
          {section === 'notifications' && (
            <SettingsCard
              icon={Bell}
              title="Notifications"
              description="Desktop and browser alert delivery permissions."
            >
              <NotificationSettings />
            </SettingsCard>
          )}
          {section === 'profile' && (
            <SettingsCard
              icon={UserRound}
              title="Account / Profile"
              description="Update the identity shown across your iTu workspace."
            >
              <ProfileSettings user={auth.user} onSave={auth.updateProfile} />
            </SettingsCard>
          )}
          {section === 'security' && (
            <SettingsCard
              icon={LockKeyhole}
              title="Security"
              description="Change your password and keep account access protected."
            >
              <SecuritySettings />
            </SettingsCard>
          )}
          {section === 'sync' && (
            <SettingsCard
              icon={Cloud}
              title="Sync & Data"
              description="Offline outbox queue status, cross-device replication state, and conflict resolution."
            >
              <UsageDataSettings
                preferences={preferences.data?.usage}
                isLoading={preferences.isLoading}
                isPending={updateUsage.isPending}
                onChange={(patch) => updateUsage.mutate(patch)}
                usageRange={usageRange}
                today={today}
                rangeError={rangeError}
                onRangeChange={setUsageRange}
                onDeleteRange={() => setDeleteMode('range')}
                onDeleteAll={() => setDeleteMode('all')}
                isDeleting={deleteUsage.isPending}
                apiBaseUrl={API_BASE_URL}
                browserDsnKey={browserDsnKey}
                isGeneratingDsn={generateBrowserDsn.isPending}
                dsnError={generateBrowserDsn.error instanceof Error ? generateBrowserDsn.error.message : ''}
                onGenerateDsn={() => generateBrowserDsn.mutate()}
              />
              <ConfirmDialog
                open={deleteMode !== null}
                onOpenChange={(open) => !open && setDeleteMode(null)}
                title={deleteMode === 'all' ? 'Delete all foreground activity?' : 'Delete activity in this range?'}
                description={
                  deleteMode === 'all'
                    ? 'This permanently removes every synced foreground-usage summary. It cannot be undone.'
                    : `This permanently removes synced foreground activity from ${usageRange.from} through ${usageRange.to}. It cannot be undone.`
                }
                confirmLabel="Delete activity"
                isPending={deleteUsage.isPending}
                onConfirm={() => {
                  if (deleteMode === 'range' && rangeError) return;
                  deleteUsage.mutate(deleteMode === 'range' ? usageRange : {});
                }}
              />
            </SettingsCard>
          )}
          {section === 'device' && (
            <SettingsCard
              icon={ShieldCheck}
              title="Device & Permissions"
              description="Review this browser’s sync identity and browser permissions."
            >
              <DeviceSettings />
            </SettingsCard>
          )}
          {section === 'ai' && (
            <SettingsCard
              icon={KeyRound}
              title="AI / Gemini"
              description="Manage encrypted Gemini credentials used by AI features."
            >
              <AiSettingsPanel />
            </SettingsCard>
          )}
        </main>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const [permission, setPermission] = useState(getBrowserNotificationPermission);
  const [focusAlertsEnabled, setFocusAlertsEnabled] = useState(() => getStoredFocusSettings().notificationEnabled);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState('');

  async function requestPermission() {
    setError('');
    setIsRequesting(true);
    try {
      setPermission(await requestBrowserNotificationPermission());
    } catch {
      setError('The browser did not allow a permission request. Check its site settings and try again.');
    } finally {
      setIsRequesting(false);
    }
  }

  async function toggleFocusAlerts(enabled: boolean) {
    if (enabled && permission !== 'granted') {
      await requestPermission();
      if (getBrowserNotificationPermission() !== 'granted') return;
    }
    const next = { ...getStoredFocusSettings(), notificationEnabled: enabled };
    saveStoredFocusSettings(next);
    setFocusAlertsEnabled(enabled);
  }

  return (
    <div className="grid gap-4 border-t pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Browser alerts</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Allow iTu to show reminders and notification-center updates outside the active tab.
          </p>
        </div>
        {permission === 'default' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRequesting}
            onClick={() => void requestPermission()}
          >
            {isRequesting ? <LoaderCircle className="animate-spin" /> : null}
            Allow browser alerts
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CheckCircle2 className={permission === 'granted' ? 'text-primary' : 'text-destructive'} />
            {notificationPermissionLabel(permission)}
          </span>
        )}
      </div>

      <label className="flex min-h-12 items-start justify-between gap-4 border-t pt-3">
        <span>
          <span className="block text-sm font-semibold">Focus completion alerts</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Show a browser notification when a Focus Session reaches its planned end.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Enable focus completion alerts"
          checked={focusAlertsEnabled}
          disabled={permission === 'denied' || permission === 'unsupported' || isRequesting}
          onChange={(event) => void toggleFocusAlerts(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary"
        />
      </label>
      {permission === 'denied' ? (
        <p className="text-xs text-muted-foreground" role="status">
          Browser alerts are blocked for this site. Enable them in the browser address-bar settings.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ProfileSettings({
  user,
  onSave,
}: {
  user: AuthSession['user'] | null;
  onSave: (data: { displayName?: string | null; username?: string | null }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
    setUsername(user?.username ?? '');
  }, [user?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    setError('');
    setIsSaving(true);
    try {
      await onSave({ displayName, username: username.trim() || null });
      setStatus('Profile updated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not update your profile.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) return <p className="border-t pt-4 text-sm text-muted-foreground">Loading account details…</p>;

  return (
    <div className="grid gap-4 border-t pt-4">
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="settings-username">Username</Label>
            <Input
              id="settings-username"
              value={username}
              minLength={3}
              maxLength={30}
              placeholder="e.g. admin"
              onChange={(event) => setUsername(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Used when signing in.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-display-name">Display name</Label>
            <Input
              id="settings-display-name"
              value={displayName}
              maxLength={120}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Shown in your workspace and account menu.</p>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="settings-email">Email</Label>
          <Input id="settings-email" value={user.email ?? 'Not provided'} disabled />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-h-5" aria-live="polite">
            {status ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" /> {status}
              </p>
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <LoaderCircle className="animate-spin" /> : null}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <div className="grid gap-2 border-t pt-4">
        <p className="text-sm font-semibold">Account access</p>
        <div className="flex flex-wrap gap-2" aria-label="Account roles and permissions">
          {(user.roles.length ? user.roles : ['USER']).map((role) => (
            <span key={role} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {role}
            </span>
          ))}
          {user.permissions.map((permission) => (
            <span key={permission} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {permission}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus('');
    setError('');
    if (newPassword.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    setIsSaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatus('Password changed.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not change your password.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4 border-t pt-4">
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="settings-current-password">Current password</Label>
            <Input
              id="settings-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-new-password">New password</Label>
            <Input
              id="settings-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-confirm-password">Confirm password</Label>
            <Input
              id="settings-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-h-5" aria-live="polite">
            {status ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" /> {status}
              </p>
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}>
            {isSaving ? <LoaderCircle className="animate-spin" /> : null}
            {isSaving ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </form>
      <div className="flex items-start gap-3 border-t pt-4 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Use a unique password you do not reuse elsewhere. Existing sign-ins remain protected by your account session.
        </p>
      </div>
    </div>
  );
}

function clampRetention(value: number) {
  return Number.isFinite(value) ? Math.min(365, Math.max(7, Math.trunc(value))) : 90;
}

export function validateUsageRange(range: { from: string; to: string }) {
  if (!range.from || !range.to) return 'Choose both dates.';
  if (range.from > range.to) return 'The start date must be before the end date.';
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  const days = (to - from) / 86_400_000 + 1;
  return Number.isFinite(days) && days <= 365 ? '' : 'Choose a range of 365 days or less.';
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

function isSettingsSection(value: string | null): value is SettingsSection {
  return (
    value !== null && ['appearance', 'notifications', 'profile', 'security', 'sync', 'device', 'ai'].includes(value)
  );
}
