import { useState } from "react";
import { api } from "../api/client";
import { PrintSendDialog } from "./PrintSendDialog";
import { useToast } from "./Toast";
import type { LiveStatus } from "./PrinterLive";

/**
 * "Drucken"-Knopf für eine bestimmte 3MF-Datei (z.B. an der Produktdatei oder am Auftrag): fragt bei Bedarf, auf welchem Drucker,
 * und öffnet dann den Druck-Dialog mit schon gewählter Datei (und Auftrag). Nur Administratoren dürfen Drucke senden.
 */

interface PrinterRow {
  id: string;
  name: string;
  status: LiveStatus;
}

export function PrintStartButton({ documentId, orderId, label = "Drucken", className = "text-brand hover:underline" }: { documentId: string; orderId?: string; label?: string; className?: string }) {
  const [printers, setPrinters] = useState<PrinterRow[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState<PrinterRow | null>(null);
  const showToast = useToast();

  async function open() {
    try {
      const [list, live] = await Promise.all([api.get("/printers"), api.get("/printers/live")]);
      const rows: PrinterRow[] = (list.data as { id: string; name: string; liveEnabled?: boolean }[])
        .filter((p) => live.data[p.id])
        .map((p) => ({ id: p.id, name: p.name, status: live.data[p.id] }));
      setPrinters(rows);
      if (rows.length === 0) showToast("Kein Drucker mit Live-Verbindung eingerichtet (Katalog → Drucker → Verbindung).", "error");
      else if (rows.length === 1) setTarget(rows[0]);
      else setChoosing(true);
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Drucker konnten nicht geladen werden.", "error");
    }
  }

  return (
    <>
      <button type="button" onClick={open} className={className}>{label}</button>
      {choosing && printers && (
        <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Drucker wählen">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3 text-sm">
            <h2 className="font-semibold">Auf welchem Drucker drucken?</h2>
            <ul className="space-y-2">
              {printers.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { setTarget(p); setChoosing(false); }} className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 hover:border-brand/50">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-slate-500">{p.status.stateLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setChoosing(false)} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800">Abbrechen</button>
          </div>
        </div>
      )}
      {target && <PrintSendDialog printerId={target.id} printerName={target.name} status={target.status} initialDocId={documentId} initialOrderId={orderId} onClose={() => setTarget(null)} />}
    </>
  );
}
