import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { HELP, HELP_CATEGORIES, type HelpTopic } from "../lib/helpContent";

/** Hilfe: alle Themen durchsuchbar, nach Bereichen gegliedert. /help#thema springt direkt zu einem Thema (Link aus den "?" im Programm). */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

export default function Help() {
  const location = useLocation();
  const [q, setQ] = useState("");
  const target = location.hash.replace("#", "");

  const hits = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (words.length === 0) return HELP;
    return HELP.filter((t) => {
      const hay = norm(`${t.title} ${t.short} ${t.body.join(" ")} ${t.keywords ?? ""} ${t.category}`);
      return words.every((w) => hay.includes(w));
    });
  }, [q]);

  // zu dem Thema springen, auf das der Link zeigt
  useEffect(() => {
    if (!target) return;
    const t = setTimeout(() => document.getElementById(`help-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => clearTimeout(t);
  }, [target]);

  const grouped = HELP_CATEGORIES.map((c) => ({ category: c, topics: hits.filter((t) => t.category === c) })).filter((g) => g.topics.length > 0);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Hilfe</h1>
      <p className="text-sm text-slate-500 mb-4">
        Überall im Programm erklärt dir ein <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border border-slate-400 text-[11px] font-semibold align-middle">?</span> die Funktion in einem Satz. Hier steht alles ausführlicher und durchsuchbar.
      </p>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Suchen, z.B. Rechnung, Zukaufteile, Bankabgleich ..."
        aria-label="Hilfe durchsuchen"
        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 mb-5"
      />

      {q.trim() === "" && (
        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Themen">
          {HELP_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => document.getElementById(`cat-${c}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="px-3 py-1.5 rounded-full text-sm bg-slate-100 dark:bg-slate-800 hover:text-brand">{c}</button>
          ))}
        </nav>
      )}

      {grouped.length === 0 && <p className="text-slate-500">Dazu gibt es kein Hilfethema. Versuch ein anderes Wort, zum Beispiel Rechnung, Material oder Drucker.</p>}

      {grouped.map((g) => (
        <section key={g.category} id={`cat-${g.category}`} className="mb-8 scroll-mt-24">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">{g.category}</h2>
          <div className="space-y-3">
            {g.topics.map((t) => <Topic key={t.id} t={t} active={t.id === target} />)}
          </div>
        </section>
      ))}

      <p className="text-xs text-slate-500 mt-8">
        Etwas fehlt oder ist unklar? Sag Bescheid, dann wird das Thema ergänzt. Ob alles angebunden ist, siehst du unter <Link to="/settings?tab=verbindungen" className="text-brand hover:underline">Einstellungen → Verbindungen</Link>.
      </p>
    </div>
  );
}

function Topic({ t, active }: { t: HelpTopic; active: boolean }) {
  return (
    <article id={`help-${t.id}`} className={`scroll-mt-24 rounded-xl bg-white dark:bg-slate-800 shadow p-4 ${active ? "ring-2 ring-brand" : ""}`}>
      <h3 className="font-medium mb-1">{t.title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{t.short}</p>
      <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
        {t.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </article>
  );
}
