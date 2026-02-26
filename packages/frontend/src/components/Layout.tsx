import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLiveFeed } from '../api/hooks/useLiveFeed';
import { useToast } from '../hooks/useToast';
import { Toast } from './ui/Toast';

const NAV_LINKS = [
  { to: '/',              label: 'Dashboard',    end: true  },
  { to: '/smart',         label: 'SMART History'            },
  { to: '/schedules',     label: 'Schedules'                },
  { to: '/notifications', label: 'Notifications'            },
];

/** Speed-gauge icon only — used on xs where the full wordmark won't fit. */
function LogoIcon() {
  return (
    <svg className="sm:hidden h-8 w-auto" viewBox="0 0 48 60" fill="none" aria-hidden="true">
      <path d="M 18.2 33.4 A 6.75 6.75 0 1 1 29.8 33.4"
            stroke="#1a6968" strokeWidth="3" strokeLinecap="round"/>
      <path d="M 13.0 36.4 A 12.75 12.75 0 1 1 35.0 36.4"
            stroke="#2b908f" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M 7.8 39.4 A 18.75 18.75 0 1 1 40.2 39.4"
            stroke="#4ec3c2" strokeWidth="4.5" strokeLinecap="round"/>
      <circle cx="24" cy="30" r="3" fill="#4ec3c2"/>
    </svg>
  );
}

/** Full horizontal logo lockup — icon + wordmark + tagline. */
function LogoFull() {
  return (
    <svg className="hidden sm:block h-8 w-auto" viewBox="0 0 220 60" fill="none" aria-label="Sectorama">
      {/* Speed-gauge icon (same geometry as favicon, scaled 1.5×) */}
      <path d="M 18.2 33.4 A 6.75 6.75 0 1 1 29.8 33.4"
            stroke="#1a6968" strokeWidth="3" strokeLinecap="round"/>
      <path d="M 13.0 36.4 A 12.75 12.75 0 1 1 35.0 36.4"
            stroke="#2b908f" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M 7.8 39.4 A 18.75 18.75 0 1 1 40.2 39.4"
            stroke="#4ec3c2" strokeWidth="4.5" strokeLinecap="round"/>
      <circle cx="24" cy="30" r="3" fill="#4ec3c2"/>
      {/* Wordmark */}
      <text x="58" y="33"
            fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
            fontSize="22" fontWeight="700" fill="#ffffff" letterSpacing="-0.4">Sectorama</text>
      {/* Tagline */}
      <text x="60" y="49"
            fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
            fontSize="10" fontWeight="500" fill="#4ec3c2" letterSpacing="2.8">DISK MONITOR</text>
    </svg>
  );
}

export default function Layout() {
  const { connected, lastSmartEvent, lastBenchmarkDone } = useLiveFeed();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { toast, showToast, dismissToast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

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

            {/* Logo — icon-only on xs, full lockup on sm+ */}
            <button
              onClick={() => navigate('/')}
              className="flex-shrink-0 flex items-center"
              aria-label="Go to dashboard"
            >
              <LogoIcon />
              <LogoFull />
            </button>

            {/* Desktop nav links — hidden on mobile */}
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_LINKS.map(({ to, label, end }) => (
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

            {/* Right side: live indicator + mobile hamburger */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-brand animate-pulse' : 'bg-gray-600'}`} />
                <span className="hidden sm:block">{connected ? 'Live' : 'Offline'}</span>
              </div>

              {/* Hamburger / close — mobile only */}
              <button
                className="sm:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-200 transition-colors"
                onClick={() => setMobileOpen(o => !o)}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? (
                  /* X icon */
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                ) : (
                  /* Hamburger icon */
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile dropdown menu — renders inside the sticky header so it scrolls with it */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-surface-300 bg-surface-50">
            <nav className="max-w-screen-xl mx-auto px-4 py-2 flex flex-col gap-0.5">
              {NAV_LINKS.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-surface-200 text-white' : 'text-gray-400 hover:text-white hover:bg-surface-200'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
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
