import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useLiveFeed } from '../api/hooks/useLiveFeed';
import { useToast } from '../hooks/useToast';
import { showNativeNotification } from '../hooks/usePushNotifications';
import { Toast } from './ui/Toast';

// ── Inline SVG nav icons ──────────────────────────────────────────────────────

function HouseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15.75A.75.75 0 0115 21v-5.25a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

// ── Nav link definitions ──────────────────────────────────────────────────────

const NAV_LINKS = [
  { to: '/',              label: 'Dashboard', end: true,  icon: <HouseIcon />   },
  { to: '/smart',         label: 'SMART',     end: false, icon: <ActivityIcon /> },
  { to: '/schedules',     label: 'Schedules', end: false, icon: <CalendarIcon /> },
  { to: '/notifications', label: 'Alerts',    end: false, icon: <BellIcon />    },
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
    <svg className="hidden sm:block h-8 w-auto" viewBox="0 0 200 50" fill="none" aria-label="Sectorama">
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
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (!lastBenchmarkDone) return;
    showToast(
      { title: 'Benchmark Complete', body: `Run #${lastBenchmarkDone.runId} finished`, level: 'info' },
      4000,
    );
    showNativeNotification('Benchmark Complete', {
      body: `Run #${lastBenchmarkDone.runId} finished`,
      tag: `benchmark-${lastBenchmarkDone.runId}`,
    });
  }, [lastBenchmarkDone]);

  useEffect(() => {
    if (lastSmartEvent?.health !== 'failed') return;
    showToast(
      { title: 'Drive Health Alert', body: `Drive ${lastSmartEvent.driveId} health FAILED`, level: 'error' },
      8000,
    );
    showNativeNotification('Drive Health Alert', {
      body: `Drive ${lastSmartEvent.driveId} health FAILED`,
      tag: `drive-health-${lastSmartEvent.driveId}`,
    });
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

            {/* Right side: live indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-brand animate-pulse' : 'bg-gray-600'}`} />
              <span className="hidden sm:block">{connected ? 'Live' : 'Offline'}</span>
            </div>

          </div>
        </div>
      </header>

      {/* Bottom nav — mobile only */}
      {/* Outer nav extends background into the safe area; inner div holds the tap targets above it */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-surface-50 border-t border-surface-300"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch h-16">
          {NAV_LINKS.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors
                 ${isActive ? 'text-white' : 'text-gray-500'}`
              }
            >
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Toast notification — auto-dismisses */}
      {toast && <Toast msg={toast} onDismiss={dismissToast} />}

      {/* ── Page content ──────────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
        {/* Spacer: clears the fixed bottom nav (4rem) + iOS safe area on mobile */}
        <div className="sm:hidden" style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }} aria-hidden="true" />
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
