# Prüfung: Automationen, Schnittstellen, Verbindungen, Auffindbarkeit (November 2026)

Grundlage: Durchsicht des Codes (Seiten, Menü, Einstellungen, Hintergrundjobs, Schnittstellen) und stichprobenartiges Ausprobieren in der laufenden Software.
Nicht geprüft: echte Hardware (Bambu-Drucker, Handy-Scan, Etikettendrucker), echter E-Mail-Versand, Push.

Ziel: so einfach und übersichtlich wie möglich, keine Funktion versteckt.

## 1. Was heute automatisch läuft (Stand)

| Automatik | Wann | Was passiert |
|---|---|---|
| Überfällige Rechnungen | stündlich | Status wird auf "Überfällig" gesetzt; Dashboard zeigt die Liste |
| Wiederkehrende Rechnungen | stündlich | fällige Vorlagen werden als **Entwurf** angelegt (nie automatisch gesendet) |
| Mindestbestand Material | alle 5 Minuten | Meldung (Startseite, Push) und optional E-Mail |
| Wartung Drucker | alle 5 Minuten | Meldung, wenn Intervall (Stunden/Tage) erreicht ist |
| Backup | täglich (einstellbar) | ZIP im Backup-Ordner, optional S3-Upload |
| Drucker-Live (Bambu) | dauerhaft | Status, AMS, Druckverlauf, Meldungen bei Fehler/Fertig, Materialabbuchung (AMS-Füllstand bzw. Slicer-Werte) |
| Rechnung erstellen | beim Fertigstellen | Materialbestand wird nach Produktrezept abgebucht |
| Bankimport (CSV) | beim Import | Zahlung wird einer Rechnung zugeordnet, wenn Betrag **und** Rechnungsnummer im Verwendungszweck stimmen -> Rechnung "Bezahlt" |
| Belegnummern | beim Fertigstellen | lückenlos fortlaufend |

## 2. Lücken bei Automationen (nach Nutzen sortiert)

**A. Auftrag kennt den Stand der Arbeit nicht von selbst.**
Der Produktionsstatus (Erstellt -> In Produktion -> Versandbereit -> Versendet) wird nur von Hand verschoben.
Ableitbar wäre: Druck für den Auftrag gestartet -> "In Produktion"; alle zugeordneten Drucke fertig -> Vorschlag "Versandbereit"; Rechnung bezahlt und versendet -> Auftrag abgeschlossen.
Vorschlag: nie stillschweigend ändern, sondern als **Vorschlag mit einem Klick** anbieten (Hinweis am Auftrag und im Dashboard).

**B. Kein zentraler "Heute zu tun"-Block.**
Einzelne Meldungen gibt es (überfällige Rechnungen, Mindestbestand, Wartung), aber nicht an einer Stelle. Fehlen: Angebote ohne Antwort seit X Tagen, abgelaufene Angebote, Aufträge versandbereit aber nicht versendet, versendet aber keine Rechnung, Entwürfe, die lange liegen, Termine in den nächsten Tagen.

**C. Angebote laufen nicht selbst ab und werden nicht nachgefasst.**
`validUntil` wird gesetzt (Standard 30 Tage), aber der Status "Abgelaufen" entsteht nie automatisch, und es gibt keine Erinnerung zum Nachfassen. Die E-Mail-Vorlage dafür fehlt.

**D. Überfällig = nur Anzeige.**
Es kommt keine Benachrichtigung (Push/E-Mail an dich), und die Zahlungserinnerung wird nicht vorbereitet. Vorschlag: bei "überfällig" Meldung + fertiger Erinnerungs-Entwurf zum Senden per Klick (Mahnwesen existiert, ist aber nur manuell in der Rechnung erreichbar).

**E. Drucke, die nicht über die Software gestartet werden, gehören keinem Auftrag.**
Läuft ein Druck direkt am Drucker oder aus Bambu Studio, fehlt die Zuordnung (und damit Zeit/Material im Auftrag). Vorschlag: Zuordnungsvorschlag nach Dateiname = Produktname bzw. nach dem einzigen Auftrag "In Produktion"; Meldung "Druck fertig - welchem Auftrag zuordnen?" mit einem Klick.

**F. Kein Lager für Fertigteile.**
Es gibt Materialbestand, aber keinen Bestand pro Produkt (Lagerproduktion, Mindestbestand, "nachproduzieren"). Aufträge können deshalb nicht aus dem Lager bedient werden.

**G. Nachbestellung ist Handarbeit.**
Bei Mindestbestand kommt eine Meldung, aber keine Bestellliste je Lieferant und keine vorbereitete E-Mail. (Lieferanten sind angelegt und am Material verknüpft - die Grundlage ist da.)

**H. Bankabgleich nur bei exaktem Treffer.**
Teilzahlungen, Skonto, Sammelüberweisungen oder fehlende Rechnungsnummer im Verwendungszweck werden nicht vorgeschlagen. Es gibt auch keine Bankanbindung (FinTS/PSD2) - nur CSV.

**I. Zeiterfassung ohne Verbindung zum Druck.**
Arbeitszeit am Auftrag wird von Hand gestartet/gestoppt. Ein "Zeit starten"-Knopf direkt auf der Auftragsseite wäre kürzer.

**J. Versand.**
Versandetikett und Versandbescheid per Klick sind da. Es gibt keine Anbindung an DHL/DPD (Etikett aus dem Versanddienst, automatische Sendungsnummer).

## 3. Schnittstellen nach außen

| Schnittstelle | Zustand |
|---|---|
| **Webhooks** | Im Server vorhanden (Ereignisse nur: Rechnung erstellt/gesendet/bezahlt, Angebot erstellt/angenommen, Kunde angelegt), aber **keine Oberfläche zum Einrichten**. Keine Ereignisse für Aufträge, Drucke, Lager, Bankzahlungen. |
| **API für eigene Skripte/n8n/Zapier** | Es gibt eine API-Doku (`/api/docs`), aber **keine API-Schlüssel**: Zugriff nur mit Benutzer-Anmeldung. Für Automation von außen unpraktisch. Zudem kein Link zur Doku in der Oberfläche. |
| **Shop-Anbindung** | Nur CSV-Import für Etsy (versteckt auf der Produktionsseite). Keine Anbindung per Schnittstelle an Etsy/Shopify/WooCommerce und nicht an die eigene Website (bewusst nicht angefasst). |
| **E-Mail** | Versand über eigenes Postfach (SMTP). Kein Eingang (Belege per E-Mail an eine Adresse einsammeln). |
| **Kalender** | Kein Kalenderfeed (ICS) für Liefertermine, Wartung, Fälligkeiten. |
| **Buchhaltung** | DATEV-Export vorhanden (nicht mit echtem DATEV geprüft), E-Rechnung (XRechnung/ZUGFeRD) vorhanden. |
| **Backup** | Lokal + optional S3. Es fehlt ein sichtbarer Hinweis "letztes Backup vor X Stunden" und ein Test der Wiederherstellung. |
| **Drucker** | Nur Bambu Lab (LAN/MQTT). Kein OctoPrint/Klipper/Prusa. |

## 4. Verbindungen - Überblick fehlt

Viele Funktionen hängen von Einrichtung ab, und ob sie gerade funktionieren, sieht man nirgends an einer Stelle:
E-Mail-Versand (SMTP), Drucker-Verbindung je Drucker, Push (braucht HTTPS), `PUBLIC_APP_URL` (QR-Codes von außen), Backup (letzter Lauf), Speicherplatz.
Folge: Fehler fallen erst auf, wenn man die Funktion braucht ("E-Mail geht nicht", "QR-Code zeigt falsche Adresse").
Vorschlag: eine Seite **Einstellungen -> Verbindungen** mit Ampel je Punkt (grün/gelb/rot), letzter Erfolg und Knopf "Testen" (Testmail, Drucker prüfen, Backup jetzt).

## 5. Versteckt oder unübersichtlich

- **Wiederkehrende Rechnungen**: nur über einen Link im Fußtext der Belegseite erreichbar, nicht im Menü.
- **Etsy-Import**: auf der Produktionsseite, nicht dort, wo man Aufträge/Importe erwartet.
- **Kunden importieren, Backups, Daten zurücksetzen**: unter Einstellungen -> Daten.
- **Wartungsplan** nur innerhalb der Druckerkarte; **Fehldruckquote** als Hinweis in Einstellungen/Drucker.
- **DATEV, Anlagen, Steuer, Bank**: Reiter in Finanzen (sinnvoll, aber ein Hinweis auf der Startseite "Monatsabschluss" fehlt).
- **Einstellungen** hat 12 Reiter in einer Reihe (Firma, Passwort, Benutzer, Logo & Stempel, Darstellung, Beleg-Design, Mahnwesen, E-Mail-Versand, Vorlagen, Sicherheit, Protokoll, Daten) - viele davon selten genutzt.
- **Doppelte Wege**: Belege gibt es als `Belege` und als `Rechnungen` ("Rechnungen verwalten" für Mehrfachauswahl/E-Mail-Status), Material/Produkte/Drucker/Lieferanten sind sowohl Menüpunkte als auch Reiter im Katalog.
- **Suche (Strg K)** findet Dinge, startet aber keine Aktionen ("Neue Rechnung", "Druck starten", "Material nachbestellen").
- **Kein "+ Neu"-Knopf** an einer festen Stelle (Rechnung/Angebot/Kunde/Auftrag/Ausgabe).
- **Keine Einrichtungs-Checkliste** für eine neue Installation (Firmendaten, Bankverbindung, Postfach, Drucker, Push, Backup).

## 6. Empfohlene Reihenfolge

**Paket 1 - Überblick und nichts versteckt (klein bis mittel, größter Effekt) - UMGESETZT (Punkte 1 bis 4, bis auf "Einstellungen in Gruppen" kurz; siehe USER_GUIDE)**
1. Dashboard-Block "Heute zu tun" (alle Punkte aus B an einer Stelle, jeweils mit Klick zur Lösung).
2. Einstellungen -> **Verbindungen** mit Ampel und Testknöpfen (Abschnitt 4).
3. Menü aufräumen: Wiederkehrende Rechnungen, Import, Wartung sichtbar verlinken; "+ Neu"-Knopf oben; Suche um Aktionen erweitern; Einrichtungs-Checkliste.
4. Einstellungen in Gruppen statt 12 Reitern in einer Reihe.

**Paket 2 - Automationen mit Bestätigung per Klick**
5. Auftragsstatus-Vorschläge aus Druck/Versand/Zahlung (A) und Zuordnung "Druck fertig -> welcher Auftrag?" (E).
6. Angebote: automatisch "Abgelaufen", Nachfass-Erinnerung mit Vorlage (C).
7. Überfällig: Benachrichtigung plus vorbereiteter Erinnerungs-Entwurf (D).
8. Nachbestellliste je Lieferant mit vorbereiteter E-Mail (G).

**Paket 3 - Schnittstellen**
9. Webhooks-Oberfläche, mehr Ereignisse (Auftrag, Druck fertig, Lager, Zahlung) und **API-Schlüssel** für n8n/Zapier/Skripte.
10. Kalenderfeed (ICS) für Termine, Wartung, Fälligkeiten.
11. Produktlager (F).
12. Bankabgleich mit Vorschlägen (H); Etsy per Schnittstelle statt CSV; weitere Druckertypen (OctoPrint/Klipper).

Grundsatz für alles Automatische: **vorschlagen und mit einem Klick bestätigen**, nie stillschweigend Belege versenden, Status ändern oder Geld verbuchen. Jede Automatik bekommt einen Schalter in den Einstellungen und einen Eintrag im Protokoll.
