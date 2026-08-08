import type { ReactNode } from 'react';

export function FeatureSettingsPopover({
  title,
  icon,
  children,
  footer,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex w-[360px] max-w-[400px] max-h-[min(560px,70vh)] flex-col overflow-hidden rounded-[var(--itu-radius-l)] border bg-card text-card-foreground shadow-[var(--itu-shadow-pop)]">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        {icon}
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {footer && <div className="border-t border-border/60 p-3">{footer}</div>}
    </div>
  );
}
