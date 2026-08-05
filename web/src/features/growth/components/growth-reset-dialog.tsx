import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthResetScope, GrowthSkill } from '@/shared/api/types';
import { isSelectableGrowthEntry } from '@/shared/growthEntryFilters';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export function GrowthResetDialog({
  open,
  skills,
  onClose,
}: {
  open: boolean;
  skills: GrowthSkill[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const selectableSkills = skills.filter(isSelectableGrowthEntry);
  const [scope, setScope] = useState<GrowthResetScope>('SKILL');
  const [selectedSkillId, setSelectedSkillId] = useState<string>(selectableSkills[0]?.id ?? '');
  const [confirmInput, setConfirmInput] = useState('');
  const [keepRules, setKeepRules] = useState(true);
  const [keepRewards, setKeepRewards] = useState(true);

  const previewQuery = useQuery({
    queryKey: ['growth', 'reset-preview', scope, selectedSkillId],
    queryFn: () => api.previewGrowthReset(scope, scope === 'SKILL' ? selectedSkillId : undefined),
    enabled: open,
  });

  const resetMutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = `reset-${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return api.executeGrowthReset({
        scope,
        skillId: scope === 'SKILL' ? selectedSkillId : undefined,
        idempotencyKey,
        keepEarningRules: keepRules,
        keepShopRewards: keepRewards,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth'] });
      setConfirmInput('');
      onClose();
    },
  });

  const isConfirmed = confirmInput.toUpperCase() === 'RESET';

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-xl font-black">Reset Growth Progression</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Resetting progression appends compensating adjustments to preserve complete ledger history.
          </p>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider">Reset Scope</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScope('SKILL')}
                className={`rounded-xl border p-2.5 text-xs font-bold transition ${
                  scope === 'SKILL'
                    ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                Single Skill
              </button>
              <button
                type="button"
                onClick={() => setScope('ALL_XP')}
                className={`rounded-xl border p-2.5 text-xs font-bold transition ${
                  scope === 'ALL_XP'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                All Skills XP
              </button>
              <button
                type="button"
                onClick={() => setScope('FULL')}
                className={`rounded-xl border p-2.5 text-xs font-bold transition ${
                  scope === 'FULL'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                Full Reset
              </button>
            </div>
          </div>

          {scope === 'SKILL' && (
            <div>
              <Label className="text-xs">Choose Skill to Reset</Label>
              <select
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-xs"
              >
                {selectableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Level {s.level})
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'FULL' && (
            <div className="space-y-2 rounded-xl border border-rose-300/30 bg-rose-500/5 p-3 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={keepRules}
                  onChange={(e) => setKeepRules(e.target.checked)}
                  className="rounded border-rose-400 text-rose-500"
                />
                <span>Preserve custom earning rules</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={keepRewards}
                  onChange={(e) => setKeepRewards(e.target.checked)}
                  className="rounded border-rose-400 text-rose-500"
                />
                <span>Preserve shop reward items</span>
              </label>
            </div>
          )}

          {/* Impact preview */}
          {previewQuery.data && (
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-xs space-y-2">
              <p className="font-bold flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" /> Reset Impact Summary:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                {previewQuery.data.affectedSkills.map(
                  (s: { id: string; name: string; currentLevel: number; xpToReset: number }) => (
                    <li key={s.id}>
                      <strong className="text-foreground">{s.name}</strong>: Level {s.currentLevel} ({s.xpToReset} XP) →
                      Level 1 (0 XP)
                    </li>
                  ),
                )}
                {previewQuery.data.coinBalanceToReset !== undefined && (
                  <li>
                    Coins: <strong className="text-foreground">{previewQuery.data.coinBalanceToReset} coins</strong>{' '}
                    will be zeroed.
                  </li>
                )}
              </ul>
            </div>
          )}

          <div>
            <Label className="text-xs font-semibold">
              Type <strong className="text-rose-600 dark:text-rose-400">RESET</strong> to confirm
            </Label>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="RESET"
              className="mt-1 h-9 font-mono text-xs uppercase"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!isConfirmed || resetMutation.isPending}
            onClick={() => resetMutation.mutate()}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Confirm Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
