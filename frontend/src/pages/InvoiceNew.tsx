import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { LineItem, PricedItemsEditor, TotalsSummary, createEmptyLineItem, withClientKeys } from "../components/PricedItemsEditor";
import { DocumentTexts } from "../components/DocumentTexts";
import { CustomerPicker, PickerCustomer } from "../components/CustomerPicker";

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
 * Rechnungseditor: Kunde und Produkte lassen sich direkt hier anlegen, der Beleg speichert sich beim
 * Tippen automatisch als Entwurf (sobald Kunde + eine vollständige Position vorhanden sind) und rechts
 * zeigt eine Live-Vorschau das echte PDF im gewählten Belegdesign. Erst "Fertigstellen" vergibt die
 * fortlaufende Rechnungsnummer und sperrt den Beleg (GoBD).
 */
export default function InvoiceNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: routeId } = useParams(); // vorhanden = vorhandenen Entwurf bearbeiten
  const draftIdRef = useRef<string | undefined>(routeId);
  const [draftId, setDraftId] = useState<string | undefined>(routeId);

  const [customers, setCustomers] = useState<PickerCustomer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [issueDate, setIssueDate] = useState("");
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
    api.get("/products").then((res) => setProducts(res.data));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const company = (await api.get("/companies/me")).data;
      if (cancelled) return;
      setIsSmallBusiness(!!company.isSmallBusiness);
      if (!routeId) {
        // Neue Rechnung: Standardtexte aus den Einstellungen vorbelegen
        setIntroText(company.invoiceIntroText ?? "");
        setClosingText(company.invoiceClosingText ?? "");
        setReady(true);
        return;
      }
      try {
        const inv = (await api.get(`/invoices/${routeId}`)).data;
        if (cancelled) return;
        if (inv.status !== "DRAFT") {
          setError("Nur Entwürfe können bearbeitet werden.");
          return;
        }
        setCustomerId(inv.customerId);
        setDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : "");
        setDeliveryDate(inv.deliveryDate ? inv.deliveryDate.slice(0, 10) : "");
        setIssueDate(inv.issueDate ? inv.issueDate.slice(0, 10) : "");
        setNotes(inv.notes ?? "");
        setIntroText(inv.introText ?? "");
        setClosingText(inv.closingText ?? "");
        setSupplyType(inv.supplyType === "SERVICE" ? "SERVICE" : "GOODS");
        setItems(
          withClientKeys(
            inv.items.map((it: any) => ({
              productId: it.productId ?? undefined,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPriceCents: it.unitPriceCents,
              vatRateBps: it.vatRateBps,
            }))
          )
        );
        setReady(true);
      } catch (err: any) {
        setError(err.response?.data?.error || t("common.error"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // ---------- Formularstand ----------
  // Leere Zeilen (z.B. frisch hinzugefügt, noch nichts eingetragen) zählen nicht mit.
  const cleanItems = items.filter((i) => i.description.trim() || i.unitPriceCents > 0).map(({ _key, ...rest }) => rest);
  const base = {
    customerId: customerId || undefined,
    issueDate: issueDate || undefined,
    dueDate: dueDate || undefined,
    deliveryDate: deliveryDate || undefined,
    notes,
    supplyType,
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
          const res = await api.post("/invoices", data);
          draftIdRef.current = res.data.id;
          setDraftId(res.data.id);
          // URL anpassen, damit ein Neuladen den Entwurf wieder öffnet - ohne die Seite neu aufzubauen
          window.history.replaceState(null, "", `/invoices/${res.data.id}/edit`);
        } else {
          await api.patch(`/invoices/${draftIdRef.current}`, data);
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
  const previewKey = JSON.stringify({ ...base, items: items.map(({ _key, ...rest }) => rest) });
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await api.post("/invoices/preview-pdf", JSON.parse(previewKey), { responseType: "blob", signal: controller.signal });
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
  }, [previewKey, ready]);

  // ---------- Aktionen ----------
  async function closeAsDraft() {
    await saveNow();
    navigate("/invoices");
  }

  async function discardDraft() {
    if (!draftIdRef.current) return navigate("/invoices");
    if (!confirm("Diesen Entwurf wirklich verwerfen? Er wird gelöscht (es wurde noch keine Rechnungsnummer vergeben).")) return;
    try {
      await chain.current;
      await api.delete(`/invoices/${draftIdRef.current}`);
      navigate("/invoices");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  async function finalize() {
    setError(null);
    if (!customerId) return setError("Bitte zuerst einen Kunden wählen.");
    if (!savable) return setError("Bitte mindestens eine vollständige Position (Beschreibung und Menge) eintragen.");
    if (!confirm("Rechnung fertigstellen?\n\nEs wird die fortlaufende Rechnungsnummer vergeben. Danach ist die Rechnung nicht mehr änderbar - Korrekturen sind nur noch per Storno möglich.")) return;
    setFinishing(true);
    try {
      await saveNow();
      const id = draftIdRef.current;
      if (!id) return;
      await api.post(`/invoices/${id}/send`);
      navigate(`/invoices/${id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    } finally {
      setFinishing(false);
    }
  }

  if (!ready) return error ? <p className="text-red-600 text-sm">{error}</p> : <p>{t("common.loading")}</p>;

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const isAbroad = !!selectedCustomer?.country && selectedCustomer.country !== "DE";

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
        <iframe title="Vorschau der Rechnung" src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`} className="w-full block bg-white" style={{ height: "min(80vh, 900px)" }} />
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
          <Link to="/invoices" className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-sm" aria-label="Zurück zu den Rechnungen">← Rechnungen</Link>
          <h1 className="text-xl font-semibold truncate">{draftId ? "Rechnung bearbeiten" : t("invoices.new")}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">Entwurf</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${saveState === "error" ? "text-red-600" : "text-slate-500"}`}>{saveLabel}</span>
          {draftId && (
            <button type="button" onClick={discardDraft} className="text-xs text-red-600 hover:underline px-1">Verwerfen</button>
          )}
          <button type="button" onClick={closeAsDraft} className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
            Als Entwurf schließen
          </button>
          <button type="button" onClick={finalize} disabled={finishing} className="px-4 py-1.5 rounded bg-brand hover:bg-brand-dark text-white text-sm disabled:opacity-60">
            {finishing ? "Wird fertiggestellt ..." : "Fertigstellen"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-5 items-start">
        <div className="min-w-0">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
            <div className="text-xs font-medium text-slate-500 mb-2">1 · Kunde</div>
            <CustomerPicker
              customers={customers}
              value={customerId}
              onSelect={setCustomerId}
              onCreated={(c) => setCustomers((list) => [c, ...list])}
            />
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
            onProductCreated={(p) => setProducts((list) => [p, ...list])}
          />
          <TotalsSummary items={items} isSmallBusiness={isSmallBusiness} abroadHint={isAbroad} />

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
            <div className="text-xs font-medium text-slate-500 mb-2">3 · Daten und Anmerkung</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Rechnungsdatum</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t("invoices.dueDate")}</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Leistungsdatum</label>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={fieldClass} />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Leer = heute bzw. Zahlungsziel aus den Einstellungen; ohne Leistungsdatum gilt das Rechnungsdatum (§14 Abs. 4 Nr. 6 UStG).</p>
            <label className="block text-xs text-slate-500 mt-3 mb-1">Anmerkung auf der Rechnung (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="z.B. Lieferung frei Haus." className={fieldClass} />
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
