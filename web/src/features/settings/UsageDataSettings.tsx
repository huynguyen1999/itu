import { Copy, Database, KeyRound, Trash2 } from 'lucide-react';
import type { UsagePreferences } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

type UsageDataSettingsProps = {
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
};

export function UsageDataSettings({
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
}: UsageDataSettingsProps) {
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
          {(preferences?.excludedBundleIds ?? []).map((bundleId, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input readOnly value={bundleId} className="h-8 text-xs" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-destructive"
                onClick={() =>
                  onChange({ excludedBundleIds: (preferences?.excludedBundleIds ?? []).filter((_, i) => i !== index) })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem('newBundleId') as HTMLInputElement;
              const value = input?.value.trim();
              if (value && !preferences?.excludedBundleIds?.includes(value)) {
                onChange({ excludedBundleIds: [...(preferences?.excludedBundleIds ?? []), value] });
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
