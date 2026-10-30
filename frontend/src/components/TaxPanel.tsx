import { useEffect, useState } from "react";
import { api } from "../api/client";
import { PdfLink } from "./PdfLink";

interface VatRow {
  key: string;
  label: string;
  kz: string | null;
  netCents: number;
  vatCents: number;
}
interface VatSummary {
  period: string;
  rows: VatRow[];
  outputVatCents: number;
  inputVatCents: number;
  expenseNetCents: number;
  payableCents: number;
  invoiceCount: number;
  expenseCount: number;
}

const eur = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const PERIODS = [
  { value: "year", label: "Ganzes Jahr" },
  { value: "q1", label: "1. Quartal" },
  { value: "q2", label: "2. Quartal" },
  { value: "q3", label: "3. Quartal" },
  { value: "q4", label: "4. Quartal" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: `m${i + 1}`, label: `Monat ${String(i + 1).padStart(2, "0")}` })),
];

/** Steuerberater-Paket (ZIP) und Umsatzsteuer-Übersicht für einen Zeitraum. */
export function TaxPanel({ year }: { year: number }) {
  const [period, setPeriod] = useState("year");
  const [summary, setSummary] = useState<VatSummary | null>(null);
  const [isSmallBusiness, setIsSmallBusiness] = useState(false);

  useEffect(() => {
    api.get(`/accounting/vat-summary?year=${year}&period=${period}`).then((res) => setSummary(res.data));
  }, [year, period]);
  useEffect(() => {
    api.get("/companies/me").then((res) => setIsSmallBusiness(!!res.data.isSmallBusiness));
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <h2 className="font-medium mb-1">Steuerberater-Paket {year}</h2>
        <p className="text-sm text-slate-500 mb-3">
          Ein ZIP mit Einnahmen- und Ausgabenliste (CSV für Excel), Umsatzsteuer-Übersicht je Quartal, allen ausgestellten Rechnungen als PDF und den hochgeladenen Ausgabenbelegen -
          alles, was die Kanzlei zum Jahresabschluss braucht. Kein DATEV-Buchungsstapel: die Konten ordnet die Kanzlei zu.
        </p>
        <PdfLink url={`/accounting/package?year=${year}`} filename={`steuerberater-${year}.zip`} download className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          Paket für {year} herunterladen
        </PdfLink>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-medium">Umsatzsteuer-Übersicht {year}</h2>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm">
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        {isSmallBusiness && <p className="text-sm text-slate-500 mb-3">Als Kleinunternehmer (§19 UStG) geben Sie keine Umsatzsteuer-Voranmeldung ab - die Übersicht zeigt nur Ihre Umsätze.</p>}
        {!summary ? (
          <p className="text-sm text-slate-500">Wird berechnet ...</p>
        ) : summary.rows.length === 0 && summary.expenseCount === 0 ? (
          <p className="text-sm text-slate-500">Keine Umsätze oder Ausgaben in diesem Zeitraum.</p>
        ) : (
          <div className="text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_44px_78px_78px] sm:grid-cols-[1fr_70px_110px_110px] gap-2 text-xs text-slate-500 border-b border-slate-100 dark:border-slate-700 pb-1">
              <span>Position</span>
              <span>Kennzahl</span>
              <span className="text-right">Netto</span>
              <span className="text-right">Umsatzsteuer</span>
            </div>
            {summary.rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_44px_78px_78px] sm:grid-cols-[1fr_70px_110px_110px] gap-2 py-1.5 border-b border-slate-50 dark:border-slate-700/50">
                <span>{r.label}</span>
                <span className="text-slate-500">{r.kz ?? ""}</span>
                <span className="text-right">{eur(r.netCents)}</span>
                <span className="text-right">{eur(r.vatCents)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_44px_78px_78px] sm:grid-cols-[1fr_70px_110px_110px] gap-2 py-1.5 border-b border-slate-50 dark:border-slate-700/50">
              <span>Abziehbare Vorsteuer aus Ausgaben</span>
              <span className="text-slate-500">66</span>
              <span className="text-right">{eur(summary.expenseNetCents)}</span>
              <span className="text-right">{eur(summary.inputVatCents)}</span>
            </div>
            {!isSmallBusiness && (
              <div className={`grid grid-cols-[minmax(0,1fr)_44px_78px_78px] sm:grid-cols-[1fr_70px_110px_110px] gap-2 py-2 font-medium ${summary.payableCents > 0 ? "" : "text-green-600"}`}>
                <span>{summary.payableCents >= 0 ? "Vorläufige Zahllast" : "Vorläufige Erstattung"}</span>
                <span></span>
                <span></span>
                <span className="text-right">{eur(Math.abs(summary.payableCents))}</span>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3">
          Orientierungshilfe, keine Voranmeldung und keine Steuerberatung: Grundlage ist das Rechnungsdatum (Sollversteuerung); bei Ist-Versteuerung weichen die Werte ab. Kennzahlen (Kz) entsprechen den
          Feldern im Elster-Formular, die Zuordnung ist ohne Gewähr. Korrekturbelege (Storno) mindern den Umsatz in dem Zeitraum, in dem sie ausgestellt wurden.
        </p>
      </div>
    </div>
  );
}
