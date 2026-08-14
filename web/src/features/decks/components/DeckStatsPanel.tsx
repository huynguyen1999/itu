import { BarChart3 } from 'lucide-react';
import { api } from '@/shared/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

export function DeckStatsPanel({ stats }: { stats: Awaited<ReturnType<typeof api.deckStats>> }) {
  const gradeTotal = Object.values(stats.gradeDistribution).reduce((sum, value) => sum + value, 0);
  const forecastTotal = stats.upcomingReviewForecast.reduce((sum, item) => sum + item.dueCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          Deck stats
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Retention</p>
          <p className="mt-1 text-3xl font-black text-foreground">{stats.retentionRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{stats.totalCards} active cards</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Grade distribution</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(['AGAIN', 'HARD', 'GOOD', 'EASY'] as const).map((grade) => (
              <div key={grade} className="rounded-lg border bg-muted/40 p-2 text-center">
                <p className="text-xs font-semibold text-muted-foreground">{grade}</p>
                <p className="mt-1 text-lg font-black text-foreground">{stats.gradeDistribution[grade]}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{gradeTotal} total graded reviews</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Upcoming review forecast</p>
          <div className="mt-3 flex h-16 items-end gap-1">
            {nextSevenDays(stats.upcomingReviewForecast).map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, Math.min(64, day.dueCount * 8))}px` }}
                  title={`${day.date}: ${day.dueCount} due`}
                />
                <span className="text-xs text-muted-foreground">{new Date(day.date).getDate()}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{forecastTotal} reviews scheduled in the next 30 days</p>
        </div>
      </CardContent>
    </Card>
  );
}

function nextSevenDays(forecast: Array<{ date: string; dueCount: number }>) {
  const byDate = new Map(forecast.map((item) => [item.date, item.dueCount]));
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const key = date.toISOString().slice(0, 10);
    return { date: key, dueCount: byDate.get(key) ?? 0 };
  });
}
