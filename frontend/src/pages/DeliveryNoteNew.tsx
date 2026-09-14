import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";

interface Customer {
  id: string;
  name: string;
}
interface SimpleItem {
  _key: string;
  description: string;
  quantity: number;
  unit: string;
}
interface OrderConfirmationSummary {
  id: string;
  confirmationNumber: string;
  customer: { name: string };
}
interface OrderConfirmationDetail {
  customerId: string;
  items: { description: string; quantity: number; unit: string }[];
}
const newKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}-${Math.random()}`);
const createEmptyItem = (): SimpleItem => ({ _key: newKey(), description: "", quantity: 1, unit: "Stk." });

export default function DeliveryNoteNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orderConfirmations, setOrderConfirmations] = useState<OrderConfirmationSummary[]>([]);
  const [sourceOrderConfirmationId, setSourceOrderConfirmationId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SimpleItem[]>([createEmptyItem()]);
  const [error, setError] = useState<string | null>(null);
  const { status, run } = useSaveStatus();

  useEffect(() => {
    api.get("/customers").then((res) => setCustomers(res.data));
    api.get("/order-confirmations").then((res) => setOrderConfirmations(res.data));
  }, []);

  useEffect(() => {
    const fromParam = searchParams.get("fromOrderConfirmation");
    if (fromParam) applySourceOrderConfirmation(fromParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applySourceOrderConfirmation(id: string) {
    setSourceOrderConfirmationId(id);
    if (!id) return;
    const res = await api.get<OrderConfirmationDetail>(`/order-confirmations/${id}`);
    setCustomerId(res.data.customerId);
    setItems(res.data.items.map((item) => ({ _key: newKey(), description: item.description, quantity: item.quantity, unit: item.unit })));
  }

  function updateItem(key: string, patch: Partial<SimpleItem>) {
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  async function handleSubmit() {
    setError(null);
    if (!customerId) return setError("Bitte einen Kunden auswählen.");
    try {
      await run(() =>
        api.post("/delivery-notes", {
          customerId,
          deliveryDate: deliveryDate || undefined,
          notes: notes || undefined,
          sourceOrderConfirmationId: sourceOrderConfirmationId || undefined,
          items,
        })
      );
      navigate("/delivery-notes");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Neuer Lieferschein</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
        <label className="block text-sm mb-1">Aus Auftragsbestätigung übernehmen (optional)</label>
        <select
          value={sourceOrderConfirmationId}
          onChange={(e) => applySourceOrderConfirmation(e.target.value)}
          className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
        >
          <option value="">-- manuell erfassen --</option>
          {orderConfirmations.map((c) => (
            <option key={c.id} value={c.id}>{c.confirmationNumber} – {c.customer.name}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">Übernimmt Kunde und Positionen aus der gewählten Auftragsbestätigung. Danach weiter unten frei anpassbar.</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 grid grid-cols-2 gap-4">
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
          <label className="block text-sm mb-1">Lieferdatum</label>
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Beschreibung</th>
              <th className="pb-2 w-24">Menge</th>
              <th className="pb-2 w-24">Einheit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._key} className="border-t border-slate-100 dark:border-slate-700">
                <td className="py-2 pr-2">
                  <input value={item.description} onChange={(e) => updateItem(item._key, { description: e.target.value })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </td>
                <td className="py-2 pr-2">
                  <input type="number" min={0} step="any" value={item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { quantity: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </td>
                <td className="py-2 pr-2">
                  <input value={item.unit} onChange={(e) => updateItem(item._key, { unit: e.target.value })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </td>
                <td>
                  <button type="button" onClick={() => setItems((prev) => prev.filter((it) => it._key !== item._key))} className="text-red-500 px-2">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={() => setItems((prev) => [...prev, createEmptyItem()])} className="mt-3 text-sm text-brand hover:underline">
          + {t("invoices.addItem")}
        </button>
      </div>

      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notizen" className="w-full mb-6 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />

      <SaveButton status={status} type="button" onClick={handleSubmit} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded" />
    </div>
  );
}
