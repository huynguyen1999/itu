import { Wallet } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_MONEY_PREFERENCES, type MoneyPreferences } from '@/shared/api/preferencesApi';

export function MoneySettingsPopover({
  preferences = DEFAULT_MONEY_PREFERENCES,
  onChange,
}: {
  preferences?: MoneyPreferences;
  onChange: (patch: Partial<MoneyPreferences>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Money Settings"
      icon={<Wallet className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChange(DEFAULT_MONEY_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="General">
          <FeatureSettingsRow label="Default currency">
            <select
              value={preferences.defaultCurrency}
              onChange={(e) => onChange({ defaultCurrency: e.target.value as 'VND' | 'USD' })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="VND">VND (₫)</option>
              <option value="USD">USD ($)</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Default transaction type">
            <select
              value={preferences.defaultTransactionType}
              onChange={(e) => onChange({ defaultTransactionType: e.target.value as 'EXPENSE' | 'INCOME' })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Quick Add">
          <FeatureSettingsRow label="Remember payment method" hint="Pre-fill last used payment source">
            <input
              type="checkbox"
              checked={preferences.rememberPaymentMethod}
              onChange={(e) => onChange({ rememberPaymentMethod: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Merchant suggestions" hint="Suggest categories for known merchants">
            <input
              type="checkbox"
              checked={preferences.merchantSuggestionsEnabled}
              onChange={(e) => onChange({ merchantSuggestionsEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Budget">
          <FeatureSettingsRow label="Warning threshold">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="50"
                max="99"
                value={preferences.budgetWarningThreshold}
                onChange={(e) => onChange({ budgetWarningThreshold: Number(e.target.value) || 80 })}
                className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Budget alerts" hint="Show warnings when nearing category limits">
            <input
              type="checkbox"
              checked={preferences.budgetAlertsEnabled}
              onChange={(e) => onChange({ budgetAlertsEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
