import type { MoneyPreferences } from '@/shared/api/client';
import { SettingsCard } from '../components/SettingsCard';
import { Wallet } from 'lucide-react';

export function MoneySettingsPanel({
  preferences,
  isLoading,
  onChange,
}: {
  preferences?: MoneyPreferences;
  isLoading: boolean;
  onChange: (patch: Partial<MoneyPreferences>) => void;
}) {
  if (isLoading || !preferences) {
    return <SettingsCard icon={Wallet} title="Money Settings" description="Loading Money preferences..." />;
  }

  return (
    <div className="grid gap-4">
      <SettingsCard icon={Wallet} title="General" description="Default currency and transaction configuration.">
        <label className="flex min-h-12 items-center justify-between border-t py-3 first:border-t-0">
          <span className="text-sm font-semibold">Default currency</span>
          <select
            value={preferences.defaultCurrency}
            onChange={(e) => onChange({ defaultCurrency: e.target.value as 'VND' | 'USD' })}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="VND">VND (₫)</option>
            <option value="USD">USD ($)</option>
          </select>
        </label>
        <label className="flex min-h-12 items-center justify-between border-t py-3">
          <span className="text-sm font-semibold">Default transaction type</span>
          <select
            value={preferences.defaultTransactionType}
            onChange={(e) => onChange({ defaultTransactionType: e.target.value as 'EXPENSE' | 'INCOME' })}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
        </label>
      </SettingsCard>

      <SettingsCard icon={Wallet} title="Quick Add" description="Automated suggestions and pre-fill behaviors for transaction entry.">
        <label className="flex items-center justify-between border-t py-3 first:border-t-0">
          <div>
            <p className="text-sm font-semibold">Remember payment method</p>
            <p className="text-xs text-muted-foreground">Pre-fill the last used payment source for quick entry.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.rememberPaymentMethod}
            onChange={(e) => onChange({ rememberPaymentMethod: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
        </label>
        <label className="flex items-center justify-between border-t py-3">
          <div>
            <p className="text-sm font-semibold">Merchant suggestions</p>
            <p className="text-xs text-muted-foreground">Suggest categories and payment methods when typing known merchants.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.merchantSuggestionsEnabled}
            onChange={(e) => onChange({ merchantSuggestionsEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
        </label>
      </SettingsCard>

      <SettingsCard icon={Wallet} title="Budgets & Alerts" description="Budget warning thresholds and notification preferences.">
        <label className="flex items-center justify-between border-t py-3 first:border-t-0">
          <span className="text-sm font-semibold">Warning threshold</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="50"
              max="99"
              value={preferences.budgetWarningThreshold}
              onChange={(e) => onChange({ budgetWarningThreshold: Number(e.target.value) || 80 })}
              className="h-9 w-20 rounded-md border bg-background px-3 text-sm text-right"
            />
            <span className="text-sm font-medium text-muted-foreground">%</span>
          </div>
        </label>
        <label className="flex items-center justify-between border-t py-3">
          <div>
            <p className="text-sm font-semibold">Budget alerts</p>
            <p className="text-xs text-muted-foreground">Show indicators when category budgets approach or exceed limits.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.budgetAlertsEnabled}
            onChange={(e) => onChange({ budgetAlertsEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary"
          />
        </label>
      </SettingsCard>
    </div>
  );
}
