import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CheckCircle2 } from 'lucide-react';
import { StatisticsDomainCards, type StatisticsDomainCardModel } from './StatisticsDomainCards';

const card = (state: StatisticsDomainCardModel['state']): StatisticsDomainCardModel => ({
  key: 'productivity',
  title: 'Productivity',
  description: 'Tasks and focus',
  href: '/plan',
  icon: CheckCircle2,
  state,
  metrics: [{ label: 'Tasks', value: '4' }],
  onRetry: vi.fn(),
});

describe('StatisticsDomainCards', () => {
  it('renders independent loading, error, and ready states with a deep link', () => {
    const render = (state: StatisticsDomainCardModel['state']) => renderToStaticMarkup(
      <MemoryRouter>
        <StatisticsDomainCards cards={[card(state)]} />
      </MemoryRouter>,
    );

    expect(render('loading')).toContain('Loading');
    expect(render('error')).toContain('Could not load; retry');
    expect(render('ready')).toContain('href="/plan"');
    expect(render('ready')).toContain('Tasks');
  });
});
