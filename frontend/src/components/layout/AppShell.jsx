import { Outlet, useLocation } from 'react-router-dom';
import { CommandNav } from './CommandNav';

export function AppShell() {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <CommandNav />
      <div className="app-main-column">
        <main className="app-content">
          <div
            key={pathname}
            className="page-enter"
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
