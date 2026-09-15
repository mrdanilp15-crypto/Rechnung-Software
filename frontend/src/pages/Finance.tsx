import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";

interface Expense {
  id: string;
  date: string;
  vendor: string;
  category: string;
  amountCents: number;
  description?: string;
  receiptPath?: string;
}

interface EuerSummary {
  year: number;
  incomeCents: number;
  expenseCents: number;
  surplusCents: number;
  expensesByCategory: Record<string, number>;
}

interface BankTransaction {
  id: string;
  bookingDate: string;
  amountCents: number;
  purpose?: string;
  counterparty?: string;
  matchedInvoiceId?: string;
}

const formatEuro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const emptyExpense = { date: new Date().toISOString().slice(0, 10), vendor: "", category: "Material", amountEur: "0.00", description: "" };

export default function Finance() {
  const [tab, setTab] = useState<"euer" | "expenses" | "bank">("euer");
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<EuerSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [form, setForm] = useState(emptyExpense);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const expenseSave = useSaveStatus();

  function loadSummary() {
    api.get(`/expenses/euer/summary?year=${year}`).then((res) => setSummary(res.data));
  }
  function loadExpenses() {
    api.get(`/expenses?year=${year}`).then((res) => setExpenses(res.data));
  }
  function loadTransactions() {
    api.get("/bank/transactions").then((res) => setTransactions(res.data));
  }

  useEffect(() => {
    loadSummary();
    loadExpenses();
  }, [year]);
  useEffect(loadTransactions, []);

  async function handleAddExpense(e: FormEvent) {
    e.preventDefault();
    await expenseSave.run(() =>
      api.post("/expenses", {
        date: form.date,
        vendor: form.vendor,
        category: form.category,
        amountCents: Math.round(parseFloat(form.amountEur) * 100),
        description: form.description || undefined,
      })
    );
    setForm(emptyExpense);
    setShowExpenseForm(false);
    loadExpenses();
    loadSummary();
  }

  async function handleDeleteExpense(exp: Expense) {
    if (!confirm(`Ausgabe "${exp.vendor}" wirklich löschen?`)) return;
    await api.delete(`/expenses/${exp.id}`);
    loadExpenses();
    loadSummary();
  }

  async function handleBankImport(file: File) {
    setBankMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post("/bank/import", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setBankMessage(`${data.imported} Buchungen importiert, ${data.matched} automatisch offenen Rechnungen zugeordnet und als bezahlt markiert.${data.errors.length ? ` ${data.errors.length} Zeilen mit Fehlern.` : ""}`);
      loadTransactions();
    } catch (err: any) {
      setBankMessage(err.response?.data?.error || "Import fehlgeschlagen.");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Finanzen</h1>

      <div className="flex gap-2 mb-6">
        {(["euer", "expenses", "bank"] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-2 rounded text-sm ${tab === tabKey ? "bg-brand text-white" : "bg-slate-200 dark:bg-slate-700"}`}
          >
            {tabKey === "euer" ? "EÜR-Übersicht" : tabKey === "expenses" ? "Ausgaben" : "Bankabgleich"}
          </button>
        ))}
      </div>

      {tab === "euer" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm">Jahr:</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <PdfLink url={`/expenses/euer/export?year=${year}`} filename={`euer-${year}.csv`} download className="ml-auto bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded text-sm">
              CSV für Steuerberater exportieren
            </PdfLink>
          </div>
          {summary && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
                  <p className="text-sm text-slate-500">Einnahmen (bezahlte Rechnungen)</p>
                  <p className="text-2xl font-semibold text-green-600">{formatEuro(summary.incomeCents)}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
                  <p className="text-sm text-slate-500">Ausgaben</p>
                  <p className="text-2xl font-semibold text-red-600">{formatEuro(summary.expenseCents)}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
                  <p className="text-sm text-slate-500">Überschuss</p>
                  <p className="text-2xl font-semibold">{formatEuro(summary.surplusCents)}</p>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
                <h2 className="font-medium mb-2 text-sm">Ausgaben nach Kategorie</h2>
                {Object.entries(summary.expensesByCategory).map(([cat, cents]) => (
                  <div key={cat} className="flex justify-between text-sm py-1 border-t border-slate-100 dark:border-slate-700 first:border-0">
                    <span>{cat}</span>
                    <span>{formatEuro(cents)}</span>
                  </div>
                ))}
                {Object.keys(summary.expensesByCategory).length === 0 && <p className="text-sm text-slate-500">Keine Ausgaben erfasst.</p>}
              </div>
            </>
          )}
          <p className="text-xs text-slate-500 mt-4">
            Hinweis: Diese Übersicht ersetzt keine steuerliche Beratung. Einnahmen werden nach Zufluss (Zahlungseingang), Ausgaben nach Belegdatum erfasst (Zufluss-/Abflussprinzip, §4 Abs. 3 EStG).
          </p>
        </div>
      )}

      {tab === "expenses" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-medium">Ausgaben {year}</h2>
            <button onClick={() => setShowExpenseForm((v) => !v)} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
              Neue Ausgabe
            </button>
          </div>
          {showExpenseForm && (
            <form onSubmit={handleAddExpense} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Datum</label>
                <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
              <div>
                <label className="block text-sm mb-1">Händler/Lieferant</label>
                <input required value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
              <div>
                <label className="block text-sm mb-1">Kategorie</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  {["Material", "Software", "Fahrtkosten", "Miete", "Werbung", "Sonstiges"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Betrag (€, brutto)</label>
                <input type="number" step="0.01" required value={form.amountEur} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, amountEur: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm mb-1">Beschreibung (optional)</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
              <div className="col-span-2 flex gap-2">
                <SaveButton status={expenseSave.status} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">Speichern</SaveButton>
                <button type="button" onClick={() => setShowExpenseForm(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
              </div>
            </form>
          )}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700 overflow-x-auto">
            {expenses.map((exp) => (
              <div key={exp.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "100px 1fr 130px 110px auto" }}>
                <span>{new Date(exp.date).toLocaleDateString("de-DE")}</span>
                <span className="font-medium truncate">{exp.vendor}</span>
                <span className="text-slate-500 truncate">{exp.category}</span>
                <span className="text-right">{formatEuro(exp.amountCents)}</span>
                <button onClick={() => handleDeleteExpense(exp)} className="text-red-600 hover:underline justify-self-end">Löschen</button>
              </div>
            ))}
            {expenses.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Ausgaben für {year} erfasst.</p>}
          </div>
        </div>
      )}

      {tab === "bank" && (
        <div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-3">
            <h2 className="font-medium">Kontoauszug importieren (CSV)</h2>
            <p className="text-sm text-slate-500">
              Erwartete Spalten: <code>bookingDate, amount, purpose, counterparty</code> (Export aus Online-Banking, ggf. Spaltennamen vorher anpassen).
              Zahlungseingänge werden automatisch offenen Rechnungen zugeordnet, wenn Betrag und Rechnungsnummer im Verwendungszweck übereinstimmen.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleBankImport(file);
                e.target.value = "";
              }}
              className="text-sm"
            />
            {bankMessage && <p className="text-sm">{bankMessage}</p>}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700 overflow-x-auto">
            {transactions.map((tx) => (
              <div key={tx.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "100px 160px 1fr 110px 100px" }}>
                <span>{new Date(tx.bookingDate).toLocaleDateString("de-DE")}</span>
                <span className="truncate">{tx.counterparty}</span>
                <span className="text-slate-500 truncate">{tx.purpose}</span>
                <span className={`text-right ${tx.amountCents >= 0 ? "text-green-600" : "text-red-600"}`}>{formatEuro(tx.amountCents)}</span>
                <span className="text-right">{tx.matchedInvoiceId ? "✓ zugeordnet" : "-"}</span>
              </div>
            ))}
            {transactions.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Noch keine Buchungen importiert.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
