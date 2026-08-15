import type { GymPreferences } from '@/shared/api/preferencesApi';
import { DEFAULT_GYM_PREFERENCES } from '@/shared/api/preferencesApi';

interface GymSettingsPopoverProps {
  preferences?: Partial<GymPreferences>;
  onChange?: (patch: Partial<GymPreferences>) => void;
}

export function GymSettingsPopover({ preferences = {}, onChange }: GymSettingsPopoverProps) {
  const current = { ...DEFAULT_GYM_PREFERENCES, ...preferences };
  const patch = (next: Partial<GymPreferences>) => onChange?.(next);

  return (
    <div className="w-80 rounded-[var(--itu-radius-l)] border bg-card p-4 text-sm text-card-foreground shadow-[var(--itu-shadow-pop)]">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Default Weight Unit
        </label>
        <select
          value={current.weightUnit}
          onChange={(e) => {
            patch({ weightUnit: e.target.value as GymPreferences['weightUnit'] });
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
        >
          <option value="KG">Kilograms (kg)</option>
          <option value="LBS">Pounds (lbs)</option>
        </select>
      </div>
      <label className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs font-semibold">Weekly workout target</span>
        <select
          value={current.weeklyWorkoutGoal ?? 3}
          onChange={(event) => patch({ weeklyWorkoutGoal: Number(event.target.value) })}
          className="rounded-md border bg-background px-2 py-1.5 text-xs"
        >
          <option value="1">1 day / week</option>
          <option value="2">2 days / week</option>
          <option value="3">3 days / week</option>
          <option value="4">4 days / week</option>
          <option value="5">5 days / week</option>
          <option value="6">6 days / week</option>
          <option value="7">7 days / week</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs font-semibold">Default rest</span>
        <select
          value={current.defaultRestSeconds}
          onChange={(event) => patch({ defaultRestSeconds: Number(event.target.value) })}
          className="rounded-md border bg-background px-2 py-1.5 text-xs"
        >
          <option value="60">60 sec</option>
          <option value="90">90 sec</option>
          <option value="120">2 min</option>
          <option value="180">3 min</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs font-semibold">Auto-start rest timer</span>
        <input
          type="checkbox"
          checked={current.autoStartRestTimer}
          onChange={(event) => patch({ autoStartRestTimer: event.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs font-semibold">Show previous performance</span>
        <input
          type="checkbox"
          checked={current.showPrevious}
          onChange={(event) => patch({ showPrevious: event.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs font-semibold">Show RPE</span>
        <input
          type="checkbox"
          checked={current.showRpe}
          onChange={(event) => patch({ showRpe: event.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs font-semibold">Rest timer sound</span>
        <input
          type="checkbox"
          checked={current.restSoundEnabled ?? current.soundsEnabled}
          onChange={(event) => patch({ restSoundEnabled: event.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs font-semibold">Set completion sound</span>
        <input
          type="checkbox"
          checked={current.completionSoundEnabled ?? current.soundsEnabled}
          onChange={(event) => patch({ completionSoundEnabled: event.target.checked })}
        />
      </label>
    </div>
  );
}
