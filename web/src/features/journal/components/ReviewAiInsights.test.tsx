import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReviewAiInsights } from './ReviewAiInsights';

describe('ReviewAiInsights', () => {
  it('shows queued work instead of looking idle', () => {
    const markup = renderToStaticMarkup(<ReviewAiInsights job={{ id: 'job-1', status: 'QUEUED' }} />);

    expect(markup).toContain('AI insights queued');
    expect(markup).toContain('Waiting for the review worker to start.');
    expect(markup).toContain('aria-busy="true"');
  });

  it('renders a completed result', () => {
    const markup = renderToStaticMarkup(
      <ReviewAiInsights
        job={{ id: 'job-1', status: 'COMPLETED' }}
        result={{
          version: 1,
          headline: 'A focused day',
          summary: 'Your focus and task completion moved together.',
          insights: [],
          attentionNext: [],
        }}
      />,
    );

    expect(markup).toContain('AI Insights');
    expect(markup).toContain('A focused day');
    expect(markup).toContain('Your focus and task completion moved together.');
  });
});
