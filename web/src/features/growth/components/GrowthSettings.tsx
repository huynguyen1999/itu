import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthOverview, GrowthRewardPreset, GrowthScalingMode, GrowthSourceType } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { GrowthCurvePreview } from './growth-curve-preview';
import { GrowthRewardPresets } from './growth-reward-presets';
import { Input } from '@/shared/ui/input';

export function GrowthSettingsView({
  data,
  onUpdateAccountBaseXp,
  onOpenReset,
  taskDefaultsEditor,
}: {
  data: GrowthOverview;
  onUpdateAccountBaseXp: (baseXp: number) => void;
  onOpenReset: () => void;
  taskDefaultsEditor?: React.ReactNode;
}) {
  const [accountBaseXpInput, setAccountBaseXpInput] = useState(String(data.profile?.accountBaseXp ?? 100));

  return (
    <div className="space-y-8">
      <GrowthRewardPresets currentPreset={data.profile?.rewardPreset} />
      <GrowthPresetEditor currentPreset={data.profile?.rewardPreset ?? 'STANDARD'} />
      {taskDefaultsEditor}

      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold">Account Progression Curve</h3>
          <p className="text-xs text-muted-foreground">
            Configure the Account Level formula base parameter (default: 100).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Input
            type="number"
            min="10"
            max="10000"
            value={accountBaseXpInput}
            onChange={(e) => setAccountBaseXpInput(e.target.value)}
            className="h-9 w-32 text-xs font-bold"
          />
          <Button size="sm" variant="outline" onClick={() => onUpdateAccountBaseXp(Number(accountBaseXpInput) || 100)}>
            Update Account Base XP
          </Button>
        </div>

        <GrowthCurvePreview initialBaseXp={data.profile?.accountBaseXp ?? 100} />
      </div>

      <div className="rounded-2xl border border-rose-300/40 bg-rose-500/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">Progression Resets & Cycles</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reset single skill XP, all skill XP, or start a new full progression cycle while keeping immutable
              history.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={onOpenReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Manage Resets
          </Button>
        </div>
      </div>
    </div>
  );
}

const presetSourceLabels: Record<GrowthSourceType, string> = {
  TASK: 'Tasks',
  HABIT: 'Habits',
  FOCUS_PRESET: 'Focus',
  REVIEW_DECK: 'Deck Reviews',
};

const presetSourceOrder: GrowthSourceType[] = ['TASK', 'HABIT', 'FOCUS_PRESET', 'REVIEW_DECK'];

type PresetDraft = Record<
  GrowthSourceType,
  {
    coinReward: string;
    accountXp: string;
    xpRewardPerSkill: string;
    scalingMode: GrowthScalingMode;
    maxRewardCap: string;
  }
>;

function GrowthPresetEditor({ currentPreset }: { currentPreset: GrowthRewardPreset }) {
  const queryClient = useQueryClient();
  const presets = useQuery({
    queryKey: ['growth', 'reward-presets', 'settings'],
    queryFn: () => api.growthRewardPresetSettings(),
  });
  const [selectedPreset, setSelectedPreset] = useState<GrowthRewardPreset>(currentPreset);
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const selected = presets.data?.[selectedPreset];

  useEffect(() => {
    if (!selected) return;
    setDraft(
      Object.fromEntries(
        presetSourceOrder.map((sourceType) => {
          const rule = selected[sourceType];
          return [
            sourceType,
            {
              coinReward: String(rule.coinReward),
              accountXp: String(rule.accountXp ?? 100),
              xpRewardPerSkill: String(rule.xpRewardPerSkill),
              scalingMode: rule.scalingMode,
              maxRewardCap: rule.maxRewardCap ? String(rule.maxRewardCap) : '',
            },
          ];
        }),
      ) as PresetDraft,
    );
  }, [selected]);

  const updatePreset = useMutation({
    mutationFn: () =>
      api.updateGrowthRewardPreset(
        selectedPreset,
        presetSourceOrder.map((sourceType) => {
          const rule = draft?.[sourceType];
          return {
            sourceType,
            coinReward: Math.max(0, Number(rule?.coinReward) || 0),
            accountXp: Math.max(0, Math.trunc(Number(rule?.accountXp) || 0)),
            xpRewardPerSkill: Math.max(0, Number(rule?.xpRewardPerSkill) || 0),
            scalingMode: rule?.scalingMode ?? 'FIXED',
            maxRewardCap: rule?.maxRewardCap ? Math.max(1, Number(rule.maxRewardCap) || 0) : null,
          };
        }),
      ),
    onSuccess: async () => {
      setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['growth'] }),
        queryClient.invalidateQueries({ queryKey: ['growth', 'reward-presets', 'settings'] }),
      ]);
    },
  });

  const applyPreset = useMutation({
    mutationFn: () => api.applyGrowthPreset(selectedPreset),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['growth'] }),
  });

  const setRuleValue = (sourceType: GrowthSourceType, patch: Partial<PresetDraft[GrowthSourceType]>) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, [sourceType]: { ...current[sourceType], ...patch } };
    });
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-sm font-bold">Edit reward preset</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Save default XP and coin values, then apply them across existing items.
          </p>
        </div>
        <select
          value={selectedPreset}
          onChange={(event) => {
            setSelectedPreset(event.target.value as GrowthRewardPreset);
            setDraft(null);
          }}
          className="h-9 rounded-md border bg-background px-3 text-sm font-semibold"
        >
          <option value="LIGHT">Light</option>
          <option value="STANDARD">Standard</option>
          <option value="STRONG">Strong</option>
        </select>
      </div>

      {presets.isLoading || !draft ? (
        <p className="py-5 text-sm text-muted-foreground">Loading preset values...</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {presetSourceOrder.map((sourceType) => {
            const rule = draft[sourceType];
            return (
              <div
                key={sourceType}
                className="grid min-w-0 gap-3 rounded-xl border border-border/70 bg-background/60 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(140px,1fr)_110px_110px_130px_110px] xl:items-center"
              >
                <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                  <p className="text-sm font-bold">{presetSourceLabels[sourceType]}</p>
                  <p className="text-xs text-muted-foreground">
                    {sourceType === 'REVIEW_DECK' ? 'Can scale per reviewed card.' : 'Earned once when completed.'}
                  </p>
                </div>
                <PresetNumber
                  label="Coins"
                  value={rule.coinReward}
                  onChange={(value) => setRuleValue(sourceType, { coinReward: value })}
                />
                <PresetNumber
                  label="Skill XP"
                  value={rule.xpRewardPerSkill}
                  onChange={(value) => setRuleValue(sourceType, { xpRewardPerSkill: value })}
                />
                <PresetNumber
                  label="Account XP"
                  value={rule.accountXp}
                  onChange={(value) => setRuleValue(sourceType, { accountXp: value })}
                />
                <label className="grid min-w-0 gap-1 text-xs font-semibold">
                  Mode
                  <select
                    value={rule.scalingMode}
                    onChange={(event) =>
                      setRuleValue(sourceType, { scalingMode: event.target.value as GrowthScalingMode })
                    }
                    className="h-9 min-w-0 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="FIXED">Fixed</option>
                    <option value="LINEAR">Linear</option>
                  </select>
                </label>
                <PresetNumber
                  label="Cap"
                  value={rule.maxRewardCap}
                  placeholder="None"
                  onChange={(value) => setRuleValue(sourceType, { maxRewardCap: value })}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={!draft || updatePreset.isPending} onClick={() => updatePreset.mutate()}>
          {updatePreset.isSuccess ? 'Saved' : 'Save preset'}
        </Button>
        <Button disabled={!draft || applyPreset.isPending} onClick={() => applyPreset.mutate()}>
          Apply to existing items
        </Button>
      </div>
      {(updatePreset.error instanceof Error || applyPreset.error instanceof Error) && (
        <p className="mt-2 text-xs text-destructive">
          {(updatePreset.error as Error | undefined)?.message ?? (applyPreset.error as Error).message}
        </p>
      )}
    </section>
  );
}

function PresetNumber({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-semibold">
      {label}
      <Input
        type="number"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 text-sm"
      />
    </label>
  );
}
