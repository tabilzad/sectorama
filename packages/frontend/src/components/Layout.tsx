import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLiveFeed } from '../api/hooks/useLiveFeed';
import { useToast } from '../hooks/useToast';
import { showNativeNotification } from '../hooks/usePushNotifications';
import { Toast } from './ui/Toast';

const GITHUB_URL = 'https://github.com/tabilzad/sectorama';

// ── Inline SVG icons ─────────────────────────────────────────────────────────

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

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

  const [showUpdate, setShowUpdate] = useState(false);
  const { updateServiceWorker } = useRegisterSW({
    onNeedRefresh: () => setShowUpdate(true),
  });

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
      <header
        className="bg-surface-50 border-b border-surface-300 sticky top-0 z-50"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
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

            {/* Right side: GitHub link + live indicator */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-white transition-colors"
                aria-label="Sectorama on GitHub"
              >
                <GitHubIcon />
              </a>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-brand animate-pulse' : 'bg-gray-600'}`} />
                <span className="hidden sm:block">{connected ? 'Live' : 'Offline'}</span>
              </div>
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

      {/* Update banner — persists until user acts */}
      {showUpdate && (
        <div
          className="fixed inset-x-0 z-40 flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-100 border-b border-accent/40 text-sm"
          style={{ top: 'calc(3.5rem + env(safe-area-inset-top))' }}
        >
          <span className="text-gray-300">A new version is available.</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => updateServiceWorker(true)}
              className="px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors"
            >
              Reload
            </button>
            <button
              onClick={() => setShowUpdate(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>
      )}

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
            <p className="flex items-center gap-1.5">
              <a
                href={
                  __APP_VERSION__.startsWith('v')
                    ? `${GITHUB_URL}/releases/tag/${__APP_VERSION__}`
                    : `${GITHUB_URL}/commit/${__APP_VERSION__}`
                }
                className="text-accent hover:text-accent-light transition-colors font-mono text-xs"
                target="_blank"
                rel="noopener noreferrer"
              >
                {__APP_VERSION__}
              </a>
              <span>·</span>
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
