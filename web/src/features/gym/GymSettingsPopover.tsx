import { useState } from 'react';

interface GymSettingsPopoverProps {
  preferences?: Record<string, any>;
  onChange?: (patch: Record<string, any>) => void;
}

export function GymSettingsPopover({ preferences = {}, onChange }: GymSettingsPopoverProps) {
  const [weightUnit, setWeightUnit] = useState(preferences.weightUnit || preferences.defaultWeightUnit || 'KG');

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
            onChange?.({ weightUnit: e.target.value });
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
        >
          <option value="KG">Kilograms (kg)</option>
          <option value="LBS">Pounds (lbs)</option>
        </select>
      </div>

    </div>
  );
}
