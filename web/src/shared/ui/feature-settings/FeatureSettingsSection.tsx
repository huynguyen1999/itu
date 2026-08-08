import type { ReactNode } from 'react';

export function FeatureSettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="select-none text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
