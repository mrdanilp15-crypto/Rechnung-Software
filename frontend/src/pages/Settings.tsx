import { DataResetPanel } from "../components/DataResetPanel";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { CompanyAssetUpload } from "../components/CompanyAssetUpload";
import { PdfLink } from "../components/PdfLink";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import Users from "./Users";
import { useToast } from "../components/Toast";
import { PlaceholderHint } from "../components/DocumentTexts";
import AuditLog from "./AuditLog";

interface Company {
  name: string;
  street?: string;
  postalCode?: string;
  city?: string;
  taxId?: string;
  vatId?: string;
  legalForm?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  registerCourt?: string;
  registerNumber?: string;
  managingDirector?: string;
  bankName?: string;
  paymentTermDays?: number;
  dunningFee2Cents?: number;
  dunningFee3Cents?: number;
  baseInterestRatePercent?: number;
  dunningDeadlineDays?: number;
  dunningText1?: string;
  dunningText2?: string;
  dunningText3?: string;
  machineRateCentsPerHour?: number;
  laborRateCentsPerHour?: number;
  materialWastePercent?: number;
  targetMarginPercent?: number;
  electricityCentsPerKwh?: number;
  overheadPercent?: number;
  failRatePercent?: number;
  platformFeePercent?: number;
  priceRounding?: string;
  minPriceCents?: number;
  pdfLayout?: "CLEAR" | "BAND" | "COMPACT";
  invoiceIntroText?: string;
  invoiceClosingText?: string;
  quoteIntroText?: string;
  quoteClosingText?: string;
  orderConfirmationIntroText?: string;
  orderConfirmationClosingText?: string;
  deliveryNoteIntroText?: string;
  deliveryNoteClosingText?: string;
  iban?: string;
  bic?: string;
  isSmallBusiness: boolean;
  invoiceFooterText?: string;
  smallBusinessThresholdCents: number;
  smallBusinessCurrentYearThresholdCents: number;
  smtpConfigured?: boolean;
}

interface RevenueStatus {
  isSmallBusiness: boolean;
  yearRevenueCents: number;
  priorYearRevenueCents: number;
  thresholdCents: number;
  currentYearThresholdCents: number;
  percentUsed: number;
  isApproaching: boolean;
  isExceeded: boolean;
  priorYearExceeded: boolean;
  currentYearExceeded: boolean;
}

const formatEuro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

const TABS = [
  { key: "company", label: "Firma" },
  { key: "password", label: "Passwort" },
  { key: "users", label: "Benutzer" },
  { key: "branding", label: "Logo & Stempel" },
  { key: "design", label: "Beleg-Design" },
  { key: "dunning", label: "Mahnwesen" },
  { key: "email", label: "E-Mail-Versand" },
  { key: "security", label: "Sicherheit" },
  { key: "audit", label: "Protokoll" },
  { key: "data", label: "Daten" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function Settings() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const showToast = useToast();
  const [tab, setTab] = useState<TabKey>("company");
  const [company, setCompany] = useState<Company | null>(null);
  const [revenue, setRevenue] = useState<RevenueStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState("");
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [smtp, setSmtp] = useState({ smtpHost: "", smtpPort: 587, smtpSecure: false, smtpUser: "", smtpPassword: "", smtpFromEmail: "", smtpFromName: "" });
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const companySave = useSaveStatus();
  const smtpSave = useSaveStatus();
  const twoFaSave = useSaveStatus();
  const backupSave = useSaveStatus();
  const importSave = useSaveStatus();
  const passwordSave = useSaveStatus();
  const disable2faSave = useSaveStatus();

  function load() {
    api.get("/companies/me").then((res) => setCompany(res.data));
    api.get("/companies/me/revenue-status").then((res) => setRevenue(res.data));
  }
  useEffect(load, []);
  useEffect(() => {
    if (user?.role === "ADMIN") api.get("/auth/me").then((res) => setTotpEnabled(res.data.totpEnabled));
  }, [user?.role]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    setCompanyError(null);
    try {
      await companySave.run(() => api.patch("/companies/me", company));
      load();
    } catch (err: any) {
      setCompanyError(err.response?.data?.error || t("common.error"));
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (passwordForm.newPassword !== passwordForm.newPasswordRepeat) {
      setPasswordError("Neue Passwörter stimmen nicht überein.");
      return;
    }
    try {
      // Backend setzt bei Erfolg automatisch frische Auth-Cookies für diese Sitzung
      // (siehe backend/src/modules/auth/router.ts, setAuthCookies) - das Frontend muss
      // selbst nichts weiter tun, da es die Tokens nicht mehr selbst verwaltet.
      await passwordSave.run(() =>
        api.post("/auth/change-password", {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        })
      );
      setPasswordForm({ currentPassword: "", newPassword: "", newPasswordRepeat: "" });
      showToast("Passwort geändert. Andere angemeldete Geräte wurden abgemeldet.", "success");
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || t("common.error"));
    }
  }

  async function setup2fa() {
    const { data } = await api.post("/auth/2fa/setup");
    setQrDataUrl(data.qrDataUrl);
  }

  async function confirm2fa() {
    await twoFaSave.run(() => api.post("/auth/2fa/confirm", { token: totpToken }));
    setQrDataUrl(null);
    setTotpToken("");
    setTotpEnabled(true);
  }

  async function disable2fa(e: FormEvent) {
    e.preventDefault();
    setDisableError(null);
    try {
      await disable2faSave.run(() => api.post("/auth/2fa/disable", { currentPassword: disablePassword }));
      setTotpEnabled(false);
      setDisablePassword("");
      showToast("2FA deaktiviert.", "success");
    } catch (err: any) {
      setDisableError(err.response?.data?.error || t("common.error"));
    }
  }

  async function runBackupNow() {
    await backupSave.run(() => api.post("/backups/run"));
  }

  async function saveSmtp(e: FormEvent) {
    e.preventDefault();
    setSmtpMessage(null);
    try {
      await smtpSave.run(() => api.put("/companies/me/smtp", smtp));
      setSmtp((s) => ({ ...s, smtpPassword: "" }));
      load();
    } catch (err: any) {
      setSmtpMessage(err.response?.data?.error || t("common.error"));
    }
  }

  async function testSmtp() {
    setSmtpMessage(null);
    try {
      const { data } = await api.post("/companies/me/smtp/test");
      setSmtpMessage(`Testmail gesendet an ${data.sentTo}.`);
    } catch (err: any) {
      setSmtpMessage(err.response?.data?.error || t("common.error"));
    }
  }

  async function removeSmtp() {
    if (!confirm("SMTP-Zugangsdaten wirklich entfernen? E-Mail-Versand ist danach nicht mehr möglich (PDF-Download bleibt).")) return;
    await api.delete("/companies/me/smtp");
    load();
  }

  async function handleImportCustomers(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const data = await importSave.run(() =>
      api.post("/import/customers", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data)
    );
    alert(`${data.imported} Kunden importiert. ${data.errors.length} Fehler.`);
  }

  if (!company) return <p>{t("common.loading")}</p>;

  const visibleTabs =
    user?.role === "ADMIN" ? TABS : TABS.filter((tb) => tb.key === "company" || tb.key === "password");

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">{t("settings.title")}</h1>

      {revenue?.isSmallBusiness && (revenue.isApproaching || revenue.currentYearExceeded || revenue.priorYearExceeded) && (
        <div className="space-y-3 mb-6">
          {revenue.priorYearExceeded && (
            <div className="rounded-lg p-4 text-sm bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
              <strong>Vorjahresgrenze überschritten:</strong> {formatEuro(revenue.priorYearRevenueCents)} von {formatEuro(revenue.thresholdCents)} im Vorjahr.
              Die Kleinunternehmerregelung (§19 UStG) entfällt damit voraussichtlich rückwirkend für das gesamte laufende Jahr - bitte dringend mit Steuerberater/Finanzamt klären.
            </div>
          )}
          {revenue.currentYearExceeded ? (
            <div className="rounded-lg p-4 text-sm bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
              <strong>Laufende Umsatzgrenze überschritten:</strong> {formatEuro(revenue.yearRevenueCents)} von {formatEuro(revenue.currentYearThresholdCents)} in diesem Jahr.
              Die Steuerbefreiung endet damit sofort ab dem Umsatz, der die Grenze überschritten hat (nicht erst im Folgejahr) - bitte umgehend mit Steuerberater/Finanzamt klären.
            </div>
          ) : revenue.isApproaching ? (
            <div className="rounded-lg p-4 text-sm bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
              <strong>Achtung:</strong> {formatEuro(revenue.yearRevenueCents)} von {formatEuro(revenue.currentYearThresholdCents)} ({revenue.percentUsed}%) der laufenden Kleinunternehmer-Umsatzgrenze in diesem Jahr bereits erreicht.
            </div>
          ) : null}
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {visibleTabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-4 py-2 rounded text-sm ${tab === tb.key ? "bg-brand text-white" : "bg-slate-200 dark:bg-slate-700"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "company" && (
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-4">
          <h2 className="font-medium">{t("settings.company")}</h2>
          <p className="text-xs text-slate-500 -mt-2">
            Steuernummer oder USt-IdNr. sind Pflichtangaben auf jeder Rechnung (§14 Abs. 4 Nr. 2 UStG) - mindestens eine der beiden bitte ausfüllen.
          </p>
          <h3 className="text-sm font-semibold pt-2">Firma &amp; Anschrift</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              Firmenname
              <input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Rechtsform
              <input type="text" value={company.legalForm || ""} onChange={(e) => setCompany({ ...company, legalForm: e.target.value })} placeholder="z.B. GmbH, e.K., Einzelunternehmen" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Wird in der Fußzeile ergänzt, falls sie nicht schon im Firmennamen steht.</span>
            </label>
            <label className="block text-sm">
              Straße und Hausnummer
              <input type="text" value={company.street || ""} onChange={(e) => setCompany({ ...company, street: e.target.value })} placeholder="" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              PLZ
              <input type="text" value={company.postalCode || ""} onChange={(e) => setCompany({ ...company, postalCode: e.target.value })} placeholder="" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Ort
              <input type="text" value={company.city || ""} onChange={(e) => setCompany({ ...company, city: e.target.value })} placeholder="" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Land (Ländercode)
              <input type="text" value={company.country || ""} onChange={(e) => setCompany({ ...company, country: e.target.value })} placeholder="DE" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Zwei Buchstaben, z.B. DE, AT, CH. Bestimmt die Umsatzsteuer-Behandlung bei Auslandskunden (Reverse-Charge/Ausfuhr).</span>
            </label>
          </div>
          <h3 className="text-sm font-semibold pt-2">Steuer &amp; Register (Pflichtangaben auf Rechnungen)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              Steuernummer
              <input type="text" value={company.taxId || ""} onChange={(e) => setCompany({ ...company, taxId: e.target.value })} placeholder="12/345/67890" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              USt-IdNr.
              <input type="text" value={company.vatId || ""} onChange={(e) => setCompany({ ...company, vatId: e.target.value })} placeholder="DE123456789" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Handelsregister: Gericht
              <input type="text" value={company.registerCourt || ""} onChange={(e) => setCompany({ ...company, registerCourt: e.target.value })} placeholder="z.B. Amtsgericht Berlin (Charlottenburg)" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Pflicht für GmbH/UG/AG/e.K. (§35a GmbHG, §37a HGB) - bei Einzelunternehmen ohne Eintrag leer lassen.</span>
            </label>
            <label className="block text-sm">
              Handelsregister: Nummer
              <input type="text" value={company.registerNumber || ""} onChange={(e) => setCompany({ ...company, registerNumber: e.target.value })} placeholder="z.B. HRB 123456" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Geschäftsführer / Inhaber
              <input type="text" value={company.managingDirector || ""} onChange={(e) => setCompany({ ...company, managingDirector: e.target.value })} placeholder="Vor- und Nachname" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Bei mehreren Geschäftsführern kommagetrennt. Pflicht bei GmbH/UG.</span>
            </label>
          </div>
          <h3 className="text-sm font-semibold pt-2">Kontakt</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block text-sm">
              Telefon
              <input type="text" value={company.phone || ""} onChange={(e) => setCompany({ ...company, phone: e.target.value })} placeholder="+49 ..." className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              E-Mail
              <input type="email" value={company.email || ""} onChange={(e) => setCompany({ ...company, email: e.target.value })} placeholder="info@firma.de" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Webseite
              <input type="text" value={company.website || ""} onChange={(e) => setCompany({ ...company, website: e.target.value })} placeholder="www.firma.de" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
          </div>
          <h3 className="text-sm font-semibold pt-2">Kalkulation (Produktpreise)</h3>
          <p className="text-xs text-slate-500 -mt-2">Aus diesen Sätzen berechnet die Produktverwaltung die Selbstkosten und einen Preisvorschlag (Material aus dem Lager + Maschinen- und Arbeitszeit).</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              Pauschaler Maschinenstundensatz (€ pro Stunde)
              <input type="number" min={0} step="0.01" value={(company.machineRateCentsPerHour ?? 0) / 100} onChange={(e) => setCompany({ ...company, machineRateCentsPerHour: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Nur für Produkte ohne gewählten Drucker. Mit Drucker rechnet die Software Strom, Abschreibung und Verschleiß einzeln (siehe Katalog → Drucker).</span>
            </label>
            <label className="block text-sm">
              Arbeitsstundensatz (€ pro Stunde)
              <input type="number" min={0} step="0.01" value={(company.laborRateCentsPerHour ?? 0) / 100} onChange={(e) => setCompany({ ...company, laborRateCentsPerHour: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Was Ihre eigene Arbeitsstunde kosten soll (Vorbereiten, Nachbearbeiten, Verpacken). Mindestens der Betrag, den Sie sich als Lohn zahlen wollen - üblich sind 20-40 €/h.</span>
            </label>
            <label className="block text-sm">
              Materialausschuss (%)
              <input type="number" min={0} max={100} step="0.5" value={company.materialWastePercent ?? 5} onChange={(e) => setCompany({ ...company, materialWastePercent: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Aufschlag auf den Materialverbrauch für Fehldrucke, Spülmaterial (Purge), Reste und Trocknungsverluste. Wenn Stützstrukturen schon in der Slicer-Angabe stecken, genügen 3-8 %.</span>
            </label>
            <label className="block text-sm">
              Strompreis (Cent pro kWh)
              <input type="number" min={0} step="0.1" value={company.electricityCentsPerKwh ?? 35} onChange={(e) => setCompany({ ...company, electricityCentsPerKwh: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Ihr Brutto-Arbeitspreis pro Kilowattstunde laut Stromrechnung, in Cent (Beispiel: 35 = 0,35 €/kWh). Bei Vorsteuerabzug den Nettopreis nehmen.</span>
            </label>
            <label className="block text-sm">
              Gemeinkosten-Aufschlag (%)
              <input type="number" min={0} step="0.5" value={company.overheadPercent ?? 5} onChange={(e) => setCompany({ ...company, overheadPercent: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Kosten, die nicht einem Produkt zuzuordnen sind: Miete/Raum, Software, Versicherung, Internet, Werkzeug, Buchhaltung. (Verpackung steht pro Produkt, Gebühren und Fehldrucke haben eigene Felder.) Faustregel: Summe dieser Kosten pro Jahr ÷ Summe aller direkten Kosten pro Jahr. Für den Start 5-15 %.</span>
            </label>
            <label className="block text-sm">
              Gewinnaufschlag (%)
              <input type="number" min={0} step="1" value={company.targetMarginPercent ?? 30} onChange={(e) => setCompany({ ...company, targetMarginPercent: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Wird auf die Selbstkosten aufgeschlagen und ergibt den Preisvorschlag. Achtung: 30 % <em>Aufschlag</em> sind nur rund 23 % <em>Gewinn vom Verkaufspreis</em> (Rechnung: Gewinn ÷ Preis). Aus dem Gewinn müssen noch Steuern und Rücklagen bezahlt werden.</span>
            </label>
            <label className="block text-sm">
              Fehldruckquote (%)
              <input type="number" min={0} step="0.5" value={company.failRatePercent ?? 5} onChange={(e) => setCompany({ ...company, failRatePercent: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Wie oft ein Druck misslingt: dann sind Druckzeit, Strom und Verschleiß verloren. Aufschlag auf diese Maschinenkosten (das verlorene Material deckt der Materialausschuss). Erfahrungswert: 3-10 %, bei neuen Materialien mehr.</span>
            </label>
            <label className="block text-sm">
              Plattform-/Zahlungsgebühren (% vom Verkaufspreis)
              <input type="number" min={0} max={90} step="0.1" value={company.platformFeePercent ?? 0} onChange={(e) => setCompany({ ...company, platformFeePercent: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Gebühren, die beim Verkauf anfallen (Etsy, eBay, PayPal, Kartenzahlung - zusammen oft 5-12 %). Der Preisvorschlag wird so erhöht, dass nach Abzug der Gebühren Ihr Gewinn bleibt. Bei Direktverkauf per Überweisung: 0.</span>
            </label>
            <label className="block text-sm">
              Preisvorschlag runden
              <select value={company.priceRounding ?? "NONE"} onChange={(e) => setCompany({ ...company, priceRounding: e.target.value })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                <option value="NONE">Nicht runden (auf den Cent genau)</option>
                <option value="5">Auf 5 Cent aufrunden (7,43 → 7,45)</option>
                <option value="10">Auf 10 Cent aufrunden (7,43 → 7,50)</option>
                <option value="50">Auf 50 Cent aufrunden (7,43 → 7,50)</option>
                <option value="100">Auf volle Euro aufrunden (7,43 → 8,00)</option>
                <option value="90">Auf ,90 aufrunden (7,43 → 7,90)</option>
                <option value="99">Auf ,99 aufrunden (7,43 → 7,99)</option>
              </select>
              <span className="block text-xs text-slate-500 mt-0.5">Es wird immer aufgerundet, nie ab. Die Rundung wirkt auf den Nettopreis (ohne USt.).</span>
            </label>
            <label className="block text-sm">
              Mindestpreis je Einheit (€ netto)
              <input type="number" min={0} step="0.01" value={(company.minPriceCents ?? 0) / 100} onChange={(e) => setCompany({ ...company, minPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Kein Preisvorschlag liegt darunter - auch nicht bei winzigen Teilen, bei denen sich Auftragsannahme, Versand und Abrechnung sonst nicht lohnen. 0 = kein Mindestpreis.</span>
            </label>
          </div>
          <h3 className="text-sm font-semibold pt-2">Bank &amp; Zahlung</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              Bank
              <input type="text" value={company.bankName || ""} onChange={(e) => setCompany({ ...company, bankName: e.target.value })} placeholder="z.B. Commerzbank" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              IBAN
              <input type="text" value={company.iban || ""} onChange={(e) => setCompany({ ...company, iban: e.target.value })} placeholder="DE00 0000 0000 0000 0000 00" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Wird auch als QR-Code (GiroCode) auf offenen Rechnungen ausgegeben.</span>
            </label>
            <label className="block text-sm">
              BIC
              <input type="text" value={company.bic || ""} onChange={(e) => setCompany({ ...company, bic: e.target.value })} placeholder="" className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Zahlungsziel (Tage)
              <input type="number" min={0} max={365} value={company.paymentTermDays ?? 14} onChange={(e) => setCompany({ ...company, paymentTermDays: Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)) })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Als Fälligkeitsdatum vorbelegt, wenn bei der Rechnung keines gewählt wird (0 = kein Standard).</span>
            </label>
          </div>
          <textarea value={company.invoiceFooterText || ""} onChange={(e) => setCompany({ ...company, invoiceFooterText: e.target.value })} placeholder="Fußzeilentext für Rechnungen" className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={company.isSmallBusiness} onChange={(e) => setCompany({ ...company, isSmallBusiness: e.target.checked })} />
            {t("settings.smallBusiness")}
          </label>
          {company.isSmallBusiness && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Vorjahresgrenze für Warnhinweis (€, gesetzlich seit 2025: 25.000 €)</label>
                <input
                  type="number"
                  value={company.smallBusinessThresholdCents / 100}
                  onChange={(e) => setCompany({ ...company, smallBusinessThresholdCents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Laufende-Jahr-Grenze für Warnhinweis (€, gesetzlich seit 2025: 100.000 €)</label>
                <input
                  type="number"
                  value={company.smallBusinessCurrentYearThresholdCents / 100}
                  onChange={(e) => setCompany({ ...company, smallBusinessCurrentYearThresholdCents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
          )}
          {companyError && <p className="text-red-600 text-sm">{companyError}</p>}
          <SaveButton status={companySave.status} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
            {t("common.save")}
          </SaveButton>
        </form>
      )}

      {tab === "password" && (
        <form onSubmit={handleChangePassword} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-4 max-w-md">
          <h2 className="font-medium">Passwort ändern</h2>
          <div>
            <label className="block text-sm mb-1">Aktuelles Passwort</label>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Neues Passwort (mind. 10 Zeichen, Buchstaben und Ziffern)</label>
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Neues Passwort wiederholen</label>
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={passwordForm.newPasswordRepeat}
              onChange={(e) => setPasswordForm((f) => ({ ...f, newPasswordRepeat: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
            />
          </div>
          {passwordError && <p className="text-red-600 text-sm">{passwordError}</p>}
          <SaveButton status={passwordSave.status} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
            Passwort ändern
          </SaveButton>
        </form>
      )}

      {tab === "password" && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-2 max-w-md mt-4">
          <h2 className="font-medium">Meine Daten (DSGVO)</h2>
          <p className="text-sm text-slate-500">
            Lädt eine Kopie aller zu deinem Benutzerkonto gespeicherten Daten herunter (Art. 15 DSGVO) - Kontodaten und dein eigenes Aktivitätsprotokoll, ohne Passwort oder 2FA-Geheimnis.
          </p>
          <PdfLink url="/auth/me/export" filename="dsgvo-export-benutzerkonto.json" download className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded text-sm">
            Eigene Daten exportieren
          </PdfLink>
        </div>
      )}

      {tab === "users" && user?.role === "ADMIN" && <Users />}

      {tab === "dunning" && user?.role === "ADMIN" && (
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-5">
          <h2 className="font-medium">Mahnwesen</h2>
          <p className="text-sm text-slate-500 -mt-3">
            Drei Stufen: Zahlungserinnerung (gebühren- und zinsfrei), 1. Mahnung und 2. (letzte) Mahnung. Ab Stufe 2 werden Verzugszinsen berechnet (Basiszinssatz + 5 Prozentpunkte bei Privatkunden,
            + 9 Prozentpunkte bei Firmenkunden, §288 BGB) und bei Firmenkunden einmalig 40 € Verzugskostenpauschale (§288 Abs. 5 BGB). Mahngebühren dürfen nur tatsächlich entstandene Kosten ersetzen.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              Mahngebühr 1. Mahnung (€)
              <input type="number" min={0} step="0.01" value={(company.dunningFee2Cents ?? 500) / 100} onChange={(e) => setCompany({ ...company, dunningFee2Cents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Mahngebühr 2. Mahnung (€)
              <input type="number" min={0} step="0.01" value={(company.dunningFee3Cents ?? 1000) / 100} onChange={(e) => setCompany({ ...company, dunningFee3Cents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
            <label className="block text-sm">
              Basiszinssatz der Bundesbank (%)
              <input type="number" step="0.01" value={company.baseInterestRatePercent ?? 1.27} onChange={(e) => setCompany({ ...company, baseInterestRatePercent: parseFloat(e.target.value) || 0 })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <span className="block text-xs text-slate-500 mt-0.5">Ändert sich zum 1. Januar und 1. Juli - bitte bei der Bundesbank prüfen und hier aktuell halten.</span>
            </label>
            <label className="block text-sm">
              Zahlungsfrist je Mahnung (Tage)
              <input type="number" min={1} max={90} value={company.dunningDeadlineDays ?? 7} onChange={(e) => setCompany({ ...company, dunningDeadlineDays: Math.max(1, parseInt(e.target.value, 10) || 7) })} className="mt-1 w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </label>
          </div>
          {(
            [
              ["Zahlungserinnerung (Stufe 1)", "dunningText1"],
              ["1. Mahnung (Stufe 2)", "dunningText2"],
              ["2. Mahnung, letzte (Stufe 3)", "dunningText3"],
            ] as const
          ).map(([title, key]) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1">Text: {title}</label>
              <textarea rows={6} value={company[key] ?? ""} onChange={(e) => setCompany({ ...company, [key]: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
            </div>
          ))}
          <PlaceholderHint />
          {companyError && <p className="text-red-600 text-sm">{companyError}</p>}
          <SaveButton status={companySave.status} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
            {t("common.save")}
          </SaveButton>
        </form>
      )}

      {tab === "audit" && user?.role === "ADMIN" && <AuditLog />}

      {tab === "design" && user?.role === "ADMIN" && (
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-5">
          <h2 className="font-medium">Beleg-Design</h2>
          <p className="text-sm text-slate-500 -mt-3">
            Gilt für alle PDFs (Rechnung, Angebot, Auftragsbestätigung, Lieferschein). Alle gesetzlichen Pflichtangaben stehen in jedem Layout. Die Farbe stellen Sie unter "Logo &amp; Stempel" ein.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                ["CLEAR", "Klar", "Viel Weiß, feine Linien, zarte Summenfläche. Wirkt hochwertig und spart Tinte."],
                ["BAND", "Akzentband", "Farbiges Kopfband mit Belegnummer, Summe als Kapsel. Sehr markant."],
                ["COMPACT", "Kompakt", "Karten für Empfänger und Details, große Summe. Modern und platzsparend."],
              ] as const
            ).map(([key, title, text]) => (
              <div key={key} className={`rounded-lg border p-3 ${(company.pdfLayout ?? "CLEAR") === key ? "border-brand ring-1 ring-brand" : "border-slate-200 dark:border-slate-600"}`}>
                <label className="flex items-center gap-2 font-medium text-sm cursor-pointer">
                  <input type="radio" name="pdfLayout" checked={(company.pdfLayout ?? "CLEAR") === key} onChange={() => setCompany({ ...company, pdfLayout: key })} />
                  {title}
                </label>
                <p className="text-xs text-slate-500 mt-1 mb-2">{text}</p>
                <PdfLink url={`/companies/me/pdf-preview?layout=${key}`} filename={`vorschau-${key}.pdf`} className="text-xs text-brand hover:underline">
                  Vorschau ansehen
                </PdfLink>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Standardtexte für Rechnungen</h3>
            <label className="block text-sm mb-1">Begrüßung</label>
            <textarea rows={3} value={company.invoiceIntroText ?? ""} onChange={(e) => setCompany({ ...company, invoiceIntroText: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
            <label className="block text-sm mb-1 mt-3">Schlusstext</label>
            <textarea rows={4} value={company.invoiceClosingText ?? ""} onChange={(e) => setCompany({ ...company, invoiceClosingText: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
          </div>
          {(
            [
              ["Angebote", "quoteIntroText", "quoteClosingText"],
              ["Auftragsbestätigungen", "orderConfirmationIntroText", "orderConfirmationClosingText"],
              ["Lieferscheine", "deliveryNoteIntroText", "deliveryNoteClosingText"],
            ] as const
          ).map(([title, introKey, closingKey]) => (
            <div key={introKey}>
              <h3 className="text-sm font-semibold mb-2">Standardtexte für {title}</h3>
              <label className="block text-sm mb-1">Begrüßung</label>
              <textarea rows={3} value={company[introKey] ?? ""} onChange={(e) => setCompany({ ...company, [introKey]: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
              <label className="block text-sm mb-1 mt-3">Schlusstext</label>
              <textarea rows={4} value={company[closingKey] ?? ""} onChange={(e) => setCompany({ ...company, [closingKey]: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
            </div>
          ))}
          <div>
            <PlaceholderHint />
            <p className="text-xs text-slate-500 mt-1">
              Diese Texte werden beim Anlegen eines neuen Belegs übernommen und können dort für den einzelnen Beleg geändert werden. Bereits versendete Belege behalten ihren Text.
            </p>
          </div>
          {companyError && <p className="text-red-600 text-sm">{companyError}</p>}
          <SaveButton status={companySave.status} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
            {t("common.save")}
          </SaveButton>
        </form>
      )}

      {tab === "branding" && user?.role === "ADMIN" && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-5">
          <h2 className="font-medium">Logo, Stempel &amp; Unterschrift</h2>
          <p className="text-sm text-slate-500 -mt-3">
            Stempel und Unterschrift werden automatisch auf jedes erzeugte PDF (Rechnung, Angebot, Lieferschein, Auftragsbestätigung) eingefügt.
          </p>
          <CompanyAssetUpload assetName="logo" label="Firmenlogo" hint="Erscheint oben links auf jedem Dokument." />
          <CompanyAssetUpload assetName="stamp" label="Firmenstempel" hint="Wird automatisch unten rechts auf PDFs eingefügt." />
          <CompanyAssetUpload assetName="signature" label="Unterschrift" hint="Wird automatisch unten links auf PDFs eingefügt, mit Unterschriftslinie." />
        </div>
      )}

      {tab === "email" && user?.role === "ADMIN" && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-medium">E-Mail-Versand</h2>
          <p className="text-sm text-slate-500">
            Eigenes Postfach hinterlegen, um Rechnungen und Zahlungserinnerungen direkt aus der Software zu versenden.
            Ist nichts hinterlegt, bleibt der PDF-Download als Versandweg jederzeit verfügbar.
          </p>
          <p className="text-sm">
            Status:{" "}
            {company.smtpConfigured ? (
              <span className="text-green-600 font-medium">eingerichtet</span>
            ) : (
              <span className="text-slate-500">nicht eingerichtet</span>
            )}
          </p>
          <form onSubmit={saveSmtp} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">SMTP-Server</label>
              <input required placeholder="z.B. smtp.gmail.com" value={smtp.smtpHost} onChange={(e) => setSmtp((s) => ({ ...s, smtpHost: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">Port</label>
              <input required type="number" placeholder="587 oder 465" value={smtp.smtpPort} onChange={(e) => setSmtp((s) => ({ ...s, smtpPort: Number(e.target.value) }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">Benutzername / E-Mail</label>
              <input required value={smtp.smtpUser} onChange={(e) => setSmtp((s) => ({ ...s, smtpUser: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">Passwort {company.smtpConfigured && "(leer lassen = unverändert)"}</label>
              <input type="password" placeholder={company.smtpConfigured ? "" : "Passwort / App-Passwort"} value={smtp.smtpPassword} onChange={(e) => setSmtp((s) => ({ ...s, smtpPassword: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">Absender-E-Mail (optional)</label>
              <input placeholder="sonst Benutzername" value={smtp.smtpFromEmail} onChange={(e) => setSmtp((s) => ({ ...s, smtpFromEmail: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">Absendername (optional)</label>
              <input placeholder="sonst Firmenname" value={smtp.smtpFromName} onChange={(e) => setSmtp((s) => ({ ...s, smtpFromName: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={smtp.smtpSecure} onChange={(e) => setSmtp((s) => ({ ...s, smtpSecure: e.target.checked }))} />
              Direktes TLS verwenden (Port 465). Bei Port 587 unmarkiert lassen (STARTTLS).
            </label>
            <div className="sm:col-span-2 flex gap-2 flex-wrap">
              <SaveButton status={smtpSave.status} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
                Speichern
              </SaveButton>
              {company.smtpConfigured && (
                <>
                  <button type="button" onClick={testSmtp} className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded text-sm">
                    Testmail senden
                  </button>
                  <button type="button" onClick={removeSmtp} className="bg-red-100 text-red-700 px-4 py-2 rounded text-sm">
                    Entfernen
                  </button>
                </>
              )}
            </div>
            {smtpMessage && <p className="sm:col-span-2 text-sm">{smtpMessage}</p>}
          </form>
        </div>
      )}

      {tab === "security" && user?.role === "ADMIN" && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
          <h2 className="font-medium">{t("settings.twoFactor")}</h2>
          {totpEnabled ? (
            <div className="space-y-3">
              <p className="text-sm text-green-600">✓ 2FA ist aktiviert.</p>
              <form onSubmit={disable2fa} className="space-y-3 max-w-sm">
                <div>
                  <label className="block text-sm mb-1">Aktuelles Passwort zum Deaktivieren</label>
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                  />
                </div>
                {disableError && <p className="text-red-600 text-sm">{disableError}</p>}
                <SaveButton status={disable2faSave.status} className="bg-red-100 text-red-700 px-4 py-2 rounded text-sm">
                  2FA deaktivieren
                </SaveButton>
              </form>
            </div>
          ) : !qrDataUrl ? (
            <button onClick={setup2fa} className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded text-sm">
              2FA einrichten
            </button>
          ) : (
            <div className="space-y-3">
              <img src={qrDataUrl} alt="TOTP QR-Code" className="w-40 h-40" />
              <div>
                <label className="block text-sm mb-1">6-stelliger Code aus der Authenticator-App</label>
                <input value={totpToken} onChange={(e) => setTotpToken(e.target.value)} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
              <SaveButton status={twoFaSave.status} onClick={confirm2fa} type="button" savingLabel="Wird geprüft..." savedLabel="✓ Aktiviert" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
                Bestätigen
              </SaveButton>
            </div>
          )}
        </div>
      )}

      {tab === "data" && user?.role === "ADMIN" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
            <h2 className="font-medium">Backups</h2>
            <SaveButton status={backupSave.status} onClick={runBackupNow} type="button" savingLabel="Backup wird erstellt..." savedLabel="✓ Backup erstellt" className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded text-sm">
              Backup jetzt erstellen
            </SaveButton>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
            <h2 className="font-medium">Kunden importieren</h2>
            <p className="text-sm text-slate-500">CSV-Spalten: name, email, phone, street, postalCode, city, country</p>
            <input
              type="file"
              accept=".csv"
              disabled={importSave.status === "saving"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                handleImportCustomers(file);
                e.target.value = "";
              }}
              className="text-sm disabled:opacity-60"
            />
            {importSave.status === "saving" && <p className="text-sm text-slate-500">Wird importiert...</p>}
          </div>

          <DataResetPanel />
        </div>
      )}
    </div>
  );
}
