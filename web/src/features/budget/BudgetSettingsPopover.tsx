import { useState } from 'react';
import { Input } from '@/shared/ui/input';
import { BudgetCategoryManager } from './BudgetCategoryManager';

interface BudgetSettingsPopoverProps {
  preferences?: Record<string, any>;
  onChange?: (patch: Record<string, any>) => void;
}

export function BudgetSettingsPopover({ preferences = {}, onChange }: BudgetSettingsPopoverProps) {
  const [currency, setCurrency] = useState(preferences.defaultCurrency || preferences.currency || 'VND');

  return (
    <div className="max-h-[min(560px,70vh)] w-[360px] max-w-[calc(100vw-2rem)] space-y-5 overflow-y-auto rounded-[var(--itu-radius-l)] border border-border bg-card p-4 text-sm text-card-foreground shadow-[var(--itu-shadow-pop)]">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Default Currency
        </label>
        <Input
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            onChange?.({ defaultCurrency: e.target.value });
          }}
          placeholder="VND"
          className="h-9 font-mono text-xs"
        />
      </div>

      <div className="border-t border-border pt-2">
        <BudgetCategoryManager compact />
      </div>
    </div>
  );
}
