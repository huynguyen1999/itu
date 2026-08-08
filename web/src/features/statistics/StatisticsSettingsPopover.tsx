import { BarChart3 } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';

export interface StatisticsDisplaySettings {
  defaultDateRange: '7D' | '30D' | '90D' | '1Y';
  grouping: 'DAY' | 'WEEK' | 'MONTH';
  showTrendComparison: boolean;
  showZeroValueSeries: boolean;
}

export const DEFAULT_STATISTICS_DISPLAY_SETTINGS: StatisticsDisplaySettings = {
  defaultDateRange: '30D',
  grouping: 'DAY',
  showTrendComparison: true,
  showZeroValueSeries: false,
};

export function StatisticsSettingsPopover({
  settings = DEFAULT_STATISTICS_DISPLAY_SETTINGS,
  onChange,
}: {
  settings?: StatisticsDisplaySettings;
  onChange: (patch: Partial<StatisticsDisplaySettings>) => void;
}) {
  return (
    <FeatureSettingsPopover
      title="Statistics Settings"
      icon={<BarChart3 className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChange(DEFAULT_STATISTICS_DISPLAY_SETTINGS)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Period & Grouping">
          <FeatureSettingsRow label="Default date range">
            <select
              value={settings.defaultDateRange}
              onChange={(e) => onChange({ defaultDateRange: e.target.value as StatisticsDisplaySettings['defaultDateRange'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="7D">7 Days</option>
              <option value="30D">30 Days</option>
              <option value="90D">90 Days</option>
              <option value="1Y">1 Year</option>
            </select>
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Grouping">
            <select
              value={settings.grouping}
              onChange={(e) => onChange({ grouping: e.target.value as StatisticsDisplaySettings['grouping'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="DAY">Day</option>
              <option value="WEEK">Week</option>
              <option value="MONTH">Month</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Display Preferences">
          <FeatureSettingsRow label="Show trend comparison">
            <input
              type="checkbox"
              checked={settings.showTrendComparison}
              onChange={(e) => onChange({ showTrendComparison: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show zero-value series">
            <input
              type="checkbox"
              checked={settings.showZeroValueSeries}
              onChange={(e) => onChange({ showZeroValueSeries: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
