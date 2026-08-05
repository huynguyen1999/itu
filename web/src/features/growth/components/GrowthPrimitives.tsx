import { Award } from 'lucide-react';

export function HeroStat({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: typeof Award;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`growth-stat ${accent ? 'is-coin' : ''}`}>
      <Icon className={`h-5 w-5 ${accent ? 'text-amber-600' : 'text-primary'}`} />
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const percent = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  return (
    <div className="growth-progress">
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="itu-eyebrow">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}
