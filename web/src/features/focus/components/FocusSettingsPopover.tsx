import { useEffect, useState } from 'react';
import { ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  FeatureSettingsPopover,
  FeatureSettingsReset,
  FeatureSettingsRow,
  FeatureSettingsSection,
} from '@/shared/ui/feature-settings';
import {
  DEFAULT_FOCUS_SETTINGS,
  getStoredFocusSettings,
  saveStoredFocusSettings,
  type FocusUserSettings,
} from '@/shared/utils/focusSettings';

function clamp(value: number, min: number, max: number, fallback: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
}

export function FocusSettingsPopover({
  onSettingsChange,
  onOpenAdvanced,
}: {
  onSettingsChange?: (settings: FocusUserSettings) => void;
  onOpenAdvanced?: () => void;
}) {
  const [settings, setSettings] = useState<FocusUserSettings>(getStoredFocusSettings);

  useEffect(() => {
    saveStoredFocusSettings(settings);
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  const update = <K extends keyof FocusUserSettings>(key: K, value: FocusUserSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  const setOvertime = (value: boolean) =>
    setSettings((current) => ({ ...current, countExceededFocusTime: value, autoContinueOvertime: value }));

  return (
    <FeatureSettingsPopover
      title="Focus settings"
      icon={<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />}
      footer={
        <div className="space-y-2">
          {onOpenAdvanced && (
            <button
              type="button"
              onClick={onOpenAdvanced}
              className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-sm font-semibold text-primary hover:bg-[var(--itu-surface-2)]"
            >
              Advanced settings…
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <FeatureSettingsReset onReset={() => setSettings(DEFAULT_FOCUS_SETTINGS)} />
        </div>
      }
    >
      <div className="space-y-5">
        <FeatureSettingsSection title="Timer">
          <FeatureSettingsRow label="Default focus length">
            <input
              type="number"
              min={1}
              max={240}
              value={settings.defaultWorkMinutes}
              aria-label="Default focus length (minutes)"
              onChange={(event) =>
                update(
                  'defaultWorkMinutes',
                  clamp(Number(event.target.value), 1, 240, DEFAULT_FOCUS_SETTINGS.defaultWorkMinutes),
                )
              }
              className="h-8 w-16 rounded-md border bg-background px-2 text-right text-sm"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Short break">
            <input
              type="number"
              min={1}
              max={60}
              value={settings.shortBreakMinutes}
              aria-label="Short break (minutes)"
              onChange={(event) =>
                update('shortBreakMinutes', clamp(Number(event.target.value), 1, 60, DEFAULT_FOCUS_SETTINGS.shortBreakMinutes))
              }
              className="h-8 w-16 rounded-md border bg-background px-2 text-right text-sm"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Long break">
            <input
              type="number"
              min={1}
              max={120}
              value={settings.longBreakMinutes}
              aria-label="Long break (minutes)"
              onChange={(event) =>
                update('longBreakMinutes', clamp(Number(event.target.value), 1, 120, DEFAULT_FOCUS_SETTINGS.longBreakMinutes))
              }
              className="h-8 w-16 rounded-md border bg-background px-2 text-right text-sm"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Long break every">
            <input
              type="number"
              min={1}
              max={20}
              value={settings.cyclesBeforeLongBreak}
              aria-label="Long break frequency (sessions)"
              onChange={(event) =>
                update('cyclesBeforeLongBreak', clamp(Number(event.target.value), 1, 20, DEFAULT_FOCUS_SETTINGS.cyclesBeforeLongBreak))
              }
              className="h-8 w-16 rounded-md border bg-background px-2 text-right text-sm"
            />
            <span className="text-xs text-muted-foreground">sessions</span>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Automation">
          <FeatureSettingsRow label="Auto-start breaks">
            <Checkbox
              checked={settings.autoStartBreaks}
              onCheckedChange={(checked) => update('autoStartBreaks', checked === true)}
              aria-label="Auto-start breaks"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Auto-start focus">
            <Checkbox
              checked={settings.autoStartWork}
              onCheckedChange={(checked) => update('autoStartWork', checked === true)}
              aria-label="Auto-start focus"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Count overtime">
            <Checkbox
              checked={settings.countExceededFocusTime}
              onCheckedChange={(checked) => setOvertime(checked === true)}
              aria-label="Count overtime"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Alerts">
          <FeatureSettingsRow label="Completion sound">
            <Checkbox
              checked={settings.soundEnabled}
              onCheckedChange={(checked) => update('soundEnabled', checked === true)}
              aria-label="Completion sound"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Desktop notification">
            <Checkbox
              checked={settings.notificationEnabled}
              onCheckedChange={(checked) => update('notificationEnabled', checked === true)}
              aria-label="Desktop notification"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
