import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface Customer {
  id: string;
  name: string;
}
interface SimpleItem {
  description: string;
  quantity: number;
  unit: string;
}
const emptyItem: SimpleItem = { description: "", quantity: 1, unit: "Stk." };

export default function DeliveryNoteNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SimpleItem[]>([{ ...emptyItem }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/customers").then((res) => setCustomers(res.data));
  }, []);

  function updateItem(idx: number, patch: Partial<SimpleItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function handleSubmit() {
    setError(null);
    if (!customerId) return setError("Bitte einen Kunden auswählen.");
    try {
      await api.post("/delivery-notes", { customerId, deliveryDate: deliveryDate || undefined, notes: notes || undefined, items });
      navigate("/delivery-notes");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Neuer Lieferschein</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

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
            {items.map((item, idx) => (
              <tr key={idx} className="border-t border-slate-100 dark:border-slate-700">
                <td className="py-2 pr-2">
                  <input value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </td>
                <td className="py-2 pr-2">
                  <input type="number" min={0} step="any" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </td>
                <td className="py-2 pr-2">
                  <input value={item.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </td>
                <td>
                  <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="text-red-500 px-2">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={() => setItems((prev) => [...prev, { ...emptyItem }])} className="mt-3 text-sm text-brand hover:underline">
          + {t("invoices.addItem")}
        </button>
      </div>

      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notizen" className="w-full mb-6 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />

      <button onClick={handleSubmit} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded">
        {t("common.save")}
      </button>
    </div>
  );
}
