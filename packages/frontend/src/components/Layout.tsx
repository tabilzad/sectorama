import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useLiveFeed } from '../api/hooks/useLiveFeed';
import { useToast } from '../hooks/useToast';
import { Toast } from './ui/Toast';

export default function Layout() {
  const { connected, lastSmartEvent, lastBenchmarkDone } = useLiveFeed();
  const navigate = useNavigate();
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (!lastBenchmarkDone) return;
    showToast(
      { title: 'Benchmark Complete', body: `Run #${lastBenchmarkDone.runId} finished`, level: 'info' },
      4000,
    );
  }, [lastBenchmarkDone]);

  useEffect(() => {
    if (lastSmartEvent?.health !== 'failed') return;
    showToast(
      { title: 'Drive Health Alert', body: `Drive ${lastSmartEvent.driveId} health FAILED`, level: 'error' },
      8000,
    );
  }, [lastSmartEvent]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top nav ───────────────────────────────────────────────────── */}
      <header className="bg-surface-50 border-b border-surface-300 sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-3 group"
            >
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center
                              group-hover:bg-accent-light transition-colors">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 6H4v2h16V6zm-2 5H6v2h12v-2zm2 5H4v2h16v-2z"/>
                </svg>
              </div>
              <span className="font-semibold text-white text-lg tracking-tight">Sectorama</span>
              <span className="hidden sm:block text-gray-500 text-sm">Disk Monitor</span>
            </button>

            {/* Nav links */}
            <nav className="flex items-center gap-1">
              {[
                { to: '/',               label: 'Dashboard',    end: true },
                { to: '/smart',          label: 'SMART History' },
                { to: '/schedules',      label: 'Schedules' },
                { to: '/notifications',  label: 'Notifications' },
              ].map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-surface-200 text-white' : 'text-gray-400 hover:text-white hover:bg-surface-200'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Live-feed indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-brand animate-pulse' : 'bg-gray-600'}`} />
              <span className="hidden sm:block">{connected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Toast notification — auto-dismisses */}
      {toast && <Toast msg={toast} onDismiss={dismissToast} />}

      {/* ── Page content ──────────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-300 mt-16">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <p>Sectorama — Local Disk Monitor</p>
            <p>
              Released under the{' '}
              <a
                href="https://www.gnu.org/licenses/gpl-3.0.html"
                className="text-accent hover:text-accent-light transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                GPLv3
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
