import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Globe2, Link2, LockKeyhole, Search } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { WebsiteUsageSummary } from '@/shared/api/usageApi';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import type { WebsitePrivacyFilter } from './statistics';
import {
  filterWebsiteSessions,
  formatActiveDuration,
  formatSessionTime,
  formatWebsitePath,
  websiteDomains,
  websiteUrls,
} from './statistics';
import { ChartEmptyState, QueryError } from './StatisticsSectionStates';

export function WebsiteUsageSection({
  isLoading,
  isError,
  onRetry,
  summary,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  summary?: WebsiteUsageSummary;
}) {
  const [filter, setFilter] = useState<WebsitePrivacyFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedHostname, setSelectedHostname] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [showAllDomains, setShowAllDomains] = useState(false);
  const privacySessions = useMemo(() => filterWebsiteSessions(summary?.sessions ?? [], filter), [summary, filter]);
  const domains = useMemo(() => websiteDomains(summary, privacySessions, search), [summary, privacySessions, search]);
  const visibleDomains = showAllDomains ? domains : domains.slice(0, 5);
  const filteredTotalActiveSeconds = domains.reduce((total, domain) => total + domain.activeSeconds, 0);
  const selectedDomain = selectedHostname && domains.some((domain) => domain.hostname === selectedHostname)
    ? selectedHostname
    : null;
  const urls = useMemo(
    () => websiteUrls(summary, privacySessions, selectedDomain, search),
    [summary, privacySessions, selectedDomain, search],
  );
  const selectedDetail = selectedUrl ? urls.find((url) => url.url === selectedUrl) ?? null : null;
  const sessions = useMemo(
    () =>
      privacySessions.filter(
        (session) => session.hostname === selectedDomain && session.url === selectedDetail?.url,
      ),
    [privacySessions, selectedDetail?.url, selectedDomain],
  );

  function selectDomain(hostname: string) {
    if (hostname === 'Other') return;
    if (!showAllDomains && !visibleDomains.some((domain) => domain.hostname === hostname)) setShowAllDomains(true);
    setSelectedHostname((current) => (current === hostname ? null : hostname));
    setSelectedUrl(null);
  }

  function changeFilter(next: WebsitePrivacyFilter) {
    setFilter(next);
    setSelectedHostname(null);
    setSelectedUrl(null);
    setShowAllDomains(false);
  }

  return (
    <section aria-labelledby="website-usage-heading" aria-busy={isLoading}>
      <div className="mb-3">
        <h2 id="website-usage-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Globe2 className="h-5 w-5 text-primary" aria-hidden="true" />
          Website activity
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Domain totals with URL-level detail from the active tab in your focused browser window.
        </p>
      </div>
      {isLoading ? (
        <Card role="status" aria-live="polite">
          <span className="sr-only">Loading website activity.</span>
          <CardContent className="p-5">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : isError ? (
        <QueryError message="Website activity could not be loaded." onRetry={onRetry} />
      ) : (
        <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
          <CardHeader className="flex-col gap-4 border-b bg-muted/20 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">Website time by domain</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Select a domain, URL, then a visit for exact timing.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-48">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, domain, URL"
                  aria-label="Search website activity"
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <div className="inline-flex rounded-lg border bg-card p-1" aria-label="Website privacy filter">
                {(['all', 'normal', 'private'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`min-h-8 rounded-md px-2.5 text-xs font-medium capitalize transition-colors ${
                      filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    }`}
                    aria-pressed={filter === value}
                    onClick={() => changeFilter(value)}
                  >
                    {value === 'all' ? 'All' : value === 'normal' ? 'Normal' : 'Private'}
                  </button>
                ))}
              </div>
              <p className="shrink-0 font-mono text-xl font-bold tracking-[-0.03em]">
                {formatActiveDuration(privacySessions.reduce((total, session) => total + session.activeSeconds, 0))}
              </p>
            </div>
          </CardHeader>
          {!summary || filteredTotalActiveSeconds <= 0 || domains.length === 0 ? (
            <CardContent className="p-5">
              <ChartEmptyState
                message={
                  filter !== 'all' || search.trim() !== ''
                    ? 'No website activity matches the selected filter.'
                    : 'No synced website activity in this period.'
                }
              />
            </CardContent>
          ) : (
            <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
            <div className="h-64 min-w-0" aria-label="Website activity by domain">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={domains}
                    dataKey="activeSeconds"
                    nameKey="hostname"
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="var(--itu-surface)"
                    strokeWidth={2}
                    onClick={(entry) => selectDomain(String(entry.payload?.hostname ?? ''))}
                  >
                    {domains.map((domain, index) => (
                      <Cell key={domain.hostname} fill={websiteColors[index % websiteColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, item) => {
                      const percent =
                        filteredTotalActiveSeconds > 0
                          ? Math.round((Number(value) / filteredTotalActiveSeconds) * 100)
                          : 0;
                      return [
                        `${percent}% · ${formatActiveDuration(Number(value))}`,
                        String(name ?? item?.payload?.hostname ?? ''),
                      ];
                    }}
                  />
                  <text
                    x="50%"
                    y="47%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-foreground font-mono text-lg font-bold"
                  >
                    {formatActiveDuration(filteredTotalActiveSeconds)}
                  </text>
                  <text
                    x="50%"
                    y="59%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-muted-foreground text-[11px]"
                  >
                    active time
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 space-y-2" aria-label="Website domains">
              {visibleDomains.map((domain, index) => {
                const selected = selectedDomain === domain.hostname;
                const percent = Math.round((domain.activeSeconds / filteredTotalActiveSeconds) * 100);
                return (
                  <button
                    key={domain.hostname}
                    type="button"
                    className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--itu-radius-s)] px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected ? 'bg-primary/10' : 'hover:bg-muted/40'
                    } ${domain.hostname === 'Other' ? 'cursor-default' : ''}`}
                    onClick={() => selectDomain(domain.hostname)}
                        aria-pressed={selected}
                    aria-label={
                      domain.hostname === 'Other' ? 'Other domains, not drillable' : `Inspect ${domain.hostname}`
                    }
                    disabled={domain.hostname === 'Other'}
                  >
                    <WebsiteFavicon src={domain.iconUrl} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={domain.hostname}>
                      {domain.hostname}
                    </span>
                    <span className="shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {percent}% · {formatActiveDuration(domain.activeSeconds)}
                    </span>
                  </button>
                );
              })}
              {domains.length > 5 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  aria-expanded={showAllDomains}
                  onClick={() => setShowAllDomains((current) => !current)}
                >
                  {showAllDomains ? 'Show less' : `See more (${domains.length - 5})`}
                </Button>
              ) : null}
            </div>
            {selectedDomain ? (
              <div className="border-t border-[var(--itu-border-soft)] pt-4 lg:col-span-2" aria-live="polite">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate" title={selectedDomain}>
                      {selectedDomain}
                    </span>
                  </h3>
                  {urls.length > 0 ? (
                    <span className="text-xs text-muted-foreground">{urls.length} URLs</span>
                  ) : null}
                </div>
                {urls.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No URL detail matches this filter or search.</p>
                ) : (
                  <div className="divide-y divide-[var(--itu-border-soft)] rounded-[var(--itu-radius-s)] border border-[var(--itu-border-soft)] bg-[var(--itu-surface-2)] px-3">
                    {urls.map((item) => (
                      <button
                        key={`${item.url}-${item.isPrivate ? 'private' : 'normal'}`}
                        type="button"
                        className={`flex w-full items-start gap-3 py-2.5 text-left ${selectedUrl === item.url ? 'text-primary' : ''}`}
                        onClick={() => setSelectedUrl((current) => (current === item.url ? null : item.url))}
                        aria-pressed={selectedUrl === item.url}
                      >
                        <WebsiteFavicon src={item.iconUrl} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-xs font-semibold" title={item.latestTitle ?? item.url}>
                              {item.latestTitle?.trim() || formatWebsitePath(item.url)}
                            </span>
                            {item.isPrivate ? <PrivateMarker /> : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={item.url}>
                            {formatWebsitePath(item.url)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                          <span className="block">{formatActiveDuration(item.activeSeconds)}</span>
                          <span className="block text-[10px] font-normal">{item.visitCount} visits</span>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
                {selectedDetail ? (
                  <div className="mt-4 rounded-[var(--itu-radius-s)] border border-[var(--itu-border-soft)] bg-[var(--itu-surface-2)] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <WebsiteFavicon src={selectedDetail.iconUrl} />
                        <h4 className="truncate text-xs font-semibold" title={selectedDetail.url}>
                          {selectedDetail.latestTitle?.trim() || formatWebsitePath(selectedDetail.url)}
                        </h4>
                        {selectedDetail.isPrivate ? <PrivateMarker /> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatActiveDuration(selectedDetail.activeSeconds)} · {sessions.length} visits
                      </span>
                    </div>
                    {sessions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No visit session detail is available for this URL.</p>
                    ) : (
                      <div className="divide-y divide-[var(--itu-border-soft)]">
                        {sessions.map((session) => (
                          <div key={session.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                            <span className="font-mono tabular-nums">{formatSessionTime(session.startedAt, session.timezone)}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-mono tabular-nums">{formatSessionTime(session.endedAt, session.timezone)}</span>
                            <span className="ml-auto font-mono font-semibold tabular-nums">
                              {formatActiveDuration(session.activeSeconds)}
                            </span>
                            {session.isPrivate ? <PrivateMarker /> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
          )}
        </Card>
      )}
    </section>
  );
}


const websiteColors = [
  'var(--itu-teal-600)',
  'var(--itu-sync-blue, #4f8fcf)',
  'var(--itu-amber-500)',
  'var(--itu-teal-400)',
  'var(--itu-coral-500)',
  'var(--itu-glow-gold, #ad8a3d)',
  'var(--itu-violet-item, #8b6fc9)',
  'var(--itu-ink-faint)',
];


function WebsiteFavicon({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  const safeSrc = websiteIconSource(src);

  useEffect(() => setFailed(false), [safeSrc]);

  if (!safeSrc || failed) {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] bg-muted text-muted-foreground" aria-hidden="true">
        <Globe2 className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <img
      src={safeSrc}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-5 w-5 shrink-0 rounded-[4px] object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function websiteIconSource(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function PrivateMarker() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <LockKeyhole className="h-3 w-3" aria-hidden="true" />
      Private
    </span>
  );
}
