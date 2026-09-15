import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { LineItem, PricedItemsEditor, TotalsSummary, createEmptyLineItem } from "../components/PricedItemsEditor";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";

interface Customer {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  unitPriceCents: number;
  vatRateBps: number;
  unit: string;
}

export default function OrderConfirmationNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [items, setItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const { status, run } = useSaveStatus();

  useEffect(() => {
    api.get("/customers").then((res) => setCustomers(res.data));
    api.get("/products").then((res) => setProducts(res.data));
  }, []);

  async function handleSubmit() {
    setError(null);
    if (!customerId) return setError("Bitte einen Kunden auswählen.");
    try {
      await run(() => api.post("/order-confirmations", { customerId, expectedDeliveryDate: expectedDeliveryDate || undefined, items }));
      navigate("/order-confirmations");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Neue Auftragsbestätigung</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">{t("invoices.customer")}</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
            <option value="">--</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Voraussichtliche Lieferung</label>
          <input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
        </div>
      </div>

      <PricedItemsEditor items={items} onChange={setItems} products={products} />
      <TotalsSummary items={items} />

      <SaveButton status={status} type="button" onClick={handleSubmit} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded" />
    </div>
  );
}
