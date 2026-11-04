import { useEffect, useState } from "react";
import { api } from "../api/client";
import { PdfLink } from "./PdfLink";
import { useAuthStore } from "../store/authStore";

/** DATEV-Export (Buchungsstapel) für den Steuerberater: Kontenrahmen, Berater-/Mandantennummer, Kontenzuordnung, Vorschau und Download. */

interface Settings {
  skr: "03" | "04";
  consultantNumber: string;
  clientNumber: string;
  accountLength: number;
  bank: string;
  revenueSmallBusiness: string;
  revenue19: string;
  revenue7: string;
  revenueTaxFree: string;
  expenseAccounts: Record<string, string>;
  expenseDefault: string;
}
interface Preview {
  period: string;
  counts: { invoices: number; expenses: number; lines: number };
  incomeCents: number;
  expenseCents: number;
  warnings: string[];
  sample: { amountCents: number; side: string; account: string; counter: string; buKey: string; date: string; ref: string; text: string }[];
}

const euro = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const input = "px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
const PERIODS = [
  { v: "year", l: "Ganzes Jahr" },
  { v: "q1", l: "1. Quartal" }, { v: "q2", l: "2. Quartal" }, { v: "q3", l: "3. Quartal" }, { v: "q4", l: "4. Quartal" },
  ...Array.from({ length: 12 }, (_, i) => ({ v: `m${i + 1}`, l: new Date(2000, i, 1).toLocaleDateString("de-DE", { month: "long" }) })),
];

export function DatevPanel({ year }: { year: number }) {
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Record<string, Settings> | null>(null);
  const [period, setPeriod] = useState("year");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/accounting/datev/settings").then((r) => { setSettings(r.data.settings); setDefaults(r.data.defaults); }).catch(() => undefined);
  }, []);
  useEffect(() => { setPreview(null); }, [year, period]);

  if (!settings) return null;
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const fail = (e: any, fallback: string) => setMsg({ ok: false, text: e?.response?.data?.error ?? fallback });

  async function save() {
    setMsg(null);
    try {
      await api.put("/accounting/datev/settings", settings);
      setMsg({ ok: true, text: "Einstellungen gespeichert." });
    } catch (e: any) {
      const issues = e?.response?.data?.details ?? e?.response?.data?.issues;
      setMsg({ ok: false, text: issues ? JSON.stringify(issues).slice(0, 200) : e?.response?.data?.error ?? "Speichern hat nicht geklappt." });
    }
  }
  async function loadPreview() {
    setMsg(null);
    try {
      const { data } = await api.get("/accounting/datev/preview", { params: { year, period } });
      setPreview(data);
    } catch (e) {
      fail(e, "Vorschau konnte nicht erstellt werden.");
    }
  }
  function switchSkr(skr: "03" | "04") {
    const d = defaults?.[skr];
    if (d) setSettings({ ...d, consultantNumber: settings!.consultantNumber, clientNumber: settings!.clientNumber, accountLength: settings!.accountLength });
  }

  const field = (label: string, key: keyof Settings, width = "w-24") => (
    <label className="block text-xs">{label}
      <input value={String(settings[key])} disabled={!isAdmin} onChange={(e) => set({ [key]: e.target.value } as Partial<Settings>)} className={`${input} ${width} block mt-1`} inputMode="numeric" />
    </label>
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">DATEV-Export für den Steuerberater</h2>
        <button onClick={() => setOpen((v) => !v)} className="text-sm text-brand hover:underline">{open ? "Einstellungen schließen" : "Einstellungen"}</button>
      </div>
      <p className="text-sm text-slate-500">
        Erzeugt einen DATEV-Buchungsstapel (CSV, Format EXTF) für deine Einnahmen-Überschuss-Rechnung: bezahlte Rechnungen zum Zahlungsdatum (Bank an Erlöse) und alle Ausgaben (Aufwand an Bank).
        Die Konten sind Vorschläge - bitte mit dem Steuerberater abstimmen und einmal einen Testimport machen lassen. Abschreibungen sind nicht enthalten.
      </p>

      {open && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="block text-xs">Kontenrahmen
              <select value={settings.skr} disabled={!isAdmin} onChange={(e) => switchSkr(e.target.value as "03" | "04")} className={`${input} block mt-1`}>
                <option value="03">SKR03</option>
                <option value="04">SKR04</option>
              </select>
            </label>
            {field("Beraternummer", "consultantNumber", "w-28")}
            {field("Mandantennummer", "clientNumber", "w-28")}
            <label className="block text-xs">Sachkontenlänge
              <select value={settings.accountLength} disabled={!isAdmin} onChange={(e) => set({ accountLength: Number(e.target.value) })} className={`${input} block mt-1`}>
                {[4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">Beraternummer, Mandantennummer und Sachkontenlänge nennt dir der Steuerberater. Bei längeren Sachkonten (z.B. 5 Stellen) müssen die Konten unten entsprechend angepasst werden.</p>
          <div className="flex flex-wrap gap-3">
            {field("Bank", "bank")}
            {field("Erlöse Kleinunternehmer", "revenueSmallBusiness", "w-28")}
            {field("Erlöse 19 %", "revenue19")}
            {field("Erlöse 7 %", "revenue7")}
            {field("Erlöse steuerfrei", "revenueTaxFree", "w-28")}
            {field("Aufwand Standard", "expenseDefault", "w-28")}
          </div>
          <div>
            <div className="text-xs mb-1">Aufwandskonten je Ausgabenkategorie</div>
            <div className="flex flex-wrap gap-3">
              {Object.keys(settings.expenseAccounts).map((cat) => (
                <label key={cat} className="block text-xs">{cat}
                  <input value={settings.expenseAccounts[cat]} disabled={!isAdmin} onChange={(e) => set({ expenseAccounts: { ...settings.expenseAccounts, [cat]: e.target.value } })} className={`${input} w-24 block mt-1`} inputMode="numeric" />
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">Kategorien ohne eigenes Konto gehen auf "Aufwand Standard".</p>
          </div>
          {isAdmin ? <button onClick={save} className="px-3 py-1.5 rounded bg-brand text-white text-sm">Einstellungen speichern</button> : <p className="text-xs text-slate-500">Nur ein Administrator kann die Einstellungen ändern.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={input} aria-label="Zeitraum">
          {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l} {year}</option>)}
        </select>
        <button onClick={loadPreview} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 text-sm">Vorschau</button>
        <PdfLink url={`/accounting/datev/export?year=${year}&period=${period}`} filename={`EXTF_Buchungsstapel_${year}_${period}.csv`} download className="px-3 py-1.5 rounded bg-brand text-white text-sm">DATEV-Datei herunterladen</PdfLink>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}

      {preview && (
        <div className="space-y-2 text-sm">
          <p>{preview.period}: {preview.counts.invoices} bezahlte Rechnung(en) ({euro(preview.incomeCents)}) und {preview.counts.expenses} Ausgabe(n) ({euro(preview.expenseCents)}) ergeben {preview.counts.lines} Buchungen.</p>
          {preview.warnings.length > 0 && (
            <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc pl-5 space-y-0.5">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          {preview.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead><tr className="text-left text-slate-500"><th className="pr-3">Datum</th><th className="pr-3 text-right">Betrag</th><th className="pr-3">S/H</th><th className="pr-3">Konto</th><th className="pr-3">Gegenkonto</th><th className="pr-3">BU</th><th className="pr-3">Beleg</th><th>Text</th></tr></thead>
                <tbody>
                  {preview.sample.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="pr-3 py-1">{new Date(l.date).toLocaleDateString("de-DE")}</td>
                      <td className="pr-3 text-right">{euro(l.amountCents)}</td>
                      <td className="pr-3">{l.side}</td><td className="pr-3">{l.account}</td><td className="pr-3">{l.counter}</td><td className="pr-3">{l.buKey}</td><td className="pr-3">{l.ref}</td><td className="truncate max-w-[16rem]">{l.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.counts.lines > preview.sample.length && <p className="text-xs text-slate-500 mt-1">... und {preview.counts.lines - preview.sample.length} weitere Buchungen.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
