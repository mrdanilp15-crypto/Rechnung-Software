# Benutzerhandbuch

## Erste Schritte

1. Auf der Startseite **Registrieren** wählen.
2. Firmenname, Ihren Namen, E-Mail-Adresse und ein Passwort (mind. 10 Zeichen, mit
   Buchstaben und Ziffern) eingeben. Sie werden automatisch als Administrator der
   neuen Firma angelegt.
3. Unter **Einstellungen → Firma** die Firmendaten vollständig ausfüllen - sie erscheinen auf
   jedem Beleg und enthalten gesetzliche Pflichtangaben:
   - **Anschrift** und **Steuernummer oder USt-IdNr.** (§14 UStG),
   - bei GmbH/UG/AG/KG/e.K.: **Rechtsform, Handelsregister (Gericht + Nummer) und Geschäftsführer**
     (§35a GmbHG, §37a HGB) - die Software weist bei fehlenden Angaben auf der Rechnung darauf hin,
   - **Telefon/E-Mail** (Kontakt; für die XRechnung zwingend),
   - **Bank, IBAN/BIC** (Fußzeile und SEPA-QR-Code) und das **Zahlungsziel** in Tagen (wird als
     Fälligkeitsdatum vorbelegt),
   - ggf. die **Kleinunternehmerregelung** (§19 UStG) - dann wird auf allen Belegen automatisch
     keine Umsatzsteuer ausgewiesen.

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

## Navigation und Belege

Das Menü hat sechs Punkte: **Start** (Schnellaktionen, offene Posten, angefangene Entwürfe), **Belege**,
**Kunden**, **Katalog** (Produkte/Leistungen und Material), **Finanzen** und **Einstellungen** (inkl. Protokoll).

Unter **Belege** stehen Rechnungen, Angebote, Auftragsbestätigungen und Lieferscheine in einer Liste -
Entwürfe zuerst, Filter nach Belegart, Suche nach Nummer oder Kunde. **+ Neuer Beleg** legt jede Belegart
neu an. Alle vier Belegarten nutzen denselben Editor (Kunde direkt anlegen, Auto-Speichern als Entwurf,
Live-Vorschau, siehe unten); auf Lieferscheinen entfallen Preise.

Der übliche Ablauf ist **Angebot → Auftrag → Lieferschein → Rechnung**. Im Menü (⋮) eines Belegs
führen Sie ihn mit einem Klick zum nächsten weiter: Kunde und Positionen werden übernommen, der Folgebeleg
öffnet sich als Entwurf. Bei Angeboten setzen Sie dort auch "angenommen/abgelehnt". Ein "✓ weitergeführt" in
der Liste zeigt, dass daraus bereits ein Folgebeleg entstanden ist. Entwürfe von Angebot, Auftrag und
Lieferschein tragen im PDF ein "ENTWURF"-Wasserzeichen, bis sie fertiggestellt sind. Die klassische
Rechnungsliste mit Mehrfachauswahl und E-Mail-Status erreichen Sie über "Rechnungen verwalten".

## Belegdesign und Texte

Unter **Einstellungen → Beleg-Design** wählen Sie das Aussehen aller PDFs (Rechnung, Angebot,
Auftragsbestätigung, Lieferschein): **Klar** (viel Weiß, feine Linien), **Akzentband** (farbiges Kopfband)
oder **Kompakt** (Karten, große Summe). Über *Vorschau ansehen* öffnen Sie ein Beispiel-PDF mit Ihren
echten Firmenangaben. Die Farbe stellen Sie unter *Logo & Stempel* ein. Alle gesetzlichen Pflichtangaben
stehen in jedem Layout.

Ebenfalls dort stehen die **Standardtexte** (Begrüßung über den Positionen, Schlusstext unter den Summen) für
Rechnungen und Angebote. Platzhalter wie `{kunde}`, `{ansprechpartner}`, `{nummer}`, `{datum}`, `{faellig}`,
`{betrag}` und `{firma}` werden im PDF automatisch gefüllt. Beim Anlegen eines Belegs wird der Standardtext
übernommen und kann im Beleg für diesen einen Fall geändert werden - solange er ein Entwurf ist. Versendete
Belege behalten ihren Text.

## Eine Rechnung erstellen

Der Rechnungseditor zeigt links das Formular und rechts eine **Live-Vorschau** des echten PDFs im gewählten
Belegdesign. Die Rechnung **speichert sich automatisch als Entwurf**, sobald ein Kunde und eine vollständige
Position eingetragen sind (oben steht "Automatisch gespeichert"). Ein Neuladen oder späteres Öffnen aus der
Rechnungsliste bringt den Entwurf zurück; "Verwerfen" löscht ihn. Erst **Fertigstellen** vergibt die
fortlaufende Rechnungsnummer und sperrt die Rechnung.

- **Kunde direkt anlegen:** Im Kundenfeld einfach den Namen tippen. Gibt es keinen Treffer, bietet der letzte
  Eintrag "als neuen Kunden anlegen" - nur der Name ist Pflicht, Adresse, E-Mail und USt-IdNr. lassen sich
  sofort oder später ergänzen.
- **Positionen frei tippen:** Beschreibung, Menge, Einheit, Preis und USt. direkt eintragen. Tippen Sie den
  Namen eines Katalogprodukts, werden Preis und Einheit übernommen. Mit **"+ Als Produkt merken"** speichern
  Sie eine frei getippte Position mit einem Klick im Produktkatalog - ohne Umweg über die Produktseite.

(Die folgenden Schritte beschreiben die einzelnen Felder.)

1. **Rechnungen** → **Neue Rechnung**.
2. Kunden auswählen, optional Fälligkeitsdatum setzen.
3. Positionen hinzufügen: entweder ein hinterlegtes Produkt auswählen (füllt
   Beschreibung, Preis und USt.-Satz automatisch aus) oder eine freie Position mit
   Beschreibung, Menge, Preis und USt.-Satz eintragen. Optional: Rechnungsdatum,
   Leistungsdatum (sonst gilt das Rechnungsdatum) und eine Anmerkung für den Beleg.
   **Auslandskunden:** Bei Kunden außerhalb Deutschlands wählen Sie zusätzlich die *Art der
   Lieferung/Leistung*. Waren an EU-Unternehmer mit USt-IdNr. sind steuerfreie
   innergemeinschaftliche Lieferungen, Dienstleistungen an EU-Unternehmer unterliegen dem
   Reverse-Charge-Verfahren, Waren in Drittländer sind steuerfreie Ausfuhren. Umsatzsteuer und
   Pflichthinweis setzt die Software automatisch - die Prüfhinweise auf der Rechnung erinnern an
   die nötigen Nachweise (Gelangensbestätigung/Ausfuhrnachweis).
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
  Kunden hinterlegen (Pflichtfeld für diese Kunden). Für den Export müssen in den Firmeneinstellungen
  Telefon, E-Mail, IBAN und Anschrift sowie beim Kunden E-Mail und Anschrift gepflegt sein - sonst
  nennt die Software die fehlenden Angaben. Die erzeugte Datei wurde mit dem offiziellen
  KoSIT-Validator geprüft (siehe [STATUS.md](STATUS.md)).

### Weitere Funktionen rund um Rechnungen

- **ZUGFeRD-PDF**: ein normales PDF (PDF/A-3), in das die strukturierte E-Rechnung (Profil EN 16931) eingebettet ist -
  Menschen lesen das PDF, Buchhaltungssoftware liest die Daten automatisch. Gleiche Voraussetzungen wie bei der XRechnung.
  Das archivierte Standard-PDF bleibt unverändert.
- **Duplizieren** (Menü ⋮ eines Belegs): legt eine Kopie als neuen Entwurf an - praktisch für Stammkunden.
- **Anzahlungs- und Schlussrechnung**: bei Angeboten, Aufträgen und Rechnungen im Menü "Anzahlungsrechnung". Die Schlussrechnung
  zieht bereits berechnete Anzahlungen mit dem ursprünglichen Steuersatz wieder ab (§ 14 Abs. 5 UStG).
- **Mahnwesen**: in der Rechnungsdetailansicht (bei überfälligen Rechnungen) erzeugen Sie Zahlungserinnerung, 1. und 2. Mahnung
  als PDF. Verzugszinsen (§ 288 BGB: Basiszins + 5 bzw. + 9 Prozentpunkte bei Geschäftskunden), die 40-€-Pauschale und
  Mahngebühren werden berechnet; Fristen und Gebühren stellen Sie unter *Einstellungen → Mahnwesen* ein.
  **Wichtig:** den aktuellen **Basiszinssatz** (Bundesbank, ändert sich halbjährlich) tragen Sie dort selbst ein - der voreingestellte Wert ist nur ein Startwert.
  Auf der Startseite sehen Sie Vorschläge, welche Rechnungen als Nächstes gemahnt werden sollten.
- **Wiederkehrende Rechnungen**: im Menü (⋮) einer Rechnung "Wiederkehrend einrichten" (Rhythmus, erster Termin, optionales Ende).
  Zu jedem Termin legt die Software einen **Entwurf** an - Sie prüfen und stellen ihn fertig, es wird nie automatisch versendet.
  Verwalten unter *Belege → Wiederkehrende Rechnungen*.
- **Kalkulation für 3D-Druck**: bei Produkten Material (inkl. Ausschuss), Druckzeit und Arbeitszeit eingeben, die Software
  rechnet Strom, Abschreibung, Verschleiß, Arbeit und Gemeinkosten aus und schlägt den Verkaufspreis vor. Die Kosten werden
  einzeln aufgeschlüsselt.
  - **Drucker** (*Katalog → Drucker*): beliebig viele Maschinen anlegen, je mit Anschaffungspreis, Lebensdauer (Druckstunden),
    Leistung (Watt) und Verschleiß/Wartung pro Stunde. Beim Anlegen sehen Sie live die Kosten pro Druckstunde. Die zwei
    vorausgefüllten Drucker sind **Beispielwerte** - bitte an Ihre Maschinen anpassen.
  - **Strompreis und Gemeinkosten-Aufschlag** stehen unter *Einstellungen → Firma → Kalkulation*.
  - Im Produkt wählen Sie den Drucker aus. Ohne Drucker gilt der pauschale Maschinenstundensatz aus den Einstellungen.
- **Steuerberater-Paket** (*Finanzen → Steuerberater*): USt-Übersicht je Zeitraum (zur Orientierung - ersetzt keine
  Umsatzsteuer-Voranmeldung, es wird nach vereinbarten Entgelten gerechnet) und ein ZIP mit allen Rechnungs-PDFs, Belegliste und
  Ausgaben. Es ist **kein DATEV-Format**. Grenzüberschreitende Fälle (innergemeinschaftliche Lieferung, Reverse-Charge) lassen Sie
  bitte von Ihrem Steuerberater bestätigen.
- **Suche überall**: **Strg + K** (am Handy die Lupe) durchsucht Kunden, Belege, Produkte und Ausgaben.
- **Umsatz-Diagramm** auf der Startseite: Umsatz der letzten Monate, Top-Kunden und offene Posten.

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
- **Passwort vergessen**: auf der Anmeldeseite "Passwort vergessen?" - die Software sendet einen Link (eine Stunde gültig,
  einmal verwendbar) an die Adresse des Kontos. Das klappt nur, wenn unter *Einstellungen → E-Mail-Versand* ein Postfach
  hinterlegt ist; sonst setzt ein Admin das Passwort unter *Benutzer* zurück oder Sie nutzen den Notfall-Befehl (INSTALL.md).
- **Logo, Stempel, Unterschrift**: beim Hochladen werden Bilder automatisch umgewandelt, überstehende Ränder abgeschnitten und
  ein weißer/gekachelter Hintergrund transparent gemacht.
- **Testdaten zurücksetzen** (*Einstellungen → Daten → Gefahrenbereich*, nur Admin): löscht alle Belege, Ausgaben und Bankbuchungen
  (auf Wunsch auch Kunden, Produkte und Material) und lässt die Nummern wieder bei 1 beginnen - **nur gedacht für den Moment vor dem
  echten Start**, denn echte Rechnungen dürfen Sie gesetzlich nicht löschen. Der Ablauf ist absichtlich umständlich: vier
  Verständnis-Häkchen, Passwort (und 2FA-Code), 30 Sekunden Bedenkzeit, Firmenname und Bestätigungssatz abtippen, zwei Rückfragen.
  Vorher wird automatisch ein Backup erstellt; schlägt es fehl, wird nichts gelöscht. Sobald echte Rechnungen existieren, sperren Sie die
  Funktion dauerhaft (Knopf im selben Bereich, oder `DISABLE_DATA_RESET=true` in der Server-Konfiguration).
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
