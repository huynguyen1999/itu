import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather, Flame, Zap } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthRewardPreset } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';

const PRESET_CARDS: Array<{
  id: GrowthRewardPreset;
  title: string;
  description: string;
  icon: typeof Feather;
  color: string;
  badge: string;
  rewardsSummary: string;
}> = [
  {
    id: 'LIGHT',
    title: 'Light Rewards',
    description: 'Modest rewards for gentle motivation without inflating levels quickly.',
    icon: Feather,
    color: 'border-blue-400/40 bg-blue-500/5 text-blue-600 dark:text-blue-300',
    badge: 'Light',
    rewardsSummary: 'Task: 5 XP, 1 coin • Habit: 3 XP, 1 coin • Focus: 5 XP, 2 coins • Deck: 1 XP/card',
  },
  {
    id: 'STANDARD',
    title: 'Standard Rewards',
    description: 'Balanced default curve providing steady skill growth and reasonable coin earnings.',
    icon: Zap,
    color: 'border-amber-400/40 bg-amber-500/5 text-amber-600 dark:text-amber-300',
    badge: 'Recommended',
    rewardsSummary: 'Task: 15 XP, 3 coins • Habit: 10 XP, 2 coins • Focus: 15 XP, 5 coins • Deck: 3 XP/card',
  },
  {
    id: 'STRONG',
    title: 'Strong Rewards',
    description: 'High-yield rewards for ambitious momentum and faster progression.',
    icon: Flame,
    color: 'border-rose-400/40 bg-rose-500/5 text-rose-600 dark:text-rose-300',
    badge: 'High Yield',
    rewardsSummary: 'Task: 30 XP, 5 coins • Habit: 20 XP, 4 coins • Focus: 30 XP, 8 coins • Deck: 5 XP/card',
  },
];

export function GrowthRewardPresets({ currentPreset }: { currentPreset?: GrowthRewardPreset }) {
  const queryClient = useQueryClient();

  const applyMutation = useMutation({
    mutationFn: (preset: GrowthRewardPreset) => api.applyGrowthPreset(preset),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth'] });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold">Reward Presets</h3>
        <p className="text-xs text-muted-foreground">
          Apply a preset configuration across all your tasks, habits, focus presets, and flashcard decks.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {PRESET_CARDS.map((card) => {
          const Icon = card.icon;
          const isCurrent = currentPreset === card.id;
          return (
            <div key={card.id} className={`flex min-w-0 flex-col justify-between rounded-2xl border p-4 ${card.color}`}>
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
                    <Icon className="h-4 w-4 shrink-0" /> <span className="break-words">{card.title}</span>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-extrabold uppercase text-background">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs opacity-90 leading-relaxed">{card.description}</p>
                <div className="mt-3 break-words rounded-xl border border-border/40 bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
                  {card.rewardsSummary}
                </div>
              </div>

              <Button
                size="sm"
                variant={isCurrent ? 'secondary' : 'outline'}
                className="mt-4 h-auto min-h-9 w-full whitespace-normal text-xs font-bold"
                disabled={applyMutation.isPending || isCurrent}
                onClick={() => applyMutation.mutate(card.id)}
              >
                {isCurrent ? 'Active Preset' : `Apply ${card.badge}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
