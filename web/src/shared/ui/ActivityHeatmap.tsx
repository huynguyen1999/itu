import { useMemo, useState } from 'react';
import { BrainCircuit, CheckCircle2, Clock, PlusCircle } from 'lucide-react';
import type { StudyCalendarDay } from '../api/types';

export function ActivityHeatmap({
  days,
  totalDays = 365,
  compact = false,
}: {
  days: StudyCalendarDay[];
  totalDays?: number;
  compact?: boolean;
}) {
  const [hoveredCell, setHoveredCell] = useState<{
    cell: {
      date: string;
      completedTasks: number;
      focusedMinutes: number;
      reviews: number;
      cardsCreated: number;
    };
    x: number;
    y: number;
  } | null>(null);

  const { columns, totalTasks, totalFocusHours, totalReviews, totalCardsCreated } = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let tTasks = 0;
    let tFocusSecs = 0;
    let tReviews = 0;
    let tCreated = 0;

    for (const d of days) {
      tTasks += d.completedTasks ?? 0;
      tFocusSecs += (d.focusedMinutes ?? 0) * 60;
      tReviews += d.reviews ?? 0;
      tCreated += d.cardsCreated ?? 0;
    }

    // Start 364 days ago
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (totalDays - 1));

    // Align to Sunday
    const startDayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - startDayOfWeek);

    const cols: Array<{
      weekIndex: number;
      monthLabel?: string;
      days: Array<{
        date: string;
        dayOfWeek: number;
        inRange: boolean;
        completedTasks: number;
        focusedMinutes: number;
        reviews: number;
        cardsCreated: number;
      }>;
    }> = [];

    let currentDate = new Date(startDate);
    let lastMonth = -1;
    let weekIndex = 0;

    while (currentDate <= today || (cols.length > 0 && cols[cols.length - 1].days.length < 7)) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || cols.length === 0) {
        cols.push({ weekIndex, days: [] });
        weekIndex++;
      }

      const currentWeek = cols[cols.length - 1];
      const key = formatDateKeyLocal(currentDate);
      const inRange = currentDate <= today;
      const dayData = byDate.get(key);

      const month = currentDate.getMonth();
      if (month !== lastMonth && (dayOfWeek === 0 || currentWeek.days.length === 0)) {
        lastMonth = month;
        currentWeek.monthLabel = currentDate.toLocaleDateString(undefined, { month: 'short' });
      }

      currentWeek.days.push({
        date: key,
        dayOfWeek,
        inRange,
        completedTasks: dayData?.completedTasks ?? 0,
        focusedMinutes: dayData?.focusedMinutes ?? 0,
        reviews: dayData?.reviews ?? 0,
        cardsCreated: dayData?.cardsCreated ?? 0,
      });

      currentDate.setDate(currentDate.getDate() + 1);
      if (currentDate > today && dayOfWeek === 6) break;
    }

    return {
      columns: cols,
      totalTasks: tTasks,
      totalFocusHours: (tFocusSecs / 3600).toFixed(1),
      totalReviews: tReviews,
      totalCardsCreated: tCreated,
    };
  }, [days, totalDays]);

  return (
    <div className="space-y-4 relative">
      {/* Metrics Summary Pills */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 p-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Tasks Completed</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{totalTasks}</p>
          </div>
          <div className="rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 p-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Hours Focused</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{totalFocusHours}h</p>
          </div>
          <div className="rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 p-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Cards Reviewed</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{totalReviews}</p>
          </div>
          <div className="rounded-lg border bg-slate-50/50 dark:bg-slate-900/50 p-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Cards Created</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{totalCardsCreated}</p>
          </div>
        </div>
      )}

      {/* Heatmap Grid */}
      <div className="overflow-x-auto pb-1 custom-scrollbar">
        <div className="min-w-[720px]">
          {/* Month Headers */}
          <div className="flex text-[10px] text-muted-foreground mb-1 pl-7">
            {columns.map((col, idx) => (
              <div key={idx} className="w-3.5 shrink-0 text-center font-medium overflow-visible">
                {col.monthLabel ?? ''}
              </div>
            ))}
          </div>

          {/* Days Grid (7 rows x 52+ columns) */}
          <div className="flex gap-1">
            {/* Weekday labels */}
            <div className="flex flex-col justify-between text-[10px] text-muted-foreground pr-1 shrink-0 select-none py-0.5">
              <span className="h-3 leading-3">Sun</span>
              <span className="h-3 leading-3">Mon</span>
              <span className="h-3 leading-3">Tue</span>
              <span className="h-3 leading-3">Wed</span>
              <span className="h-3 leading-3">Thu</span>
              <span className="h-3 leading-3">Fri</span>
              <span className="h-3 leading-3">Sat</span>
            </div>

            {/* Columns */}
            <div className="flex gap-1 flex-1">
              {columns.map((col) => (
                <div key={col.weekIndex} className="flex flex-col gap-1 shrink-0">
                  {col.days.map((cell) => {
                    return (
                      <button
                        type="button"
                        key={cell.date}
                        onMouseEnter={(e) => {
                          if (!cell.inRange) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredCell({
                            cell,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onMouseLeave={() => setHoveredCell(null)}
                        onFocus={(e) => {
                          if (!cell.inRange) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredCell({
                            cell,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onBlur={() => setHoveredCell(null)}
                        disabled={!cell.inRange}
                        aria-label={heatmapCellLabel(cell)}
                        className={`h-3 w-3 rounded-[2px] transition-transform hover:z-10 hover:scale-125 focus-visible:z-10 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default ${getHeatmapLevelClass(cell)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Rich Tooltip Card */}
      {hoveredCell && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full mb-2 pointer-events-none transition-all duration-75"
          style={{
            left: `${Math.max(140, Math.min(typeof window !== 'undefined' ? window.innerWidth - 140 : 1000, hoveredCell.x))}px`,
            top: `${hoveredCell.y - 6}px`,
          }}
        >
          <div className="w-64 rounded-xl border bg-popover/95 text-popover-foreground shadow-2xl p-3 backdrop-blur-md text-xs space-y-2.5 border-border/80 animate-in fade-in-0 zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b pb-2 border-border/60">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatReadableDate(hoveredCell.cell.date)}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getActivityBadgeClass(hoveredCell.cell)}`}
              >
                {getActivityLabel(hoveredCell.cell)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                <div>
                  <div className="text-[10px] text-muted-foreground font-medium">Tasks</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {hoveredCell.cell.completedTasks} done
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="text-[10px] text-muted-foreground font-medium">Focus</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {(hoveredCell.cell.focusedMinutes / 60).toFixed(1)}h
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-purple-500 shrink-0" />
                <div>
                  <div className="text-[10px] text-muted-foreground font-medium">Reviewed</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">{hoveredCell.cell.reviews} cards</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <div className="text-[10px] text-muted-foreground font-medium">Created</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {hoveredCell.cell.cardsCreated} cards
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>Showing last {totalDays} days</span>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>Less</span>
          <span className="h-2.5 w-2.5 rounded-[2px] bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-300/40 dark:bg-emerald-800/50" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-400/60 dark:bg-emerald-700/60" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-500/80 dark:bg-emerald-600/80" />
          <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-600 dark:bg-emerald-500" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

function getHeatmapLevelClass(cell: {
  completedTasks: number;
  focusedMinutes: number;
  reviews: number;
  cardsCreated: number;
  inRange: boolean;
}): string {
  if (!cell.inRange) return 'opacity-0 pointer-events-none';
  const score = calculateScore(cell);

  if (score >= 25) return 'bg-emerald-600 dark:bg-emerald-500';
  if (score >= 12) return 'bg-emerald-500/80 dark:bg-emerald-600/80';
  if (score >= 4) return 'bg-emerald-400/60 dark:bg-emerald-700/60';
  if (score > 0) return 'bg-emerald-300/40 dark:bg-emerald-800/50';
  return 'bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50';
}

function formatDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatReadableDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function heatmapCellLabel(cell: {
  date: string;
  completedTasks: number;
  focusedMinutes: number;
  reviews: number;
  cardsCreated: number;
}): string {
  return `${formatReadableDate(cell.date)}: ${cell.completedTasks} tasks completed, ${cell.focusedMinutes} focus minutes, ${cell.reviews} reviews, ${cell.cardsCreated} cards created`;
}

function calculateScore(cell: {
  completedTasks: number;
  focusedMinutes: number;
  reviews: number;
  cardsCreated: number;
}): number {
  return cell.completedTasks * 3 + Math.floor(cell.focusedMinutes / 15) + cell.reviews + cell.cardsCreated * 2;
}

function getActivityLabel(cell: {
  completedTasks: number;
  focusedMinutes: number;
  reviews: number;
  cardsCreated: number;
}): string {
  const score = calculateScore(cell);
  if (score >= 25) return 'Ultra Active';
  if (score >= 12) return 'High Activity';
  if (score >= 4) return 'Moderate';
  if (score > 0) return 'Light Activity';
  return 'No Activity';
}

function getActivityBadgeClass(cell: {
  completedTasks: number;
  focusedMinutes: number;
  reviews: number;
  cardsCreated: number;
}): string {
  const score = calculateScore(cell);
  if (score >= 25) return 'bg-emerald-600 text-white font-bold';
  if (score >= 12) return 'bg-emerald-500/90 text-white';
  if (score >= 4) return 'bg-emerald-200 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200';
  if (score > 0) return 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
}
