import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { LineItem, PricedItemsEditor, TotalsSummary, createEmptyLineItem, withClientKeys } from "../components/PricedItemsEditor";
import { DocumentTexts } from "../components/DocumentTexts";
import { CustomerPicker, PickerCustomer } from "../components/CustomerPicker";

export type DocKind = "invoice" | "quote" | "confirmation" | "deliveryNote";

type DateField = "issueDate" | "dueDate" | "deliveryDate" | "validUntil" | "expectedDeliveryDate";

interface KindConfig {
  base: string; // API-Pfad
  routeBase: string; // Frontend-Pfad
  newTitle: string;
  editTitle: string;
  prices: boolean;
  dates: { field: DateField; label: string }[];
  datesHint?: string;
  textKeys: [string, string]; // Firmeneinstellungen: Standard-Begrüßung / -Schlusstext
  finalizeLabel: string;
  finalizeConfirm: string;
  notesLabel: string;
}

const CONFIG: Record<DocKind, KindConfig> = {
  invoice: {
    base: "/invoices",
    routeBase: "/invoices",
    newTitle: "Neue Rechnung",
    editTitle: "Rechnung bearbeiten",
    prices: true,
    dates: [
      { field: "issueDate", label: "Rechnungsdatum" },
      { field: "dueDate", label: "Fällig am" },
      { field: "deliveryDate", label: "Leistungsdatum" },
    ],
    datesHint: "Leer = heute bzw. Zahlungsziel aus den Einstellungen; ohne Leistungsdatum gilt das Rechnungsdatum (§14 Abs. 4 Nr. 6 UStG).",
    textKeys: ["invoiceIntroText", "invoiceClosingText"],
    finalizeLabel: "Fertigstellen",
    finalizeConfirm: "Rechnung fertigstellen?\n\nEs wird die fortlaufende Rechnungsnummer vergeben. Danach ist die Rechnung nicht mehr änderbar - Korrekturen sind nur noch per Storno möglich.",
    notesLabel: "Anmerkung auf der Rechnung (optional)",
  },
  quote: {
    base: "/quotes",
    routeBase: "/quotes",
    newTitle: "Neues Angebot",
    editTitle: "Angebot bearbeiten",
    prices: true,
    dates: [
      { field: "issueDate", label: "Angebotsdatum" },
      { field: "validUntil", label: "Gültig bis" },
    ],
    datesHint: "Leer = heute bzw. 30 Tage Gültigkeit.",
    textKeys: ["quoteIntroText", "quoteClosingText"],
    finalizeLabel: "Fertigstellen",
    finalizeConfirm: "Angebot fertigstellen? Es wird danach als versendet geführt und das PDF trägt kein Entwurfs-Wasserzeichen mehr.",
    notesLabel: "Anmerkung auf dem Angebot (optional)",
  },
  confirmation: {
    base: "/order-confirmations",
    routeBase: "/order-confirmations",
    newTitle: "Neue Auftragsbestätigung",
    editTitle: "Auftragsbestätigung bearbeiten",
    prices: true,
    dates: [
      { field: "issueDate", label: "Datum" },
      { field: "expectedDeliveryDate", label: "Voraussichtliche Lieferung" },
    ],
    textKeys: ["orderConfirmationIntroText", "orderConfirmationClosingText"],
    finalizeLabel: "Fertigstellen",
    finalizeConfirm: "Auftragsbestätigung fertigstellen? Das PDF trägt danach kein Entwurfs-Wasserzeichen mehr.",
    notesLabel: "Anmerkung auf der Auftragsbestätigung (optional)",
  },
  deliveryNote: {
    base: "/delivery-notes",
    routeBase: "/delivery-notes",
    newTitle: "Neuer Lieferschein",
    editTitle: "Lieferschein bearbeiten",
    prices: false,
    dates: [{ field: "deliveryDate", label: "Lieferdatum" }],
    textKeys: ["deliveryNoteIntroText", "deliveryNoteClosingText"],
    finalizeLabel: "Fertigstellen",
    finalizeConfirm: "Lieferschein fertigstellen? Das PDF trägt danach kein Entwurfs-Wasserzeichen mehr.",
    notesLabel: "Anmerkung auf dem Lieferschein (optional)",
  },
};

interface Product {
  id: string;
  name: string;
  unitPriceCents: number;
  vatRateBps: number;
  unit: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const fieldClass = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
const timeFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * Gemeinsamer Editor für Rechnung, Angebot, Auftragsbestätigung und Lieferschein: Kunde und Produkte lassen
 * sich direkt hier anlegen, der Beleg speichert sich beim Tippen automatisch als Entwurf (sobald Kunde +
 * eine vollständige Position vorhanden sind), rechts zeigt eine Live-Vorschau das echte PDF im gewählten
 * Belegdesign. Erst "Fertigstellen" macht aus dem Entwurf den ausgestellten Beleg (bei Rechnungen: vergibt
 * die fortlaufende Rechnungsnummer und sperrt den Beleg, GoBD).
 */
export default function DocumentEditor({ kind }: { kind: DocKind }) {
  const cfg = CONFIG[kind];
  const navigate = useNavigate();
  const { id: routeId } = useParams(); // vorhanden = vorhandenen Entwurf bearbeiten
  const draftIdRef = useRef<string | undefined>(routeId);
  const [draftId, setDraftId] = useState<string | undefined>(routeId);

  const [customers, setCustomers] = useState<PickerCustomer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [dates, setDates] = useState<Partial<Record<DateField, string>>>({});
  const [notes, setNotes] = useState("");
  const [supplyType, setSupplyType] = useState<"GOODS" | "SERVICE">("GOODS");
  const [isSmallBusiness, setIsSmallBusiness] = useState(false);
  const [introText, setIntroText] = useState("");
  const [closingText, setClosingText] = useState("");
  const [items, setItems] = useState<LineItem[]>([createEmptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [savedKey, setSavedKey] = useState("");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [showPreviewMobile, setShowPreviewMobile] = useState(false);

  // ---------- Daten laden ----------
  useEffect(() => {
    api.get("/customers").then((res) => setCustomers(res.data));
    if (cfg.prices) api.get("/products").then((res) => setProducts(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const company = (await api.get("/companies/me")).data;
      if (cancelled) return;
      setIsSmallBusiness(!!company.isSmallBusiness);
      if (!routeId) {
        // Neuer Beleg: Standardtexte aus den Einstellungen vorbelegen
        setIntroText(company[cfg.textKeys[0]] ?? "");
        setClosingText(company[cfg.textKeys[1]] ?? "");
        setReady(true);
        return;
      }
      try {
        const doc = (await api.get(`${cfg.base}/${routeId}`)).data;
        if (cancelled) return;
        if (doc.status !== "DRAFT") {
          setError("Nur Entwürfe können bearbeitet werden.");
          return;
        }
        setCustomerId(doc.customerId);
        const loaded: Partial<Record<DateField, string>> = {};
        for (const d of cfg.dates) loaded[d.field] = doc[d.field] ? String(doc[d.field]).slice(0, 10) : "";
        setDates(loaded);
        setNotes(doc.notes ?? "");
        setIntroText(doc.introText ?? "");
        setClosingText(doc.closingText ?? "");
        if (kind === "invoice") setSupplyType(doc.supplyType === "SERVICE" ? "SERVICE" : "GOODS");
        setItems(
          withClientKeys(
            doc.items.map((it: any) => ({
              productId: it.productId ?? undefined,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPriceCents: it.unitPriceCents ?? 0,
              vatRateBps: it.vatRateBps ?? 0,
            }))
          )
        );
        setReady(true);
      } catch (err: any) {
        setError(err.response?.data?.error || "Beleg konnte nicht geladen werden.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // ---------- Formularstand ----------
  // Leere Zeilen (z.B. frisch hinzugefügt, noch nichts eingetragen) zählen nicht mit.
  const mapItem = (i: LineItem) => {
    const { _key, ...rest } = i;
    return cfg.prices ? rest : { description: rest.description, quantity: rest.quantity, unit: rest.unit };
  };
  const cleanItems = items.filter((i) => i.description.trim() || (cfg.prices && i.unitPriceCents > 0)).map(mapItem);
  const dateFields: Record<string, string | undefined> = {};
  for (const d of cfg.dates) dateFields[d.field] = dates[d.field] || undefined;
  const base = {
    customerId: customerId || undefined,
    ...dateFields,
    notes,
    ...(kind === "invoice" ? { supplyType } : {}),
    introText,
    closingText,
  };
  const payload = { ...base, items: cleanItems };
  const payloadKey = JSON.stringify(payload);
  const savable = !!customerId && cleanItems.length > 0 && cleanItems.every((i) => i.description.trim() && i.quantity > 0);
  const dirty = savable && payloadKey !== savedKey;

  const payloadRef = useRef(payload);
  const keyRef = useRef(payloadKey);
  const savableRef = useRef(savable);
  payloadRef.current = payload;
  keyRef.current = payloadKey;
  savableRef.current = savable;

  // ---------- Automatisch als Entwurf speichern ----------
  const chain = useRef<Promise<void>>(Promise.resolve());
  const savedKeyRef = useRef("");
  const baseline = useRef<string | null>(null);

  const saveNow = useCallback((): Promise<void> => {
    chain.current = chain.current.then(async () => {
      if (!savableRef.current || keyRef.current === savedKeyRef.current) return;
      const key = keyRef.current;
      const data = payloadRef.current;
      setSaveState("saving");
      try {
        if (!draftIdRef.current) {
          const res = await api.post(cfg.base, data);
          draftIdRef.current = res.data.id;
          setDraftId(res.data.id);
          // URL anpassen, damit ein Neuladen den Entwurf wieder öffnet - ohne die Seite neu aufzubauen
          window.history.replaceState(null, "", `${cfg.routeBase}/${res.data.id}/edit`);
        } else {
          await api.patch(`${cfg.base}/${draftIdRef.current}`, data);
        }
        savedKeyRef.current = key;
        setSavedKey(key);
        setSavedAt(new Date());
        setSaveState("saved");
        setError(null);
      } catch (err: any) {
        setSaveState("error");
        setError(err.response?.data?.error || "Automatisches Speichern ist fehlgeschlagen.");
      }
    });
    return chain.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (baseline.current === null) {
      // Ausgangsstand (frisch geladen bzw. leeres Formular) gilt nicht als Änderung
      baseline.current = payloadKey;
      if (routeId) {
        savedKeyRef.current = payloadKey;
        setSavedKey(payloadKey);
      }
      return;
    }
    if (!savable) return;
    const timer = setTimeout(() => void saveNow(), 1200);
    return () => clearTimeout(timer);
  }, [payloadKey, ready, savable, routeId, saveNow]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---------- Live-Vorschau ----------
  const previewKey = JSON.stringify({ ...base, items: items.map(mapItem) });
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await api.post(`${cfg.base}/preview-pdf`, JSON.parse(previewKey), { responseType: "blob", signal: controller.signal });
        const url = URL.createObjectURL(res.data);
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
        setPreviewError(false);
        setPreviewLoading(false);
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED") return;
        setPreviewError(true);
        setPreviewLoading(false);
      }
    }, 900);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, ready]);

  // ---------- Aktionen ----------
  async function closeAsDraft() {
    await saveNow();
    navigate("/documents");
  }

  async function discardDraft() {
    if (!draftIdRef.current) return navigate("/documents");
    if (!confirm("Diesen Entwurf wirklich verwerfen? Er wird gelöscht.")) return;
    try {
      await chain.current;
      await api.delete(`${cfg.base}/${draftIdRef.current}`);
      navigate("/documents");
    } catch (err: any) {
      setError(err.response?.data?.error || "Entwurf konnte nicht verworfen werden.");
    }
  }

  async function finalize() {
    setError(null);
    if (!customerId) return setError("Bitte zuerst einen Kunden wählen.");
    if (!savable) return setError("Bitte mindestens eine vollständige Position (Beschreibung und Menge) eintragen.");
    if (!confirm(cfg.finalizeConfirm)) return;
    setFinishing(true);
    try {
      await saveNow();
      const id = draftIdRef.current;
      if (!id) return;
      if (kind === "invoice") {
        await api.post(`${cfg.base}/${id}/send`);
        navigate(`/invoices/${id}`);
      } else if (kind === "quote") {
        await api.patch(`${cfg.base}/${id}/status`, { status: "SENT" });
        navigate("/documents");
      } else {
        await api.post(`${cfg.base}/${id}/finalize`);
        navigate("/documents");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Fertigstellen fehlgeschlagen.");
    } finally {
      setFinishing(false);
    }
  }

  if (!ready) return error ? <p className="text-red-600 text-sm">{error}</p> : <p>Wird geladen ...</p>;

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const isAbroad = kind === "invoice" && !!selectedCustomer?.country && selectedCustomer.country !== "DE";

  const saveLabel =
    saveState === "saving"
      ? "Speichert ..."
      : saveState === "error"
      ? "Speichern fehlgeschlagen"
      : dirty
      ? "Änderungen werden gleich gespeichert ..."
      : savedAt
      ? `Automatisch gespeichert, ${timeFormat.format(savedAt)}`
      : draftId
      ? "Entwurf geöffnet"
      : "Speichert automatisch, sobald Kunde und eine Position eingetragen sind";

  const preview = (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 overflow-hidden relative">
      {previewUrl ? (
        <iframe title="Vorschau" src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`} className="w-full block bg-white" style={{ height: "min(80vh, 900px)" }} />
      ) : (
        <div className="flex items-center justify-center text-sm text-slate-500" style={{ height: 320 }}>Vorschau wird erstellt ...</div>
      )}
      <div className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full bg-white/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
        {previewError ? "Vorschau nicht verfügbar" : previewLoading ? "Aktualisiert ..." : "Live-Vorschau"}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/documents" className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-sm" aria-label="Zurück zu den Belegen">← Belege</Link>
          <h1 className="text-xl font-semibold truncate">{draftId ? cfg.editTitle : cfg.newTitle}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">Entwurf</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${saveState === "error" ? "text-red-600" : "text-slate-500"}`}>{saveLabel}</span>
          {draftId && <button type="button" onClick={discardDraft} className="text-xs text-red-600 hover:underline px-1">Verwerfen</button>}
          <button type="button" onClick={closeAsDraft} className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
            Als Entwurf schließen
          </button>
          <button type="button" onClick={finalize} disabled={finishing} className="px-4 py-1.5 rounded bg-brand hover:bg-brand-dark text-white text-sm disabled:opacity-60">
            {finishing ? "Wird fertiggestellt ..." : cfg.finalizeLabel}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-5 items-start">
        <div className="min-w-0">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
            <div className="text-xs font-medium text-slate-500 mb-2">1 · Kunde</div>
            <CustomerPicker customers={customers} value={customerId} onSelect={setCustomerId} onCreated={(c) => setCustomers((list) => [c, ...list])} />
            {isAbroad && (
              <div className="mt-3">
                <label className="block text-sm mb-1">Art der Lieferung/Leistung (Auslandskunde)</label>
                <select value={supplyType} onChange={(e) => setSupplyType(e.target.value as "GOODS" | "SERVICE")} className={fieldClass}>
                  <option value="GOODS">Lieferung von Waren (z.B. gedruckte Teile)</option>
                  <option value="SERVICE">Sonstige Leistung (Dienstleistung, Konstruktion, ...)</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Entscheidet über die Umsatzsteuer: Waren an EU-Unternehmer mit USt-IdNr. = steuerfreie innergemeinschaftliche Lieferung, Dienstleistungen = Reverse-Charge, Waren in Drittländer = steuerfreie Ausfuhr.
                </p>
              </div>
            )}
          </div>

          <div className="text-xs font-medium text-slate-500 mb-2 px-1">2 · Positionen</div>
          <PricedItemsEditor
            items={items}
            onChange={setItems}
            products={products}
            compact
            showPrices={cfg.prices}
            onProductCreated={cfg.prices ? (p) => setProducts((list) => [p, ...list]) : undefined}
          />
          {cfg.prices && <TotalsSummary items={items} isSmallBusiness={isSmallBusiness} abroadHint={isAbroad} />}

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
            <div className="text-xs font-medium text-slate-500 mb-2">3 · Daten und Anmerkung</div>
            <div className={`grid grid-cols-1 gap-3 ${cfg.dates.length >= 3 ? "sm:grid-cols-3" : cfg.dates.length === 2 ? "sm:grid-cols-2" : ""}`}>
              {cfg.dates.map((d) => (
                <div key={d.field}>
                  <label className="block text-xs text-slate-500 mb-1">{d.label}</label>
                  <input type="date" value={dates[d.field] ?? ""} onChange={(e) => setDates((prev) => ({ ...prev, [d.field]: e.target.value }))} className={fieldClass} />
                </div>
              ))}
            </div>
            {cfg.datesHint && <p className="text-xs text-slate-500 mt-2">{cfg.datesHint}</p>}
            <label className="block text-xs text-slate-500 mt-3 mb-1">{cfg.notesLabel}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldClass} />
          </div>

          <details className="mb-4 group">
            <summary className="cursor-pointer text-sm text-brand px-1 mb-2 select-none">Begrüßung und Schlusstext anpassen</summary>
            <DocumentTexts introText={introText} closingText={closingText} onChange={(p) => { if (p.introText !== undefined) setIntroText(p.introText); if (p.closingText !== undefined) setClosingText(p.closingText); }} />
          </details>

          <div className="lg:hidden mb-4">
            <button type="button" onClick={() => setShowPreviewMobile((v) => !v)} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 text-sm">
              {showPreviewMobile ? "Vorschau ausblenden" : "Vorschau anzeigen"}
            </button>
            {showPreviewMobile && <div className="mt-3">{preview}</div>}
          </div>
        </div>

        <div className="hidden lg:block lg:sticky lg:top-4">{preview}</div>
      </div>
    </div>
  );
}
