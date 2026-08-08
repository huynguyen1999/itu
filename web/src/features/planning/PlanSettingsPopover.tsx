import { useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { TaskDefaultsPopover } from './TaskDefaultsPopover';
import type { TaskPreferences } from '@/shared/api/preferencesApi';

export interface PlanViewSettings {
  groupBy: 'NONE' | 'DUE_DATE' | 'PRIORITY' | 'LIST';
  sortBy: 'DUE_DATE' | 'PRIORITY' | 'TITLE' | 'CREATED_AT';
  hideCompleted: boolean;
  showTaskDetails: boolean;
  useDefaultPlanPreferences: boolean;
}

export const DEFAULT_PLAN_VIEW_SETTINGS: PlanViewSettings = {
  groupBy: 'DUE_DATE',
  sortBy: 'DUE_DATE',
  hideCompleted: false,
  showTaskDetails: true,
  useDefaultPlanPreferences: true,
};

export function PlanSettingsPopover({
  settings = DEFAULT_PLAN_VIEW_SETTINGS,
  taskPreferences,
  taskLists = [],
  onChange,
  onTaskPreferencesChange,
}: {
  settings?: PlanViewSettings;
  taskPreferences?: TaskPreferences;
  taskLists?: Array<{ id: string; title: string }>;
  onChange: (patch: Partial<PlanViewSettings>) => void;
  onTaskPreferencesChange?: (patch: Partial<TaskPreferences>) => void;
}) {
  const [showTaskDefaults, setShowTaskDefaults] = useState(false);

  if (showTaskDefaults) {
    return (
      <TaskDefaultsPopover
        preferences={taskPreferences}
        taskLists={taskLists}
        onBack={() => setShowTaskDefaults(false)}
        onChange={onTaskPreferencesChange}
      />
    );
  }

  return (
    <FeatureSettingsPopover
      title="Plan Settings"
      icon={<Calendar className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChange(DEFAULT_PLAN_VIEW_SETTINGS)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="View">
          <FeatureSettingsRow label="Group by">
            <select
              value={settings.groupBy}
              onChange={(e) => onChange({ groupBy: e.target.value as PlanViewSettings['groupBy'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="NONE">None</option>
              <option value="DUE_DATE">Due Date</option>
              <option value="PRIORITY">Priority</option>
              <option value="LIST">List</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Sort by">
            <select
              value={settings.sortBy}
              onChange={(e) => onChange({ sortBy: e.target.value as PlanViewSettings['sortBy'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="DUE_DATE">Due Date</option>
              <option value="PRIORITY">Priority</option>
              <option value="TITLE">Title</option>
              <option value="CREATED_AT">Created Date</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Hide completed">
            <input
              type="checkbox"
              checked={settings.hideCompleted}
              onChange={(e) => onChange({ hideCompleted: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show task details">
            <input
              type="checkbox"
              checked={settings.showTaskDetails}
              onChange={(e) => onChange({ showTaskDetails: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Overrides">
          <FeatureSettingsRow label="Use default Plan preferences">
            <input
              type="checkbox"
              checked={settings.useDefaultPlanPreferences}
              onChange={(e) => onChange({ useDefaultPlanPreferences: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Task Creation">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border p-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
            onClick={() => setShowTaskDefaults(true)}
          >
            <span>Task defaults…</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
