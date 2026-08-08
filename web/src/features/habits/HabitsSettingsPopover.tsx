import { Flame } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_HABIT_PREFERENCES, type HabitPreferences } from '@/shared/api/preferencesApi';

export interface HabitsDisplaySettings {
  showStreak: boolean;
  showCompletedToday: boolean;
  groupByTimeBlock: boolean;
  ordering: 'MANUAL' | 'TIME_BLOCK' | 'COMPLETION_STATUS';
}

export const DEFAULT_HABITS_DISPLAY_SETTINGS: HabitsDisplaySettings = {
  showStreak: true,
  showCompletedToday: true,
  groupByTimeBlock: false,
  ordering: 'TIME_BLOCK',
};

export function HabitsSettingsPopover({
  preferences = DEFAULT_HABIT_PREFERENCES,
  displaySettings = DEFAULT_HABITS_DISPLAY_SETTINGS,
  onChangePreferences,
  onChangeDisplay,
}: {
  preferences?: HabitPreferences;
  displaySettings?: HabitsDisplaySettings;
  onChangePreferences: (patch: Partial<HabitPreferences>) => void;
  onChangeDisplay: (patch: Partial<HabitsDisplaySettings>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Habits Settings"
      icon={<Flame className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChangePreferences(DEFAULT_HABIT_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Schedule (Synced)">
          <FeatureSettingsRow label="Day rollover cutoff">
            <select
              value={preferences.dayRolloverCutoffHour}
              onChange={(e) => onChangePreferences({ dayRolloverCutoffHour: Number(e.target.value) || 4 })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="0">12:00 AM (Midnight)</option>
              <option value="3">3:00 AM</option>
              <option value="4">4:00 AM</option>
              <option value="5">5:00 AM</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Week starts on">
            <select
              value={preferences.weekStartDay}
              onChange={(e) => onChangePreferences({ weekStartDay: e.target.value as HabitPreferences['weekStartDay'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="MONDAY">Monday</option>
              <option value="SUNDAY">Sunday</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Display & Ordering">
          <FeatureSettingsRow label="Show streak">
            <input
              type="checkbox"
              checked={displaySettings.showStreak}
              onChange={(e) => onChangeDisplay({ showStreak: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show completed today">
            <input
              type="checkbox"
              checked={displaySettings.showCompletedToday}
              onChange={(e) => onChangeDisplay({ showCompletedToday: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Group by time block">
            <input
              type="checkbox"
              checked={displaySettings.groupByTimeBlock}
              onChange={(e) => onChangeDisplay({ groupByTimeBlock: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Ordering">
            <select
              value={displaySettings.ordering}
              onChange={(e) => onChangeDisplay({ ordering: e.target.value as HabitsDisplaySettings['ordering'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="MANUAL">Manual</option>
              <option value="TIME_BLOCK">Time block</option>
              <option value="COMPLETION_STATUS">Completion status</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
