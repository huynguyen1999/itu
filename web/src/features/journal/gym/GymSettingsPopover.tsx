import { Dumbbell } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_GYM_PREFERENCES, type GymPreferences } from '@/shared/api/preferencesApi';

export function GymSettingsPopover({
  preferences = DEFAULT_GYM_PREFERENCES,
  onChange,
}: {
  preferences?: GymPreferences;
  onChange: (patch: Partial<GymPreferences>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Gym Settings"
      icon={<Dumbbell className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChange(DEFAULT_GYM_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Units">
          <FeatureSettingsRow label="Weight unit">
            <select
              value={preferences.weightUnit}
              onChange={(e) => onChange({ weightUnit: e.target.value as 'KG' | 'LBS' })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="KG">Kilograms (kg)</option>
              <option value="LBS">Pounds (lbs)</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Distance unit">
            <select
              value={preferences.distanceUnit}
              onChange={(e) => onChange({ distanceUnit: e.target.value as 'KM' | 'MI' })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="KM">Kilometers (km)</option>
              <option value="MI">Miles (mi)</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Workout Logging">
          <FeatureSettingsRow label="Previous performance mode">
            <select
              value={preferences.previousPerformanceMode}
              onChange={(e) => onChange({ previousPerformanceMode: e.target.value as 'EXERCISE' | 'ROUTINE' })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="EXERCISE">By Exercise</option>
              <option value="ROUTINE">By Routine</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show RPE" hint="Rate of Perceived Exertion">
            <input
              type="checkbox"
              checked={preferences.showRpe}
              onChange={(e) => onChange({ showRpe: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Rest">
          <FeatureSettingsRow label="Auto-start timer" hint="Start timer after logging set">
            <input
              type="checkbox"
              checked={preferences.autoStartRestTimer}
              onChange={(e) => onChange({ autoStartRestTimer: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Default duration">
            <select
              value={preferences.defaultRestSeconds}
              onChange={(e) => onChange({ defaultRestSeconds: Number(e.target.value) || 120 })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="60">60 sec</option>
              <option value="90">90 sec</option>
              <option value="120">120 sec (2 min)</option>
              <option value="180">180 sec (3 min)</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Goals">
          <FeatureSettingsRow label="Weekly workout goal">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="14"
                value={preferences.weeklyWorkoutGoal ?? 3}
                onChange={(e) => onChange({ weeklyWorkoutGoal: Number(e.target.value) || 3 })}
                className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">/ wk</span>
            </div>
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
