import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuthStore } from "./store/authStore";
import { api } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Products from "./pages/Products";
import Materials from "./pages/Materials";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import InvoiceNew from "./pages/InvoiceNew";
import Quotes from "./pages/Quotes";
import QuoteForm from "./pages/QuoteForm";
import DeliveryNotes from "./pages/DeliveryNotes";
import DeliveryNoteNew from "./pages/DeliveryNoteNew";
import OrderConfirmations from "./pages/OrderConfirmations";
import OrderConfirmationNew from "./pages/OrderConfirmationNew";
import Finance from "./pages/Finance";
import AuditLog from "./pages/AuditLog";
import Settings from "./pages/Settings";

function RequireAuth({ children }: { children: JSX.Element }) {
  const status = useAuthStore((s) => s.status);
  if (status !== "authenticated") return <Navigate to="/login" replace />;
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
        <Route path="/invoices/new" element={<InvoiceNew />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/edit" element={<InvoiceNew />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/quotes/new" element={<QuoteForm />} />
        <Route path="/quotes/:id/edit" element={<QuoteForm />} />
        <Route path="/delivery-notes" element={<DeliveryNotes />} />
        <Route path="/delivery-notes/new" element={<DeliveryNoteNew />} />
        <Route path="/order-confirmations" element={<OrderConfirmations />} />
        <Route path="/order-confirmations/new" element={<OrderConfirmationNew />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
