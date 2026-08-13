import {
  Calendar,
  CalendarDays,
  Compass,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Search,
} from 'lucide-react';
import { PointerEvent as ReactPointerEvent, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

interface JournalSidebarProps {
  onPointerDownResizer: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

const trackNavigation = [
  { to: '/journal', label: 'Overview', icon: Compass, end: true },
  { to: '/journal/daily', label: 'Daily Notes', icon: Calendar, end: false },
  { to: '/journal/reviews/daily', label: 'Daily Reviews', icon: Sparkles, end: false },
  { to: '/journal/weekly', label: 'Weekly Reviews', icon: CalendarDays, end: false },
] as const;

const libraryNavigation = [
  { to: '/journal/notes', label: 'All Notes', icon: FileText, end: false },
  { to: '/journal/templates', label: 'Templates', icon: FileSpreadsheet, end: false },
] as const;

export function JournalSidebar({ onPointerDownResizer }: JournalSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/journal/notes?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <aside className="itu-journal-sidebar" aria-label="Journal navigation">
      <header>
        <p>Workspace</p>
        <h2>Journal</h2>
      </header>

      <div className="p-3 border-b border-border/40">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Journal Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </form>
      </div>

      <nav>
        <div className="nav-section-title">TRACK</div>
        {trackNavigation.map(({ icon: Icon, ...item }) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `itu-journal-nav-link ${isActive ? 'is-active' : ''}`}
          >
            <Icon />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="nav-section-title mt-4">LIBRARY</div>
        {libraryNavigation.map(({ icon: Icon, ...item }) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `itu-journal-nav-link ${isActive ? 'is-active' : ''}`}
          >
            <Icon />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <button
        className="itu-pane-resizer"
        aria-label="Resize Journal navigation"
        title="Drag to resize Journal navigation"
        onPointerDown={onPointerDownResizer}
      />
    </aside>
  );
}
