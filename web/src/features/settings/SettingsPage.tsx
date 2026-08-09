import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CalendarClock,
  Cloud,
  Copy,
  Database,
  Flag,
  Monitor,
  Palette,
  KeyRound,
  Settings,
  Trash2,
} from 'lucide-react';
import { API_BASE_URL, api } from '@/shared/api/client';
import type { UsagePreferences, UserPreferencesResponse } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SettingsCard } from './components/SettingsCard';
import { useTheme } from '@/shared/ui/ThemeProvider';

type SettingsSection = 'appearance' | 'notifications' | 'profile' | 'security' | 'sync' | 'device';

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Account / Profile', icon: Monitor },
  { id: 'security', label: 'Security', icon: CalendarClock },
  { id: 'sync', label: 'Sync & Data', icon: Cloud },
  { id: 'device', label: 'Device & Permissions', icon: Flag },
];

export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>('appearance');
  const theme = useTheme();
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
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
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
            />
          )}
          {section === 'profile' && (
            <SettingsCard
              icon={Monitor}
              title="Account / Profile"
              description="Authenticated user identity, profile details, and active authentication sessions."
            />
          )}
          {section === 'security' && (
            <SettingsCard
              icon={CalendarClock}
              title="Security"
              description="Password management, refresh sessions, and authentication security."
            />
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
              icon={Flag}
              title="Device & Permissions"
              description="Browser installation device ID, client instance session, and system permissions."
            />
          )}
        </main>
      </div>
    </div>
  );
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
