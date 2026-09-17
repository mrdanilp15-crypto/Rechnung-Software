import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { CompanyAssetUpload } from "../components/CompanyAssetUpload";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import Users from "./Users";
import { useToast } from "../components/Toast";

interface Company {
  name: string;
  street?: string;
  postalCode?: string;
  city?: string;
  taxId?: string;
  vatId?: string;
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
  { key: "email", label: "E-Mail-Versand" },
  { key: "security", label: "Sicherheit" },
  { key: "data", label: "Daten" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function Settings() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateAccessToken = useAuthStore((s) => s.updateAccessToken);
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
      const { data } = await passwordSave.run(() =>
        api.post("/auth/change-password", {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        })
      );
      updateAccessToken(data.accessToken, data.refreshToken);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} placeholder="Firmenname" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input value={company.taxId || ""} onChange={(e) => setCompany({ ...company, taxId: e.target.value })} placeholder="Steuernummer" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input value={company.vatId || ""} onChange={(e) => setCompany({ ...company, vatId: e.target.value })} placeholder="USt-IdNr. (optional)" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input value={company.street || ""} onChange={(e) => setCompany({ ...company, street: e.target.value })} placeholder="Straße" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input value={company.postalCode || ""} onChange={(e) => setCompany({ ...company, postalCode: e.target.value })} placeholder="PLZ" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input value={company.city || ""} onChange={(e) => setCompany({ ...company, city: e.target.value })} placeholder="Ort" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input value={company.iban || ""} onChange={(e) => setCompany({ ...company, iban: e.target.value })} placeholder="IBAN" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input value={company.bic || ""} onChange={(e) => setCompany({ ...company, bic: e.target.value })} placeholder="BIC" className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
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

      {tab === "users" && user?.role === "ADMIN" && <Users />}

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
        </div>
      )}
    </div>
  );
}
