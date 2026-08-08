import type { GymPreferences } from '@/shared/api/client';
import { SettingsCard } from '../components/SettingsCard';
import { Dumbbell } from 'lucide-react';

export function GymSettingsPanel({
  preferences,
  isLoading,
  onChange,
}: {
  preferences?: GymPreferences;
  isLoading: boolean;
  onChange: (patch: Partial<GymPreferences>) => void;
}) {
  if (isLoading || !preferences) {
    return <SettingsCard icon={Dumbbell} title="Gym Settings" description="Loading Gym preferences..." />;
  }

  return (
    <div className="grid gap-4">
      <SettingsCard icon={Dumbbell} title="Units" description="Measurement units for strength and cardio tracking.">
        <label className="flex min-h-12 items-center justify-between border-t py-3 first:border-t-0">
          <span className="text-sm font-semibold">Weight unit</span>
          <select
            value={preferences.weightUnit}
            onChange={(e) => onChange({ weightUnit: e.target.value as 'KG' | 'LBS' })}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="KG">Kilograms (kg)</option>
            <option value="LBS">Pounds (lbs)</option>
          </select>
        </label>
        <label className="flex min-h-12 items-center justify-between border-t py-3">
          <span className="text-sm font-semibold">Distance unit</span>
          <select
            value={preferences.distanceUnit}
            onChange={(e) => onChange({ distanceUnit: e.target.value as 'KM' | 'MI' })}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="KM">Kilometers (km)</option>
            <option value="MI">Miles (mi)</option>
          </select>
        </label>
      </SettingsCard>

      <SettingsCard icon={Dumbbell} title="Workout Logging" description="Defaults for active workout logging and performance history.">
        <label className="flex items-center justify-between border-t py-3 first:border-t-0">
          <div>
            <p className="text-sm font-semibold">Show previous performance</p>
            <p className="text-xs text-muted-foreground">Display previous set values in the active workout logger.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.previousPerformanceMode !== undefined}
            onChange={(e) =>
              onChange({ previousPerformanceMode: e.target.checked ? 'EXERCISE' : ('EXERCISE' as any) })
            }
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
        </label>
        <label className="flex items-center justify-between border-t py-3">
          <div>
            <p className="text-sm font-semibold">Show RPE column</p>
            <p className="text-xs text-muted-foreground">Display Rate of Perceived Exertion input in set rows.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.showRpe}
            onChange={(e) => onChange({ showRpe: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
        </label>
      </SettingsCard>

      <SettingsCard icon={Dumbbell} title="Rest Timer" description="Automatic rest timer defaults and duration overrides.">
        <label className="flex items-center justify-between border-t py-3 first:border-t-0">
          <div>
            <p className="text-sm font-semibold">Auto-start rest timer</p>
            <p className="text-xs text-muted-foreground">Automatically start the timer upon completing a set.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.autoStartRestTimer}
            onChange={(e) => onChange({ autoStartRestTimer: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
        </label>
        <label className="flex min-h-12 items-center justify-between border-t py-3">
          <span className="text-sm font-semibold">Default rest duration</span>
          <select
            value={preferences.defaultRestSeconds}
            onChange={(e) => onChange({ defaultRestSeconds: Number(e.target.value) || 120 })}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="60">60 sec</option>
            <option value="90">90 sec</option>
            <option value="120">120 sec (2 min)</option>
            <option value="180">180 sec (3 min)</option>
          </select>
        </label>
      </SettingsCard>

      <SettingsCard icon={Dumbbell} title="History & Goals" description="Weekly workout target goal.">
        <label className="flex items-center justify-between border-t py-3 first:border-t-0">
          <span className="text-sm font-semibold">Weekly workout goal</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="14"
              value={preferences.weeklyWorkoutGoal ?? 3}
              onChange={(e) => onChange({ weeklyWorkoutGoal: Number(e.target.value) || 3 })}
              className="h-9 w-20 rounded-md border bg-background px-3 text-sm text-right"
            />
            <span className="text-sm font-medium text-muted-foreground">workouts / week</span>
          </div>
        </label>
      </SettingsCard>
    </div>
  );
}
