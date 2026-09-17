import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { InfoBox } from "../components/InfoBox";
import { MobileCard, MobileField } from "../components/MobileCard";
import { useAuthStore } from "../store/authStore";

interface Entry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  metadata: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

const LIMIT = 50;
const ROW_COLUMNS = "150px 1fr 130px 160px 110px";
const formatDateTime = (iso: string) => new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));

export default function AuditLog() {
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [meta, setMeta] = useState<{ actions: string[]; entityTypes: string[] }>({ actions: [], entityTypes: [] });

  useEffect(() => {
    api.get("/audit-logs/meta").then((res) => setMeta(res.data));
  }, []);

  function load() {
    setLoading(true);
    api
      .get("/audit-logs", { params: { limit: LIMIT, offset, entityType: entityType || undefined, action: action || undefined } })
      .then((res) => {
        setEntries(res.data.entries);
        setTotal(res.data.total);
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, [offset, entityType, action]);

  if (!isAdmin) return <Navigate to="/" replace />;

  function formatMetadata(m: string | null) {
    if (!m) return "-";
    try {
      const obj = JSON.parse(m);
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ");
    } catch {
      return m;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Audit-Log</h1>
      <InfoBox title="Wozu dient das Audit-Log?">
        <p>Protokolliert jede schreibende Aktion (Anlegen, Ändern, Login, Statuswechsel usw.) unveränderlich - wer hat wann was gemacht. Erfüllt die Rechenschaftspflicht nach Art. 5 Abs. 2 DSGVO. Nur für Admins einsehbar, da auch Handlungen anderer Benutzer inkl. IP-Adresse sichtbar sind.</p>
      </InfoBox>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setOffset(0); }} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm">
          <option value="">Alle Entitätstypen</option>
          {meta.entityTypes.map((et) => (
            <option key={et} value={et}>{et}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm">
          <option value="">Alle Aktionen</option>
          {meta.actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Lädt...</p>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
          <div className="hidden md:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
            <span>Zeitpunkt</span>
            <span>Aktion / Details</span>
            <span>Entität</span>
            <span>Benutzer</span>
            <span>IP-Adresse</span>
          </div>
          {entries.map((e) => (
            <div key={e.id}>
              {/* Desktop */}
              <div className="hidden md:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                <span className="text-slate-500 text-xs">{formatDateTime(e.createdAt)}</span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.action}</div>
                  <div className="text-xs text-slate-400 truncate">{formatMetadata(e.metadata)}</div>
                </div>
                <span className="text-slate-500 truncate">{e.entityType}</span>
                <span className="truncate" title={e.user?.email}>{e.user?.name ?? "-"}</span>
                <span className="text-slate-400 text-xs">{e.ipAddress ?? "-"}</span>
              </div>
              {/* Mobile */}
              <MobileCard title={e.action} subtitle={formatDateTime(e.createdAt)}>
                <MobileField label="Entität" value={e.entityType} />
                <MobileField label="Benutzer" value={e.user?.name ?? "-"} />
                <MobileField label="IP-Adresse" value={e.ipAddress ?? "-"} />
                {e.metadata && <MobileField label="Details" value={formatMetadata(e.metadata)} />}
              </MobileCard>
            </div>
          ))}
          {entries.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Einträge gefunden.</p>}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 text-sm">
        <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 disabled:opacity-50">
          Zurück
        </button>
        <span className="text-slate-500">{total === 0 ? 0 : offset + 1}–{Math.min(offset + LIMIT, total)} von {total}</span>
        <button disabled={offset + LIMIT >= total} onClick={() => setOffset((o) => o + LIMIT)} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700 disabled:opacity-50">
          Weiter
        </button>
      </div>
    </div>
  );
}
