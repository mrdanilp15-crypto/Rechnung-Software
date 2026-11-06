import { aggregateRows, newPartKey, type PartRow } from "../lib/parts";
import { HelpTip } from "./HelpTip";

/**
 * Bauteile: für Produkte aus mehreren Drucken (z.B. Tankdeckel = Scharnier + Deckel, je eine 3MF). Jedes Bauteil hat Druckzeit und Material je
 * Druckplatte (aus der jeweiligen 3MF), die Teile pro Platte und die Anzahl je Produkt. Die Kalkulation des Produkts ist die Summe aller Bauteile.
 */

interface MaterialOption {
  id: string;
  name: string;
  unit: string;
}

const field = "w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")} min` : `${Math.round(m * 10) / 10} min`);

export function ProductParts({ rows, setRows, materials }: { rows: PartRow[]; setRows: (fn: (r: PartRow[]) => PartRow[]) => void; materials: MaterialOption[] }) {
  const patch = (key: string, p: Partial<PartRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const agg = aggregateRows(rows);
  const unitOf = (id: string) => materials.find((m) => m.id === id)?.unit ?? "";

  return (
    <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 space-y-3">
      <div>
        <div className="text-sm font-medium">Bauteile (Produkt aus mehreren Drucken)<HelpTip topic="parts" className="ml-1.5" /></div>
        <p className="text-xs text-slate-500 mt-0.5">
          Jedes Bauteil hat seine eigene Platte mit Druckzeit und Material (so zeigt es der Slicer). Druckzeit und Materialverbrauch des Produkts sind die <strong>Summe aller Bauteile</strong> -
          bei mehreren gleichen Teilen auf einer Platte wird durch deren Anzahl geteilt und mit der Anzahl je Produkt multipliziert. Die Werte aus der 3MF übernimmst du bei <em>Dateien und Versionen</em> (Werte aus 3MF übernehmen → Bauteil).
        </p>
      </div>

      {rows.map((p, idx) => (
        <div key={p.key} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={p.name} onChange={(e) => patch(p.key, { name: e.target.value })} placeholder={`Bauteil ${idx + 1}, z.B. Scharnier`} className={`${field} flex-1 font-medium`} aria-label="Name des Bauteils" />
            <button type="button" onClick={() => setRows((l) => l.filter((r) => r.key !== p.key))} className="text-red-500 text-sm px-2" aria-label="Bauteil entfernen">✕</button>
          </div>
          {p.fileName && <p className="text-xs text-slate-500">Werte aus {p.fileName}</p>}
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-slate-500">Anzahl je Produkt
              <input type="number" min="1" step="any" inputMode="decimal" value={p.qty} onFocus={(e) => e.target.select()} onChange={(e) => patch(p.key, { qty: e.target.value })} className={`${field} mt-0.5`} />
            </label>
            <label className="text-xs text-slate-500">Teile pro Platte
              <input type="number" min="1" step="1" inputMode="numeric" value={p.pieces} onFocus={(e) => e.target.select()} onChange={(e) => patch(p.key, { pieces: e.target.value })} className={`${field} mt-0.5`} />
            </label>
            <label className="text-xs text-slate-500">Druckzeit je Platte (min)
              <input type="number" min="0" step="any" inputMode="decimal" value={p.minutes} onFocus={(e) => e.target.select()} onChange={(e) => patch(p.key, { minutes: e.target.value })} className={`${field} mt-0.5`} />
            </label>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500">Material je Platte</p>
            {p.materials.map((m, mi) => (
              <div key={mi} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
                <select value={m.materialId} onChange={(e) => patch(p.key, { materials: p.materials.map((x, j) => (j === mi ? { ...x, materialId: e.target.value } : x)) })} className={field}>
                  <option value="">- Material wählen -</option>
                  {materials.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <input type="number" min="0" step="any" inputMode="decimal" value={m.quantity} placeholder={unitOf(m.materialId) || "Menge"} onFocus={(e) => e.target.select()} onChange={(e) => patch(p.key, { materials: p.materials.map((x, j) => (j === mi ? { ...x, quantity: e.target.value } : x)) })} className={field} aria-label={`Menge in ${unitOf(m.materialId) || "Einheit des Materials"}`} />
                <button type="button" onClick={() => patch(p.key, { materials: p.materials.filter((_, j) => j !== mi) })} className="text-red-500 px-1" aria-label="Material entfernen">✕</button>
              </div>
            ))}
            <button type="button" disabled={materials.length === 0} onClick={() => patch(p.key, { materials: [...p.materials, { materialId: materials[0]?.id ?? "", quantity: "" }] })} className="text-brand text-xs hover:underline disabled:opacity-50">+ Material</button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((l) => [...l, { key: newPartKey(), name: "", qty: "1", pieces: "1", minutes: "", documentId: null, fileName: null, materials: [] }])} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">+ Bauteil hinzufügen</button>
        {rows.length > 0 && (
          <p className="text-sm">
            <strong>Summe je Produkt:</strong> Druckzeit {fmtMin(agg.printMinutes)}
            {agg.materials.length > 0 ? ` · ${agg.materials.map((m) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(m.quantity)} ${unitOf(m.materialId)} ${materials.find((x) => x.id === m.materialId)?.name ?? ""}`).join(" · ")}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
