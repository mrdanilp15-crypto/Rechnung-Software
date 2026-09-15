import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { InfoBox } from "../components/InfoBox";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { useToast } from "../components/Toast";
import { MobileCard, MobileField } from "../components/MobileCard";

interface DeliveryNote {
  id: string;
  noteNumber: string;
  deliveryDate: string;
  notes?: string;
  customer: { name: string; city?: string };
  _count: { items: number };
}

const ROW_COLUMNS = "140px 1fr 100px 90px 90px 150px";
const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

export default function DeliveryNotes() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);

  function load() {
    api.get("/delivery-notes").then((res) => setNotes(res.data));
  }
  useEffect(load, []);

  async function handleDelete(n: DeliveryNote) {
    if (!confirm(`Lieferschein "${n.noteNumber}" wirklich löschen?`)) return;
    await api.delete(`/delivery-notes/${n.id}`);
    load();
    showToast(`Lieferschein ${n.noteNumber} gelöscht`, "success");
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("nav.deliveryNotes")}</h1>
        <Link to="/delivery-notes/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          Neuer Lieferschein
        </Link>
      </div>
      <InfoBox title="Wozu dient ein Lieferschein?">
        <p>Begleitet die Ware bei der Übergabe/Lieferung an den Kunden. Zeigt nur, <strong>was</strong> geliefert wurde (Bezeichnung, Menge) - <strong>keine Preise</strong>, das ist Aufgabe der Rechnung.</p>
        <p>Kann direkt aus einer bestehenden Auftragsbestätigung erzeugt werden (Positionen werden übernommen, siehe "Neuer Lieferschein") oder frei erfasst werden.</p>
      </InfoBox>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden md:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>Nummer</span>
          <span>Kunde</span>
          <span className="text-right">Lieferdatum</span>
          <span className="text-right">Ort</span>
          <span className="text-right">Positionen</span>
          <span></span>
        </div>
        {notes.map((n) => {
          const actions = (
            <div className="flex gap-2 justify-end items-center">
              <PdfLink url={`/delivery-notes/${n.id}/pdf`} filename={`${n.noteNumber}.pdf`} className="text-brand hover:underline">PDF</PdfLink>
              <RowActionsMenu actions={[{ label: t("common.delete"), onClick: () => handleDelete(n), danger: true }]} />
            </div>
          );
          return (
            <div key={n.id}>
              {/* Desktop */}
              <div className="hidden md:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                <span className="font-medium truncate">{n.noteNumber}</span>
                <div className="min-w-0">
                  <div className="truncate">{n.customer.name}</div>
                  {n.notes && <div className="text-xs text-slate-500 truncate">{n.notes}</div>}
                </div>
                <span className="text-right text-slate-500">{formatDate(n.deliveryDate)}</span>
                <span className="text-right text-slate-500 truncate">{n.customer.city || "-"}</span>
                <span className="text-right text-slate-500">{n._count.items}</span>
                {actions}
              </div>
              {/* Mobile */}
              <MobileCard title={n.noteNumber} subtitle={n.notes || n.customer.name} actions={actions}>
                <MobileField label="Kunde" value={n.customer.name} />
                <MobileField label="Lieferdatum" value={formatDate(n.deliveryDate)} />
                <MobileField label="Ort" value={n.customer.city || "-"} />
                <MobileField label="Positionen" value={n._count.items} />
              </MobileCard>
            </div>
          );
        })}
        {notes.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Lieferscheine vorhanden.</p>}
      </div>
    </div>
  );
}
