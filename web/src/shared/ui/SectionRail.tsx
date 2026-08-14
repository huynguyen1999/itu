import type { ComponentType, CSSProperties, FormEventHandler, InputHTMLAttributes, ReactNode } from 'react';
import { NavLink, type NavLinkProps } from 'react-router-dom';
import { Plus } from 'lucide-react';

type RailIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

export function SectionRail({
  kicker,
  title,
  ariaLabel,
  children,
  className = '',
}: {
  kicker: string;
  title: string;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={`itu-section-rail ${className}`.trim()} aria-label={ariaLabel}>
      <div className="itu-section-rail__header">
        <span className="itu-section-rail__kicker">{kicker}</span>
        <h2 className="itu-section-rail__title">{title}</h2>
      </div>
      {children}
    </aside>
  );
}

export function SectionRailNav({ children, ariaLabel }: { children: ReactNode; ariaLabel?: string }) {
  return (
    <nav className="itu-section-rail__nav" aria-label={ariaLabel}>
      {children}
    </nav>
  );
}

export function SectionRailLink({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: NavLinkProps['to'];
  end?: boolean;
  icon: RailIcon;
  label: string;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `itu-section-rail__link${isActive ? ' is-active' : ''}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

export function SectionRailSections({ children }: { children: ReactNode }) {
  return <div className="itu-section-rail__sections">{children}</div>;
}

export function SectionRailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="itu-section-rail__section">
      <h2 className="itu-section-rail__section-title">{title}</h2>
      <div className="itu-section-rail__items">{children}</div>
    </section>
  );
}

export function SectionRailButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`itu-section-rail__item${active ? ' is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function SectionRailDot({ color }: { color: string }) {
  return <span className="itu-section-rail__dot" style={{ background: color }} />;
}

export function SectionRailLabel({ children }: { children: ReactNode }) {
  return <span className="itu-section-rail__item-label">{children}</span>;
}

function SectionRailBadge({ children }: { children: ReactNode }) {
  return <span className="itu-section-rail__item-count">{children}</span>;
}

export function SectionRailCreator({
  value,
  placeholder,
  onChange,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  onChange: InputHTMLAttributes<HTMLInputElement>['onChange'];
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form className="itu-section-rail__creator" onSubmit={onSubmit}>
      <Plus className="h-3.5 w-3.5" />
      <input placeholder={placeholder} value={value} onChange={onChange} />
    </form>
  );
}
