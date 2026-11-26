import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from './lib/supabase';
import { travelOrderService } from './services/travelOrderService';
import type { AdminUser, AppSettings } from './types/travelOrder';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLogin } from './components/AdminLogin';
import { SetupGuide } from './components/SetupGuide';
import { TrackingPage } from './components/TrackingPage';
import { UserPortal } from './components/UserPortal';

type View = 'home' | 'track' | 'admin';

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  mayor_name: 'JOGANIE C. RARANG',
  mayor_title: 'Municipal Mayor',
  vice_mayor_name: 'ERWIN C. CATABAY',
  vice_mayor_title: 'Municipal Vice Mayor',
  mayor_next_seq: 1617,
  vice_mayor_next_seq: 1551,
};

function parseRoute(): { view: View; token: string } {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) {
    return { view: 'admin', token: '' };
  }
  if (path.startsWith('/track')) {
    const tokenFromPath = path.replace(/^\/track\/?/, '').split('/')[0] || '';
    const tokenFromQuery = new URLSearchParams(window.location.search).get('token') || '';
    return { view: 'track', token: decodeURIComponent(tokenFromPath || tokenFromQuery) };
  }
  return { view: 'home', token: '' };
}

export default function App() {
  const initialRoute = parseRoute();
  const [view, setView] = useState<View>(initialRoute.view);
  const [trackToken, setTrackToken] = useState<string>(initialRoute.token);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(isSupabaseConfigured);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      const next = parseRoute();
      setView(next.view);
      setTrackToken(next.token);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const bootstrap = async () => {
      try {
        const [loadedSettings, currentAdmin] = await Promise.all([
          travelOrderService.getSettings(),
          travelOrderService.getCurrentAdmin(),
        ]);
        setSettings(loadedSettings);
        setAdminUser(currentAdmin);
        setConnectionError(null);
      } catch (err) {
        setConnectionError(
          err instanceof Error
            ? err.message
            : 'Unable to reach Supabase database. Verify schema.sql has been executed.'
        );
      } finally {
        setCheckingAuth(false);
      }
    };

    void bootstrap();
  }, []);

  const navigate = (nextView: View, token = '') => {
    setView(nextView);
    setTrackToken(token);
    const url =
      nextView === 'admin'
        ? '/admin'
        : nextView === 'track'
          ? token
            ? `/track/${encodeURIComponent(token)}`
            : '/track'
          : '/';
    window.history.pushState({}, '', url);
  };

  return (
    <div className="app-shell">
      <header className="site-header no-print">
        <div className="header-inner">
          <button type="button" className="brand" onClick={() => navigate('home')}>
            <img
              src="/assets/seal-anda.png"
              alt="Municipality of Anda Seal"
              className="brand-logo"
            />
            <div className="brand-text">
              <span className="brand-title">Municipality of Anda, Pangasinan</span>
              <span className="brand-sub">Online Travel Order Management System</span>
            </div>
          </button>

          <nav className="site-nav" aria-label="Main navigation">
            <button
              type="button"
              className={`nav-link ${view === 'home' ? 'active' : ''}`}
              onClick={() => navigate('home')}
            >
              Apply
            </button>
            <button
              type="button"
              className={`nav-link ${view === 'track' ? 'active' : ''}`}
              onClick={() => navigate('track', trackToken)}
            >
              Track Application
            </button>
            <button
              type="button"
              className={`nav-link ${view === 'admin' ? 'active' : ''}`}
              onClick={() => navigate('admin')}
            >
              HR / Admin Portal
            </button>
          </nav>
        </div>
      </header>

      <main className="main-container">
        {!isSupabaseConfigured ? (
          <SetupGuide />
        ) : connectionError ? (
          <section className="card">
            <div className="alert alert-error">
              <strong>Database Connection Notice:</strong> {connectionError}
            </div>
            <SetupGuide />
          </section>
        ) : view === 'home' ? (
          <UserPortal
            settings={settings}
            onOpenTracking={(token) => navigate('track', token)}
          />
        ) : view === 'track' ? (
          <TrackingPage
            initialToken={trackToken}
            onBackHome={() => navigate('home')}
          />
        ) : checkingAuth ? (
          <div className="card">Checking administrator session...</div>
        ) : adminUser ? (
          <AdminDashboard
            admin={adminUser}
            settings={settings}
            onSettingsUpdated={setSettings}
            onSignedOut={() => setAdminUser(null)}
          />
        ) : (
          <AdminLogin onSuccess={setAdminUser} />
        )}
      </main>
    </div>
  );
}
