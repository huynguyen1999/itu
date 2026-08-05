import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpenText, ChartNoAxesCombined, CheckCircle2, Clock3, Settings2, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  type BaseTickContentProps,
} from 'recharts';
import { api } from '@/shared/api/client';
import { safeLocalStorage } from '@/shared/browser/safeStorage';
import type { GrowthSkill } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Skeleton } from '@/shared/ui/skeleton';
import { growthColorClasses, GrowthIconMark } from '@/shared/ui/GrowthIcons';
import {
  formatFocusDuration,
  growthAttributeItems,
  MAX_HOME_PROFILE_ITEMS,
  parseHomeProfileSelection,
  profileRadarCeiling,
  profileRadarValue,
  resolveHomeProfileSelection,
  summarizeTodayActivity,
  toggleHomeProfileItem,
  xpProgress,
} from './dashboard';

const HOME_PROFILE_SELECTION_KEY = 'itu_home_profile_selection_v1';

/* ─── Design tokens from the reference HTML ─── */
const RADIUS_LG = '20px';
const RADIUS_MD = '14px';
const TEAL_DEEP = '#0D3831';
const TEAL = '#1E7864';
const GOLD = '#AD8A3D';
const GOLD_SOFT = '#F1E7CF';

export function HomeOverview() {
  const [storedProfileIds, setStoredProfileIds] = useState<string[] | null>(() =>
    parseHomeProfileSelection(safeLocalStorage.getItem(HOME_PROFILE_SELECTION_KEY)),
  );
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.dashboard() });
  const growth = useQuery({ queryKey: ['growth', 'overview'], queryFn: () => api.growthOverview() });
  const todayActivity = useQuery({
    queryKey: ['study-calendar', 1],
    queryFn: () => api.studyCalendar(1),
  });

  const activity = summarizeTodayActivity(todayActivity.data ?? []);
  const profileOptions = useMemo(() => growthAttributeItems(growth.data?.skills ?? []), [growth.data?.skills]);
  const selectedProfileIds = resolveHomeProfileSelection(
    storedProfileIds,
    profileOptions.map((item) => item.id),
  );
  const selectedProfileItems = selectedProfileIds
    .map((id) => profileOptions.find((item) => item.id === id))
    .filter((item) => item !== undefined);
  const profileRadarData = selectedProfileItems.map((item) => ({ ...item, radarValue: profileRadarValue(item) }));
  const profileChartCeiling = profileRadarCeiling(selectedProfileItems);
  const dueCount = dashboard.data?.dueCount ?? 0;
  const account = growth.data?.account;
  const accountProgress = xpProgress(account?.progressXp ?? 0, account?.requiredXp ?? 0);

  function toggleProfileItem(itemId: string) {
    const nextSelection = toggleHomeProfileItem(selectedProfileIds, itemId);
    setStoredProfileIds(nextSelection);
    safeLocalStorage.setItem(HOME_PROFILE_SELECTION_KEY, JSON.stringify(nextSelection));
  }

  if (dashboard.isLoading && growth.isLoading && todayActivity.isLoading) {
    return <OverviewLoading />;
  }

  return (
    <section
      aria-labelledby="progress-overview-heading"
      className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in duration-500"
    >
      <h2 id="progress-overview-heading" className="sr-only">
        Today’s progress overview
      </h2>

      {/* ── Combined Level & Today Activity Card ── */}
      <Card className="itu-gradient-card flex flex-col border-none shadow-md" style={{ borderRadius: RADIUS_LG }}>
        <CardContent className="relative flex h-full flex-col justify-between p-6 sm:p-7">
          {/* Top Level Section */}
          <div>
            {/* Top row */}
            <div className="flex items-start justify-between">
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-[rgba(237,243,240,0.65)]">
                Account level
              </span>
              {/* Gold seal badge */}
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ border: '1.5px solid rgba(173,138,61,0.65)' }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full font-serif font-semibold text-sm"
                  style={{ border: '1px solid rgba(173,138,61,0.35)', color: GOLD_SOFT }}
                >
                  {account?.level ?? 1}
                </span>
              </span>
            </div>

            {/* Level figure & XP Block */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 items-end gap-4">
              {growth.isLoading ? (
                <div className="sm:col-span-5">
                  <Skeleton className="h-14 w-24 bg-white/15" />
                </div>
              ) : (
                <div className="sm:col-span-5 flex items-baseline gap-2">
                  <span className="font-serif font-medium leading-none tracking-tight text-5xl sm:text-6xl text-white">
                    {String(account?.level ?? '—').padStart(2, '0')}
                  </span>
                  <span className="text-xs text-[rgba(237,243,240,0.65)]">current level</span>
                </div>
              )}

              {/* XP block */}
              <div className="sm:col-span-7 flex flex-col justify-end">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[rgba(237,243,240,0.65)]">
                    Experience
                  </span>
                  <span className="font-mono text-xs text-[rgba(237,243,240,0.85)]">
                    {account
                      ? `${account.progressXp.toLocaleString()} / ${account.requiredXp.toLocaleString()} XP`
                      : '—'}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-[rgba(237,243,240,0.14)]"
                  role="progressbar"
                  aria-label="Experience toward the next level"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={accountProgress}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{
                      width: `${accountProgress}%`,
                      background: `linear-gradient(90deg, ${GOLD}, #D9B96A)`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-[rgba(237,243,240,0.55)]">
                  {account ? `${account.nextLevelXp.toLocaleString()} total XP to Level ${account.level + 1}` : ' '}
                </p>
              </div>
            </div>
          </div>

          {/* Integrated Today's Activity Stats Section */}
          <div className="mt-6 pt-4 border-t border-[rgba(237,243,240,0.12)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-[rgba(237,243,240,0.65)]">
                Today's activity
              </span>
            </div>

            {/* 3 Compact Stat Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <CompactStatTile
                icon={Clock3}
                label="Focus today"
                value={todayActivity.isLoading ? null : formatFocusDuration(activity.focusedMinutes)}
                detail="Deep work"
                to="/focus"
              />
              <CompactStatTile
                icon={BookOpenText}
                label="To review"
                value={dashboard.isLoading ? null : dueCount.toLocaleString()}
                detail={dueCount === 1 ? '1 card ready' : `${dueCount} ready now`}
                to="/learn/review"
              />
              <CompactStatTile
                icon={ChartNoAxesCombined}
                label="Reviewed"
                value={todayActivity.isLoading ? null : activity.reviewedCards.toLocaleString()}
                detail="Completed today"
                to="/learn/history"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Attribute profile card ── */}
      <Card
        className="flex flex-col border border-[rgba(226,230,225,0.8)] shadow-sm"
        style={{ borderRadius: RADIUS_LG, padding: '24px 26px 18px' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.10em] text-muted-foreground">
              Attribute profile
            </span>
            <h2 className="mt-1 font-serif text-[18px] font-medium text-foreground">
              {selectedProfileItems.length} attributes
            </h2>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="-mr-1 -mt-1 flex items-center gap-[4px]"
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '11.5px',
                  color: TEAL,
                  letterSpacing: '0.03em',
                  paddingTop: '4px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label="Choose attributes to show"
              >
                MANAGE
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="flex items-center justify-between gap-3">
                <span>Show on your profile</span>
                <span className="font-mono text-[10px] font-medium text-muted-foreground">
                  {selectedProfileItems.length}/{MAX_HOME_PROFILE_ITEMS}
                </span>
              </DropdownMenuLabel>
              <p className="px-2 pb-2 text-xs leading-5 text-muted-foreground">
                Choose up to eight attributes.
              </p>
              <DropdownMenuSeparator />
              {profileOptions.map((item, index) => {
                const isSelected = selectedProfileIds.includes(item.id);
                const isAtLimit = selectedProfileIds.length >= MAX_HOME_PROFILE_ITEMS;
                const previousItem = profileOptions[index - 1];
                const startsSkillSection = index > 0 && item.kind === 'SKILL' && previousItem?.kind !== 'SKILL';

                return (
                  <div key={item.id}>
                    {startsSkillSection && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          Skills
                        </DropdownMenuLabel>
                      </>
                    )}
                    {index === 0 && (
                      <DropdownMenuLabel className="py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {item.kind === 'ATTRIBUTE' ? 'Attributes' : 'Skills'}
                      </DropdownMenuLabel>
                    )}
                    <DropdownMenuCheckboxItem
                      checked={isSelected}
                      disabled={!isSelected && isAtLimit}
                      onCheckedChange={() => toggleProfileItem(item.id)}
                      onSelect={(event) => event.preventDefault()}
                      className="gap-2 py-2"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-inset ${
                          growthColorClasses[item.color] ?? growthColorClasses.TEAL
                        }`}
                      >
                        <GrowthIconMark icon={item.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">Level {item.level}</span>
                    </DropdownMenuCheckboxItem>
                  </div>
                );
              })}
              {profileOptions.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  Create an attribute first.
                </p>
              )}
              <DropdownMenuSeparator />
              <Button asChild variant="ghost" size="sm" className="w-full justify-between text-xs">
                <Link to="/growth/attributes">
                  Manage growth
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-1 items-center justify-center" style={{ marginTop: '4px' }}>
          {growth.isLoading ? (
            <Skeleton className="min-h-0 flex-1 rounded-lg" />
          ) : selectedProfileItems.length >= 3 ? (
            <div
              className="h-[clamp(300px,32vw,360px)] min-w-0 w-full"
              role="img"
              aria-label={`Attribute radar chart. ${selectedProfileItems
                .map((item) => `${item.name}, ${item.currentXp} total experience`)
                .join('. ')}`}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <RadarChart
                  data={profileRadarData}
                  outerRadius="58%"
                  margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
                >
                  <PolarGrid stroke="#E2E6E1" strokeWidth={1} />
                  <PolarAngleAxis
                    dataKey="id"
                    tick={<ProfileRadarTick items={selectedProfileItems} />}
                    tickLine={false}
                    tickSize={12}
                  />
                  <PolarRadiusAxis domain={[0, profileChartCeiling]} tick={false} axisLine={false} />
                  <Radar
                    dataKey="radarValue"
                    fill={TEAL}
                    fillOpacity={0.16}
                    stroke={TEAL}
                    strokeWidth={2}
                    dot={{ r: 3.5, fill: TEAL_DEEP, strokeWidth: 0 }}
                    isAnimationActive
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-5 text-center">
              <ChartNoAxesCombined className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold">Choose at least three items</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use the settings icon to build your radar profile.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Error banner ── */}
      {(dashboard.isError || growth.isError || todayActivity.isError) && (
        <div
          className="col-span-full flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-foreground"
          role="status"
        >
          <BookOpenText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          Some overview data could not be loaded. Available sections remain usable.
        </div>
      )}
    </section>
  );
}

/* ─── Compact Stat Tile ─── */

function CompactStatTile({
  icon: Icon,
  label,
  value,
  detail,
  to,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | null;
  detail: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] p-3 text-left transition-all duration-200 hover:border-white/25 hover:bg-white/[0.12] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft"
    >
      <div className="flex items-center justify-between">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(237,243,240,0.12)] text-[#F1E7CF] transition-transform duration-200 group-hover:scale-105">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-white/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white/80" />
      </div>

      <div className="mt-3">
        {value === null ? (
          <Skeleton className="h-6 w-12 bg-white/15" />
        ) : (
          <span className="block font-serif text-xl font-semibold leading-tight tracking-tight text-white tabular-nums">
            {value}
          </span>
        )}
        <span className="mt-0.5 block font-mono text-[10px] font-medium uppercase tracking-wider text-[rgba(237,243,240,0.7)]">
          {label}
        </span>
        <span className="block text-[11px] text-[rgba(237,243,240,0.55)] truncate">{detail}</span>
      </div>
    </Link>
  );
}

/* ─── Radar tick ─── */

type ProfileRadarTickProps = Partial<BaseTickContentProps> & {
  items: GrowthSkill[];
  cx?: number;
  cy?: number;
  x?: number;
  y?: number;
  index?: number;
};

function ProfileRadarTick({ x = 0, y = 0, cx = 0, cy = 0, index = 0, items }: ProfileRadarTickProps) {
  const item = items[index];
  if (!item) return null;

  const numX = Number(x);
  const numY = Number(y);
  const numCx = Number(cx);
  const numCy = Number(cy);

  let renderX = numX;
  let renderY = numY;

  if (numCx && numCy) {
    const dx = numX - numCx;
    const dy = numY - numCy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const PUSH_OFFSET = 12;
      renderX = numX + (dx / dist) * PUSH_OFFSET;
      renderY = numY + (dy / dist) * PUSH_OFFSET;
    }
  }

  // Directional shift based on position around the chart circle
  const isTop = numY < numCy - 20;
  const isBottom = numY > numCy + 20;
  const yShift = isTop ? -44 : isBottom ? 2 : -20;

  return (
    <foreignObject x={renderX - 50} y={renderY + yShift} width={100} height={64} overflow="visible">
      <div className="flex h-full flex-col items-center justify-center text-center leading-none">
        <span
          className={`flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-md ring-1 ring-inset ${
            growthColorClasses[item.color] ?? growthColorClasses.TEAL
          }`}
        >
          <GrowthIconMark icon={item.icon} className="h-3.5 w-3.5" />
        </span>
        <span className="mt-0.5 max-w-[96px] truncate text-[10px] font-semibold text-foreground">
          {item.name}
        </span>
        <span className="mt-0.5 font-mono text-[8px] text-muted-foreground">
          Lv {item.level}
        </span>
      </div>
    </foreignObject>
  );
}

/* ─── Loading state ─── */

function OverviewLoading() {
  return (
    <section
      aria-label="Loading progress overview"
      className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in duration-500"
      role="status"
    >
      <Skeleton className="w-full rounded-[20px]" style={{ height: '380px', background: '#E2E6E1' }} />
      <Skeleton className="w-full rounded-[20px]" style={{ height: '380px', background: '#E2E6E1' }} />
    </section>
  );
}
