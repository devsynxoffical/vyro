import { Navigate, Route, Routes } from 'react-router-dom';
import './styles/tokens.css';
import './styles/console.css';
import { AuthProvider, RequireRole } from './auth';
import { FeedbackProvider } from './ui';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { InvoicePage } from './pages/InvoicePage';
import { PortalLayout } from './pages/portal/PortalLayout';
import { BillingReturn, PortalBilling, PortalCompany, PortalOverview, PortalProducts } from './pages/portal/PortalPages';
import { AdminClients, AdminInvoices, AdminLayout, AdminNewClient, AdminOverview } from './pages/admin/AdminPages';
import { AdminClient } from './pages/admin/AdminClient';
import { AdminSettings } from './pages/admin/AdminSettings';

/** Client portal and admin console. Loaded on demand, separate from the marketing site. */
export default function SaasApp() {
  return (
    <AuthProvider>
      <FeedbackProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />

          <Route path="portal/billing/return" element={<RequireRole role="client"><BillingReturn /></RequireRole>} />
          <Route path="portal" element={<RequireRole role="client"><PortalLayout /></RequireRole>}>
            <Route index element={<PortalOverview />} />
            <Route path="billing" element={<PortalBilling />} />
            <Route path="products" element={<PortalProducts />} />
            <Route path="company" element={<PortalCompany />} />
            <Route path="invoices/:id" element={<InvoicePage />} />
          </Route>

          <Route path="admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
            <Route index element={<AdminOverview />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="clients/new" element={<AdminNewClient />} />
            <Route path="clients/:id" element={<AdminClient />} />
            <Route path="invoices" element={<AdminInvoices />} />
            <Route path="invoices/:id" element={<InvoicePage />} />
            <Route path="settings" element={<AdminSettings />} />
            {/* old address */}
            <Route path="new" element={<Navigate to="/admin/clients/new" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </FeedbackProvider>
    </AuthProvider>
  );
}
