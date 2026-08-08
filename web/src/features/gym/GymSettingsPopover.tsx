import { useState } from 'react';
import { Input } from '@/shared/ui/input';

interface GymSettingsPopoverProps {
  preferences?: Record<string, any>;
  onChange?: (patch: Record<string, any>) => void;
}

export function GymSettingsPopover({ preferences = {}, onChange }: GymSettingsPopoverProps) {
  const [weightUnit, setWeightUnit] = useState(preferences.defaultWeightUnit || 'KG');
  const [restTimer, setRestTimer] = useState(preferences.defaultRestSeconds || 60);

  return (
    <div className="space-y-4 p-4 w-72 text-sm">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Default Weight Unit
        </label>
        <select
          value={weightUnit}
          onChange={(e) => {
            setWeightUnit(e.target.value);
            onChange?.({ ...preferences, defaultWeightUnit: e.target.value });
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
        >
          <option value="KG">Kilograms (kg)</option>
          <option value="LBS">Pounds (lbs)</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Default Rest Timer (seconds)
        </label>
        <Input
          type="number"
          value={restTimer}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            setRestTimer(val);
            onChange?.({ ...preferences, defaultRestSeconds: val });
          }}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}
