import { useState } from 'react';
import { Grid2X2, ChevronRight, ArrowLeft } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_MATRIX_PREFERENCES, type MatrixPreferences } from '@/shared/api/preferencesApi';
import { Button } from '@/shared/ui/button';

export interface MatrixViewDisplaySettings {
  showCompleted: boolean;
  showWontDo: boolean;
  sortBy: 'DUE_DATE' | 'PRIORITY' | 'TITLE';
}

export const DEFAULT_MATRIX_DISPLAY_SETTINGS: MatrixViewDisplaySettings = {
  showCompleted: false,
  showWontDo: false,
  sortBy: 'DUE_DATE',
};

export function MatrixSettingsPopover({
  preferences = DEFAULT_MATRIX_PREFERENCES,
  displaySettings = DEFAULT_MATRIX_DISPLAY_SETTINGS,
  onChangePreferences,
  onChangeDisplay,
}: {
  preferences?: MatrixPreferences;
  displaySettings?: MatrixViewDisplaySettings;
  onChangePreferences: (patch: Partial<MatrixPreferences>) => void;
  onChangeDisplay: (patch: Partial<MatrixViewDisplaySettings>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const togglePriority = (
    field: 'urgentPriorities' | 'importantPriorities',
    priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE',
  ) => {
    const list = preferences[field] || [];
    const updated = list.includes(priority)
      ? list.filter((p) => p !== priority)
      : [...list, priority];
    onChangePreferences({ [field]: updated.length ? updated : ['HIGH'] });
  };

  if (showAdvanced) {
    return (
      <FeatureSettingsPopover
        title="Advanced Matrix Rules"
        icon={<Grid2X2 className="h-4 w-4 text-primary" />}
        footer={
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced(false)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
            <FeatureSettingsReset onReset={() => onChangePreferences(DEFAULT_MATRIX_PREFERENCES)} />
          </div>
        }
      >
        <div className="space-y-4">
          <FeatureSettingsSection title="Urgency Rules">
            <FeatureSettingsRow label="Urgent when due within">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={preferences.urgentDueWithinDays}
                  onChange={(e) => onChangePreferences({ urgentDueWithinDays: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            </FeatureSettingsRow>
          </FeatureSettingsSection>

          <FeatureSettingsSection title="Urgent Priority Triggers">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((p) => (
                <button
                  key={`u-${p}`}
                  type="button"
                  className={`rounded border px-2 py-1 text-xs font-bold ${
                    preferences.urgentPriorities.includes(p)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'bg-background text-muted-foreground'
                  }`}
                  onClick={() => togglePriority('urgentPriorities', p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </FeatureSettingsSection>

          <FeatureSettingsSection title="Important Priority Triggers">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((p) => (
                <button
                  key={`i-${p}`}
                  type="button"
                  className={`rounded border px-2 py-1 text-xs font-bold ${
                    preferences.importantPriorities.includes(p)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'bg-background text-muted-foreground'
                  }`}
                  onClick={() => togglePriority('importantPriorities', p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </FeatureSettingsSection>
        </div>
      </FeatureSettingsPopover>
    );
  }

  return (
    <FeatureSettingsPopover
      title="Matrix Settings"
      icon={<Grid2X2 className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChangePreferences(DEFAULT_MATRIX_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Classification">
          <FeatureSettingsRow label="Preset">
            <select
              value="CUSTOM"
              onChange={(e) => {
                if (e.target.value === 'BALANCED') {
                  onChangePreferences({ urgentDueWithinDays: 2, urgentPriorities: ['HIGH'], importantPriorities: ['HIGH'] });
                } else if (e.target.value === 'DEADLINE') {
                  onChangePreferences({ urgentDueWithinDays: 1, urgentPriorities: ['HIGH', 'MEDIUM'], importantPriorities: ['HIGH'] });
                } else if (e.target.value === 'PRIORITY') {
                  onChangePreferences({ urgentDueWithinDays: 3, urgentPriorities: ['HIGH'], importantPriorities: ['HIGH', 'MEDIUM'] });
                }
              }}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="BALANCED">Balanced</option>
              <option value="DEADLINE">Deadline-focused</option>
              <option value="PRIORITY">Priority-focused</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Display">
          <FeatureSettingsRow label="Show completed">
            <input
              type="checkbox"
              checked={displaySettings.showCompleted}
              onChange={(e) => onChangeDisplay({ showCompleted: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show won't-do">
            <input
              type="checkbox"
              checked={displaySettings.showWontDo}
              onChange={(e) => onChangeDisplay({ showWontDo: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Sort">
            <select
              value={displaySettings.sortBy}
              onChange={(e) => onChangeDisplay({ sortBy: e.target.value as MatrixViewDisplaySettings['sortBy'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="DUE_DATE">Due Date</option>
              <option value="PRIORITY">Priority</option>
              <option value="TITLE">Title</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Advanced">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border p-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
            onClick={() => setShowAdvanced(true)}
          >
            <span>Advanced matrix rules…</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
