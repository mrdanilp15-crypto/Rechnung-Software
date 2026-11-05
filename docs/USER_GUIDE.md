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
  - **Weitere Kostenpunkte pro Produkt:** Rüstzeit (einmal je Auftrag, verteilt sich auf die Stückzahl - eine Tabelle zeigt Selbstkosten und Preisvorschlag für 1 bis 100 Stück), Verpackung/Versand je Stück und zusätzlicher Materialverlust (z.B. Spülmaterial bei Mehrfarbdruck).
  - **Firmenweit** (*Einstellungen → Firma → Kalkulation*): Fehldruckquote (Aufschlag auf Strom, Abschreibung und Verschleiß), Plattform-/Zahlungsgebühren (werden in den Preisvorschlag eingerechnet), Rundung des Preisvorschlags (z.B. auf ,90) und Mindestpreis.
  - **Staffelpreise:** Im Produkt Preise ab einer Mindestmenge hinterlegen (Button "Aus Kalkulation vorschlagen"). In Angeboten, Aufträgen und Rechnungen setzt sich der Stückpreis passend zur Menge automatisch; ein von Hand geänderter Preis bleibt unangetastet.
  - **Druckplatte:** Passen mehrere gleiche Teile auf eine Platte, tragen Sie im Produkt "Stück pro Druckplatte" ein. Druckzeit und Materialverbrauch geben Sie dann
    für die ganze Platte ein (so wie der Slicer sie anzeigt), die Software verteilt sie auf die Stück. Gespeichert und im Lager abgebucht wird je Stück.
  - **Veredelung / Nachbearbeitung:** Zusatzkosten je Stück als eigene Posten (z.B. Lackieren 40 €, Klarlack 2 €); sie erscheinen einzeln in der Kostenaufstellung.
  - **Materialpreis überschreiben:** Je Materialzeile im Produkt lässt sich ein eigener Preis pro Einheit eintragen (leer = Lagerpreis), z.B. für ein Sondermaterial.
  - **Materialpreis:** Beim Nachbestellen gilt der gleitende Durchschnitt aus Restbestand und neuer Lieferung.
- **Finanzdiagramm** (*Finanzen → EÜR-Übersicht*): Einnahmen (Monat des Zahlungseingangs), Ausgaben (Monat des Belegdatums) und Gewinn pro Monat, dazu die noch offenen
  (unbezahlten) Rechnungen.
- **Steuerberater-Paket** (*Finanzen → Steuerberater*): USt-Übersicht je Zeitraum (zur Orientierung - ersetzt keine
  Umsatzsteuer-Voranmeldung, es wird nach vereinbarten Entgelten gerechnet) und ein ZIP mit allen Rechnungs-PDFs, Belegliste und
  Ausgaben. Es ist **kein DATEV-Format** (das gibt es getrennt, siehe "DATEV-Export" unten). Grenzüberschreitende Fälle (innergemeinschaftliche Lieferung, Reverse-Charge) lassen Sie
  bitte von Ihrem Steuerberater bestätigen.
- **Gemessene Fehldruckquote** (*Einstellungen → Firma → Kalkulation*, unter "Fehldruckquote"): Aus den erkannten Druckaufträgen der letzten 90 Tage (Drucker mit Live-Verbindung) zeigt die Software, wie viele Drucke fehlgeschlagen oder abgebrochen sind und wie viel Druckzeit dabei verloren ging. Der **passende Wert** für das Feld ist verschwendete geteilt durch gute Druckzeit, weil die Kalkulation den Zuschlag auf die Kosten der guten Drucke rechnet; "Übernehmen" trägt ihn ein (danach Speichern nicht vergessen). Abgebrochene Drucke zählen als Fehldruck, auch wenn du sie bewusst gestoppt hast; Drucke ohne erkanntes Ende (z.B. Serverneustart) zählen nicht. Unter 10 Drucken weist die Software auf die geringe Aussagekraft hin.
- **DATEV-Export** (*Finanzen → Steuerberater*, unter dem Steuerberater-Paket; Administratoren und Buchhaltung): Erzeugt einen DATEV-Buchungsstapel (CSV, Format EXTF) für die Einnahmen-Überschuss-Rechnung - **bezahlte Rechnungen zum Zahlungsdatum** (Bank an Erlöse, getrennt nach Steuersatz) und **alle Ausgaben** (Aufwand an Bank). Unter "Einstellungen" wählst du den Kontenrahmen (SKR03/SKR04), trägst Berater-, Mandantennummer und Sachkontenlänge ein (nennt der Steuerberater) und prüfst die Konten: Erlöse (Kleinunternehmer, 19 %, 7 %, steuerfrei), Bank und ein Aufwandskonto je Ausgabenkategorie. Die Konten sind **Vorschläge** - bitte mit dem Steuerberater abstimmen. Bei Kleinunternehmern gibt es keine Steuerschlüssel und keinen Vorsteuerabzug, sonst gelten die DATEV-Schlüssel 3/2 (Umsatzsteuer 19/7 %) und 9/8 (Vorsteuer). Die "Vorschau" zeigt Summen, Hinweise (z.B. noch nicht bezahlte Rechnungen, Auslandsbezug, Kategorien ohne Konto) und die ersten Buchungen; "DATEV-Datei herunterladen" liefert die Datei in Windows-1252. **Nicht enthalten:** Abschreibungen (AfA/GWG) - die bucht der Steuerberater anhand des Anlageverzeichnisses; Rechnungen ohne Zahlungseingang. Wichtig: Das Format und die Kontenvorschläge sind nach der DATEV-Beschreibung gebaut, aber **nicht mit einem echten DATEV-Import geprüft** - lass die Kanzlei einen Testimport machen.
- **Produktdateien mit Versionen** (*Katalog → Produkte → Bearbeiten → "Dateien und Versionen"*, erst nach dem ersten Speichern): Hier hängst du dem Produkt STL-, 3MF-, STEP-Dateien, Bilder oder PDFs an. "Neue Version hochladen" legt die Datei im Belegarchiv ab und macht sie zur nächsten Version (Rev 1, 2, 3 ...) mit optionaler Änderungsnotiz; sie ist dann die **aktuelle Druckdatei**. "Aus dem Archiv zuordnen" nimmt eine schon abgelegte Datei, "Als aktuell setzen" geht zu einer älteren Version zurück, "Lösen" trennt nur die Zuordnung (die Datei bleibt im Archiv). Hat die Datei schon einen Archiv-Eintrag, wird sie nicht doppelt gespeichert - dann über "Aus dem Archiv zuordnen" wählen.
  **Werte aus 3MF übernehmen:** Bei einer fertig geslicten 3MF (in Bambu Studio *Exportieren → G-Code 3MF*) liest die Software Druckzeit und Filamentverbrauch je Platte aus. Du ordnest jedem Filament ein Material zu (Vorschlag nach Filamentart) und übernimmst es in die Kalkulation: Druckzeit und Materialmengen stehen dann für die ganze Platte im Formular (Slicer-Werte inklusive Stützen und Spülmenge) - prüfen und speichern. Optional lässt sich "Stück pro Druckplatte" auf die Zahl der Objekte setzen (nur sinnvoll bei gleichen Teilen). Eine reine Projektdatei ohne G-Code lässt sich nicht auswerten.
- **Belege per E-Mail senden** (Belegliste → "✉ Senden", für Angebote, Aufträge, Lieferscheine und Rechnungen): Empfänger, Betreff und Text prüfen oder ändern, das PDF hängt automatisch an.
  Wichtig: **"Fertigstellen" verschickt nichts** - es macht den Entwurf nur zum fertigen Beleg (ohne Wasserzeichen). Nach dem Fertigstellen öffnet sich deshalb gleich das Sende-Fenster.
  Gesendet wird über Ihr Postfach (Einstellungen → E-Mail-Versand, muss eingerichtet sein). Die Statusanzeige unterscheidet **"Fertig"** (noch nicht per E-Mail verschickt) und **"Versendet"**.
  - **Nochmal senden:** Über "✉ Erneut senden" lässt sich ein Beleg beliebig oft verschicken (z.B. wenn die erste E-Mail nicht angekommen ist), auch an eine andere Adresse. Bei Rechnungen geht das auch für
    bereits bezahlte oder überfällige.
  - **Kopie an mich:** Haken im Sende-Fenster schickt eine verdeckte Kopie an Ihre Absenderadresse.
  - **Aussehen:** Alle E-Mails der Software (Belege, Mahnungen, Passwort-Link) sind als HTML-Nachricht gestaltet: Ihr **Firmenlogo im Kopf** (aus Einstellungen → Logo & Stempel, eingebettet - kein Anhang), Ihre
    Firmenfarbe als Linie, der Text, ein Hinweis auf den Anhang und die Firmendaten im Fuß. Mailprogramme ohne HTML bekommen automatisch die Textfassung.
  - **E-Mail-Vorlagen** (*Einstellungen → Vorlagen*, nur Administratoren): Je Anlass (Angebot, Auftragsbestätigung, Lieferschein, Rechnung, Versandbescheid) kannst du Vorlagen mit Betreff und Text anlegen; "Beispielvorlagen anlegen" erzeugt einen Satz zum Anpassen. Die Vorlage mit "Standard" füllt den Versanddialog des jeweiligen Belegs vor, im Dialog lässt sich eine andere Vorlage wählen, und der Text bleibt vor dem Senden änderbar. Platzhalter wie {kunde}, {ansprechpartner}, {nummer}, {datum}, {faellig}, {betrag}, {firma} werden mit den Daten des Belegs gefüllt (dieselben wie in Begrüßung und Schlusstext), für den Versandbescheid zusätzlich {versanddienst}, {sendungsnummer}, {sendungslink}. Bei einem Rechnungs-Entwurf bleibt {nummer} stehen und wird beim Senden durch die dann vergebene Rechnungsnummer ersetzt.
  - **Textbausteine** (ebenfalls unter *Einstellungen → Vorlagen*): kurze Sätze (Lieferzeit, Garantie, Materialhinweis), die du im Beleg-Editor über "Textbaustein einfügen ..." an Begrüßung oder Schlusstext anhängst.
  - **Versandbescheid:** Beim Verschieben eines Auftrags nach **Versendet** (Produktionsboard) fragt ein Fenster Versanddienst und Sendungsnummer ab und bietet den Versandbescheid per E-Mail an den Kunden an (Text aus der Standardvorlage "Versandbescheid", sonst ein eingebauter Text; vor dem Senden änderbar). Gesendet wird **nur auf Klick**, nie automatisch; ohne eingerichtetes Postfach oder Kundenadresse ist die Option gesperrt. Die Karte zeigt danach Dienst, Nummer und das Datum der Mail; war noch keine Mail draußen, steht dort "Versandmail senden". Die Sendungsverfolgung führt zur Seite von DHL, DPD, GLS, Hermes oder der Deutschen Post (über DHL); die Links werden nicht automatisch geprüft - im Zweifel zählt die Sendungsnummer.
  - Die Software kann nur bestätigen, dass die E-Mail an Ihren Mailserver übergeben wurde - nicht, dass sie gelesen wurde oder im Spam gelandet ist.
- **Tablet und Handy:** Hochkant (bis 1023 px) gibt es oben nur Titel und Suche, unten die Leiste mit Start, Belege, Produktion, Kunden und "Mehr" (dort der Rest, nichts doppelt); in Editoren oben ☰ für das ganze Menü. Quer (ab 1024 px) steht links die Seitenleiste: schmal mit Symbol und Beschriftung, mit dem Pfeil unten ein-/ausklappbar (wird pro Gerät gemerkt); ab 1280 px automatisch voll. Bei als App installierter Seite liegt alles unterhalb der Statusleiste des iPads.
  Listen werden bis 1279 px als Karten gezeigt, darüber als Tabelle. **PDFs** (Vorschau im Editor, PDF-Knöpfe) werden auf Touch-Geräten in der App selbst angezeigt (mit Herunterladen und Teilen) - man muss sie nicht mehr erst herunterladen.
- **Drucker-Live-Anbindung (Bambu Lab, nur lesend)** (*Katalog → Drucker → Bearbeiten → Live-Anbindung*, nur Administratoren): Zeigt im LAN-Modus direkt vom Drucker Zustand,
  Fortschritt mit Restzeit, Schicht, Temperaturen (Düse, Bett, Gehäuse), die **AMS-Spulen** (Material, Farbe, Füllstand, aktive Spule, Feuchte-Stufe), Fehlercodes und bei
  **ein Kamerabild und eine Live-Ansicht** (siehe unten). Auf der Startseite zeigt eine Karte "Drucker live" alle verbundenen Drucker.
  - **Einrichten:** Am Drucker unter Einstellungen → WLAN/Netzwerk den *LAN-Modus* aktivieren - dort stehen IP-Adresse und der 8-stellige *Zugangscode*; die Seriennummer steht unter
    Einstellungen → Gerät. Im Drucker-Formular Modell, IP-Adresse, Seriennummer und Zugangscode eintragen, "Verbindung testen", speichern.
  - **Nur lesend:** Die Software sendet nie Befehle (Pause/Stopp/Start) an den Drucker; der Zugangscode wird verschlüsselt gespeichert und nie angezeigt.
  - **Druckverlauf und Betriebsstunden:** Erkannte Drucke (Start, Ende, Ergebnis fertig/abgebrochen/fehlgeschlagen) werden gespeichert; je Drucker sehen Sie die erfassten
    Druckstunden im Vergleich zur eingetragenen Lebensdauer. Die Zählung beginnt mit der Einrichtung und enthält Pausen.
  - **Voraussetzungen:** Der Server muss den Drucker im Netzwerk erreichen (gleiches Heimnetz oder VPN, z.B. Tailscale); feste IP-Adresse im Router reservieren; es sind nur
    Adressen aus dem eigenen Netz erlaubt. Je nach Modell/Firmware schränkt der LAN-Modus die Bambu-Cloud (Handy-App von unterwegs) ein - Bambu ändert das gelegentlich.
    Pro Drucker besteht eine dauerhafte Verbindung; gleichzeitige Verbindungen anderer Programme (Home Assistant, Bambu Studio im LAN) können sich je nach Modell gegenseitig verdrängen.
  - **Kamera / Live-Ansicht:** P1P, P1S, A1, A1 mini holen Einzelbilder direkt vom Drucker. **X1C, X1E, P2S, H2** haben einen Videostrom (RTSP): Dafür am Drucker unter *Einstellungen → Netzwerk* den **"LAN-Modus-Liveview"** einschalten; der Server wandelt den Strom mit ffmpeg (im Docker-Image enthalten) in Bilder um. Die Live-Ansicht zeigt 1-2 Bilder pro Sekunde, läuft bis zu 15 Minuten und teilt sich pro Drucker EINE Verbindung unter allen Betrachtern.
  - **Material automatisch abbuchen (AMS):** In der Druckerkarte wählt ein Administrator je AMS-Fach unter der Spule "Bucht von: <Material>". Bambu-Spulen mit Chip melden ihren Füllstand in Prozent; sinkt er, wird die Differenz mal Spulengewicht (1000 g) laufend vom Materialbestand abgezogen und im Druckverlauf je Auftrag angezeigt. Beim Zuordnen gilt der aktuelle Füllstand als Ausgangswert (nichts wird rückwirkend gebucht), ein Spulenwechsel setzt nur den Ausgangswert neu. Spulen ohne Chip (Fremdfilament) und die externe Spule lassen sich nicht messen - für Drucke, die Sie über "Druck senden" starten oder dorthin gesendet haben, bucht die Software stattdessen den **Verbrauch laut Slicer** (Gramm je Filament aus der 3MF-Datei) bei Druckende vom zugeordneten Material ab (siehe "Druck senden"). **Wichtig:** Ein so zugeordnetes Material wird nicht zusätzlich über die Rezepte der Rechnungen abgebucht (sonst doppelt); es trägt in der Materialliste das Kennzeichen "AMS-gemessen". Das Material muss in g oder kg geführt werden. Die Messung ist auf ganze Prozent genau (ca. 10 g je Prozent bei 1-kg-Spulen); wegen der laufenden Buchung geht über viele Drucke nichts verloren.
  - **Bereits gelaufene Stunden:** Im Druckerformular gibt es "Bereits gelaufene Stunden (vor der Erfassung hier)" - für gebraucht gekaufte Drucker oder neue, die schon vor der Gewerbeanmeldung liefen. Die Abschreibung rechnet dann Preis ÷ (Lebensdauer minus diese Stunden), und die Druckerkarte zeigt "Gesamt" aus diesen Stunden plus den erfassten.
  - **Benachrichtigungen:** Auf der *Startseite* gibt es die Karte "Meldungen": Druck fertig, Druck fehlgeschlagen und Druckerfehler (mit Code, Bedeutung in der Bambu-Wiki) - nur für Drucker mit Live-Verbindung. Ein Administrator kann dort unter "Einstellungen" zusätzlich eine E-Mail-Benachrichtigung einschalten (nutzt das SMTP-Postfach aus den Einstellungen) und die Ereignisse einzeln wählen. Abgebrochene Drucke melden nichts.
  - **Wartungsplan** (*Katalog → Drucker*, in jeder Druckerkarte "Wartung"): Aufgaben wie "Düse prüfen" mit Intervall in **Betriebsstunden** und/oder **Tagen** (z.B. 300 h oder 90 Tage; das frühere von beiden zählt). "+ Aufgabe" bietet **Richtwerte** an (Platte reinigen, Lüfter, Linearführungen, Düse, AMS, Riemen, Trockenmittel, Gesamtwartung) - bitte nach dem Handbuch deines Druckers anpassen. Die Betriebsstunden sind die vorher gelaufenen Stunden plus die erkannten Druckaufträge (nur bei Druckern mit Live-Verbindung; ohne Live-Verbindung bleibt nur das Tagesintervall sinnvoll). Ist eine Aufgabe fällig, erscheint "Wartung fällig" an der Druckerkarte und **einmal** eine Meldung (Startseite, Push, optional E-Mail; abschaltbar unter "Wartung fällig" in den Einstellungen der Karte "Meldungen"). Mit **Erledigt** beginnt die Zählung neu. Anlegen, ändern und löschen darf nur ein Administrator, "Erledigt" jeder Benutzer.
  - **Mindestbestand bei Material:** Beim Anlegen/Bearbeiten eines Materials (*Katalog → Material*) kannst du einen Mindestbestand eintragen (in der Einheit des Materials, z.B. 500 g). Fällt der Bestand auf diese Menge oder darunter, erscheint in der Liste "wenig", und es kommt **einmal** eine Meldung (Startseite, Push, optional E-Mail; abschaltbar unter *Einstellungen* der Karte "Meldungen" → "Material wird knapp") mit Restmenge und bevorzugtem Lieferant. Erst wenn der Bestand wieder über der Grenze lag (z.B. nach "Nachbestellen"), wird erneut gemeldet. Die Prüfung läuft nach jeder Abbuchung durch einen Druck, nach Änderungen am Material und zusätzlich alle 5 Minuten (für Abbuchungen durch Rechnungen).
- **Push aufs Handy/Tablet:** In der Karte "Meldungen" gibt es "Push aufs Handy/Tablet: Auf diesem Gerät einschalten" - jedes Gerät meldet sich selbst an (Erlaubnis bestätigen). Dann kommen dieselben Meldungen (Druck fertig/fehlgeschlagen/Druckerfehler) als Benachrichtigung aufs Gerät, auch bei geschlossener App. Voraussetzung: die Software läuft über **HTTPS** (Push gibt es sonst nicht), und auf iPhone/iPad muss die Seite über "Teilen → Zum Home-Bildschirm" als App hinzugefügt und von dort geöffnet werden (ab iOS 16.4). "Test senden" prüft es.
  - **Druck senden (nur Administratoren):** In der Druckerkarte "Druck senden": eine **fertig geslicte** Datei aus dem Belegarchiv wählen (in Bambu Studio die Platte slicen und als *G-Code 3MF* exportieren, dann im Archiv ablegen - die reine Projektdatei enthält keinen G-Code und wird abgelehnt), Platte und je Filament ein AMS-Fach wählen (Vorschlag nach Material und Farbe). "Nur senden" legt die Datei per FTPS auf die SD-Karte des Druckers (Start am Drucker); "Senden und starten" startet zusätzlich den Druck - nur im Zustand Bereit/Fertig und nur nach der Bestätigung "Druckplatte ist leer und sauber". Jeder Versand steht im Protokoll. **Materialabbuchung für Spulen ohne Chip:** Die Software merkt sich beim Senden, welches Filament in welchem Fach liegt und wie viele Gramm der Slicer berechnet hat. Beginnt am Drucker ein Auftrag mit demselben Dateinamen (bis 48 Stunden später, auch nach "Nur senden"), wird bei Druckende das Material des Fachs abgebucht, bei Abbruch oder Fehler anteilig nach dem zuletzt gemeldeten Fortschritt. Voraussetzung: Das Fach ist unter "Bucht von" einem Material zugeordnet, und beim Senden wurde ein Fach gewählt. Chip-Spulen werden hier übersprungen (die AMS-Messung bucht sie, nichts doppelt), die externe Spule wird nicht gebucht. Es sind Slicer-Werte - Spülmenge beim Farbwechsel und Abweichungen der Spule sind nicht enthalten; Drucke, die direkt in Bambu Studio oder am Drucker gestartet werden, werden so nicht erfasst. **Der Start ist bisher nur gegen einen simulierten Drucker getestet** - bitte beim ersten Mal mit "Nur senden" beginnen und am Drucker prüfen, dann erst "Senden und starten" mit Aufsicht.
  - Andere Hersteller (Prusa, Creality ...) sind nicht angebunden.
- **Produktbild:** In "Dateien und Versionen" eines Produkts erscheint bei Bilddateien "Als Produktbild". Das Bild steht dann in der Produktliste und im Dashboard bei den aktuellen Aufträgen (zugeordnet über den Positionsnamen, der dem Produktnamen entsprechen muss). Nur Bilder aus dem Belegarchiv sind erlaubt.
- **Einheitliche Bedienelemente:** Eingabefelder übernehmen den Eckenradius des gewählten Designs und zeigen beim Anklicken einen Rahmen in der Akzentfarbe; Zweittext ist im dunklen Modus etwas heller. Die Karten, Tabellen und Dialoge der übrigen Seiten wurden nicht einzeln neu gestaltet - sie übernehmen Farben und Rundungen des Designs.
- **Mitarbeiter, Profilbilder und Zuständigkeit:** Jede Person hat ein eigenes Konto (*Einstellungen → Benutzer*, Rollen Admin / Mitarbeiter / Buchhaltung). Unter *Einstellungen → Mein Konto* wählt jeder sein **Profilbild**: ein eigenes Foto (PNG oder JPEG, wird im Browser quadratisch zugeschnitten und auf 256 Pixel verkleinert, höchstens 512 KB) oder eines von zwölf Symbolen auf einer von zwölf Farben; ohne Auswahl erscheinen die Initialen. Ein Administrator kann in der Benutzerliste (Zeile → *Profilbild ändern*) das Bild anderer festlegen. Jedem **Auftrag** lässt sich ein **Zuständiger** zuordnen: auf der Auftragsseite per Auswahl, auf dem Produktionsboard direkt auf der Karte (Klick auf den Kreis am rechten Rand). Das Board lässt sich nach **Alle / Meine / Nicht zugeordnet / einer Person** filtern, und in "Heute zu tun" blendet **Nur meine** Aufträge anderer aus. Die Zuständigkeit steht im Verlauf des Auftrags und im Protokoll. Deaktivierte Konten lassen sich nicht neu zuordnen; bei einem bestehenden Auftrag bleibt ihr Name als Hinweis stehen.
- **Lager für Fertigteile:** Beim Produkt (Bearbeiten) lässt sich **Lagerbestand führen** einschalten, optional mit Mindestbestand. In der Produktliste zeigt die Zeile dann den Bestand, der Knopf **Bestand** bucht Zugang (z.B. fertig gedruckt), Abgang (z.B. Messe, Ausschuss) oder Inventur. Rechnungen buchen den Bestand beim Fertigstellen automatisch ab; Entwurf löschen, Stornieren und Ändern buchen entsprechend zurück. Wird mehr verkauft als vorrätig, steht der Bestand im Minus und erscheint in "Heute zu tun" als dringend; unter dem Mindestbestand als Hinweis zum Nachproduzieren.
- **Bankabgleich (Finanzen → Bankabgleich):** Der CSV-Import erkennt die üblichen Spaltennamen deutscher Banken (Buchungstag, Betrag, Verwendungszweck, Beguenstigter/Zahlungspflichtiger ...), Datum als TT.MM.JJ(JJ) oder JJJJ-MM-TT und deutsche wie englische Beträge. Dieselbe Datei lässt sich gefahrlos erneut importieren: schon vorhandene Buchungen werden übersprungen. Automatisch als bezahlt zugeordnet wird nur bei Betrag **und** Rechnungsnummer im Verwendungszweck (auch ohne Bindestriche, z.B. RE20260007). Alle übrigen Zahlungseingänge erscheinen unter **Zahlungen zuordnen** mit Vorschlag und Begründung (Betrag, Rechnungsnummer, Name, Skonto-Verdacht); **Zuordnen** markiert die Rechnung als bezahlt, bei abweichendem Betrag nach Rückfrage. Was zu keiner Rechnung gehört (z.B. private Einlage), lässt sich **ausblenden**. Offene Zuordnungen stehen auch in "Heute zu tun".
- **Einstellungen → Schnittstellen:** (1) **API-Schlüssel** für eigene Skripte, n8n, Zapier oder Make - wahlweise nur lesend oder lesend und schreibend; der Schlüssel wird nur einmal angezeigt und gibt nie Zugriff auf Benutzer, Einstellungen, Sicherungen oder Anmeldung. (2) **Webhooks**: Die Software meldet gewählte Ereignisse (Rechnung bezahlt oder überfällig, Angebot angenommen oder abgelaufen, Auftragsstatus geändert, Druck beendet, Material knapp ...) an eine Adresse deiner Wahl, signiert; mit **Test senden** und Anzeige der letzten Zustellung. (3) **Kalender-Abo**: Liefertermine, Zahlungsziele, Angebotsfristen und Wartung erscheinen im Handy-/Outlook-/Google-Kalender (geheime Adresse, keine Beträge).
- **Startseite "Heute zu tun":** Ganz oben steht, was Aufmerksamkeit braucht - überfällige Rechnungen (mit Link zur Mahnung), versandbereite Aufträge, Aufträge versendet aber ohne Rechnung, Liefertermine, Angebote ohne Antwort seit 7 Tagen oder abgelaufen, Material unter Mindestbestand, fällige Wartung, Drucke der letzten Tage ohne Auftrag und lange liegende Entwürfe. Jeder Punkt führt zur Stelle, an der du ihn erledigst; die Liste verändert nichts von selbst. Darunter zeigt (nur Administratoren) eine **Einrichtungs-Checkliste**, was für den vollen Funktionsumfang noch fehlt; sie lässt sich ausblenden.
- **Vorschläge mit einem Klick (Startseite):** Manche Punkte in "Heute zu tun" tragen einen orangen Knopf. Er führt den Vorschlag aus, aber nur auf deinen Klick: **Auftrag auf "In Produktion" setzen**, sobald ihm ein Druck zugeordnet ist; **auf "Versandbereit" setzen**, wenn der letzte zugeordnete Druck fertig ist; **Druck einem Auftrag zuordnen**, wenn der Druckname zu genau einer Auftragsposition passt (oder genau ein Druck und genau ein Auftrag in Produktion sind - sonst wird nicht geraten).
- **Angebote laufen ab und werden nachgefasst:** Versendete Angebote springen einen Tag nach Ende der Gültigkeit automatisch auf **Abgelaufen** (außer es gibt schon Auftrag oder Rechnung dazu); nichts wird gelöscht oder versendet, und ein abgelaufenes Angebot lässt sich weiter annehmen oder in einen Auftrag umwandeln. Ohne Antwort seit 7 Tagen oder abgelaufen erscheint ein Punkt mit **Nachfassen**: Er öffnet die E-Mail mit vorbereitetem Text (Anrede, Angebotsnummer, Betrag) zum Prüfen und Senden - auch über das ⋮-Menü des Angebots.
- **Meldung bei überfälliger Rechnung:** Wird eine Rechnung überfällig, kommt eine Meldung (Startseite, Push, optional E-Mail) - ein-/ausschaltbar bei den Meldungs-Einstellungen. In "Heute zu tun" führt der Punkt direkt zur Mahnung (Erinnerung oder Mahnung vorbereiten).
- **Nachbestellliste:** Unter *Material* zeigt **Nachbestellliste** das Material unter dem Mindestbestand je Lieferant mit Mengenvorschlag (bis auf den doppelten Mindestbestand aufgefüllt, in Schritten von 100 g / 0,5 kg). **E-Mail vorbereiten** öffnet dein Mailprogramm mit fertigem Bestelltext an die Adresse des Lieferanten (Kundennummer inklusive); die Software sendet nichts selbst. Geliefertes buchst du wie gewohnt über **Nachbestellen**. Der Punkt "unter dem Mindestbestand" in "Heute zu tun" öffnet die Liste direkt.
- **Einstellungen → Verbindungen:** Eine Ampel für E-Mail-Versand (mit Probe-Mail), Drucker-Verbindungen, die Adresse der Software für QR-Codes (zeigt sie noch auf localhost?), Push-Meldungen, Backup (letzter Lauf, Knopf "Jetzt sichern") und freien Speicherplatz. Die Einstellungen sind in drei Gruppen geordnet: Mein Betrieb, Verbindungen, Konto & System.
- **"+ Neu" und Schnellaktionen:** Der Knopf **+ Neu** in der oberen Leiste legt Rechnung, Angebot, Auftrag, Lieferschein, Kunde, Produkt, Material oder Ausgabe von jeder Seite aus an. Die Suche (**Strg K**) findet zusätzlich Aktionen wie "Druck starten", "Zeit erfassen", "Wiederkehrende Rechnungen" oder "Verbindungen prüfen".
- **Vorhandenen Druck einem Auftrag zuordnen (von der Auftragsseite):** Im Bereich **Drucke** des Auftrags zeigt **+ Vorhandenen Druck zuordnen** die letzten Drucke der letzten 90 Tage, die noch keinem Auftrag gehören, aus allen Druckern - auch die in Bambu Studio oder am Drucker gestartet wurden. Drucke, deren Name zu einer Position des Auftrags passt, stehen oben mit dem Hinweis "passt zum Auftrag"; **Zuordnen** hängt den Druck an den Auftrag. Zugeordnete Drucke zeigen ihr Material, daneben **festlegen/ändern** (siehe unten) und **Zuordnung lösen**. Die Zuordnung geht weiterhin auch von der Druckerkarte aus (Druckverlauf → Auftrag).
- **Material eines Drucks festlegen (Drucke aus Bambu Studio):** Im Druckverlauf der Druckerkarte steht bei jedem beendeten Druck **"Material festlegen/ändern"**. Die AMS-Messung kennt nur ganze Prozent (bei 1-kg-Spulen etwa 10 g) und nur Fächer mit Zuordnung ("Bucht von"); hier trägst du Material und Gramm selbst ein. Passt der Druckname zu einer 3MF im Archiv (gleicher Name wie in Bambu Studio), schlägt die Software den Slicer-Verbrauch vor. Der Unterschied zum bisher Gebuchten wird im Materialbestand ausgeglichen, die Kosten des Auftrags rechnen mit den neuen Werten. Während der Druck läuft, misst das AMS mit - festlegen kannst du es nach dem Druckende.
- **Vorgangs-Übersicht (Belegkette):** In der Belegliste ist jede Belegnummer antippbar und öffnet die Seite des Vorgangs (Angebot -> eigene Angebotsseite, Auftrag -> Auftragsseite, Rechnung -> Rechnungsseite, Lieferschein -> sein Auftrag; Entwürfe öffnen den Editor). Dort steht im Bereich **Vorgang** die ganze Kette: Angebot -> Auftrag -> Lieferschein -> Rechnung mit Nummer, Status, Datum, Betrag, E-Mail-Versand und PDF; der Beleg, auf dem du gerade bist, ist markiert. **Fehlende Schritte lassen sich direkt anlegen**: z.B. "+ Rechnung schreiben" oder "+ Anzahlungsrechnung" beim Auftrag - auch wenn schon ein Lieferschein existiert -, "+ Lieferschein anlegen" oder beim angenommenen Angebot "+ Auftrag anlegen" bzw. "+ Gleich Rechnung schreiben". Alles wird als Entwurf angelegt und im Editor geöffnet. Die Angebotsseite bietet außerdem PDF, Senden, Nachfassen, Angenommen und Abgelehnt. In der Liste zeigt ein Auftrag mit Lieferschein, aber ohne Rechnung weiterhin den Knopf **→ Rechnung** (Hinweis "Lieferschein ✓"); erst eine Rechnung zählt als abgerechnet.
- **Angebot und Auftrag nachträglich verknüpfen:** Wurde ein Auftrag separat angelegt (nicht aus dem Angebot heraus), kennt die Software die Verbindung nicht und das Angebot bietet weiter "→ Auftrag anlegen" an. Über das ⋮-Menü lässt sich beides verknüpfen: beim Angebot **Mit vorhandenem Auftrag verknüpfen**, beim Auftrag **Mit Angebot verknüpfen** (nur Belege desselben Kunden). Das Angebot gilt danach als angenommen und weitergeführt ("✓ weitergeführt"). **Verknüpfung mit Angebot lösen** macht es rückgängig. Klickst du bei einem Angebot auf "→ Auftrag anlegen", obwohl es für den Kunden schon einen nicht verknüpften Auftrag mit gleichem Betrag gibt, zeigt die Software diese Aufträge zur Auswahl an - mit der Möglichkeit, trotzdem einen neuen anzulegen.
- **Nächster Schritt bei Belegen:** In *Belege* zeigt jede Zeile den nächsten Schritt als orangen Knopf: beim fertigen Angebot **"Angenommen → Auftrag"** (markiert es als angenommen und legt die Auftragsbestätigung an), beim angenommenen Angebot **"→ Auftrag anlegen"**, beim fertigen Auftrag **"→ Rechnung"**. Lieferschein, Anzahlungsrechnung und alles Weitere steht weiter im ⋮-Menü.
- **Druck starten:** Am schnellsten über den Auftrag (Abschnitt **Drucke → "Jetzt drucken"**): dort stehen die 3MF-Dateien des Auftrags und die aktuelle Version der Produkte, deren Name einer Position entspricht, jeweils mit **Drucken**-Knopf; ebenso bei jeder 3MF unter *Produkt → Dateien*. Der Dialog öffnet mit gewählter Datei und Auftrag (bei mehreren Druckern fragt er vorher, auf welchem) und zeigt ein **Vorschaubild der Platte**. Über die Druckerkarte ("Druck senden") wählst du die Datei aus einer durchsuchbaren Liste; Dateien, die einem Produkt zugeordnet sind, stehen oben mit Produktname und Version.
- **Artikelnummern:** Produkte und Material haben eine Artikelnummer (SKU). Beim Anlegen trägt die Software automatisch die **nächste freie Nummer** ein (aus deinen vorhandenen abgeleitet: gleiches Präfix und gleiche Stellenzahl, höchste Zahl plus eins, z.B. P-0007 → P-0008; ohne vorhandene Nummern P-0001 bzw. M-0001). Der Knopf **Nächste frei** setzt sie jederzeit neu, und beim Tippen prüft das Feld die Nummer live: grün "Frei" oder rot "Schon vergeben an ...". Gelöschte (archivierte) Artikel blockieren ihre Nummer nicht mehr. Doppelte Nummern lehnt auch der Server ab (Groß-/Kleinschreibung egal) und nennt dabei die nächste freie. Du kannst das Feld leer lassen oder eigene **Reihen je Thema** verwenden, z.B. HW-1, HW-2 für Halloween und T4-1, T4-2 für den T4: Tippst du nur das Präfix ("HW-" oder "HW"), schlägt das Feld die nächste Nummer dieser Reihe vor (HW-3) und übernimmt sie per Klick; "Nächste frei" macht dasselbe. Jede Reihe zählt für sich, eine neue Reihe (z.B. "XY-") beginnt bei 1.
- **QR-Etiketten und Spulen:** Unter *Katalog → Material* (⋮ → "QR-Etikett und Spulen"), bei Produkten und Druckern (Link "QR") gibt es zu jedem Artikel eine Seite mit QR-Code. Beim Material legst du **einzelne Spulen** an (Anzahl, Gewicht, Bezeichnung); jede Rolle bekommt ihren eigenen Code. Scannst du ihn mit dem Handy, öffnet sich die Spule: **Restmenge**, Erwerbsdatum, Notiz, "aufgebraucht" und das Kennzeichen **Altbestand** (war schon vor dem Start des Geschäfts, z.B. vor der Gewerbeanmeldung, vorhanden). Das Kennzeichen dient nur der Kennzeichnung - Materialbestand und Ausgaben ändert es nicht. **Etiketten** gibt es als PDF in 62 × 29 mm (Brother QL), 50 × 30 mm oder als A4-Bogen (3 × 8) und werden über den normalen Druckdialog gedruckt. Der Code enthält nur einen Link auf die Software (Adresse aus PUBLIC_APP_URL; ohne gesetzte Adresse die, unter der du gerade arbeitest - für Scans von außen also HTTPS-Adresse eintragen). Wer scannt, muss angemeldet sein; nach der Anmeldung landet er direkt auf der gescannten Seite.
- **Druckerbild:** In jeder Druckerkarte (*Drucker*) gibt es "Bild hinzufügen/ändern" und "entfernen". Das Foto liegt im Belegarchiv und erscheint in der Druckerkarte und in der **Druckerübersicht auf der Startseite**. Produkte, Material und Drucker sowie die Lieferanten erreichst du direkt über die Seitenleiste; die früheren Reiter oben auf diesen Seiten sind entfallen (doppelte Navigation).
- **Statistiken** (Menüpunkt *Statistiken*): Je Jahr Umsatz, Ausgaben und Ergebnis mit **Vorjahresvergleich** (Prozent), Umsatz je Monat als Balken (Jahr gegen Vorjahr), **Bestseller** nach verkaufter Menge (aus den Rechnungspositionen, gleiche Namen zusammengefasst), **beste Kunden**, **Drucker** (Stunden, Drucke, Fehldrucke) und **Materialverbrauch** aus den Druckaufträgen. Umsatz ist netto aus gestellten Rechnungen nach Rechnungsdatum; Drucker- und Materialwerte gibt es nur für Drucke, die über die Drucker-Anbindung erkannt und gebucht wurden.
- **Auftragsseite** (im Auftragsboard auf die Nummer oder "Details" klicken, auch vom Dashboard): Alles zu einem Auftrag an einem Ort - Kundendaten, Auftragswert, Liefertermin, Druck- und Arbeitszeit, **Positionen**, verknüpfte **Belege** (Angebot, Lieferschein, Rechnungen), zugeordnete **Drucke**, **Versand**, **Kommentare** (z.B. Kundenwünsche), **Dateien** (hochladen oder aus dem Belegarchiv zuordnen; sie liegen im Archiv und sind dort durchsuchbar) und ein gemeinsamer **Verlauf** aus Statuswechseln, Kommentaren, Drucken, erfassten Zeiten und Dateien. Die **Priorität** (normal, hoch, dringend) stellst du oben ein; hohe und dringende Aufträge stehen im Board zuerst und tragen ein Zeichen. Der Knopf "Kosten" öffnet den Soll-Ist-Vergleich.
- **Zeiterfassung** (Menüpunkt *Zeit*): Arbeitszeit mit **Start/Stopp** (laufende Zeit wird angezeigt) oder über "Zeit nachtragen" (Datum, Beginn, Dauer als "1:30", "1,5" oder "90 min"), je mit **Tätigkeit** (Produktion, Nacharbeit, Verpackung, Konstruktion, Kundenkontakt, Verwaltung, Sonstiges), optional einem **Auftrag** und Notiz. Pro Benutzer läuft höchstens eine Zeit gleichzeitig. Jeder erfasst und ändert seine eigene Zeit (ein Administrator auch fremde); Administratoren und Buchhaltung sehen alle Benutzer. Die Monate gelten nach deutscher Zeit. Oben stehen Monatssumme und Summe je Tätigkeit; **Stundenzettel (PDF)** mit Unterschriftszeilen gibt es je Monat und Benutzer, die **CSV** (Semikolon, Dezimalstunden, mit BOM für Excel) für den Steuerberater nur für Administratoren und Buchhaltung. **Arbeitskosten am Auftrag:** Die auf einen Auftrag gebuchten Zeiten mal Arbeitsstundensatz (Einstellungen → Firma → Kalkulation) erscheinen unter *Produktion → Kosten* als Zeile "Arbeit" im Soll-Ist-Vergleich. **Hinweis:** Das ist eine Zeit- und Kostenerfassung, keine Lohnabrechnung - Lohn, Lohnsteuer und Sozialversicherung macht der Steuerberater oder eine Lohnsoftware; ebenso sind gesetzliche Vorgaben zur Arbeitszeitaufzeichnung bei Angestellten nicht automatisch erfüllt.
- **Produktionsboard** (Menüpunkt *Produktion*): Jede Auftragsbestätigung erscheint als Karte in den Spalten **Erstellt → In Produktion → Versandbereit → Versendet**.
  Karten per Ziehen oder mit den Pfeil-Knöpfen (auch am Handy) verschieben; eine Notiz pro Karte (z.B. Farbe, Sendungsnummer). Die Karte zeigt Positionen, Betrag,
  gewünschtes Lieferdatum (rot, wenn überschritten) und eine geschätzte Druckzeit (wenn der Positionstext dem Namen eines Produkts mit Druckzeit entspricht).
  **Drucke und Kosten pro Auftrag:** Beim Senden eines Drucks (Druckerkarte → *Druck senden*) kannst du unter "Für Auftrag" den Auftrag wählen; Drucke, die du anders gestartet hast, ordnest du in der Druckerkarte unter *Druckverlauf* je Druck einem Auftrag zu (oder löst die Zuordnung wieder). Die Karte zeigt dann ein grünes Zeichen mit Anzahl, Druckzeit und Gramm, und der Knopf **Kosten** zeigt Soll (Kalkulation der Produkte in den Positionen) gegen Ist: Druckzeit, Material (Einkaufspreis bei der Abbuchung) und Maschine (Strom, Abschreibung auf die Restlebensdauer, Verschleiß je Betriebsstunde), dazu was vom Auftragswert nach Material und Maschine übrig bleibt. Fehldrucke zählen mit, weil sie echtes Geld kosten. **Nicht enthalten** sind Arbeit, Verpackung, Gemeinkosten und der Spülanteil beim Farbwechsel (der Slicer nennt ihn nicht). Der Soll-Wert braucht ein Produkt im Katalog mit genau dem Namen der Position (erste Zeile).
  **Ist-Kosten je Produkt:** Im Katalog zeigt jedes Produkt, das in Aufträgen mit zugeordneten Drucken vorkommt, unter den Kosten eine Zeile "Ist je Stück" mit Material und Maschine und der Abweichung zur Kalkulation. Berücksichtigt werden nur Aufträge, in denen genau eine Position einem Produkt entspricht (sonst lässt sich nicht sagen, welcher Druck zu welchem Produkt gehörte).
  Versendete Aufträge verschwinden nach 14 Tagen vom Board. Der Produktionsstatus ändert weder Beleg noch Materialbestand.
- **Etsy-Import** (*Produktion → Etsy-Import*): Etsy-Bestellungen aus dem CSV-Export ("Bestellte Artikel" unter Shop-Manager → Einstellungen → Optionen → Daten herunterladen)
  übernehmen. Erst Vorschau mit Auswahl, dann werden je Bestellung ein Kunde (falls neu) und ein **Auftrag als Entwurf** angelegt, der direkt im Produktionsboard erscheint.
  Bereits importierte Bestellungen erkennt die Software an der Etsy-Bestellnummer. Rabatte/Gutscheine und Fremdwährungen werden nicht automatisch verrechnet (Hinweis in der
  Vorschau). Es gibt keine Live-Verbindung zu Etsy; Etsy-Gebühren tragen Sie als Ausgabe ein.
- **Lieferanten** (*Katalog → Lieferanten*): Händler mit Kontaktdaten, Ihrer Kundennummer dort und Summen (gesamt, dieses Jahr, zuletzt eingekauft). Ausgaben werden automatisch
  zugeordnet, wenn der Händlername dem Lieferantennamen entspricht; bei Material wählen Sie den Lieferanten, Nachbestellungen werden dann auf ihn gebucht.
- **Anlageverzeichnis** (*Finanzen → Anlagen*): Drucker, Werkzeug und andere größere Anschaffungen mit **GWG-Sofortabzug** (bis 800 € netto) oder **linearer Abschreibung (AfA)**
  über die Nutzungsdauer (im Anschaffungsjahr zeitanteilig ab dem Kaufmonat). Eine bereits erfasste Ausgabe lässt sich verknüpfen - dann zählt die EÜR statt des vollen Betrags nur
  die Abschreibung des Jahres (kein doppeltes Absetzen). Kleinunternehmer tragen den Bruttobetrag ein. Das Steuerberater-Paket enthält ein Anlagenverzeichnis (CSV).
  Nutzungsdauer und GWG-Grenze bitte mit dem Steuerberater abstimmen (Hinweis: für 3D-Drucker ist die Einordnung nicht eindeutig).
- **Darstellung** (*Einstellungen → Darstellung*, nur Admin): **Akzentfarbe** für Knöpfe, Menü, Links und Diagramme (acht Vorschläge oder eigene Farbe),
  **Design** (Farbwelt, gilt im hellen und im dunklen Modus) und **Programmname**. Es gibt sechs Designs: *Klassisch* (kühles Blaugrau), *Werkstatt* (warme Braun-
  und Steintöne), *Graphit* (neutrales Anthrazit), *Mitternacht* (tiefes Nachtblau mit leuchtenden Karten), *Wald* (dunkles Tannengrün) und *Aurora* (Blauviolett).
  Mit dem Design wird die dazu passende Akzentfarbe vorgeschlagen, die du jederzeit ändern kannst; die Auswahl wirkt sofort und gilt nach "Speichern" für alle
  Benutzer und Geräte. Der **Programmname** erscheint in der Seitenleiste, auf der Anmeldeseite und im Browser-Tab (leer = "Rechnungssoftware"); das Logo für Belege stellst
  du unter "Logo & Stempel" ein. Die PDF-Belege haben ihre eigene Farbe. Hell/Dunkel wechselst du oben rechts (Sonne/Mond, je Gerät).
- **Seitenleiste und obere Leiste:** Die Seitenleiste führt flach zu Start, Aufträge, Belege, Kunden, Produkte, Material, Drucker, Zeit, Finanzen, Belegarchiv und Einstellungen
  (Produkte, Material und Drucker sind die Reiter des Katalogs, direkt erreichbar). Oben (ab Tablet quer) stehen die Suche (Strg K), Hell/Dunkel, die **Glocke** mit der Zahl der
  ungelesenen Meldungen (führt zur Karte "Meldungen" auf der Startseite) und das **Benutzermenü** (Einstellungen, Sprache, Abmelden). Am Handy gibt es eine Leiste unten mit Start,
  Belege, Aufträge, Kunden und "Mehr" (öffnet das ganze Menü mit Hell/Dunkel, Sprache und Abmelden).
- **Startseite (Dashboard):** Begrüßung mit Kurzlage ("2 Aufträge warten auf Bearbeitung"), darunter die Meldungen (einklappbar; gleiche Meldungen werden zusammengefasst), Hinweise
  zur Kleinunternehmergrenze und fällige Mahnungen. Fünf Kennzahlen: **Aktive Aufträge** (mit "seit gestern"), **Drucker online** (nur Drucker mit Live-Verbindung), **Umsatz des Monats**
  (netto, mit Vergleich zum Vormonat), **Materialbestand** (Summe in kg bei Material in g/kg, mit Zahl der Artikel unter dem Mindestbestand) und **Offene Rechnungen**. Darunter die
  **Druckerübersicht** (Status, Fortschritt, Restzeit, aktives Material, Temperaturen, Fehlercode), die **aktuellen Aufträge** (nach Liefertermin, mit Status), **Umsatz & Gewinn**
  (aufgelaufen seit dem 1. des Monats oder die letzten 12 Monate; Gewinn ist hier das Ergebnis vor Steuern), das **Materiallager** (knappe zuerst, Balken im Verhältnis zum Mindestbestand),
  Schnellaktionen, Rechnungen nach Status, beste Kunden und die letzte Aktivität. **Nicht enthalten**, weil es dafür keine Daten gibt: Kundenzufriedenheit, Bewertungen, ein KI-Assistent.
- **Belegarchiv** (Menüpunkt *Belegarchiv*): Ablage für alle Unterlagen, die nicht in der Software entstehen - Eingangsrechnungen,
  Quittungen, Kontoauszüge, Verträge, Versicherungen, Bescheide, Schriftverkehr. Hochladen per Klick oder Drag & Drop (bis zu 20 Dateien
  gleichzeitig; PDF, Fotos, Word/Excel/LibreOffice, CSV, Text, XML, ZIP sowie 3D-Dateien wie STL, 3MF, STEP, OBJ und G-Code; je Datei max. 25 MB). Je Dokument: Titel, Kategorie, Belegdatum,
  Aussteller, Betrag, Tags, Notiz.
  - **Suche:** über Titel, Aussteller, Notizen, Tags, Dateiname **und den Text im PDF** (mehrere Suchwörter müssen alle vorkommen;
    Scans und Fotos ohne Textebene findet man über Titel/Tags/Notizen - dort bitte einen aussagekräftigen Titel vergeben).
  - **Filter und Sortierung:** Kategorie, Jahr, Zeitraum, Tag; sortierbar nach Belegdatum, Titel, Aussteller, Betrag, Hinzugefügt, Größe
    (auch per Klick auf die Spaltenüberschriften).
  - **Aufbewahrung:** Zu jeder Kategorie wird das Ende der gesetzlichen Frist angezeigt (Buchungsbelege 8 Jahre, Geschäftsbriefe 6 Jahre,
    ab Ende des Belegjahres); vor dem Löschen erscheint eine Warnung. Doppelte Dateien werden erkannt und nicht erneut abgelegt.
  - **Beleg scannen (lokale Texterkennung):** *Finanzen → Ausgaben → Beleg scannen*. Foto aufnehmen oder Foto/PDF wählen; die App liest den Text **direkt im Browser**
    (Tesseract, deutsches Sprachpaket liegt in der App) - es geht nichts an einen Cloud-Dienst. PDFs mit Textebene werden direkt gelesen, gescannte PDFs und Fotos per
    Erkennung. Vorgeschlagen werden Datum, Händler, Bruttobetrag, MwSt-Satz (mit Gegenprobe Netto + Steuer = Brutto), Belegnummer und Kategorie; Händler, die schon
    vorkommen, bringen ihre bisherige Kategorie und ihren Steuersatz mit, mögliche Doppelerfassungen werden gemeldet. Jedes Feld zeigt "sicher", "bitte prüfen" oder "nicht
    erkannt". **Nachbessern:** Felder ändern, Alternativen (andere Beträge/Daten/Händler) antippen, im Aufklappbereich "Erkannten Text prüfen" einzelne Zeilen als Betrag/Datum/Händler
    übernehmen oder den Text korrigieren und neu auswerten, das Foto drehen oder mit mehr Kontrast neu lesen. Gebucht wird nie automatisch - erst "Ausgabe speichern". Das Foto
    wird als Beleg an der Ausgabe und im Belegarchiv abgelegt. Beim ersten Mal lädt die Erkennung einmalig ca. 5 MB nach und läuft danach auch ohne Netz.
    Grenzen: Sehr unscharfe, schräge oder handschriftliche Belege liest sie schlecht - dann gerade und hell fotografieren oder von Hand nachbessern.
  - **Belege von Ausgaben:** Bei *Finanzen → Ausgaben → Neue Ausgabe* können Sie den Beleg (PDF oder Foto, bis 25 MB) gleich mit hochladen. Er hängt
    an der Ausgabe ("Beleg"-Link in der Liste) und wird **automatisch zusätzlich im Belegarchiv abgelegt** (Kennzeichnung "aus Ausgabe", Kategorie
    Eingangsrechnung, Tags "ausgabe" und die Ausgabenkategorie). Löschen Sie später die Ausgabe, bleibt die Archiv-Kopie bestehen. Belege, die schon
    vor dieser Funktion an Ausgaben hingen, übernehmen Sie über den Hinweis oben im Archiv ("Jetzt ins Archiv übernehmen").
  - **Export:** "ZIP-Export" lädt die aktuelle Auswahl als ZIP mit Übersichtsliste (index.csv). Das Steuerberater-Paket enthält die
    Archiv-Dokumente des gewählten Jahres. Die Dateien sind im täglichen Backup enthalten.
  - Das Archiv ist eine Ablage, **kein revisionssicheres GoBD-Archiv**: Dokumente lassen sich bearbeiten und löschen (jede Änderung steht im
    Audit-Log). Für die rechtssichere Aufbewahrung sorgt das Backup - bitte regelmäßig prüfen, dass es auch extern gesichert wird.
- **Versandetikett:** In der Belegliste (Menü "⋮" bei Rechnungen, Lieferscheinen, Auftragsbestätigungen) und auf der Kundenseite: Adressaufkleber als PDF in 10 × 15 cm, A6 oder 62 × 100 mm (Brother QL), Empfänger groß (Ausland mit Land), Absender klein, optional mit Hinweis unten. Gedruckt wird über den normalen Druckdialog (jeder Etikettendrucker mit Treiber; dort die Papiergröße des Etiketts wählen). Es werden **keine DHL/DPD-Versandmarken** erzeugt - dafür bräuchte es einen Geschäftskunden-Zugang des Versanddienstes.
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
  Das **Belegarchiv bleibt vom Zurücksetzen unberührt**.
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
