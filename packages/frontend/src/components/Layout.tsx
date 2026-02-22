import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useLiveFeed } from '../api/hooks/useLiveFeed';

interface ToastMessage {
  title: string;
  body:  string;
  level: 'info' | 'danger';
}

export default function Layout() {
  const { connected, lastSmartEvent, lastBenchmarkDone } = useLiveFeed();
  const navigate = useNavigate();

  const [toast, setToast]   = useState<ToastMessage | null>(null);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: ToastMessage, durationMs: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(msg);
    timerRef.current = setTimeout(() => setToast(null), durationMs);
  }

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
      { title: 'Drive Health Alert', body: `Drive ${lastSmartEvent.driveId} health FAILED`, level: 'danger' },
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
                { to: '/',             label: 'Dashboard', end: true },
                { to: '/smart',        label: 'SMART History' },
                { to: '/schedules',    label: 'Schedules' },
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
      {toast && (
        <div className={`fixed top-16 right-4 z-50 max-w-xs bg-surface-100 rounded-lg px-4 py-3
                         text-sm shadow-lg border flex items-start gap-3 animate-fade-in
                         ${toast.level === 'danger' ? 'border-danger/50' : 'border-accent/40'}`}>
          <div className="flex-1">
            <p className={`font-medium ${toast.level === 'danger' ? 'text-danger' : 'text-accent'}`}>
              {toast.title}
            </p>
            <p className="text-gray-400 mt-0.5">{toast.body}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-gray-600 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
      )}

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
