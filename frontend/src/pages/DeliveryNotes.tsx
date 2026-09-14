import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";

interface DeliveryNote {
  id: string;
  noteNumber: string;
  deliveryDate: string;
  customer: { name: string };
}

export default function DeliveryNotes() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);

  function load() {
    api.get("/delivery-notes").then((res) => setNotes(res.data));
  }
  useEffect(load, []);

  async function handleDelete(n: DeliveryNote) {
    if (!confirm(`Lieferschein "${n.noteNumber}" wirklich löschen?`)) return;
    await api.delete(`/delivery-notes/${n.id}`);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("nav.deliveryNotes")}</h1>
        <Link to="/delivery-notes/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          Neuer Lieferschein
        </Link>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        {notes.map((n) => (
          <div key={n.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "140px 1fr 120px auto" }}>
            <span className="font-medium truncate">{n.noteNumber}</span>
            <span className="truncate">{n.customer.name}</span>
            <span className="text-right">{new Date(n.deliveryDate).toLocaleDateString("de-DE")}</span>
            <div className="flex gap-3 justify-end">
              <PdfLink url={`/delivery-notes/${n.id}/pdf`} filename={`${n.noteNumber}.pdf`} className="text-brand hover:underline">PDF</PdfLink>
              <button onClick={() => handleDelete(n)} className="text-red-600 hover:underline">{t("common.delete")}</button>
            </div>
          </div>
        ))}
        {notes.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Lieferscheine vorhanden.</p>}
      </div>
    </div>
  );
}
