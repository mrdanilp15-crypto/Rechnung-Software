import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { InfoBox } from "../components/InfoBox";
import { OrderSelect } from "../components/OrderSelect";
import { PdfLink } from "../components/PdfLink";
import { useToast } from "../components/Toast";

import { HelpTip } from "../components/HelpTip";
/** Zeiterfassung: Start/Stopp oder manuell, optional einem Auftrag zugeordnet. Stundenzettel als PDF, CSV für den Steuerberater. */

interface Entry {
  id: string;
  userId: string;
  userName: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  activity: string;
  note: string | null;
  order: { id: string; number: string; customerName: string } | null;
}
interface Meta {
  activities: { key: string; label: string }[];
  users: { id: string; name: string }[];
  seesAll: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthTitle = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

/** "1:30", "1,5" (Stunden) oder "90" mit Zusatz min - gibt Minuten zurück, 0 bei ungültiger Eingabe */
export function parseDuration(text: string): number {
  const t = text.trim().toLowerCase().replace(",", ".");
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+(?:\.\d+)?)\s*min$/.exec(t);
  if (m) return Math.round(Number(m[1]));
  m = /^(\d+(?:\.\d+)?)\s*h?$/.exec(t);
  if (m) return Math.round(Number(m[1]) * 60);
  return 0;
}

const input = "px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

export default function TimeTracking() {
  const showToast = useToast();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [userId, setUserId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [byActivity, setByActivity] = useState<{ activity: string; minutes: number }[]>([]);
  const [running, setRunning] = useState<Entry | null>(null);
  const [now, setNow] = useState(Date.now());
  const [start, setStart] = useState({ activity: "PRODUKTION", orderId: "", note: "" });
  const [manual, setManual] = useState({ date: localDay(new Date().toISOString()), time: "08:00", duration: "", activity: "NACHARBEIT", orderId: "", note: "" });
  const [showManual, setShowManual] = useState(false);
  const [editing, setEditing] = useState<{ id: string; duration: string; activity: string; note: string; orderId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activityName = useMemo(() => Object.fromEntries((meta?.activities ?? []).map((a) => [a.key, a.label.split(" (")[0]])), [meta]);
  const fail = (e: any, fallback: string) => setError(e?.response?.data?.error ?? fallback);

  const load = useCallback(() => {
    api.get("/time", { params: { month, userId: userId || undefined } }).then((r) => {
      setEntries(r.data.entries);
      setTotal(r.data.totalMinutes);
      setByActivity(r.data.activities);
    }).catch((e) => fail(e, "Zeiten konnten nicht geladen werden."));
  }, [month, userId]);
  const loadRunning = useCallback(() => {
    api.get("/time/running").then((r) => { setRunning(r.data); window.dispatchEvent(new Event("timer-changed")); }).catch(() => undefined);
  }, []);

  useEffect(() => { api.get("/time/meta").then((r) => setMeta(r.data)).catch(() => undefined); loadRunning(); }, [loadRunning]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function startTimer() {
    setError(null);
    try {
      await api.post("/time/start", { activity: start.activity, note: start.note || null, orderConfirmationId: start.orderId || null });
      setStart((s) => ({ ...s, note: "" }));
      loadRunning();
    } catch (e) { fail(e, "Start hat nicht geklappt."); }
  }
  async function stopTimer() {
    setError(null);
    try {
      await api.post("/time/stop");
      setRunning(null);
      load();
      showToast("Zeit gespeichert", "success");
    } catch (e) { fail(e, "Stopp hat nicht geklappt."); }
  }
  async function addManual() {
    setError(null);
    const minutes = parseDuration(manual.duration);
    if (minutes <= 0) return setError('Bitte eine Dauer angeben, z.B. "1:30", "1,5" oder "90 min".');
    try {
      await api.post("/time", { startedAt: new Date(`${manual.date}T${manual.time || "08:00"}`).toISOString(), minutes, activity: manual.activity, note: manual.note || null, orderConfirmationId: manual.orderId || null });
      setManual((m) => ({ ...m, duration: "", note: "" }));
      setShowManual(false);
      load();
      showToast("Zeit eingetragen", "success");
    } catch (e) { fail(e, "Eintragen hat nicht geklappt."); }
  }
  async function saveEdit() {
    if (!editing) return;
    setError(null);
    const minutes = parseDuration(editing.duration);
    if (minutes <= 0) return setError("Bitte eine gültige Dauer angeben.");
    try {
      await api.patch(`/time/${editing.id}`, { minutes, activity: editing.activity, note: editing.note || null, orderConfirmationId: editing.orderId || null });
      setEditing(null);
      load();
    } catch (e) { fail(e, "Speichern hat nicht geklappt."); }
  }
  async function remove(e: Entry) {
    if (!window.confirm(`Eintrag vom ${dayLabel(e.startedAt)} (${hm(e.minutes ?? 0)}) löschen?`)) return;
    try { await api.delete(`/time/${e.id}`); load(); } catch (err) { fail(err, "Löschen hat nicht geklappt."); }
  }

  const days = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) map.set(localDay(e.startedAt), [...(map.get(localDay(e.startedAt)) ?? []), e]);
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [entries]);

  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000)) : 0;
  const query = `month=${month}${userId ? `&userId=${userId}` : ""}`;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Zeiterfassung<HelpTip topic="time" className="ml-2" /></h1>
      <p className="text-sm text-slate-500 mb-4">Arbeitszeit mit Start und Stopp oder von Hand eintragen, optional einem Auftrag zuordnen.</p>

      <InfoBox title="So funktioniert die Zeiterfassung">
        <p><strong>Start</strong> drücken, arbeiten, <strong>Stopp</strong> drücken - oder nachträglich über "Zeit nachtragen" eintragen. Wählst du einen <strong>Auftrag</strong>, fließt die Zeit dort in die Ist-Kosten ein (Produktion → Kosten, mit dem Arbeitsstundensatz aus den Einstellungen).</p>
        <p>Jeder erfasst seine eigene Zeit. Administratoren und Buchhaltung sehen alle Benutzer, laden den <strong>Stundenzettel</strong> als PDF (mit Unterschriftszeilen) und die <strong>CSV</strong> für den Steuerberater. Monate gelten nach deutscher Zeit. Die Zeiterfassung ist eine Hilfe für Nachweise und Kosten; die Lohnabrechnung selbst macht der Steuerberater oder eine Lohnsoftware.</p>
      </InfoBox>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
        {running ? (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-3xl font-mono tabular-nums">{pad(Math.floor(elapsed / 3600))}:{pad(Math.floor((elapsed % 3600) / 60))}:{pad(elapsed % 60)}</div>
              <div className="text-xs text-slate-500">{activityName[running.activity] ?? running.activity}{running.order ? ` · ${running.order.number}` : ""}{running.note ? ` · ${running.note}` : ""} · seit {clock(running.startedAt)}</div>
            </div>
            <button onClick={stopTimer} className="ml-auto px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium">Stopp</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <label className="block text-sm">Tätigkeit
              <select value={start.activity} onChange={(e) => setStart({ ...start, activity: e.target.value })} className={`${input} w-full mt-1`}>
                {meta?.activities.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">Auftrag (optional)
              <OrderSelect value={start.orderId} onChange={(id) => setStart({ ...start, orderId: id })} className={`${input} w-full mt-1`} emptyLabel="Kein Auftrag" />
            </label>
            <button onClick={startTimer} className="px-5 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-medium">Start</button>
            <input value={start.note} onChange={(e) => setStart({ ...start, note: e.target.value })} placeholder="Notiz (optional)" className={`${input} sm:col-span-3`} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700" aria-label="Vorheriger Monat">‹</button>
        <span className="font-medium w-40 text-center capitalize">{monthTitle(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700" aria-label="Nächster Monat">›</button>
        {meta?.seesAll && (
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={input}>
            <option value="">Alle Benutzer</option>
            {meta.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <button onClick={() => setShowManual((v) => !v)} className="ml-auto px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 text-sm">{showManual ? "Abbrechen" : "Zeit nachtragen"}</button>
      </div>

      {showManual && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="block text-sm">Datum<input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} className={`${input} w-full mt-1`} /></label>
          <label className="block text-sm">Beginn<input type="time" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} className={`${input} w-full mt-1`} /></label>
          <label className="block text-sm">Dauer<input value={manual.duration} onChange={(e) => setManual({ ...manual, duration: e.target.value })} placeholder="1:30" className={`${input} w-full mt-1`} /></label>
          <label className="block text-sm">Tätigkeit
            <select value={manual.activity} onChange={(e) => setManual({ ...manual, activity: e.target.value })} className={`${input} w-full mt-1`}>{meta?.activities.map((a) => <option key={a.key} value={a.key}>{a.label.split(" (")[0]}</option>)}</select>
          </label>
          <label className="block text-sm col-span-2">Auftrag (optional)<OrderSelect value={manual.orderId} onChange={(id) => setManual({ ...manual, orderId: id })} className={`${input} w-full mt-1`} emptyLabel="Kein Auftrag" /></label>
          <label className="block text-sm col-span-2">Notiz<input value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} className={`${input} w-full mt-1`} /></label>
          <div className="col-span-2 sm:col-span-4"><button onClick={addManual} className="px-4 py-2 rounded bg-brand text-white text-sm">Eintragen</button> <span className="text-xs text-slate-500 ml-2">Dauer als "1:30", "1,5" (Stunden) oder "90 min".</span></div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
        <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 dark:border-slate-700">
          <span className="font-medium">Summe {hm(total)} h</span>
          <span className="text-xs text-slate-500">{byActivity.map((a) => `${activityName[a.activity] ?? a.activity} ${hm(a.minutes)}`).join(" · ")}</span>
          <span className="ml-auto flex gap-3 text-sm">
            <PdfLink url={`/time/timesheet.pdf?${query}`} filename={`stundenzettel-${month}.pdf`} className="text-brand hover:underline">Stundenzettel (PDF)</PdfLink>
            {meta?.seesAll && <PdfLink url={`/time/export.csv?${query}`} filename={`zeiten-${month}.csv`} download className="text-brand hover:underline">CSV-Export</PdfLink>}
          </span>
        </div>
        {days.length === 0 && <p className="px-4 py-6 text-center text-slate-500 text-sm">In diesem Monat sind keine Zeiten erfasst.</p>}
        {days.map(([day, list]) => (
          <div key={day} className="border-b border-slate-100 dark:border-slate-700 last:border-0">
            <div className="px-4 pt-2 text-xs font-medium text-slate-500 flex justify-between"><span>{dayLabel(list[0].startedAt)}</span><span>{hm(list.reduce((a, e) => a + (e.minutes ?? 0), 0))} h</span></div>
            <ul className="px-4 pb-2 text-sm">
              {list.map((e) => (
                <li key={e.id} className="py-1.5">
                  {editing?.id === e.id ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input value={editing.duration} onChange={(ev) => setEditing({ ...editing, duration: ev.target.value })} className={input} aria-label="Dauer" />
                      <select value={editing.activity} onChange={(ev) => setEditing({ ...editing, activity: ev.target.value })} className={input}>{meta?.activities.map((a) => <option key={a.key} value={a.key}>{a.label.split(" (")[0]}</option>)}</select>
                      <OrderSelect value={editing.orderId} current={e.order} onChange={(id) => setEditing({ ...editing, orderId: id })} className={input} emptyLabel="Kein Auftrag" />
                      <input value={editing.note} onChange={(ev) => setEditing({ ...editing, note: ev.target.value })} placeholder="Notiz" className={input} />
                      <div className="col-span-2 sm:col-span-4 flex gap-2"><button onClick={saveEdit} className="px-3 py-1.5 rounded bg-brand text-white text-xs">Speichern</button><button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 text-xs">Abbrechen</button></div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono tabular-nums w-32 whitespace-nowrap text-slate-600 dark:text-slate-300">{clock(e.startedAt)}{e.endedAt ? ` - ${clock(e.endedAt)}` : " läuft"}</span>
                      <span className="font-medium">{e.endedAt ? `${hm(e.minutes ?? 0)} h` : ""}</span>
                      <span>{activityName[e.activity] ?? e.activity}</span>
                      {e.order && <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{e.order.number}</span>}
                      {meta?.seesAll && <span className="text-xs text-slate-500">{e.userName}</span>}
                      {e.note && <span className="text-xs text-slate-500">{e.note}</span>}
                      {e.endedAt && (
                        <span className="ml-auto flex gap-3 text-xs">
                          <button onClick={() => setEditing({ id: e.id, duration: hm(e.minutes ?? 0), activity: e.activity, note: e.note ?? "", orderId: e.order?.id ?? "" })} className="text-brand hover:underline">Ändern</button>
                          <button onClick={() => remove(e)} className="text-red-600 hover:underline">Löschen</button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
