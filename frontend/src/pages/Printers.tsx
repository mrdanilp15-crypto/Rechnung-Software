import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../components/Toast";
import { InfoBox } from "../components/InfoBox";
import { printerHourlyCost } from "../lib/cost";
import { useAuthStore } from "../store/authStore";
import { CAMERA_MODELS, PrinterLiveCard, type LiveStatus } from "../components/PrinterLive";

interface Printer {
  id: string;
  name: string;
  purchasePriceCents: number;
  lifetimeHours: number;
  usedHoursBefore?: number;
  powerWatts: number;
  wearCentsPerHour: number;
  notes?: string | null;
  _count?: { products: number };
  connectionType: "NONE" | "BAMBU_LAN";
  model: string | null;
  host: string | null;
  serial: string | null;
  hasAccessCode: boolean;
  liveEnabled: boolean;
  trackedMinutes: number;
}

const MODELS: [string, string][] = [["X1C", "X1 Carbon"], ["X1E", "X1E"], ["P1P", "P1P"], ["P1S", "P1S"], ["P2S", "P2S"], ["A1", "A1"], ["A1MINI", "A1 mini"], ["H2D", "H2D"], ["H2S", "H2S"], ["OTHER", "Anderes Modell"]];

const inputClass = "mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";
const money = (cents: number, digits = 2) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100);

const emptyForm = { name: "", price: "500", lifetime: "5000", usedBefore: "0", watts: "120", wear: "0.10", notes: "", connectionType: "NONE" as "NONE" | "BAMBU_LAN", model: "P1S", host: "", serial: "", accessCode: "", liveEnabled: true };

/** Drucker/Maschinen mit eigenen Kostenwerten - jeder Drucker lässt sich einzeln anpassen. */
export default function Printers() {
  const showToast = useToast();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [electricity, setElectricity] = useState(35);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const [liveMap, setLiveMap] = useState<Record<string, LiveStatus>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [clearCode, setClearCode] = useState(false);

  function load() {
    api.get("/printers").then((r) => setPrinters(r.data));
  }
  function loadLive() {
    api.get("/printers/live").then((r) => setLiveMap(r.data)).catch(() => {});
  }
  // Live-Status alle 4 Sekunden aktualisieren, solange die Seite sichtbar ist
  useEffect(() => {
    loadLive();
    const timer = setInterval(() => { if (!document.hidden) loadLive(); }, 4000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    load();
    api.get("/companies/me").then((r) => setElectricity(r.data.electricityCentsPerKwh ?? 35));
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setTestResult(null);
    setClearCode(false);
    setError(null);
    setShowForm(true);
  }
  function startEdit(p: Printer) {
    setEditingId(p.id);
    setForm({ name: p.name, price: String(p.purchasePriceCents / 100), lifetime: String(p.lifetimeHours), usedBefore: String(p.usedHoursBefore ?? 0), watts: String(p.powerWatts), wear: String(p.wearCentsPerHour / 100), notes: p.notes ?? "", connectionType: p.connectionType, model: p.model ?? "P1S", host: p.host ?? "", serial: p.serial ?? "", accessCode: "", liveEnabled: p.connectionType === "NONE" ? true : p.liveEnabled });
    setTestResult(null);
    setClearCode(false);
    setError(null);
    setShowForm(true);
  }

  const draft = {
    purchasePriceCents: Math.round((parseFloat(form.price) || 0) * 100),
    lifetimeHours: parseFloat(form.lifetime) || 0,
    usedHoursBefore: Math.max(0, parseFloat(form.usedBefore) || 0),
    powerWatts: parseFloat(form.watts) || 0,
    wearCentsPerHour: (parseFloat(form.wear) || 0) * 100,
  };
  const live = printerHourlyCost(draft, electricity);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError("Bitte einen Namen eingeben.");
    if (draft.lifetimeHours <= 0) return setError("Die Lebensdauer muss größer als 0 Stunden sein.");
    if (draft.usedHoursBefore >= draft.lifetimeHours) return setError("Die bereits gelaufenen Stunden müssen kleiner als die Lebensdauer sein.");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { name: form.name.trim(), ...draft, notes: form.notes.trim() || null };
      if (isAdmin) {
        payload.connectionType = form.connectionType;
        if (form.connectionType === "BAMBU_LAN") {
          Object.assign(payload, { model: form.model, host: form.host.trim(), serial: form.serial.trim(), liveEnabled: form.liveEnabled });
          if (form.accessCode.trim()) payload.accessCode = form.accessCode.trim();
          if (clearCode) payload.clearAccessCode = true;
        }
      }
      if (editingId) await api.patch(`/printers/${editingId}`, payload);
      else await api.post("/printers", payload);
      setShowForm(false);
      load();
      showToast("Drucker gespeichert", "success");
    } catch (err: any) {
      setError(err.response?.data?.error || "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post("/printers/test-connection", { printerId: editingId ?? undefined, host: form.host.trim(), serial: form.serial.trim(), accessCode: form.accessCode.trim() || undefined });
      setTestResult(data.ok ? { ok: true, text: `Verbindung steht - Drucker meldet: ${data.status.stateLabel}${data.status.nozzleTemp !== null ? `, Düse ${Math.round(data.status.nozzleTemp)} °C` : ""}.` } : { ok: false, text: data.reason });
    } catch (err: any) {
      setTestResult({ ok: false, text: err.response?.data?.details?.fieldErrors ? Object.values(err.response.data.details.fieldErrors as Record<string, string[]>).flat().join(" ") : err.response?.data?.error || "Test fehlgeschlagen." });
    } finally {
      setTesting(false);
    }
  }

  async function remove(p: Printer) {
    const n = p._count?.products ?? 0;
    if (!confirm(`"${p.name}" entfernen?${n ? `\n\n${n} Produkt(e) nutzen diesen Drucker und rechnen danach wieder mit dem pauschalen Maschinenstundensatz.` : ""}`)) return;
    await api.delete(`/printers/${p.id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Drucker</h1>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">+ Drucker anlegen</button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Jeder Drucker hat eigene Werte. In der Produktkalkulation wählen Sie, auf welchem Drucker gedruckt wird - daraus rechnet die Software Strom, Abschreibung und Verschleiß automatisch.
        Der Strompreis ({electricity} ct/kWh) steht unter Einstellungen → Firma → Kalkulation.
      </p>

      <InfoBox title="So kommen die Zahlen zustande - und wo sie hingehören">
        <p><strong>1. Drucker anlegen</strong> (hier): Anschaffungspreis, Lebensdauer, Watt, Verschleiß. Daraus entstehen die Kosten pro Druckstunde.</p>
        <p><strong>2. Strompreis, Arbeitsstundensatz, Gemeinkosten, Gewinnaufschlag</strong> stehen einmalig unter Einstellungen → Firma → Kalkulation.</p>
        <p><strong>3. Material</strong> legen Sie unter "Material (Lager)" an (Gesamtpreis und Menge einer Spule eintragen, der Preis pro Gramm wird berechnet).</p>
        <p><strong>4. Pro Produkt</strong> tragen Sie Materialverbrauch, Druckzeit und Arbeitszeit ein (Werte aus dem Slicer) und wählen den Drucker - die Software zeigt Selbstkosten, Preisvorschlag und Gewinn.</p>
        <p><strong>Richtwerte:</strong> Lebensdauer eines Bambu/Prusa-Druckers 5.000-10.000 h, einfacher Drucker 3.000-5.000 h. Leistung im Betrieb meist 80-150 W (Datenblatt-Maximalwert liegt höher, da Heizphasen kurz sind). Verschleiß (Düsen, Bett, Riemen, Lager) 5-15 Cent pro Stunde. Ein Strommessgerät zwischen Steckdose und Drucker liefert den genauesten Wert.</p>
        <p>Änderungen an Druckern oder Sätzen wirken auf die Kalkulation in der Produktverwaltung sofort. Bereits erstellte Rechnungen und Angebote ändern sich dadurch <strong>nicht</strong> - dort steht der damals eingetragene Preis.</p>
      </InfoBox>

      <InfoBox title="Live-Anbindung für Bambu Lab (Fortschritt, Temperaturen, AMS, Kamera)">
        <p>Bei Bambu-Lab-Druckern kann die Software im <strong>LAN-Modus</strong> den Zustand direkt vom Drucker lesen: Fortschritt und Restzeit, Temperaturen, die Spulen im AMS (Material, Farbe, Füllstand), ein Kamerabild und eine Live-Ansicht (P1P, P1S, A1, A1 mini, X1C, X1E, P2S, H2). Aus den erkannten Drucken entstehen außerdem ein <strong>Druckverlauf und die tatsächlichen Betriebsstunden</strong> je Drucker.</p>
        <p><strong>Nur lesend:</strong> Die Software sendet nie Befehle (Pause, Stopp, Start) an den Drucker.</p>
        <p><strong>Einrichten (am Drucker):</strong> Einstellungen → WLAN/Netzwerk: <em>LAN-Modus</em> aktivieren; dort stehen die <strong>IP-Adresse</strong> und der <strong>Zugangscode</strong> (8 Zeichen). Die <strong>Seriennummer</strong> finden Sie unter Einstellungen → Gerät (oder auf dem Aufkleber). Tragen Sie die drei Werte im Formular unten ein und klicken Sie "Verbindung testen".</p>
        <p><strong>Voraussetzungen:</strong> Der Server, auf dem diese Software läuft, muss den Drucker im Netzwerk erreichen (typisch: gleiches Heimnetz). Läuft die Software in der Cloud oder bei einem Hoster, ist das nicht der Fall - dann ist ein VPN (z.B. Tailscale) nötig. Der Drucker sollte eine feste IP-Adresse haben (im Router reservieren). Je nach Modell und Firmware kann der LAN-Modus die Verbindung zur Bambu-Cloud (Handy-App von unterwegs) einschränken; Bambu ändert dieses Verhalten gelegentlich per Firmware. Bitte beim ersten Einrichten ausprobieren.</p>
        <p>Der Zugangscode wird verschlüsselt gespeichert und nie wieder angezeigt. Einrichten dürfen nur Administratoren.</p>
      </InfoBox>

      {showForm && (
        <form onSubmit={submit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-5 space-y-4">
          <h2 className="font-medium">{editingId ? "Drucker bearbeiten" : "Neuer Drucker"}</h2>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <label className="block text-sm">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Bambu Lab P1S" className={inputClass} autoFocus />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              Anschaffungspreis (€)
              <input type="number" min="0" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} />
              <span className="block text-xs text-slate-500 mt-0.5">Was der Drucker gekostet hat (inkl. Zubehör, das dazugehört).</span>
            </label>
            <label className="block text-sm">
              Lebensdauer (Druckstunden)
              <input type="number" min="1" step="any" value={form.lifetime} onChange={(e) => setForm({ ...form, lifetime: e.target.value })} className={inputClass} />
              <span className="block text-xs text-slate-500 mt-0.5">Wie viele Stunden der Drucker voraussichtlich läuft, bis er ersetzt wird. Preis ÷ Stunden = Abschreibung pro Stunde.</span>
            </label>
            <label className="block text-sm">
              Schon gelaufene Stunden beim Kauf
              <input type="number" min="0" step="any" value={form.usedBefore} onChange={(e) => setForm({ ...form, usedBefore: e.target.value })} className={inputClass} />
              <span className="block text-xs text-slate-500 mt-0.5">Bei einem Gebrauchtdrucker: Betriebsstunden, die er beim Kauf schon hatte (steht am Drucker unter Einstellungen/Geräteinfo oder beim Verkäufer). Die Abschreibung rechnet dann Preis ÷ (Lebensdauer minus diese Stunden). Bei neu: 0.</span>
            </label>
            <label className="block text-sm">
              Leistung (Watt)
              <input type="number" min="0" step="any" value={form.watts} onChange={(e) => setForm({ ...form, watts: e.target.value })} className={inputClass} />
              <span className="block text-xs text-slate-500 mt-0.5">Durchschnittliche Leistungsaufnahme beim Drucken (Datenblatt oder Strommessgerät). Typisch 100-200 W.</span>
            </label>
            <label className="block text-sm">
              Verschleiß &amp; Wartung (€ pro Druckstunde)
              <input type="number" min="0" step="any" value={form.wear} onChange={(e) => setForm({ ...form, wear: e.target.value })} className={inputClass} />
              <span className="block text-xs text-slate-500 mt-0.5">Düse, Druckbett, Riemen, Lager, Schmiermittel. Faustwert: 5-15 Cent pro Stunde.</span>
            </label>
          </div>
          <label className="block text-sm">
            Notiz (optional)
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} />
          </label>
          {isAdmin && (
            <fieldset className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <legend className="px-1 text-sm font-medium">Live-Anbindung (optional)</legend>
              <label className="block text-sm">
                Anbindung
                <select value={form.connectionType} onChange={(e) => setForm({ ...form, connectionType: e.target.value as "NONE" | "BAMBU_LAN" })} className={inputClass}>
                  <option value="NONE">Keine</option>
                  <option value="BAMBU_LAN">Bambu Lab im LAN-Modus</option>
                </select>
              </label>
              {form.connectionType === "BAMBU_LAN" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block text-sm">
                      Modell
                      <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputClass}>
                        {MODELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                      <span className="block text-xs text-slate-500 mt-0.5">{["X1C", "X1E", "P2S", "H2D", "H2S"].includes(form.model) ? "Kamera/Live-Ansicht möglich - am Drucker unter Einstellungen → Netzwerk den \"LAN-Modus-Liveview\" einschalten." : CAMERA_MODELS.includes(form.model) ? "Für dieses Modell sind Kamerabild und Live-Ansicht möglich." : "Für dieses Modell gibt es keine Kamera-Anbindung."}</span>
                    </label>
                    <label className="block text-sm">
                      IP-Adresse des Druckers
                      <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="z.B. 192.168.1.50" className={inputClass} inputMode="decimal" />
                      <span className="block text-xs text-slate-500 mt-0.5">Nur Adressen aus dem eigenen Netz (192.168.x.x, 10.x.x.x ...).</span>
                    </label>
                    <label className="block text-sm">
                      Seriennummer
                      <input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} placeholder="z.B. 01P00A123456789" className={inputClass} autoCapitalize="characters" />
                    </label>
                    <label className="block text-sm">
                      Zugangscode (8 Zeichen)
                      <input type="password" autoComplete="new-password" value={form.accessCode} onChange={(e) => setForm({ ...form, accessCode: e.target.value })} placeholder={editingId && printers.find((x) => x.id === editingId)?.hasAccessCode ? "gespeichert - leer lassen zum Behalten" : "aus den Netzwerk-Einstellungen am Drucker"} className={inputClass} />
                      {editingId && printers.find((x) => x.id === editingId)?.hasAccessCode && (
                        <label className="flex items-center gap-2 text-xs text-slate-500 mt-1"><input type="checkbox" checked={clearCode} onChange={(e) => setClearCode(e.target.checked)} />gespeicherten Zugangscode löschen</label>
                      )}
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.liveEnabled} onChange={(e) => setForm({ ...form, liveEnabled: e.target.checked })} />
                    Live-Verbindung aktiv (Status anzeigen, Druckverlauf erfassen)
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={testConnection} disabled={testing || !form.host.trim() || !form.serial.trim() || (!form.accessCode.trim() && !(editingId && printers.find((x) => x.id === editingId)?.hasAccessCode))} className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                      {testing ? "Testet ... (bis 10 s)" : "Verbindung testen"}
                    </button>
                    {testResult && <span className={`text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>{testResult.text}</span>}
                  </div>
                </>
              )}
            </fieldset>
          )}
          <div className="text-sm rounded bg-slate-50 dark:bg-slate-900/40 p-3 space-y-1">
            <div className="font-medium">Kosten pro Druckstunde (Vorschau)</div>
            <div className="flex justify-between"><span className="text-slate-500">Strom ({form.watts || 0} W × {electricity} ct/kWh)</span><span>{money(live.electricity, 3)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Abschreibung</span><span>{money(live.depreciation, 3)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Verschleiß &amp; Wartung</span><span>{money(live.wear, 3)}</span></div>
            <div className="flex justify-between font-medium border-t border-slate-200 dark:border-slate-700 pt-1"><span>Summe pro Stunde</span><span>{money(live.total, 3)}</span></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded disabled:opacity-60">{busy ? "Wird gespeichert ..." : "Speichern"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        {printers.map((p) => {
          const h = printerHourlyCost(p, electricity);
          return (
            <div key={p.id} className="px-4 py-3 text-sm flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-80">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-slate-500">
                  {money(p.purchasePriceCents, 0)} · {p.lifetimeHours} h Lebensdauer{p.usedHoursBefore ? ` (davon ${p.usedHoursBefore} h schon beim Kauf gelaufen)` : ""} · {p.powerWatts} W · Verschleiß {money(p.wearCentsPerHour, 3)}/h
                </div>
                <div className="text-xs text-slate-500">
                  = <strong>{money(h.total, 3)} pro Druckstunde</strong> (Strom {money(h.electricity, 3)}, Abschreibung {money(h.depreciation, 3)}, Verschleiß {money(h.wear, 3)})
                  {p._count?.products ? ` · von ${p._count.products} Produkt(en) genutzt` : ""}
                </div>
                {p.notes && <div className="text-xs text-amber-600 dark:text-amber-400">{p.notes}</div>}
                {p.connectionType === "BAMBU_LAN" && p.liveEnabled && liveMap[p.id] && (
                  <PrinterLiveCard printerId={p.id} status={liveMap[p.id]} model={p.model} trackedMinutes={p.trackedMinutes} lifetimeHours={p.lifetimeHours} usedHoursBefore={p.usedHoursBefore ?? 0} />
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => startEdit(p)} className="text-brand hover:underline">Bearbeiten</button>
                <button onClick={() => remove(p)} className="text-red-600 hover:underline">Entfernen</button>
              </div>
            </div>
          );
        })}
        {printers.length === 0 && <div className="p-6 text-center text-slate-500 text-sm">Noch kein Drucker angelegt.</div>}
      </div>
    </div>
  );
}
