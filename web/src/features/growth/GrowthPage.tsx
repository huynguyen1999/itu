import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, ChartNoAxesCombined, Coins, History, Plus, ShoppingBag, Sprout, Star } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthOverview } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Input } from '@/shared/ui/input';
import { SectionRail, SectionRailLink, SectionRailNav } from '@/shared/ui/SectionRail';
import { GrowthOnboardingDialog } from './components/growth-onboarding-dialog';
import { CreateGrowthDialog } from './components/GrowthDialogs';
import { HeroStat, Progress, SectionTitle } from './components/GrowthPrimitives';
import { GrowthResetDialog } from './components/growth-reset-dialog';
import { Shop } from './components/growth-shop';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { GrowthSettingsPopover } from './GrowthSettingsPopover';
import type { GrowthPreferences } from '@/shared/api/preferencesApi';
import { GrowthSettingsView } from './components/GrowthSettings';
import { SkillCard } from './components/GrowthSkillCard';
import { Ledger } from './components/GrowthLedger';
import { GROWTH_KIND, ONBOARDING_STATE } from '@/shared/constants/growth.constants';
import type { GrowthKindValue } from '@/shared/constants/growth.constants';
import { growthSkillWeightsTotal } from '@/shared/growthRewardMath';
import { isSelectableGrowthEntry } from '@/shared/growthEntryFilters';
import { canonicalizeGrowthTaskRewardAwards } from './growthTaskRewardDefaults';

export {
  groupLedgerEntries,
  growthLedgerXpKind,
  growthLedgerXpLabel,
  isDerivedAttributeLedgerEntry,
} from './components/GrowthLedger';

export type GrowthTab = 'attributes' | 'skills' | 'shop' | 'ledger' | 'settings';

const growthNavigation = [
  { to: '/growth/attributes', label: 'Attributes', icon: ChartNoAxesCombined, tab: 'attributes', end: false },
  { to: '/growth/skills', label: 'Skills', icon: Star, tab: 'skills', end: false },
  { to: '/growth/shop', label: 'Rewards', icon: ShoppingBag, tab: 'shop', end: false },
  { to: '/growth/ledger', label: 'Ledger', icon: History, tab: 'ledger', end: false },
] as const;

export function GrowthPage({ tab = 'attributes' }: { tab?: GrowthTab }) {
  const [dialog, setDialog] = useState<'attribute' | 'skill' | 'reward' | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateGrowthPref = useMutation({
    mutationFn: (patch: Partial<GrowthPreferences>) => api.updateGrowthPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const overview = useQuery({ queryKey: ['growth', 'overview'], queryFn: () => api.growthOverview() });
  const rewards = useQuery({
    queryKey: ['growth', 'rewards'],
    queryFn: () => api.growthRewards(),
    enabled: tab === 'shop',
  });
  const ledger = useQuery({
    queryKey: ['growth', 'ledger'],
    queryFn: () => api.growthLedger(),
    enabled: tab === 'ledger',
  });
  const data = overview.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['growth'] });

  const redeem = useMutation({
    mutationFn: (id: string) => api.redeemGrowthReward(id),
  });

  const updateAccountBaseXp = useMutation({
    mutationFn: (newBaseXp: number) => api.updateGrowthProfile({ accountBaseXp: newBaseXp }),
  });

  if (overview.isLoading) return <GrowthLoading />;
  if (overview.isError || !data) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        Growth could not be loaded.
      </div>
    );
  }

  const needsOnboarding = data.profile?.onboardingState === ONBOARDING_STATE.NOT_STARTED;

  return (
    <div className="itu-task-workspace growth-workspace">
      <SectionRail kicker="Growth" title="Progress" ariaLabel="Growth navigation" className="growth-rail">
        <SectionRailNav ariaLabel="Growth sections">
          {growthNavigation.map(({ to, label, icon, end }) => (
            <SectionRailLink key={to} to={to} label={label} icon={icon} end={end} />
          ))}
        </SectionRailNav>
      </SectionRail>

      <main className="itu-task-list-pane growth-main">
        <div className="growth-page">
          <PageHeader
            kicker="Personal growth"
            title="Growth"
            description="Build useful skills, strengthen core attributes, and turn completed work into visible progress."
            className="px-4 pt-4 sm:px-6 lg:px-8"
          >
            {needsOnboarding && (
              <Button onClick={() => setShowOnboarding(true)} size="sm" className="gap-2">
                <Sprout className="h-4 w-4" /> Set up Growth
              </Button>
            )}
            <FeatureSettingsButton title="Growth settings">
              <GrowthSettingsPopover
                preferences={userPreferences.data?.growth}
                onChangePreferences={(patch) => updateGrowthPref.mutate(patch)}
                onOpenResetData={() => setShowReset(true)}
              />
            </FeatureSettingsButton>
          </PageHeader>

          <section className="growth-account-summary" aria-label="Account progress">
            <HeroStat icon={Award} label="Level" value={String(data.account.level)} />
            <HeroStat icon={Coins} label="Coins" value={String(data.account.coinBalance)} accent />
            <div className="growth-account-summary__xp">
              <div className="growth-account-summary__xp-heading">
                <div>
                  <span>Next level</span>
                  <strong>
                    {data.account.currentXp.toLocaleString()}
                    <small> XP</small>
                  </strong>
                </div>
                <span>{data.account.nextLevelXp.toLocaleString()} XP goal</span>
              </div>
              <Progress value={data.account.progressXp} max={data.account.requiredXp} />
            </div>
          </section>

          <div className="growth-content">
            {tab === 'attributes' && (
              <ProgressEntries data={data} kind={GROWTH_KIND.ATTRIBUTE} onCreate={() => setDialog('attribute')} />
            )}
            {tab === 'skills' && (
              <ProgressEntries data={data} kind={GROWTH_KIND.SKILL} onCreate={() => setDialog('skill')} />
            )}
            {tab === 'shop' && (
              <Shop
                rewards={rewards.data ?? []}
                balance={data.account.coinBalance}
                onCreate={() => setDialog('reward')}
                onRedeem={(id) => redeem.mutate(id)}
                pending={redeem.isPending}
                offline={!navigator.onLine}
                isLoading={rewards.isLoading}
                error={rewards.error}
              />
            )}
            {tab === 'ledger' && <Ledger entries={ledger.data?.data ?? data.recentLedger} />}
            {tab === 'settings' && (
              <SettingsView
                data={data}
                onUpdateAccountBaseXp={(v) => updateAccountBaseXp.mutate(v)}
                onOpenReset={() => setShowReset(true)}
              />
            )}
          </div>
        </div>

        <CreateGrowthDialog type={dialog} skills={data.skills} onClose={() => setDialog(null)} onCreated={refresh} />
        <GrowthOnboardingDialog open={showOnboarding} onClose={() => setShowOnboarding(false)} onCompleted={refresh} />
        <GrowthResetDialog open={showReset} skills={data.skills} onClose={() => setShowReset(false)} />

        <div className="sr-only" aria-live="polite">
          {redeem.isSuccess ? 'Reward redeemed.' : redeem.error instanceof Error ? redeem.error.message : ''}
        </div>
      </main>
    </div>
  );
}

function ProgressEntries({
  data,
  kind,
  onCreate,
}: {
  data: GrowthOverview;
  kind: GrowthKindValue;
  onCreate: () => void;
}) {
  const entries = data.skills.filter((entry) => entry.kind === kind && isSelectableGrowthEntry(entry));
  const isAttribute = kind === GROWTH_KIND.ATTRIBUTE;
  const label = isAttribute ? 'Attributes' : 'Skills';
  return (
    <section>
      <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle title={label} eyebrow={isAttribute ? 'Core personal qualities' : 'Practiced capabilities'} />
        <Button onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New {isAttribute ? 'attribute' : 'skill'}
        </Button>
      </div>
      <div className="growth-entry-grid">
        {entries.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
      </div>
    </section>
  );
}

function SettingsView({
  data,
  onUpdateAccountBaseXp,
  onOpenReset,
}: {
  data: GrowthOverview;
  onUpdateAccountBaseXp: (baseXp: number) => void;
  onOpenReset: () => void;
}) {
  return (
    <GrowthSettingsView
      data={data}
      onUpdateAccountBaseXp={onUpdateAccountBaseXp}
      onOpenReset={onOpenReset}
      taskDefaultsEditor={<GrowthTaskRewardDefaultsEditor />}
    />
  );
}

function GrowthTaskRewardDefaultsEditor() {
  const queryClient = useQueryClient();
  const taskLists = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const skills = useQuery({ queryKey: ['growth', 'skills'], queryFn: () => api.growthSkills() });
  const selectableSkills = useMemo(() => (skills.data ?? []).filter(isSelectableGrowthEntry), [skills.data]);
  const selectableSkillIds = useMemo(
    () => (skills.data ? new Set(selectableSkills.map((skill) => skill.id)) : null),
    [selectableSkills, skills.data],
  );
  const defaults = useQuery({
    queryKey: ['growth', 'task-reward-defaults'],
    queryFn: () => api.growthTaskRewardDefaults(),
  });
  const [scope, setScope] = useState('global');
  const selectedTaskListId = scope === 'global' ? null : scope;
  const selectedDefault = defaults.data?.find((item) => (item.taskListId ?? null) === selectedTaskListId);
  const [coins, setCoins] = useState('0');
  const [accountXp, setAccountXp] = useState('100');
  const [enabled, setEnabled] = useState(true);
  const [xp, setXp] = useState<Record<string, string>>({});
  const selectedWeightsTotal = growthSkillWeightsTotal(
    Object.entries(xp).map(([skillId, value]) => ({ skillId, xpReward: Number(value) || 0 })),
  );

  const updateDefaultWeight = (skillId: string, value: string) => {
    setXp((current) => {
      const selectedIds = Object.entries(current)
        .filter(([, amount]) => Number.isFinite(Number(amount)) && Number(amount) > 0)
        .map(([id]) => id);
      const isNew = !selectedIds.includes(skillId) && Number.isFinite(Number(value)) && Number(value) > 0;
      if (isNew && selectedIds.length >= 3) return current;
      if (value === '' || (Number.isFinite(Number(value)) && Number(value) > 0)) {
        return { ...current, [skillId]: value };
      }
      const next = { ...current };
      delete next[skillId];
      return next;
    });
  };

  useEffect(() => {
    setCoins(String(selectedDefault?.coinReward ?? 0));
    setAccountXp(String(selectedDefault?.accountXp ?? 100));
    setEnabled(selectedDefault?.enabled ?? true);
    if (!selectableSkillIds) return;
    const persistedAwards = canonicalizeGrowthTaskRewardAwards(selectedDefault?.skillAwards ?? [], selectableSkillIds);
    setXp(Object.fromEntries(persistedAwards.map((award) => [award.skillId, String(award.xpReward)])));
  }, [selectedDefault, selectableSkillIds]);

  const save = useMutation({
    mutationFn: () =>
      api.saveGrowthTaskRewardDefault({
        taskListId: selectedTaskListId,
        coinReward: Math.max(0, Number(coins) || 0),
        accountXp: Math.max(0, Math.trunc(Number(accountXp) || 0)),
        enabled,
        skillAwards: canonicalizeGrowthTaskRewardAwards(
          Object.entries(xp).map(([skillId, value]) => ({ skillId, xpReward: Number(value) })),
          selectableSkillIds ?? new Set<string>(),
        ),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['growth'] }),
        queryClient.invalidateQueries({ queryKey: ['growth', 'task-reward-defaults'] }),
      ]);
    },
  });

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-sm font-bold">Default task skill weights</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which skills new tasks should reward. Task-list defaults override the global default.
          </p>
        </div>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm font-semibold"
        >
          <option value="global">Global default</option>
          {(taskLists.data ?? []).map((list) => (
            <option key={list.id} value={list.id}>
              {list.title}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[180px_1fr]">
        <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-3">
          <label className="grid gap-1 text-xs font-semibold">
            Coins
            <Input
              type="number"
              min="0"
              value={coins}
              onChange={(event) => setCoins(event.target.value)}
              className="h-9"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Account XP
            <Input
              type="number"
              min="0"
              value={accountXp}
              onChange={(event) => setAccountXp(event.target.value)}
              className="h-9"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Enabled
          </label>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/60 p-3">
          {skills.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading skills...</p>
          ) : !selectableSkills.length ? (
            <p className="text-sm text-muted-foreground">Create skills before assigning task XP defaults.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {selectableSkills.map((skill) => (
                <label key={skill.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                  <span className="inline-flex items-center gap-1">
                    <Input
                      aria-label={`${skill.name} skill weight`}
                      type="number"
                      min="0"
                      value={xp[skill.id] ?? '0'}
                      onChange={(event) => updateDefaultWeight(skill.id, event.target.value)}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          disabled={save.isPending || !skills.data || (selectedWeightsTotal > 0 && selectedWeightsTotal !== 100)}
          onClick={() => save.mutate()}
        >
          {save.isSuccess ? 'Saved' : 'Save task defaults'}
        </Button>
      </div>
      {selectedWeightsTotal > 0 && selectedWeightsTotal !== 100 ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          Skill weights must total 100%.
        </p>
      ) : null}
      {save.error instanceof Error && <p className="mt-2 text-xs text-destructive">{save.error.message}</p>}
    </section>
  );
}

function GrowthLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="animate-pulse text-sm text-muted-foreground">Preparing your Growth ledger…</div>
    </div>
  );
}
