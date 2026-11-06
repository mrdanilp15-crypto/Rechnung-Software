import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuthStore } from "./store/authStore";
import { api } from "./api/client";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Products from "./pages/Products";
import Materials from "./pages/Materials";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import DocumentEditor from "./pages/DocumentEditor";
import Documents from "./pages/Documents";
import Catalog from "./pages/Catalog";
import RecurringPage from "./pages/Recurring";
import Finance from "./pages/Finance";
import Archive from "./pages/Archive";
import Production from "./pages/Production";
import TimeTracking from "./pages/TimeTracking";
import OrderDetail from "./pages/OrderDetail";
import Statistics from "./pages/Statistics";
import ScanItem from "./pages/ScanItem";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";
import QuoteDetail from "./pages/QuoteDetail";
import Help from "./pages/Help";
import DeliveryNoteDetail from "./pages/DeliveryNoteDetail";

function RequireAuth({ children }: { children: JSX.Element }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  // Die gewünschte Seite merken (z.B. nach dem Scannen eines QR-Codes), damit es nach der Anmeldung dorthin zurückgeht
  if (status !== "authenticated") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

export default function App() {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const clearSession = useAuthStore((s) => s.clearSession);

  // Die Tokens liegen als httpOnly-Cookies vor (siehe api/client.ts) - das Frontend
  // kann selbst nicht direkt feststellen, ob eine gültige Sitzung besteht, und fragt
  // deshalb einmal beim Laden der App nach (Cookie wird automatisch mitgeschickt).
  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => clearSession());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "checking") {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Lädt...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/products" element={<Products />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/invoices/new" element={<DocumentEditor kind="invoice" />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/edit" element={<DocumentEditor kind="invoice" />} />
        <Route path="/quotes" element={<Navigate to="/documents?type=QUOTE" replace />} />
        <Route path="/quotes/new" element={<DocumentEditor kind="quote" />} />
        <Route path="/quotes/:id" element={<QuoteDetail />} />
        <Route path="/quotes/:id/edit" element={<DocumentEditor kind="quote" />} />
        <Route path="/delivery-notes" element={<Navigate to="/documents?type=DELIVERY_NOTE" replace />} />
        <Route path="/delivery-notes/new" element={<DocumentEditor kind="deliveryNote" />} />
        <Route path="/delivery-notes/:id" element={<DeliveryNoteDetail />} />
        <Route path="/delivery-notes/:id/edit" element={<DocumentEditor kind="deliveryNote" />} />
        <Route path="/order-confirmations" element={<Navigate to="/documents?type=ORDER_CONFIRMATION" replace />} />
        <Route path="/order-confirmations/new" element={<DocumentEditor kind="confirmation" />} />
        <Route path="/order-confirmations/:id/edit" element={<DocumentEditor kind="confirmation" />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/production" element={<Production />} />
        <Route path="/time" element={<TimeTracking />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/stats" element={<Statistics />} />
        <Route path="/q/:type/:id" element={<ScanItem />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/help" element={<Help />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
