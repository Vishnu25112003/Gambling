import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SolanaProvider } from './providers/SolanaProvider';
import { AuthProvider } from './providers/AuthProvider';
import { Layout } from './components/shared/Layout';
import { Landing } from './pages/Landing';
import {
  DashboardHome,
  DashboardHistory,
  DashboardLeaderboard,
  DashboardProfile,
  DashboardWallet,
} from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

/**
 * Doc 06's two layers: a public landing page and a dashboard you can enter
 * freely. Note that NO route is guarded here — gating happens per-section
 * inside the dashboard, which is exactly what the doc specifies.
 */
export default function App() {
  return (
    <BrowserRouter>
      <SolanaProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/dashboard" element={<DashboardHome />} />
              <Route path="/dashboard/leaderboard" element={<DashboardLeaderboard />} />
              <Route path="/dashboard/wallet" element={<DashboardWallet />} />
              <Route path="/dashboard/history" element={<DashboardHistory />} />
              <Route path="/dashboard/profile" element={<DashboardProfile />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </SolanaProvider>
    </BrowserRouter>
  );
}
