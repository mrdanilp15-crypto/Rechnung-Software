import { useState } from "react";
import { api } from "../api/client";
import { InfoBox } from "./InfoBox";
import { useToast } from "./Toast";

interface PreviewOrder {
  orderId: string;
  date: string | null;
  buyerName: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  items: { description: string; quantity: number; unitPriceCents: number }[];
  shippingCents: number;
  totalCents: number;
  warnings: string[];
  alreadyImportedAs: string | null;
}

const money = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const dateDe = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

/** Etsy-Bestellungen aus dem CSV-Export übernehmen: Vorschau, Auswahl, Import als Auftrags-Entwürfe. */
export function EtsyImport({ onImported }: { onImported: () => void }) {
  const showToast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [orders, setOrders] = useState<PreviewOrder[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(f: File | null) {
    setFile(f);
    setOrders(null);
    setError(null);
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/order-import/etsy/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setOrders(data.orders);
      setSelected(new Set(data.orders.filter((o: PreviewOrder) => !o.alreadyImportedAs).map((o: PreviewOrder) => o.orderId)));
    } catch (err: any) {
      setError(err.response?.data?.error || "Die Datei konnte nicht gelesen werden.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!file || selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("only", [...selected].join(","));
      const { data } = await api.post("/order-import/etsy", fd, { headers: { "Content-Type": "multipart/form-data" } });
      showToast(`${data.created.length} Auftrag/Aufträge angelegt${data.newCustomers ? `, ${data.newCustomers} neue Kunden` : ""}`, "success");
      setFile(null);
      setOrders(null);
      onImported();
    } catch (err: any) {
      setError(err.response?.data?.error || "Import fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-3">
      <h2 className="font-medium text-sm">Bestellungen aus Etsy übernehmen</h2>
      <InfoBox title="So holen Sie die Datei aus Etsy">
        <p>In Etsy: <strong>Shop-Manager → Einstellungen → Optionen → Daten herunterladen</strong>. Wählen Sie <strong>"Bestellte Artikel"</strong> (empfohlen, enthält die einzelnen Artikel) oder "Bestellungen", Zeitraum und Format CSV.</p>
        <p>Danach laden Sie die Datei hier hoch. Sie sehen erst eine <strong>Vorschau</strong>; angelegt wird nichts, bevor Sie bestätigen. Je Bestellung entsteht ein <strong>Auftrag als Entwurf</strong> (mit Kunde und Lieferadresse, neue Kunden werden angelegt) - er erscheint direkt im Produktionsboard. Die Etsy-Bestellnummer steht im Auftrag; bereits importierte Bestellungen werden erkannt und nicht doppelt angelegt.</p>
        <p>Rabatte, Gutscheine und Fremdwährungen werden nicht automatisch umgerechnet - die Vorschau weist darauf hin. Etsy-Gebühren sind nicht Teil dieses Imports (tragen Sie sie als Ausgabe ein). Es gibt keine Live-Verbindung zu Etsy; Preise gelten als Endkundenpreise (bei Kleinunternehmern 1:1, sonst brutto inkl. 19 % USt. und daraus netto berechnet).</p>
      </InfoBox>
      <input type="file" accept=".csv,text/csv" onChange={(e) => choose(e.target.files?.[0] ?? null)} className="text-sm" />
      {busy && <p className="text-sm text-slate-500">Bitte warten ...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {orders && (
        <>
          <div className="text-xs text-slate-500">{orders.length} Bestellung(en) in der Datei · {orders.filter((o) => o.alreadyImportedAs).length} schon importiert</div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded text-sm max-h-96 overflow-auto">
            {orders.map((o) => (
              <li key={o.orderId} className={`px-3 py-2 flex gap-3 ${o.alreadyImportedAs ? "opacity-60" : ""}`}>
                <input type="checkbox" className="mt-1" disabled={!!o.alreadyImportedAs} checked={selected.has(o.orderId)} onChange={() => toggle(o.orderId)} aria-label={`Bestellung ${o.orderId} importieren`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">#{o.orderId} · {o.buyerName}</span>
                    <span>{money(o.totalCents)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {o.date ? dateDe(o.date) : "ohne Datum"} · {[o.postalCode, o.city].filter(Boolean).join(" ")} {o.country}
                    {o.alreadyImportedAs && <span className="ml-2 text-green-600">bereits importiert als {o.alreadyImportedAs}</span>}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">{o.items.map((i) => `${i.quantity}× ${i.description.split("\n")[0]}`).join(", ")}{o.shippingCents > 0 ? ` · Versand ${money(o.shippingCents)}` : ""}</div>
                  {o.warnings.map((w, i) => <div key={i} className="text-xs text-amber-600">{w}</div>)}
                </div>
              </li>
            ))}
          </ul>
          <button onClick={runImport} disabled={busy || selected.size === 0} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60">
            {selected.size} Bestellung(en) als Aufträge anlegen
          </button>
        </>
      )}
    </div>
  );
}
