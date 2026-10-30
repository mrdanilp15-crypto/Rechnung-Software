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
  Ausgaben. Es ist **kein DATEV-Format**. Grenzüberschreitende Fälle (innergemeinschaftliche Lieferung, Reverse-Charge) lassen Sie
  bitte von Ihrem Steuerberater bestätigen.
- **Belege per E-Mail senden** (Belegliste → "✉ Senden", für Angebote, Aufträge, Lieferscheine und Rechnungen): Empfänger, Betreff und Text prüfen oder ändern, das PDF hängt automatisch an.
  Wichtig: **"Fertigstellen" verschickt nichts** - es macht den Entwurf nur zum fertigen Beleg (ohne Wasserzeichen). Nach dem Fertigstellen öffnet sich deshalb gleich das Sende-Fenster.
  Gesendet wird über Ihr Postfach (Einstellungen → E-Mail-Versand, muss eingerichtet sein). Die Statusanzeige unterscheidet **"Fertig"** (noch nicht per E-Mail verschickt) und **"Versendet"**.
  - **Nochmal senden:** Über "✉ Erneut senden" lässt sich ein Beleg beliebig oft verschicken (z.B. wenn die erste E-Mail nicht angekommen ist), auch an eine andere Adresse. Bei Rechnungen geht das auch für
    bereits bezahlte oder überfällige.
  - **Kopie an mich:** Haken im Sende-Fenster schickt eine verdeckte Kopie an Ihre Absenderadresse.
  - **Aussehen:** Alle E-Mails der Software (Belege, Mahnungen, Passwort-Link) sind als HTML-Nachricht gestaltet: Ihr **Firmenlogo im Kopf** (aus Einstellungen → Logo & Stempel, eingebettet - kein Anhang), Ihre
    Firmenfarbe als Linie, der Text, ein Hinweis auf den Anhang und die Firmendaten im Fuß. Mailprogramme ohne HTML bekommen automatisch die Textfassung.
  - Die Software kann nur bestätigen, dass die E-Mail an Ihren Mailserver übergeben wurde - nicht, dass sie gelesen wurde oder im Spam gelandet ist.
- **Tablet und Handy:** Hochkant (bis 1023 px) gibt es oben nur Titel und Suche, unten die Leiste mit Start, Belege, Produktion, Kunden und "Mehr" (dort der Rest, nichts doppelt); in Editoren oben ☰ für das ganze Menü. Quer (ab 1024 px) steht links die Seitenleiste: schmal mit Symbol und Beschriftung, mit dem Pfeil unten ein-/ausklappbar (wird pro Gerät gemerkt); ab 1280 px automatisch voll. Bei als App installierter Seite liegt alles unterhalb der Statusleiste des iPads.
  Listen werden bis 1279 px als Karten gezeigt, darüber als Tabelle. **PDFs** (Vorschau im Editor, PDF-Knöpfe) werden auf Touch-Geräten in der App selbst angezeigt (mit Herunterladen und Teilen) - man muss sie nicht mehr erst herunterladen.
- **Drucker-Live-Anbindung (Bambu Lab, nur lesend)** (*Katalog → Drucker → Bearbeiten → Live-Anbindung*, nur Administratoren): Zeigt im LAN-Modus direkt vom Drucker Zustand,
  Fortschritt mit Restzeit, Schicht, Temperaturen (Düse, Bett, Gehäuse), die **AMS-Spulen** (Material, Farbe, Füllstand, aktive Spule, Feuchte-Stufe), Fehlercodes und bei
  **P1P, P1S, A1 und A1 mini ein Kamerabild** (Einzelbild per Knopfdruck). Auf der Startseite zeigt eine Karte "Drucker live" alle verbundenen Drucker.
  - **Einrichten:** Am Drucker unter Einstellungen → WLAN/Netzwerk den *LAN-Modus* aktivieren - dort stehen IP-Adresse und der 8-stellige *Zugangscode*; die Seriennummer steht unter
    Einstellungen → Gerät. Im Drucker-Formular Modell, IP-Adresse, Seriennummer und Zugangscode eintragen, "Verbindung testen", speichern.
  - **Nur lesend:** Die Software sendet nie Befehle (Pause/Stopp/Start) an den Drucker; der Zugangscode wird verschlüsselt gespeichert und nie angezeigt.
  - **Druckverlauf und Betriebsstunden:** Erkannte Drucke (Start, Ende, Ergebnis fertig/abgebrochen/fehlgeschlagen) werden gespeichert; je Drucker sehen Sie die erfassten
    Druckstunden im Vergleich zur eingetragenen Lebensdauer. Die Zählung beginnt mit der Einrichtung und enthält Pausen.
  - **Voraussetzungen:** Der Server muss den Drucker im Netzwerk erreichen (gleiches Heimnetz oder VPN, z.B. Tailscale); feste IP-Adresse im Router reservieren; es sind nur
    Adressen aus dem eigenen Netz erlaubt. Je nach Modell/Firmware schränkt der LAN-Modus die Bambu-Cloud (Handy-App von unterwegs) ein - Bambu ändert das gelegentlich.
    Pro Drucker besteht eine dauerhafte Verbindung; gleichzeitige Verbindungen anderer Programme (Home Assistant, Bambu Studio im LAN) können sich je nach Modell gegenseitig verdrängen.
  - Kamerabild bei X1/P2S/H2 (Videostrom) wird nicht unterstützt. Andere Hersteller (Prusa, Creality ...) sind nicht angebunden.
- **Produktionsboard** (Menüpunkt *Produktion*): Jede Auftragsbestätigung erscheint als Karte in den Spalten **Erstellt → In Produktion → Versandbereit → Versendet**.
  Karten per Ziehen oder mit den Pfeil-Knöpfen (auch am Handy) verschieben; eine Notiz pro Karte (z.B. Farbe, Sendungsnummer). Die Karte zeigt Positionen, Betrag,
  gewünschtes Lieferdatum (rot, wenn überschritten) und eine geschätzte Druckzeit (wenn der Positionstext dem Namen eines Produkts mit Druckzeit entspricht).
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
- **Darstellung** (*Einstellungen → Darstellung*, nur Admin): **Akzentfarbe** für Knöpfe, Menü, Links und Diagramme (acht Vorschläge oder eigene Farbe)
  und **Stil des dunklen Designs** (warm = braune Töne, kühl = Blau-Schwarz). Gilt für alle Benutzer und Geräte; die PDF-Belege haben ihre eigene
  Farbe unter "Logo & Stempel". Hell/Dunkel wechseln Sie unten im Menü (Mond/Sonne, je Gerät). Am Handy gibt es eine Leiste unten mit Start, Belege,
  Kunden, Katalog und "Mehr" (öffnet das ganze Menü). Die **Startseite** zeigt Umsatz, Ausgaben und Ergebnis des Monats, offene Posten, ein
  Diagramm Umsatz/Ausgaben der letzten 12 Monate, die Rechnungen nach Status und die letzte Aktivität.
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
  - **Belege von Ausgaben:** Bei *Finanzen → Ausgaben → Neue Ausgabe* können Sie den Beleg (PDF oder Foto, bis 25 MB) gleich mit hochladen. Er hängt
    an der Ausgabe ("Beleg"-Link in der Liste) und wird **automatisch zusätzlich im Belegarchiv abgelegt** (Kennzeichnung "aus Ausgabe", Kategorie
    Eingangsrechnung, Tags "ausgabe" und die Ausgabenkategorie). Löschen Sie später die Ausgabe, bleibt die Archiv-Kopie bestehen. Belege, die schon
    vor dieser Funktion an Ausgaben hingen, übernehmen Sie über den Hinweis oben im Archiv ("Jetzt ins Archiv übernehmen").
  - **Export:** "ZIP-Export" lädt die aktuelle Auswahl als ZIP mit Übersichtsliste (index.csv). Das Steuerberater-Paket enthält die
    Archiv-Dokumente des gewählten Jahres. Die Dateien sind im täglichen Backup enthalten.
  - Das Archiv ist eine Ablage, **kein revisionssicheres GoBD-Archiv**: Dokumente lassen sich bearbeiten und löschen (jede Änderung steht im
    Audit-Log). Für die rechtssichere Aufbewahrung sorgt das Backup - bitte regelmäßig prüfen, dass es auch extern gesichert wird.
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
