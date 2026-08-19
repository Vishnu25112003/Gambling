import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SolanaProvider } from './providers/SolanaProvider';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { DashboardShell } from './components/dashboard/DashboardShell';
import { Landing } from './pages/Landing';
import { Overview } from './pages/dashboard/Overview';
import { Games } from './pages/dashboard/Games';
import { Leaderboard } from './pages/dashboard/Leaderboard';
import { Escrow } from './pages/dashboard/Escrow';
import { Transactions } from './pages/dashboard/Transactions';
import { Settings } from './pages/dashboard/Settings';
import { Profile } from './pages/dashboard/Profile';
import { PublicProfile } from './pages/dashboard/PublicProfile';
import { InviteEarn } from './pages/dashboard/InviteEarn';
import { Placeholder } from './pages/dashboard/Placeholder';
import { NotFound } from './pages/NotFound';

/**
 * Doc 06's two layers: a public landing page and a dashboard you can enter
 * freely. Note that NO route is guarded here — gating happens per-section
 * inside the dashboard, which is exactly what the doc specifies.
 *
 * The dashboard's ten sections are the design's sidebar. The four with no
 * backend behind them yet render the shared placeholder rather than being
 * hidden, so the navigation matches the design at every stage.
 */
export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SolanaProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Landing />} />

              <Route path="/dashboard" element={<DashboardShell />}>
                <Route index element={<Overview />} />
                <Route path="games" element={<Games />} />
                <Route path="bets" element={<Placeholder navKey="mybets" />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="escrow" element={<Escrow />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                <Route path="rewards" element={<Placeholder navKey="rewards" />} />
                {/* Doc 09. The path stays `affiliates` so existing links hold. */}
                <Route path="affiliates" element={<InviteEarn />} />
                <Route path="invite" element={<Navigate to="/dashboard/affiliates" replace />} />
                <Route path="settings" element={<Settings />} />
                <Route path="support" element={<Placeholder navKey="support" />} />

                {/* Doc 11 — own profile, and anyone's by handle. */}
                <Route path="profile" element={<Profile />} />
                <Route path="u/:handle" element={<PublicProfile />} />

                {/* The pre-redesign paths, kept alive so old links still land. */}
                <Route path="wallet" element={<Navigate to="/dashboard/escrow" replace />} />
                <Route
                  path="history"
                  element={<Navigate to="/dashboard/transactions" replace />}
                />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </SolanaProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
