import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('keeps attached controls in the sticky header surface', () => {
    const markup = renderToStaticMarkup(
      <PageHeader title="Statistics" stickyControls={<button type="button">7 days</button>} />,
    );

    expect(markup).toContain('itu-page-header-sticky');
    expect(markup).toContain('itu-page-header-sticky__controls');
    expect(markup.indexOf('itu-page-header-sticky__controls')).toBeGreaterThan(markup.indexOf('<header'));
    expect(markup).toContain('>7 days</button>');
  });
});
