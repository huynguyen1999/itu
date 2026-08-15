import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, CircleAlert, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import type { StatisticsDomainKey } from './StatisticsSettingsPopover';

export interface StatisticsDomainCardModel {
  key: StatisticsDomainKey;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  state: 'loading' | 'error' | 'ready';
  metrics: Array<{ label: string; value: string; comparison?: string }>;
  onRetry?: () => void;
}

export function StatisticsDomainCards({ cards }: { cards: StatisticsDomainCardModel[] }) {
  return (
    <section aria-labelledby="domain-summary-heading">
      <div className="mb-3">
        <h2 id="domain-summary-heading" className="text-lg font-semibold">
          Domain summaries
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Independent snapshots from each area of iTu.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="shadow-[var(--shadow-soft)]">
              <CardHeader className="flex-row items-start justify-between gap-3 border-b bg-muted/20 p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <CardTitle className="truncate text-sm">{card.title}</CardTitle>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{card.description}</p>
                  </div>
                </div>
                <Link
                  to={card.href}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Details <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </CardHeader>
              <CardContent className="p-4">
                {card.state === 'loading' ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading
                  </div>
                ) : card.state === 'error' ? (
                  <button type="button" onClick={card.onRetry} className="flex items-center gap-2 text-xs text-destructive hover:underline">
                    <CircleAlert className="h-4 w-4" aria-hidden="true" /> Could not load; retry
                  </button>
                ) : (
                  <dl className="grid grid-cols-2 gap-3">
                    {card.metrics.map((metric) => (
                      <div key={metric.label}>
                        <dt className="text-[11px] text-muted-foreground">{metric.label}</dt>
                        <dd className="mt-1 text-base font-semibold tabular-nums">{metric.value}</dd>
                        {metric.comparison ? <dd className="text-[11px] text-muted-foreground">{metric.comparison} vs previous</dd> : null}
                      </div>
                    ))}
                  </dl>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
