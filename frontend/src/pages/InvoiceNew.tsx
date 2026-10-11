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
  country?: string;
  type?: string;
  vatId?: string | null;
}
interface Product {
  id: string;
  name: string;
  unitPriceCents: number;
  vatRateBps: number;
  unit: string;
}

export default function InvoiceNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams(); // vorhanden = Entwurf bearbeiten, sonst neu anlegen
  const isEditing = Boolean(id);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [supplyType, setSupplyType] = useState<"GOODS" | "SERVICE">("GOODS");
  const [isSmallBusiness, setIsSmallBusiness] = useState(false);
  const [items, setItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);
  const { status, run } = useSaveStatus();

  useEffect(() => {
    api.get("/customers").then((res) => setCustomers(res.data));
    api.get("/products").then((res) => setProducts(res.data));
    api.get("/companies/me").then((res) => setIsSmallBusiness(!!res.data.isSmallBusiness));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get(`/invoices/${id}`).then((res) => {
      const inv = res.data;
      if (inv.status !== "DRAFT") {
        setError("Nur Entwürfe können bearbeitet werden.");
        return;
      }
      setCustomerId(inv.customerId);
      setDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : "");
      setDeliveryDate(inv.deliveryDate ? inv.deliveryDate.slice(0, 10) : "");
      setIssueDate(inv.issueDate ? inv.issueDate.slice(0, 10) : "");
      setNotes(inv.notes ?? "");
      setSupplyType(inv.supplyType === "SERVICE" ? "SERVICE" : "GOODS");
      setItems(withClientKeys(inv.items.map((it: any) => ({
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
        const payload = {
          customerId,
          issueDate: issueDate || undefined,
          dueDate: dueDate || undefined,
          deliveryDate: deliveryDate || undefined,
          notes,
          supplyType,
          items,
        };
        if (isEditing) {
          await api.patch(`/invoices/${id}`, payload);
        } else {
          const { data } = await api.post("/invoices", payload);
          navigate(`/invoices/${data.id}`);
        }
      });
      if (isEditing) navigate(`/invoices/${id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  if (loading) return <p>{t("common.loading")}</p>;

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const isAbroad = !!selectedCustomer?.country && selectedCustomer.country !== "DE";

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{isEditing ? t("common.edit") : t("invoices.new")}</h1>
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
          <label className="block text-sm mb-1">{t("invoices.dueDate")}</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
        </div>
        <div>
          <label className="block text-sm mb-1">Leistungs-/Lieferdatum</label>
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <p className="text-xs text-slate-500 mt-1">Leer lassen = Rechnungsdatum gilt als Leistungsdatum (§14 Abs. 4 Nr. 6 UStG verlangt i.d.R. eine explizite Angabe).</p>
        </div>
        <div>
          <label className="block text-sm mb-1">Rechnungsdatum</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <p className="text-xs text-slate-500 mt-1">Leer lassen = heutiges Datum. Die Fälligkeit wird sonst aus dem Zahlungsziel in den Einstellungen berechnet.</p>
        </div>
        {isAbroad && (
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Art der Lieferung/Leistung (Auslandskunde)</label>
            <select value={supplyType} onChange={(e) => setSupplyType(e.target.value as "GOODS" | "SERVICE")} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              <option value="GOODS">Lieferung von Waren (z.B. gedruckte Teile)</option>
              <option value="SERVICE">Sonstige Leistung (Dienstleistung, Konstruktion, ...)</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Entscheidet über die Umsatzsteuer: Waren an EU-Unternehmer mit USt-IdNr. = steuerfreie innergemeinschaftliche Lieferung, Dienstleistungen an EU-Unternehmer = Reverse-Charge,
              Waren in Drittländer = steuerfreie Ausfuhr. Die Software setzt die passende USt. und den Pflichthinweis automatisch.
            </p>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="block text-sm mb-1">Anmerkung auf der Rechnung (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="z.B. Vielen Dank für Ihren Auftrag. Lieferung frei Haus." className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
        </div>
      </div>

      <PricedItemsEditor items={items} onChange={setItems} products={products} />
      <TotalsSummary items={items} isSmallBusiness={isSmallBusiness} abroadHint={isAbroad} />

      <SaveButton status={status} type="button" onClick={handleSubmit} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded" />
    </div>
  );
}
