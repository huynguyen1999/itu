import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sliders, Trophy } from 'lucide-react';
import { api } from '@/shared/api/client';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export function GrowthCurvePreview({ initialBaseXp = 100 }: { initialBaseXp?: number }) {
  const [baseXp, setBaseXp] = useState(initialBaseXp);

  const previewQuery = useQuery({
    queryKey: ['growth', 'curve-preview', baseXp],
    queryFn: () => api.growthCurvePreview(baseXp, 1, 10),
  });

  return (
    <div className="rounded-2xl border border-violet-300/30 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-bold">Level XP Curve Preview</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">Quadratic Formula: baseXp × (L-1)²</span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex-1">
          <Label htmlFor="base-xp-input" className="text-xs">
            Account / Skill Base XP Parameter (10 – 10,000)
          </Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="base-xp-input"
              type="number"
              min="10"
              max="10000"
              value={baseXp}
              onChange={(e) => setBaseXp(Math.max(10, Math.min(10000, Number(e.target.value) || 100)))}
              className="h-8 w-28 text-xs font-bold"
            />
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={baseXp}
              onChange={(e) => setBaseXp(Number(e.target.value))}
              className="flex-1 accent-violet-500"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Level</th>
              <th className="py-2 px-3 font-semibold">Total XP Required</th>
              <th className="py-2 pl-3 font-semibold">XP for This Level</th>
            </tr>
          </thead>
          <tbody>
            {previewQuery.data?.map((row) => (
              <tr key={row.level} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                <td className="py-2 pr-3 font-bold text-violet-600 dark:text-violet-300">
                  <div className="flex items-center gap-1">
                    <Trophy className="h-3 w-3 text-amber-500" /> Level {row.level}
                  </div>
                </td>
                <td className="py-2 px-3 font-semibold">{row.totalXpRequired.toLocaleString()} XP</td>
                <td className="py-2 pl-3 text-muted-foreground">+{row.xpForLevel.toLocaleString()} XP</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
