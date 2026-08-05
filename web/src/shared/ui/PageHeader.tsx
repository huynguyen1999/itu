import type { ReactNode } from 'react';

export function PageHeader({
  kicker,
  title,
  description,
  children,
  className = '',
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`flex flex-col gap-3 pb-4 border-b border-border/60 sm:flex-row sm:items-end sm:justify-between ${className}`.trim()}
    >
      <div className="min-w-0 space-y-0.5">
        {kicker && (
          <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground/70 select-none">
            {kicker}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground truncate font-display">{title}</h1>
        {description && <p className="text-xs text-muted-foreground leading-normal mt-1">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">{children}</div>}
    </header>
  );
}
