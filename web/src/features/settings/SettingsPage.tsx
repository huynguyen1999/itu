import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  LoaderCircle,
  LockKeyhole,
  Palette,
  KeyRound,
  ShieldCheck,
  Settings,
  Trash2,
  UserRound,
} from 'lucide-react';
import { API_BASE_URL, api } from '@/shared/api/client';
import type { AuthSession, UsagePreferences, UserPreferencesResponse } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthProvider';
import { getClientInstanceId, getDeviceId } from '@/shared/sync/syncIdentity';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SettingsCard } from './components/SettingsCard';
import { AiSettingsPanel } from './AiSettingsPanel';
import { useTheme } from '@/shared/ui/ThemeProvider';
import { useSearchParams } from 'react-router-dom';
import { getStoredFocusSettings, saveStoredFocusSettings } from '@/shared/utils/focusSettings';

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

function DeviceSettings() {
  const deviceId = useMemo(() => getDeviceId(), []);
  const clientInstanceId = useMemo(() => getClientInstanceId(), []);
  const [permission, setPermission] = useState(getBrowserNotificationPermission);
  const [isRequesting, setIsRequesting] = useState(false);
  const [copied, setCopied] = useState('');

  async function copyValue(label: string, value: string) {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      // Clipboard access is optional and may be blocked by the browser.
    }
  }

  async function requestPermission() {
    setIsRequesting(true);
    try {
      setPermission(await requestBrowserNotificationPermission());
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <div className="grid gap-4 border-t pt-4">
      <DeviceIdentityRow
        label="Sync device ID"
        description="Stable identifier for this browser installation."
        value={deviceId}
        copied={copied === 'device'}
        onCopy={() => void copyValue('device', deviceId)}
      />
      <DeviceIdentityRow
        label="Current tab instance"
        description="Unique to this open tab and refreshed when it closes."
        value={clientInstanceId}
        copied={copied === 'tab'}
        onCopy={() => void copyValue('tab', clientInstanceId)}
      />
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Browser notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {permission === 'granted'
              ? 'Allowed for this site.'
              : permission === 'denied'
                ? 'Blocked by the browser. Change it from the address-bar site settings.'
                : permission === 'unsupported'
                  ? 'This browser does not support web notifications.'
                  : 'Permission has not been requested yet.'}
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
            Allow notifications
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DeviceIdentityRow({
  label,
  description,
  value,
  copied,
  onCopy,
}: {
  label: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
          <Copy />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <code className="break-all rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">{value}</code>
    </div>
  );
}

function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  return typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported';
}

function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return Promise.resolve('unsupported');
  return window.Notification.requestPermission();
}

export function notificationPermissionLabel(permission: NotificationPermission | 'unsupported') {
  if (permission === 'granted') return 'Alerts allowed';
  if (permission === 'denied') return 'Alerts blocked';
  if (permission === 'unsupported') return 'Not supported';
  return 'Permission needed';
}

function UsageDataSettings({
  preferences,
  isLoading,
  isPending,
  onChange,
  usageRange,
  today,
  rangeError,
  onRangeChange,
  onDeleteRange,
  onDeleteAll,
  isDeleting,
  apiBaseUrl,
  browserDsnKey,
  isGeneratingDsn,
  dsnError,
  onGenerateDsn,
}: {
  preferences?: UsagePreferences;
  isLoading: boolean;
  isPending: boolean;
  onChange: (patch: Partial<UsagePreferences>) => void;
  usageRange: { from: string; to: string };
  today: string;
  rangeError: string;
  onRangeChange: (range: { from: string; to: string }) => void;
  onDeleteRange: () => void;
  onDeleteAll: () => void;
  isDeleting: boolean;
  apiBaseUrl: string;
  browserDsnKey: string;
  isGeneratingDsn: boolean;
  dsnError: string;
  onGenerateDsn: () => void;
}) {
  const retentionDays = preferences?.retentionDays ?? 90;
  return (
    <div className="grid gap-4 border-t pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Foreground activity tracking</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading
              ? 'Loading synced status…'
              : preferences?.trackingEnabled
                ? 'Tracking is enabled on synced devices.'
                : 'Tracking is disabled on synced devices.'}
          </p>
        </div>
        <input
          type="checkbox"
          aria-label="Enable foreground activity tracking"
          checked={preferences?.trackingEnabled ?? false}
          disabled={isLoading || isPending || !preferences}
          onChange={(event) => onChange({ trackingEnabled: event.target.checked })}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary"
        />
      </div>
      <label className="flex min-h-12 items-start justify-between gap-4 border-t pt-3">
        <span>
          <span className="block text-sm font-semibold">Website activity tracking</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Allow the Chromium extension to store visited URL time. Statistics groups it by domain.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Enable website activity tracking"
          checked={preferences?.websiteTrackingEnabled ?? false}
          disabled={isLoading || isPending || !preferences}
          onChange={(event) => onChange({ websiteTrackingEnabled: event.target.checked })}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary"
        />
      </label>
      <div className="grid gap-3 border-t pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" /> Browser extension connection
        </div>
        <p className="text-xs text-muted-foreground">
          Generate a new DSN key, then paste it and the backend URL into the extension. Generating again invalidates the
          previous key.
        </p>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Backend URL
          <Input readOnly value={apiBaseUrl} />
        </label>
        {browserDsnKey ? (
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            DSN key
            <Input readOnly value={browserDsnKey} />
          </label>
        ) : null}
        {dsnError ? (
          <p className="text-xs text-destructive" role="alert">
            {dsnError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={isGeneratingDsn} onClick={onGenerateDsn}>
            Generate new DSN key
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(apiBaseUrl)}
          >
            <Copy aria-hidden="true" /> Copy backend URL
          </Button>
          {browserDsnKey ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(browserDsnKey)}
            >
              <Copy aria-hidden="true" /> Copy DSN key
            </Button>
          ) : null}
        </div>
      </div>
      <label className="flex min-h-12 items-center justify-between gap-4 border-t pt-3">
        <span>
          <span className="block text-sm font-semibold">Idle threshold</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Inactivity threshold after which Screen Time continues but Engaged Time stops (1–30 min).
          </span>
        </span>
        <select
          value={preferences?.idleThresholdSeconds ?? 300}
          disabled={isLoading || isPending || !preferences}
          onChange={(event) => onChange({ idleThresholdSeconds: Number(event.target.value) })}
          className="h-9 rounded-md border bg-background px-3 text-xs"
        >
          <option value={60}>1 minute</option>
          <option value={180}>3 minutes</option>
          <option value={300}>5 minutes (default)</option>
          <option value={600}>10 minutes</option>
          <option value={900}>15 minutes</option>
          <option value={1800}>30 minutes</option>
        </select>
      </label>

      <div className="grid gap-2 border-t pt-3">
        <div>
          <span className="block text-sm font-semibold">Excluded app bundle IDs</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Applications excluded from activity tracking.
          </span>
        </div>
        <div className="space-y-2">
          {(preferences?.excludedBundleIds ?? []).map((bundleId, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input readOnly value={bundleId} className="h-8 text-xs" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-destructive"
                onClick={() => {
                  const updated = (preferences?.excludedBundleIds ?? []).filter((_, i) => i !== idx);
                  onChange({ excludedBundleIds: updated });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem('newBundleId') as HTMLInputElement;
              const val = input?.value.trim();
              if (val && !preferences?.excludedBundleIds?.includes(val)) {
                onChange({ excludedBundleIds: [...(preferences?.excludedBundleIds ?? []), val] });
                input.value = '';
              }
            }}
            className="flex items-center gap-2"
          >
            <Input name="newBundleId" placeholder="e.g. com.example.app" className="h-8 text-xs" />
            <Button type="submit" variant="outline" size="sm" className="h-8">
              Add
            </Button>
          </form>
        </div>
      </div>

      <label className="flex min-h-12 items-center justify-between gap-4 border-t pt-3">
        <span>
          <span className="block text-sm font-semibold">Retention period</span>
          <span className="mt-1 block text-xs text-muted-foreground">Keep synced usage summaries for 7–365 days.</span>
        </span>
        <span className="flex items-center gap-2">
          <Input
            type="number"
            min={7}
            max={365}
            value={retentionDays}
            disabled={isLoading || isPending || !preferences}
            onChange={(event) => onChange({ retentionDays: clampRetention(Number(event.target.value)) })}
            className="w-24 text-right"
          />
          <span className="text-sm text-muted-foreground">days</span>
        </span>
      </label>
      <div className="grid gap-3 border-t pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" aria-hidden="true" /> Delete synced activity
        </div>
        <p className="text-xs text-muted-foreground">
          Remove foreground-usage summaries from the server. Tracking preferences stay unchanged.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            From
            <Input
              type="date"
              max={today}
              value={usageRange.from}
              onChange={(event) => onRangeChange({ ...usageRange, from: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            To
            <Input
              type="date"
              max={today}
              value={usageRange.to}
              onChange={(event) => onRangeChange({ ...usageRange, to: event.target.value })}
            />
          </label>
        </div>
        {rangeError ? (
          <p className="text-xs text-destructive" role="alert">
            {rangeError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(rangeError) || isDeleting}
            onClick={onDeleteRange}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete range
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={isDeleting} onClick={onDeleteAll}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete all
          </Button>
        </div>
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
