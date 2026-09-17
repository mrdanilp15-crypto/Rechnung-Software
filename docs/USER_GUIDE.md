# Benutzerhandbuch

## Erste Schritte

1. Auf der Startseite **Registrieren** wählen.
2. Firmenname, Ihren Namen, E-Mail-Adresse und ein Passwort (mind. 10 Zeichen, mit
   Buchstaben und Ziffern) eingeben. Sie werden automatisch als Administrator der
   neuen Firma angelegt.
3. Unter **Einstellungen** die Firmendaten vervollständigen: Adresse, USt-IdNr.,
   IBAN/BIC (für den SEPA-QR-Code auf Rechnungen) und ggf. die
   **Kleinunternehmerregelung** (§19 UStG) aktivieren, falls zutreffend - dann wird auf
   allen Belegen automatisch keine Umsatzsteuer ausgewiesen.

## Kunden anlegen

**Kunden** → **Neuer Kunde**. Pflichtfeld ist nur der Name; alle weiteren Angaben
(Adresse, E-Mail, USt-IdNr. bei Geschäftskunden) sind optional, aber für vollständige
Rechnungen nach § 14 UStG empfehlenswert. Jeder Kunde erhält automatisch eine
fortlaufende Kundennummer.

Über das Suchfeld lässt sich die Kundenliste unscharf durchsuchen (auch bei
Tippfehlern werden passende Treffer gefunden).

## Produkte/Leistungen anlegen

**Produkte** → **Neues Produkt**. Preis wird in Euro eingegeben (z.B. `0,15` für
15 Cent pro Gramm 3D-Druckmaterial) und intern präzise in Cent gespeichert. Der
hinterlegte USt.-Satz wird bei Rechnungen automatisch vorausgefüllt, kann pro Position
aber überschrieben werden.

## Eine Rechnung erstellen

1. **Rechnungen** → **Neue Rechnung**.
2. Kunden auswählen, optional Fälligkeitsdatum setzen.
3. Positionen hinzufügen: entweder ein hinterlegtes Produkt auswählen (füllt
   Beschreibung, Preis und USt.-Satz automatisch aus) oder eine freie Position mit
   Beschreibung, Menge, Preis und USt.-Satz eintragen.
4. Die Summenvorschau (netto/USt./brutto) aktualisiert sich live.
5. **Speichern** legt die Rechnung als **Entwurf** mit automatisch vergebener
   Rechnungsnummer an.

## Rechnung versenden, als bezahlt markieren, stornieren

In der Rechnungsdetailansicht:

- Ein neu angelegter Entwurf hat noch **keine feste Rechnungsnummer** - die wird erst
  beim Versenden bzw. direkten "als bezahlt markieren" vergeben, damit ein gelöschter,
  nie versendeter Entwurf keine Lücke in der Nummernfolge hinterlässt.
- **Versenden**: markiert die Rechnung als `SENT` und vergibt die endgültige Nummer. Ab
  diesem Zeitpunkt sind die Positionen aus rechtlichen Gründen (GoBD) nicht mehr
  editierbar oder löschbar.
- **Als bezahlt markieren**: setzt den Status auf `PAID` (nur Rolle Admin/Buchhaltung).
- **Stornieren**: erzeugt einen eigenständigen Korrekturbeleg (Gutschrift) mit negierten
  Beträgen und eigener Nummer, der auf die Originalrechnung verweist - funktioniert auch
  für bereits bezahlte Rechnungen. Die Originalrechnung bleibt unverändert erhalten und
  wird nur als `CANCELLED` markiert (GoBD-Unveränderbarkeit).
- Überfällige, versendete Rechnungen wechseln automatisch stündlich in den Status
  `OVERDUE`, sobald das Fälligkeitsdatum verstrichen ist.
- **PDF herunterladen**: erzeugt das Rechnungs-PDF inkl. SEPA-QR-Code (sofern IBAN in
  den Firmeneinstellungen hinterlegt ist und die Rechnung noch offen ist) - Kunden
  können den QR-Code direkt mit ihrer Banking-App scannen.
- **XRechnung (XML)**: erzeugt eine strukturierte E-Rechnung im XRechnung-Format (nur für
  bereits versendete Rechnungen, da eine feste Nummer nötig ist) - z.B. für öffentliche
  Auftraggeber, die eine XRechnung statt eines PDFs verlangen. Bei Behörden/öffentlichen
  Auftraggebern vorher unbedingt die vom Auftraggeber mitgeteilte **Leitweg-ID** beim
  Kunden hinterlegen (Pflichtfeld für diese Kunden). Vor dem ersten echten Versand
  empfiehlt sich eine Prüfung der erzeugten Datei mit einem offiziellen XRechnung-
  Validator (siehe [SECURITY.md](SECURITY.md)).

## Angebote

**Angebote** → **Neues Angebot**, analog zu Rechnungen. Nach Annahme durch den Kunden
Status auf **ACCEPTED** setzen; über **→ Rechnung** wird daraus mit einem Klick eine
Rechnung mit identischen Positionen erzeugt.

## Lieferscheine

**Lieferscheine**: enthalten bewusst keine Preise, nur Mengen/Beschreibungen - für die
Warenbegleitung ohne Preisangabe an den Empfänger.

## DSGVO: Kundendaten exportieren oder löschen

In der Kundendetailansicht, oben rechts:

- **DSGVO-Export**: liefert alle gespeicherten Daten des Kunden als JSON-Datei.
- **Anonymisieren (DSGVO)**: anonymisiert Name, Kontaktdaten und Notizen (nur Admin).
  Rechnungsbelege selbst bleiben aus steuerrechtlichen Gründen bestehen (siehe
  [SECURITY.md](SECURITY.md)).

Für den eigenen Benutzer-Account: **Einstellungen → Passwort → Eigene Daten
exportieren** liefert Kontodaten und das eigene Aktivitätsprotokoll als JSON-Datei.

## Einstellungen

- **Dunkelmodus**: Schalter in der linken Navigationsleiste, wird pro Gerät gespeichert.
- **Sprache**: Deutsch/Englisch, ebenfalls in der Navigationsleiste.
- **Zwei-Faktor-Authentifizierung**: unter Einstellungen aktivierbar - QR-Code mit
  einer Authenticator-App (z.B. Google Authenticator) scannen und den 6-stelligen Code
  zur Bestätigung eingeben.
- **Backup jetzt erstellen**: erstellt sofort ein ZIP-Backup (zusätzlich zu
  automatisierten, geplanten Backups, siehe [INSTALL.md](INSTALL.md)).
- **Kunden importieren**: CSV-Datei mit Bestandskunden hochladen (z.B. beim Wechsel von
  einer anderen Software).

## Benutzer & Rollen verwalten

Nur für Administratoren: unter **Einstellungen → Benutzer** lassen sich beliebig viele
Benutzerkonten für dieselbe Firma anlegen (z.B. für Büro, Versand, Buchhaltung). Jedes
Konto hat einen eigenen Login (E-Mail + Passwort, optional eigene 2FA), sieht aber
dieselben Kunden, Rechnungen und Produkte der Firma - nur die Rolle bestimmt, welche
Aktionen erlaubt sind:

- **Admin**: uneingeschränkter Zugriff, inkl. Firmeneinstellungen, Benutzerverwaltung, Backups
- **Mitarbeiter**: Kunden/Produkte/Belege anlegen und bearbeiten, keine Verwaltungsfunktionen
- **Buchhaltung**: wie Mitarbeiter, zusätzlich Rechnungen als bezahlt markieren/stornieren

Ein Konto lässt sich jederzeit deaktivieren (Login wird gesperrt, alle aktiven Sitzungen
werden ungültig) - Belege und Historie bleiben dabei erhalten.
