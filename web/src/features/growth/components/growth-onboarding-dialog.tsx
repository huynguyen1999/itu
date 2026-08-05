import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Book, Crosshair, Heart, Palette, Shield, Sprout, Users } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { GrowthSkill } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

const STARTER_SKILLS = [
  {
    key: 'knowledge',
    name: 'Knowledge',
    description: 'Studying, reading, and reviews',
    icon: Book,
    color: 'border-blue-400/40 bg-blue-500/10 text-blue-600 dark:text-blue-300',
  },
  {
    key: 'focus',
    name: 'Focus',
    description: 'Completed work-focus sessions',
    icon: Crosshair,
    color: 'border-violet-400/40 bg-violet-500/10 text-violet-600 dark:text-violet-300',
  },
  {
    key: 'discipline',
    name: 'Discipline',
    description: 'Tasks, routines, and consistency',
    icon: Shield,
    color: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  },
  {
    key: 'health',
    name: 'Health',
    description: 'Exercise, sleep, and wellness habits',
    icon: Heart,
    color: 'border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300',
  },
  {
    key: 'creativity',
    name: 'Creativity',
    description: 'Writing, designing, and making',
    icon: Palette,
    color: 'border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
  {
    key: 'relationships',
    name: 'Relationships',
    description: 'Family, friends, and social habits',
    icon: Users,
    color: 'border-teal-400/40 bg-teal-500/10 text-teal-600 dark:text-teal-300',
  },
];

export function GrowthOnboardingDialog({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: (skills: GrowthSkill[]) => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({
    knowledge: true,
    focus: true,
    discipline: true,
    health: true,
  });
  const [customNames, setCustomNames] = useState<Record<string, string>>({});

  const completeMutation = useMutation({
    mutationFn: () => {
      const skillsToCreate = Object.entries(selected)
        .filter(([, active]) => active)
        .map(([key]) => ({
          key,
          customName: customNames[key]?.trim() || undefined,
        }));
      return api.completeGrowthOnboarding(skillsToCreate);
    },
    onSuccess: (skills) => {
      void queryClient.invalidateQueries({ queryKey: ['growth'] });
      onCompleted(skills);
      onClose();
    },
  });

  const toggleSkill = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Sprout className="h-5 w-5" />
            <DialogTitle className="text-xl font-black">Welcome to Personal Growth</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Choose starter skills to track your progress across work, study, habits, and life. You can edit or add more
            anytime.
          </p>
        </DialogHeader>

        <div className="my-4 grid gap-3 sm:grid-cols-2">
          {STARTER_SKILLS.map((skill) => {
            const Icon = skill.icon;
            const isChecked = Boolean(selected[skill.key]);
            return (
              <div
                key={skill.key}
                onClick={() => toggleSkill(skill.key)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  isChecked
                    ? 'border-amber-400/80 bg-amber-500/10 shadow-sm'
                    : 'border-border/60 bg-card opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${skill.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">{skill.name}</h4>
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSkill(skill.key)}
                    className="h-4 w-4 rounded border-amber-400 text-amber-500 focus:ring-amber-400"
                  />
                </div>
                {isChecked && (
                  <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                    <Input
                      placeholder={`Custom name (default: ${skill.name})`}
                      value={customNames[skill.key] ?? ''}
                      onChange={(e) => setCustomNames((prev) => ({ ...prev, [skill.key]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            Selected: {Object.values(selected).filter(Boolean).length} skills
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip for now
            </Button>
            <Button
              size="sm"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending || !Object.values(selected).some(Boolean)}
            >
              Initialize My Skills
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
