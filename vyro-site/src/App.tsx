import { lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { SiteShell } from './components/site/SiteShell';
import { HomePage } from './pages/HomePage';
import { TryOnPage } from './pages/TryOnPage';
import { ChallengePage } from './pages/ChallengePage';
import { PlatformPage } from './pages/PlatformPage';
import { ExperiencePage } from './pages/ExperiencePage';
import { IntegratePage } from './pages/IntegratePage';
import { PricingPage } from './pages/PricingPage';
import { EmbedTryOnPage } from './pages/EmbedTryOnPage';

// Client portal + admin dashboard: loaded only when someone opens them.
const SaasApp = lazy(() => import('./saas/SaasApp'));
const SAAS_PATHS = /^\/(login|register|portal|admin)(\/|$)/;

function AppRoutes() {
  const { pathname } = useLocation();
  if (SAAS_PATHS.test(pathname)) {
    return (
      <Suspense fallback={null}>
        <SaasApp />
      </Suspense>
    );
  }
  return <SiteRoutes />;
}

function SiteRoutes() {
  return (
    <Routes>
      <Route path="embed" element={<EmbedTryOnPage />} />
      <Route element={<SiteShell />}>
        <Route index element={<HomePage />} />
        <Route path="try-on" element={<TryOnPage />} />
        <Route path="demo" element={<Navigate to="/try-on" replace />} />
        <Route path="challenge" element={<ChallengePage />} />
        <Route path="platform" element={<PlatformPage />} />
        <Route path="experience" element={<ExperiencePage />} />
        <Route path="integrate" element={<IntegratePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
