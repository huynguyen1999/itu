import { Timer } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_FOCUS_PREFERENCES, type FocusPreferences } from '@/shared/api/preferencesApi';

export function FocusSettingsPopover({
  preferences = DEFAULT_FOCUS_PREFERENCES,
  onChange,
}: {
  preferences?: FocusPreferences;
  onChange: (patch: Partial<FocusPreferences>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Focus Settings"
      icon={<Timer className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChange(DEFAULT_FOCUS_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Timer">
          <FeatureSettingsRow label="Focus duration">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="180"
                value={preferences.workDurationMinutes}
                onChange={(e) => onChange({ workDurationMinutes: Number(e.target.value) || 25 })}
                className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Short break">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="60"
                value={preferences.shortBreakDurationMinutes}
                onChange={(e) => onChange({ shortBreakDurationMinutes: Number(e.target.value) || 5 })}
                className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Long break">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="120"
                value={preferences.longBreakDurationMinutes}
                onChange={(e) => onChange({ longBreakDurationMinutes: Number(e.target.value) || 15 })}
                className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Long break every">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="12"
                value={preferences.longBreakInterval}
                onChange={(e) => onChange({ longBreakInterval: Number(e.target.value) || 4 })}
                className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">sessions</span>
            </div>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Automation">
          <FeatureSettingsRow label="Auto-start breaks">
            <input
              type="checkbox"
              checked={preferences.autoStartBreaks}
              onChange={(e) => onChange({ autoStartBreaks: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Auto-start focus">
            <input
              type="checkbox"
              checked={preferences.autoStartFocus}
              onChange={(e) => onChange({ autoStartFocus: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Count overtime">
            <input
              type="checkbox"
              checked={preferences.countOvertime}
              onChange={(e) => onChange({ countOvertime: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Alerts">
          <FeatureSettingsRow label="Completion sound">
            <select
              value={preferences.completionSound}
              onChange={(e) => onChange({ completionSound: e.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="bell">Bell</option>
              <option value="chime">Chime</option>
              <option value="digital">Digital</option>
              <option value="none">None</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Desktop notification">
            <input
              type="checkbox"
              checked={preferences.desktopNotification}
              onChange={(e) => onChange({ desktopNotification: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
