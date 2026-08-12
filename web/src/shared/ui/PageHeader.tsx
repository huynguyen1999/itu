import type { ReactNode } from 'react';

export function PageHeader({
  kicker,
  title,
  description,
  children,
  stickyControls,
  className = '',
  transparent = false,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  stickyControls?: ReactNode;
  className?: string;
  transparent?: boolean;
}) {
  return (
    <div className={`itu-page-header-sticky${transparent ? ' itu-page-header-sticky--transparent' : ''}`}>
      <header
        className={`itu-page-header-sticky__row flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`.trim()}
      >
        <div className="itu-page-header-sticky__content min-w-0 space-y-0.5">
          {kicker && (
            <p className="itu-page-header-sticky__kicker text-[11px] font-mono font-bold uppercase tracking-wider select-none">
              {kicker}
            </p>
          )}
          <h1 className="itu-page-header-sticky__title font-display">{title}</h1>
          {description && <p className="itu-page-header-sticky__description">{description}</p>}
        </div>
        {children && (
          <div className="itu-page-header-sticky__actions flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {children}
          </div>
        )}
      </header>
      {stickyControls && <div className="itu-page-header-sticky__controls">{stickyControls}</div>}
    </div>
  );
}
