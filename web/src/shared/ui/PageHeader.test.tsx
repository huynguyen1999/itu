import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the shared row, title, description, and actions structure', () => {
    const markup = renderToStaticMarkup(
      <PageHeader
        kicker="Learning workspace"
        title="Overview"
        description="Choose what to do next."
      >
        <button type="button" aria-label="Open settings">
          Settings
        </button>
      </PageHeader>,
    );

    expect(markup).toContain('itu-page-header-sticky__row');
    expect(markup).toContain('sm:flex-row');
    expect(markup).toContain('sm:justify-between');
    expect(markup).toContain('itu-page-header-sticky__content');
    expect(markup).toContain('itu-page-header-sticky__kicker');
    expect(markup).toContain('itu-page-header-sticky__title');
    expect(markup).toContain('itu-page-header-sticky__description');
    expect(markup).toContain('itu-page-header-sticky__actions');
    expect(markup).toContain('aria-label="Open settings"');
  });

  it('keeps attached controls in the sticky header surface', () => {
    const markup = renderToStaticMarkup(
      <PageHeader title="Statistics" stickyControls={<button type="button">7 days</button>} />,
    );

    expect(markup).toContain('itu-page-header-sticky');
    expect(markup).toContain('itu-page-header-sticky__controls');
    expect(markup.indexOf('itu-page-header-sticky__controls')).toBeGreaterThan(markup.indexOf('<header'));
    expect(markup).toContain('>7 days</button>');
  });

  it('supports a title-only header', () => {
    const markup = renderToStaticMarkup(<PageHeader title="Trash" />);

    expect(markup).toContain('itu-page-header-sticky__title');
    expect(markup).not.toContain('itu-page-header-sticky__kicker');
    expect(markup).not.toContain('itu-page-header-sticky__description');
    expect(markup).not.toContain('itu-page-header-sticky__actions');
  });
});
