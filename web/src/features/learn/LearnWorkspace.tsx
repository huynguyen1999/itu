import { History, LibraryBig, PlayCircle } from 'lucide-react';
import { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useStoredNumber } from '@/shared/hooks/useStoredNumber';

const navigation = [
  { to: '/learn/decks', label: 'Decks & cards', icon: LibraryBig, end: false },
  { to: '/learn/review', label: 'Review', icon: PlayCircle, end: false },
  { to: '/learn/history', label: 'Learning history', icon: History, end: false },
] as const;

export function LearnWorkspace() {
  const [width, setWidth] = useStoredNumber('itu.learn.sidebar-width', 240);

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const resize = (pointerEvent: PointerEvent) =>
      setWidth(Math.min(360, Math.max(176, startWidth + pointerEvent.clientX - startX)));
    const finish = () => {
      document.body.classList.remove('itu-is-resizing');
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', finish);
    };
    document.body.classList.add('itu-is-resizing');
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', finish, { once: true });
  }

  return (
    <div className="itu-learn-workspace" style={{ '--itu-learn-sidebar-width': `${width}px` } as CSSProperties}>
      <aside className="itu-learn-sidebar" aria-label="Learn navigation">
        <header>
          <p>Library</p>
          <h2>Learn</h2>
        </header>
        <nav>
          {navigation.map(({ icon: Icon, ...item }) => (
            <NavLink
              key={item.to}
              {...item}
              className={({ isActive }) => `itu-learn-nav-link ${isActive ? 'is-active' : ''}`}
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          className="itu-pane-resizer"
          aria-label="Resize Learn navigation"
          title="Drag to resize Learn navigation"
          onPointerDown={beginResize}
        />
      </aside>
      <section className="itu-learn-content">
        <div className="itu-learn-content__inner">
          <Outlet />
        </div>
      </section>
    </div>
  );
}
