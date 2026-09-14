import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { LineItem, PricedItemsEditor, TotalsSummary, createEmptyLineItem, withClientKeys } from "../components/PricedItemsEditor";
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

export default function QuoteForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const { status, run } = useSaveStatus();

  useEffect(() => {
    api.get("/customers").then((res) => setCustomers(res.data));
    api.get("/products").then((res) => setProducts(res.data));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get(`/quotes/${id}`).then((res) => {
      const q = res.data;
      setCustomerId(q.customerId);
      setValidUntil(q.validUntil ? q.validUntil.slice(0, 10) : "");
      setItems(withClientKeys(q.items.map((it: any) => ({
        productId: it.productId ?? undefined,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPriceCents: it.unitPriceCents,
        vatRateBps: it.vatRateBps,
      }))));
      setLoading(false);
    });
  }, [id]);

  async function handleSubmit() {
    setError(null);
    if (!customerId) return setError("Bitte einen Kunden auswählen.");
    try {
      await run(async () => {
        if (isEditing) {
          await api.patch(`/quotes/${id}`, { customerId, validUntil: validUntil || undefined, items });
        } else {
          await api.post("/quotes", { customerId, validUntil: validUntil || undefined, items });
        }
      });
      navigate("/quotes");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  if (loading) return <p>{t("common.loading")}</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{isEditing ? t("common.edit") : "Neues Angebot"}</h1>
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
          <label className="block text-sm mb-1">Gültig bis</label>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
        </div>
      </div>

      <PricedItemsEditor items={items} onChange={setItems} products={products} />
      <TotalsSummary items={items} />

      <SaveButton status={status} type="button" onClick={handleSubmit} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded" />
    </div>
  );
}
