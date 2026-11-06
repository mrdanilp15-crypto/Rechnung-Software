import { useEffect, useState } from "react";
import { api } from "../api/client";

import { HelpTip } from "./HelpTip";
/**
 * Nachbestellliste: Material unter dem Mindestbestand, je Lieferant mit Mengenvorschlag. Die Bestell-E-Mail wird nur vorbereitet
 * (öffnet dein Mailprogramm zum Prüfen und Absenden) - die Software bestellt nichts von selbst. Gebucht wird weiter über "Nachbestellen" beim Material, sobald geliefert wird.
 */

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  contactName: string | null;
  customerNumber: string | null;
}
interface Item {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stock: number;
  minStock: number;
  suggestedQty: number;
}
interface Group {
  supplier: Supplier | null;
  items: Item[];
}

const qtyText = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

export function orderText(group: Group, qty: Record<string, string>, company: string): string {
  const lines = group.items
    .map((i) => ({ i, q: parseFloat((qty[i.id] ?? String(i.suggestedQty)).replace(",", ".")) }))
    .filter((x) => x.q > 0)
    .map(({ i, q }) => `- ${qtyText(q)} ${i.unit} ${i.name}${i.sku ? ` (Art.-Nr. ${i.sku})` : ""}`);
  const s = group.supplier;
  return [
    `Guten Tag${s?.contactName ? ` ${s.contactName}` : ""},`,
    "",
    "ich möchte gern Folgendes bestellen:",
    "",
    ...lines,
    "",
    ...(s?.customerNumber ? [`Meine Kundennummer bei Ihnen: ${s.customerNumber}`, ""] : []),
    "Bitte bestätigen Sie mir die Bestellung mit Preis und Lieferzeit.",
    "",
    "Mit freundlichen Grüßen",
    company,
  ].join("\n");
}

export function ReorderDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ company: { name: string }; groups: Group[] } | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api.get("/materials/reorder").then((r) => setData(r.data)).catch(() => setData({ company: { name: "" }, groups: [] }));
  }, []);

  async function copy(g: Group) {
    const key = g.supplier?.id ?? "-";
    try {
      await navigator.clipboard.writeText(orderText(g, qty, data?.company.name ?? ""));
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Text zum Kopieren:", orderText(g, qty, data?.company.name ?? ""));
    }
  }

  const input = "w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-right";
  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Nachbestellliste">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold flex-1">Nachbestellliste<HelpTip topic="reorder" className="ml-2" /></h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4 text-sm">
          <p className="text-xs text-slate-500">Material unter dem Mindestbestand, je Lieferant. Die Mengen sind Vorschläge (bis auf den doppelten Mindestbestand aufgefüllt) und lassen sich ändern. Die E-Mail wird nur vorbereitet - du prüfst und sendest sie selbst.</p>
          {data === null && <p className="text-slate-500">Wird geladen ...</p>}
          {data && data.groups.length === 0 && <p className="text-slate-500">Nichts nachzubestellen - kein Material liegt unter dem Mindestbestand.</p>}
          {data?.groups.map((g) => {
            const key = g.supplier?.id ?? "-";
            const subject = `Bestellung ${data.company.name}`.trim();
            const mailto = g.supplier?.email ? `mailto:${g.supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(orderText(g, qty, data.company.name).replace(/\n/g, "\r\n"))}` : null;
            return (
              <section key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h3 className="font-medium">{g.supplier?.name ?? "Ohne Lieferant"}</h3>
                  {g.supplier?.email ? <span className="text-xs text-slate-500">{g.supplier.email}</span> : <span className="text-xs text-amber-600">{g.supplier ? "keine E-Mail-Adresse hinterlegt" : "beim Material lässt sich ein Lieferant zuordnen"}</span>}
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.items.map((i) => (
                    <li key={i.id} className="py-1.5 flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{i.name}</span>
                        <span className="block text-xs text-slate-500">Bestand {qtyText(i.stock)} {i.unit} · Mindestbestand {qtyText(i.minStock)} {i.unit}</span>
                      </span>
                      <input type="number" min="0" step="any" inputMode="decimal" value={qty[i.id] ?? String(i.suggestedQty)} onFocus={(e) => e.target.select()} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} className={input} aria-label={`Menge ${i.name}`} />
                      <span className="text-xs text-slate-500 w-8">{i.unit}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 pt-1">
                  {mailto && <a href={mailto} className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm">E-Mail vorbereiten</a>}
                  <button type="button" onClick={() => copy(g)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm">{copied === key ? "Kopiert" : "Text kopieren"}</button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
