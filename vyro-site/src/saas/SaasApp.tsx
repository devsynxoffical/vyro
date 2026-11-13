import { Navigate, Route, Routes } from 'react-router-dom';
import { configured } from './api';
import { AuthProvider, RequireRole } from './auth';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { BillingReturn, Portal } from './pages/Portal';
import { AdminHome, AdminNewClient } from './pages/AdminHome';
import { AdminClient } from './pages/AdminClient';
import { AdminSettings } from './pages/AdminSettings';
import './saas.css';

/** Client portal and admin dashboard. Loaded on demand, separate from the marketing site. */
export default function SaasApp() {
  if (!configured) {
    return (
      <div className="sa sa-center">
        The dashboard is not connected yet: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see platform/README.md).
      </div>
    );
  }
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="portal" element={<RequireRole role="client"><Portal /></RequireRole>} />
        <Route path="portal/billing" element={<Navigate to="/portal" replace />} />
        <Route path="portal/billing/return" element={<RequireRole role="client"><BillingReturn /></RequireRole>} />
        <Route path="admin" element={<RequireRole role="admin"><AdminHome /></RequireRole>} />
        <Route path="admin/new" element={<RequireRole role="admin"><AdminNewClient /></RequireRole>} />
        <Route path="admin/clients/:id" element={<RequireRole role="admin"><AdminClient /></RequireRole>} />
        <Route path="admin/settings" element={<RequireRole role="admin"><AdminSettings /></RequireRole>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
