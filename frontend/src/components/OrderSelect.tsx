import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface OpenOrder {
  id: string;
  number: string;
  customerName: string;
}

// Offene Aufträge werden einmal geladen und für alle Auswahlfelder auf der Seite geteilt
let cache: { at: number; promise: Promise<OpenOrder[]> } | null = null;
function loadOpenOrders(): Promise<OpenOrder[]> {
  if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), promise: api.get("/production/open").then((r) => r.data as OpenOrder[]).catch(() => []) };
  return cache.promise;
}

/** Auswahl eines offenen Auftrags (Auftragsbestätigung), z.B. um einen Druck zuzuordnen. Der aktuell gewählte Auftrag bleibt auch dann sichtbar, wenn er nicht mehr offen ist. */
export function OrderSelect({ value, current, onChange, className, emptyLabel = "Kein Auftrag" }: { value: string; current?: OpenOrder | null; onChange: (id: string) => void; className?: string; emptyLabel?: string }) {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  useEffect(() => {
    let alive = true;
    loadOpenOrders().then((o) => alive && setOrders(o));
    return () => {
      alive = false;
    };
  }, []);
  const list = current && !orders.some((o) => o.id === current.id) ? [current, ...orders] : orders;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className ?? "px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"}>
      <option value="">{emptyLabel}</option>
      {list.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.customerName}</option>)}
    </select>
  );
}
