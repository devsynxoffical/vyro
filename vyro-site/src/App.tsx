import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SiteShell } from './components/site/SiteShell';
import { HomePage } from './pages/HomePage';
import { TryOnPage } from './pages/TryOnPage';
import { ChallengePage } from './pages/ChallengePage';
import { PlatformPage } from './pages/PlatformPage';
import { ExperiencePage } from './pages/ExperiencePage';
import { IntegratePage } from './pages/IntegratePage';
import { PricingPage } from './pages/PricingPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
    </BrowserRouter>
  );
}
