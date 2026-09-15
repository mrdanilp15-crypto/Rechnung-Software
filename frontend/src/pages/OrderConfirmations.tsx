import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { InfoBox } from "../components/InfoBox";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { useToast } from "../components/Toast";

interface OrderConfirmation {
  id: string;
  confirmationNumber: string;
  totalCents: number;
  issueDate: string;
  expectedDeliveryDate?: string;
  customer: { name: string };
  _count: { deliveryNotes: number };
}

const ROW_COLUMNS = "160px 1fr 100px 110px 120px 150px";
const formatDate = (iso?: string) => (iso ? new Intl.DateTimeFormat("de-DE").format(new Date(iso)) : "-");

export default function OrderConfirmations() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [list, setList] = useState<OrderConfirmation[]>([]);

  function load() {
    api.get("/order-confirmations").then((res) => setList(res.data));
  }
  useEffect(load, []);

  const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  async function handleDelete(c: OrderConfirmation) {
    if (!confirm(`Auftragsbestätigung "${c.confirmationNumber}" wirklich löschen?`)) return;
    await api.delete(`/order-confirmations/${c.id}`);
    load();
    showToast(`Auftragsbestätigung ${c.confirmationNumber} gelöscht`, "success");
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("nav.orderConfirmations")}</h1>
        <Link to="/order-confirmations/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          Neue Auftragsbestätigung
        </Link>
      </div>
      <InfoBox title="Wozu dient eine Auftragsbestätigung?">
        <p>Bestätigt schriftlich, dass ein Auftrag angenommen wurde - z.B. nach einer telefonischen Bestellung oder einem angenommenen Angebot. Legt Leistung, Preis und voraussichtlichen Liefertermin verbindlich fest, <strong>bevor</strong> produziert/versendet wird.</p>
        <p><strong>Optional:</strong> nicht gesetzlich vorgeschrieben, aber sinnvoll zur Absicherung bei individuellen Aufträgen. Aus einer Auftragsbestätigung lässt sich später mit "→ Lieferschein" direkt ein Lieferschein mit denselben Positionen erzeugen.</p>
      </InfoBox>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700 overflow-x-auto">
        <div className="grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>Nummer</span>
          <span>Kunde</span>
          <span className="text-right">Datum</span>
          <span className="text-right">Lieferung ca.</span>
          <span className="text-right">Betrag</span>
          <span></span>
        </div>
        {list.map((c) => (
          <div key={c.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
            <span className="font-medium truncate">{c.confirmationNumber}</span>
            <span className="truncate">{c.customer.name}</span>
            <span className="text-right text-slate-500">{formatDate(c.issueDate)}</span>
            <span className="text-right text-slate-500">{formatDate(c.expectedDeliveryDate)}</span>
            <span className="text-right">{format(c.totalCents)}</span>
            <div className="flex gap-2 justify-end items-center flex-wrap">
              {c._count.deliveryNotes > 0 ? (
                <span className="text-xs text-green-600" title="Lieferschein wurde bereits erstellt">✓ Lieferschein</span>
              ) : (
                <Link to={`/delivery-notes/new?fromOrderConfirmation=${c.id}`} className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm">→ Lieferschein</Link>
              )}
              <PdfLink url={`/order-confirmations/${c.id}/pdf`} filename={`${c.confirmationNumber}.pdf`} className="text-brand hover:underline">PDF</PdfLink>
              <RowActionsMenu actions={[{ label: t("common.delete"), onClick: () => handleDelete(c), danger: true }]} />
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Auftragsbestätigungen vorhanden.</p>}
      </div>
    </div>
  );
}
