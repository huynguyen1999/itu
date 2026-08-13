import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReviewAiInsights } from './ReviewAiInsights';

describe('ReviewAiInsights', () => {
  it('shows pending work instead of looking idle', () => {
    const markup = renderToStaticMarkup(<ReviewAiInsights isPending />);

    expect(markup).toContain('Generating AI insights');
    expect(markup).toContain('Analyzing your saved activity and reflections.');
    expect(markup).toContain('aria-busy="true"');
  });

  it('renders a completed result', () => {
    const markup = renderToStaticMarkup(
      <ReviewAiInsights
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
