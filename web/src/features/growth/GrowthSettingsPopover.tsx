import { useState } from 'react';
import { TrendingUp, ChevronRight, AlertTriangle, ArrowLeft } from 'lucide-react';
import {
  FeatureSettingsPopover,
  FeatureSettingsSection,
  FeatureSettingsRow,
  FeatureSettingsReset,
} from '@/shared/ui/feature-settings';
import { DEFAULT_GROWTH_PREFERENCES, type GrowthPreferences } from '@/shared/api/preferencesApi';
import { Button } from '@/shared/ui/button';

export function GrowthSettingsPopover({
  preferences = DEFAULT_GROWTH_PREFERENCES,
  onChangePreferences,
  onOpenResetData,
}: {
  preferences?: GrowthPreferences;
  onChangePreferences: (patch: Partial<GrowthPreferences>) => void;
  onOpenResetData: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (showAdvanced) {
    return (
      <FeatureSettingsPopover
        title="Advanced Growth Configuration"
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        footer={
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced(false)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
            <FeatureSettingsReset onReset={() => onChangePreferences(DEFAULT_GROWTH_PREFERENCES)} />
          </div>
        }
      >
        <div className="space-y-4">
          <FeatureSettingsSection title="Destructive Data Operations">
            <div className="rounded-md border border-destructive/30 p-3 space-y-2 bg-destructive/5">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-xs font-bold">Reset Growth Data</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Resetting Growth data clears accumulated XP, level progression, or skill XP while preserving your earning rules.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => {
                  setShowAdvanced(false);
                  onOpenResetData();
                }}
              >
                Reset Growth data…
              </Button>
            </div>
          </FeatureSettingsSection>
        </div>
      </FeatureSettingsPopover>
    );
  }

  return (
    <FeatureSettingsPopover
      title="Growth Settings"
      icon={<TrendingUp className="h-4 w-4 text-primary" />}
      footer={<FeatureSettingsReset onReset={() => onChangePreferences(DEFAULT_GROWTH_PREFERENCES)} />}
    >
      <div className="space-y-4">
        <FeatureSettingsSection title="Feedback">
          <FeatureSettingsRow label="Celebration">
            <select
              value={preferences.celebrationIntensity}
              onChange={(e) => onChangePreferences({ celebrationIntensity: e.target.value as GrowthPreferences['celebrationIntensity'] })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="OFF">Off</option>
              <option value="SUBTLE">Subtle</option>
              <option value="FULL">Full</option>
            </select>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Rewards">
          <FeatureSettingsRow label="Confirmation threshold">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="10000"
                value={preferences.rewardConfirmationThreshold}
                onChange={(e) => onChangePreferences({ rewardConfirmationThreshold: Number(e.target.value) || 100 })}
                className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs"
              />
              <span className="text-xs text-muted-foreground">coins</span>
            </div>
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Display">
          <FeatureSettingsRow label="Show reward receipts">
            <input
              type="checkbox"
              checked={preferences.showRewardReceipts}
              onChange={(e) => onChangePreferences({ showRewardReceipts: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
          <FeatureSettingsRow label="Show animations">
            <input
              type="checkbox"
              checked={preferences.showAnimations}
              onChange={(e) => onChangePreferences({ showAnimations: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
          </FeatureSettingsRow>
        </FeatureSettingsSection>

        <FeatureSettingsSection title="Advanced">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border p-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
            onClick={() => setShowAdvanced(true)}
          >
            <span>Advanced Growth configuration…</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </FeatureSettingsSection>
      </div>
    </FeatureSettingsPopover>
  );
}
