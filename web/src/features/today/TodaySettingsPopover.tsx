import { LayoutDashboard } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';

export interface TodaySettings {
  showTasks: boolean;
  showHabits: boolean;
  showFocusSummary: boolean;
  density: 'COMPACT' | 'COMFORTABLE';
  groupTasksBy: 'NONE' | 'PRIORITY' | 'LIST';
}

export const DEFAULT_TODAY_SETTINGS: TodaySettings = {
  showTasks: true,
  showHabits: true,
  showFocusSummary: true,
  density: 'COMFORTABLE',
  groupTasksBy: 'NONE',
};

export function TodaySettingsPopover({
  settings = DEFAULT_TODAY_SETTINGS,
  onChange,
}: {
  settings?: TodaySettings;
  onChange: (patch: Partial<TodaySettings>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Today Settings"
      icon={<LayoutDashboard className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChange(DEFAULT_TODAY_SETTINGS)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Sections">
          <FeatureSettingsRow label="Show tasks">
            <input
              type="checkbox"
              checked={settings.showTasks}
              onChange={(e) => onChange({ showTasks: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show habits">
            <input
              type="checkbox"
              checked={settings.showHabits}
              onChange={(e) => onChange({ showHabits: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show focus summary">
            <input
              type="checkbox"
              checked={settings.showFocusSummary}
              onChange={(e) => onChange({ showFocusSummary: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Display">
          <FeatureSettingsRow label="Layout density">
            <select
              value={settings.density}
              onChange={(e) => onChange({ density: e.target.value as 'COMPACT' | 'COMFORTABLE' })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="COMFORTABLE">Comfortable</option>
              <option value="COMPACT">Compact</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Group tasks by">
            <select
              value={settings.groupTasksBy}
              onChange={(e) => onChange({ groupTasksBy: e.target.value as 'NONE' | 'PRIORITY' | 'LIST' })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="NONE">None</option>
              <option value="PRIORITY">Priority</option>
              <option value="LIST">Project List</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
