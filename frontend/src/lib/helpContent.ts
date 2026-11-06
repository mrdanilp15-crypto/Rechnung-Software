/**
 * Zentraler Hilfe-Inhalt: eine Quelle für die "?"-Kurzhilfen (short) und die Hilfeseite (body).
 * Jedes Thema hat eine ID; ein "?" im Programm verweist per ID auf sein Thema (Link zur Hilfeseite: /help#id).
 * Texte in Du-Form, ohne Fachchinesisch. Beim Ändern einer Funktion bitte das passende Thema mitpflegen.
 */

export type HelpCategory = "Erste Schritte" | "Belege" | "Aufträge und Produktion" | "Katalog und Lager" | "Finanzen" | "Einstellungen und Team";

export interface HelpTopic {
  id: string;
  category: HelpCategory;
  title: string;
  /** ein bis zwei Sätze für das "?" */
  short: string;
  /** ausführlich für die Hilfeseite: jeder Eintrag ein Absatz */
  body: string[];
  /** Begriffe, unter denen die Suche das Thema ebenfalls findet */
  keywords?: string;
}

export const HELP_CATEGORIES: HelpCategory[] = ["Erste Schritte", "Belege", "Aufträge und Produktion", "Katalog und Lager", "Finanzen", "Einstellungen und Team"];

export const HELP: HelpTopic[] = [
  // ---------------------------------------------------------------- Erste Schritte
  {
    id: "ablauf",
    category: "Erste Schritte",
    title: "Der typische Ablauf von der Anfrage bis zur Zahlung",
    short: "Angebot → Auftrag → Drucken → Lieferschein/Versand → Rechnung → Zahlung. Jeder Schritt nimmt alle Daten aus dem vorigen mit.",
    body: [
      "1. Kunde anlegen (oder beim Beleg direkt neu eingeben). 2. Angebot schreiben und per E-Mail senden. 3. Sagt der Kunde zu: im Angebot auf \"Angenommen → Auftrag\" klicken. Alle Positionen werden übernommen.",
      "4. Auf der Auftragsseite druckst du, erfasst Zeit, ordnest Drucke zu und setzt den Status (Erstellt → In Produktion → Versandbereit → Versendet). 5. Optional einen Lieferschein anlegen. 6. Rechnung: entweder \"→ Rechnung\" (Entwurf zum Prüfen) oder \"Rechnung gleich fertigstellen\" (mit einem Klick fertig und zum Senden bereit).",
      "7. Die Zahlung erkennt die Software beim Import des Kontoauszugs selbst (Finanzen → Bankabgleich) und setzt die Rechnung auf \"Bezahlt\". Was noch zu tun ist, siehst du immer auf der Startseite unter \"Heute zu tun\".",
    ],
    keywords: "workflow anleitung start überblick",
  },
  {
    id: "start",
    category: "Erste Schritte",
    title: "Startseite",
    short: "Dein Tagesüberblick: was heute zu tun ist, laufende Aufträge, Umsatz, Materialbestand und Drucker.",
    body: [
      "Oben stehen Meldungen und \"Heute zu tun\". Darunter siehst du aktive Aufträge, Umsatz des Monats, Materialbestand, offene Rechnungen, den Stand deiner Drucker (bei Live-Verbindung) und die letzten Belege.",
      "Die Schnellaktionen unten und das \"+ Neu\"-Menü oben führen mit einem Klick zu neuem Auftrag, Rechnung, Angebot, Kunde, Datei oder Zeit. Mit Strg K (am Handy: Lupe) suchst du alles: Aufträge, Kunden, Belege und Aktionen.",
    ],
    keywords: "dashboard übersicht",
  },
  {
    id: "today",
    category: "Erste Schritte",
    title: "Heute zu tun",
    short: "Alles, was Aufmerksamkeit braucht, in einer Liste. Vorschläge bestätigst du mit einem Klick - es passiert nichts von selbst.",
    body: [
      "Die Liste sammelt: überfällige Rechnungen (mit Link zur Erinnerung/Mahnung), Rechnungen, die schon über 14 Tage offen sind (schon bezahlt, aber nicht abgehakt?), Angebote ohne Antwort seit 7 Tagen und abgelaufene Angebote (mit vorbereiteter Nachfass-Mail), versandbereite Aufträge, Liefertermine, versendete Aufträge ohne Rechnung, knappes Material und Fertigteile, fällige Wartung, nicht zugeordnete Zahlungseingänge und Drucke ohne Auftrag.",
      "Manche Punkte haben einen Knopf (z.B. \"Auf In Produktion setzen\" oder \"Druck dem Auftrag zuordnen\"): erst dein Klick führt die Aktion aus. Mit \"Nur meine\" siehst du nur Punkte zu Aufträgen, Angeboten und Rechnungen, für die du zuständig bist.",
    ],
    keywords: "aufgaben todo erinnerung vorschläge",
  },
  {
    id: "meldungen",
    category: "Erste Schritte",
    title: "Meldungen und Push aufs Handy",
    short: "Hier erscheinen fertige/fehlgeschlagene Drucke, Druckerfehler, knappes Material, überfällige Rechnungen und Aufträge, die dir zugewiesen wurden.",
    body: [
      "Persönliche Meldungen (\"Neuer Auftrag für dich\") siehst nur du, alle anderen sehen die gemeinsamen. Ein Klick auf eine Meldung mit Link öffnet die passende Seite.",
      "Push aufs Handy/Tablet schaltest du pro Gerät in der Karte \"Meldungen\" ein (\"Auf diesem Gerät einschalten\"). Das geht nur über HTTPS; am iPhone/iPad nur, wenn die Seite über \"Teilen → Zum Home-Bildschirm\" als App hinzugefügt wurde. Per E-Mail meldest du dich unter \"Einstellungen\" in der Karte an (Administrator).",
    ],
    keywords: "benachrichtigung push glocke",
  },
  {
    id: "setup",
    category: "Erste Schritte",
    title: "Einrichtung (Checkliste)",
    short: "Die wichtigsten Einstellungen, damit Rechnungen vollständig und rechtssicher sind - jeder Punkt führt direkt zur richtigen Stelle.",
    body: [
      "Firmendaten und Steuerangaben (Pflicht auf Rechnungen), Bankverbindung (IBAN, Kontoinhaber), Logo, E-Mail-Versand und das erste Produkt mit Kalkulation. Die Checkliste verschwindet, wenn alles erledigt ist; du kannst sie vorher ausblenden.",
      "Ob alle Verbindungen laufen, siehst du jederzeit unter Einstellungen → Verbindungen.",
    ],
  },
  {
    id: "search",
    category: "Erste Schritte",
    title: "Suche und Schnellmenü",
    short: "Strg K öffnet die Suche für Aufträge, Kunden, Belege und Aktionen. \"+ Neu\" legt alles Neue mit einem Klick an.",
    body: ["Die Suche findet Nummern, Kundennamen und Positionstexte. Eingaben wie \"neue rechnung\" bieten Aktionen an. Das Neu-Menü in der Kopfzeile ist von jeder Seite aus erreichbar."],
    keywords: "finden schnell",
  },

  // ---------------------------------------------------------------- Belege
  {
    id: "documents",
    category: "Belege",
    title: "Belege (Angebote, Aufträge, Lieferscheine, Rechnungen)",
    short: "Alle Belege in einer Liste. Der farbige Knopf je Zeile ist der nächste Schritt, alles Weitere steckt im Menü ⋮.",
    body: [
      "Filtere oben nach Belegart und Status. Ein Klick auf die Nummer öffnet den Beleg bzw. seine Seite mit der ganzen Belegkette. Entwürfe öffnen im Editor.",
      "Im Menü ⋮ stehen Senden, Weiterführen (→ Auftragsbestätigung, → Lieferschein, → Rechnung, Anzahlungsrechnung), Duplizieren, Verknüpfen und Versandetikett. \"Ungültig markieren\" löscht keine Nummer, sondern kennzeichnet den Beleg.",
    ],
    keywords: "liste übersicht angebot auftragsbestätigung lieferschein rechnung",
  },
  {
    id: "chain",
    category: "Belege",
    title: "Vorgang (Belegkette)",
    short: "Zeigt zu einem Beleg die ganze Kette Angebot → Auftrag → Lieferschein → Rechnung. Jeder Beleg ist antippbar, fehlende Schritte kannst du direkt anlegen.",
    body: [
      "Ein grüner Punkt heißt: Beleg ist vorhanden. Bei einem fehlenden Schritt steht ein Knopf zum Anlegen (z.B. \"Rechnung schreiben\"). Wurde ein Angebot und der Auftrag getrennt angelegt, verknüpfst du beide mit \"+ Mit Angebot verknüpfen\" - das Angebot gilt dann als angenommen und weitergeführt. Falsche Verknüpfungen löst du mit \"Verknüpfung lösen\".",
    ],
    keywords: "verknüpfen vorgang kette",
  },
  {
    id: "quick-invoice",
    category: "Belege",
    title: "Rechnung gleich fertigstellen",
    short: "Legt die Rechnung an, stellt sie fertig (Nummer wird vergeben) und öffnet gleich das E-Mail-Formular - ohne Entwurf-Zwischenschritt.",
    body: [
      "Du findest den Knopf beim Auftrag und beim Angebot in der Belegkette und im Menü ⋮ der Belegliste. Vorher kommt eine Rückfrage, weil eine fertige Rechnung nur noch per Storno korrigiert werden kann.",
      "Willst du Preise oder Texte vor dem Fertigstellen prüfen oder ändern, nimm stattdessen \"→ Rechnung\": das legt einen Entwurf an.",
    ],
    keywords: "schnell abschließen",
  },
  {
    id: "quote",
    category: "Belege",
    title: "Angebot",
    short: "Preisangebot an den Kunden. Mit \"Angenommen → Auftrag\" wird daraus mit einem Klick der Auftrag.",
    body: [
      "Entwurf → Fertigstellen → per E-Mail senden. Nach 30 Tagen (Standard, einstellbar am Angebot) läuft ein Angebot von selbst ab. Ohne Antwort erinnert dich \"Heute zu tun\" nach 7 Tagen und bereitet die Nachfass-Mail vor.",
      "Das Feld \"Zuständig\" legt fest, wer sich kümmert; die Zuständigkeit wird in Auftrag und Rechnung übernommen.",
    ],
  },
  {
    id: "invoice",
    category: "Belege",
    title: "Rechnung",
    short: "Entwurf → Fertigstellen (Rechnungsnummer wird vergeben, danach nicht mehr änderbar) → Senden → Bezahlt. Korrekturen nur per Storno.",
    body: [
      "Die fortlaufende Nummer wird erst beim Fertigstellen vergeben, damit keine Lücken entstehen. Eine fertige Rechnung ist aus rechtlichen Gründen (GoBD) unveränderlich: bei einem Fehler stornierst du sie, es entsteht ein Korrekturbeleg, und du schreibst eine neue.",
      "Per E-Mail senden hängt das PDF an. \"Teilen\" öffnet das Teilen-Menü deines Geräts (WhatsApp, Mail ...). Als \"Bezahlt\" markierst du von Hand oder lässt es den Bankabgleich tun. Das Feld \"Zuständig\" kannst du jederzeit ändern.",
    ],
    keywords: "storno gobd nummer",
  },
  {
    id: "down-payment",
    category: "Belege",
    title: "Anzahlungsrechnung",
    short: "Rechnung über einen Prozentsatz des Auftrags vorab. Die spätere Schlussrechnung zieht die Anzahlung automatisch ab.",
    body: ["Du gibst den Prozentsatz an (z.B. 30), die Software legt die Anzahlungsrechnung als Entwurf an. In der Schlussrechnung erscheint die Anzahlung als Abzugsposition."],
    keywords: "abschlag vorauszahlung",
  },
  {
    id: "delivery-note",
    category: "Belege",
    title: "Lieferschein",
    short: "Begleitdokument zur Ware ohne Preise. Entsteht aus dem Auftrag; die Rechnung bleibt davon unabhängig.",
    body: ["Aus dem Auftrag mit \"→ Lieferschein\" anlegen, fertigstellen und per E-Mail oder PDF mitgeben. Eine Unterschriftszeile für den Kunden steht nur darauf, wenn du sie unter Einstellungen → Beleg-Design → Texte einschaltest - sinnvoll bei persönlicher Übergabe, nicht bei Versand per DHL/DPD. Ein Lieferschein allein gilt nicht als Abrechnung: der Auftrag behält den Knopf \"→ Rechnung\"."],
  },
  {
    id: "einvoice",
    category: "Belege",
    title: "E-Rechnung (XRechnung und ZUGFeRD)",
    short: "Fertige Rechnungen lassen sich als XRechnung (XML) oder ZUGFeRD-PDF exportieren - für Kunden und Behörden, die E-Rechnungen verlangen.",
    body: ["Die Knöpfe erscheinen auf der Rechnungsseite, sobald die Rechnung fertig ist. Bei Behörden trägst du am Kunden die Leitweg-ID ein. Der Kontoinhaber aus den Einstellungen steht als Zahlungsempfänger in der E-Rechnung."],
    keywords: "xml zugferd leitweg behörde",
  },
  {
    id: "dunning",
    category: "Belege",
    title: "Zahlungserinnerung und Mahnung",
    short: "Bei überfälligen Rechnungen bereitet die Software Erinnerung oder Mahnung vor; gesendet wird erst auf deinen Klick.",
    body: ["Überfällige Rechnungen siehst du in \"Heute zu tun\". Der Link führt zur Rechnung mit dem Mahnbereich. Stufen, Fristen und Gebühren stellst du unter Einstellungen → Mahnwesen ein."],
    keywords: "mahnen überfällig erinnerung",
  },
  {
    id: "recurring",
    category: "Belege",
    title: "Wiederkehrende Rechnungen",
    short: "Rechnungen, die sich regelmäßig wiederholen (z.B. monatlich), legt die Software nach deinem Plan selbst an.",
    body: ["Aus einer vorhandenen Rechnung über das Menü ⋮ \"Wiederkehrend einrichten\" oder hier direkt anlegen. Den Rhythmus (z.B. jeden Monat, alle 3 Monate) und den Start bestimmst du; die erzeugten Rechnungen findest du in der Belegliste."],
    keywords: "abo serie monatlich",
  },
  {
    id: "send-mail",
    category: "Belege",
    title: "Belege per E-Mail senden",
    short: "Empfänger, Betreff und Text prüfen, das PDF hängt automatisch an. Ein Entwurf wird beim Senden fertiggestellt.",
    body: ["Voraussetzung ist ein eingerichtetes Postfach (Einstellungen → E-Mail-Versand). Texte kommen aus deinen Vorlagen (Einstellungen → Vorlagen). \"Kopie an mich\" schickt dir verdeckt eine Kopie."],
    keywords: "mail smtp vorlage",
  },
  {
    id: "customers",
    category: "Belege",
    title: "Kunden",
    short: "Deine Kundenliste mit Adresse, E-Mail und Belegen. Privat oder gewerblich, bei Firmen mit USt-IdNr. und Leitweg-ID.",
    body: ["Ein Klick auf einen Kunden zeigt alle Aufträge, Angebote und Rechnungen. Datenschutz: Über die Kundenseite kannst du Daten exportieren oder löschen (DSGVO)."],
    keywords: "adressen dsgvo",
  },

  // ---------------------------------------------------------------- Aufträge und Produktion
  {
    id: "production",
    category: "Aufträge und Produktion",
    title: "Aufträge (Produktionsboard)",
    short: "Alle Aufträge als Karten nach Status: Erstellt, In Produktion, Versandbereit, Versendet. Karten lassen sich weiterschieben.",
    body: [
      "Auf jeder Karte siehst du Kunde, Positionen, Liefertermin, Priorität und den Zuständigen (Profilbild). Oben filterst du nach Mitarbeiter oder \"Nur meine\". Ein Klick auf die Karte öffnet die Auftragsseite.",
      "\"Versendet\" fragt nach Versanddienst und Sendungsnummer und kann gleich den Versandbescheid per E-Mail senden. Importierte Shop-Bestellungen (z.B. Etsy-CSV) legst du hier an.",
    ],
    keywords: "board kanban status versand",
  },
  {
    id: "order",
    category: "Aufträge und Produktion",
    title: "Auftragsseite",
    short: "Alles zu einem Auftrag an einem Ort: Positionen, Drucke, Zeit, Dateien, Kommentare, Verlauf und die Belegkette.",
    body: [
      "Oben stehen Zuständiger, Priorität, Kosten und Beleg. Darunter Zeit starten, Positionen, Kommentare, Dateien, Drucke (starten oder vorhandene zuordnen) und der gemeinsame Verlauf. Rechts siehst du den Vorgang mit den nächsten Schritten.",
    ],
  },
  {
    id: "timer",
    category: "Aufträge und Produktion",
    title: "Zeit am Auftrag erfassen",
    short: "Mit einem Klick Arbeitszeit für diesen Auftrag starten und stoppen. Die Zeit landet im Auftrag und in der Zeiterfassung.",
    body: [
      "Läuft schon eine Zeit für etwas anderes, wechselst du mit \"Hierher wechseln\" in einem Klick. Solange eine Zeit läuft, zeigt die Kopfzeile einen roten Zeitgeber auf jeder Seite (Klick führt zum Auftrag), damit du sie nicht vergisst.",
    ],
    keywords: "arbeitszeit stunden start stopp",
  },
  {
    id: "assignee",
    category: "Aufträge und Produktion",
    title: "Zuständigkeit",
    short: "Wer kümmert sich? Der Zuständige bekommt eine persönliche Meldung und sieht den Vorgang unter \"Nur meine\".",
    body: ["Gilt für Aufträge, Angebote und Rechnungen. Wer einen Beleg neu anlegt, ist automatisch zuständig - im Beleg lässt sich das gleich oder später ändern (z.B. auf einen Kollegen oder \"Niemand\"). Beim Weiterführen wird die Zuständigkeit übernommen (Angebot → Auftrag → Rechnung). Sich selbst zuzuweisen löst keine Meldung aus. Profilbilder wählt jeder Mitarbeiter in seinem Konto."],
    keywords: "mitarbeiter zuweisen verantwortlich",
  },
  {
    id: "print-assign",
    category: "Aufträge und Produktion",
    title: "Drucke dem Auftrag zuordnen",
    short: "Ordnet einen Druck (auch aus Bambu Studio gestartet) dem Auftrag zu, damit Zeit und Material in der Kalkulation landen.",
    body: [
      "Auf der Auftragsseite \"+ Vorhandenen Druck zuordnen\" wählen. Danach prüfst du die Materialbuchung: hat der Druck Gramm je Filament gemeldet, wird so abgebucht, sonst schlägt die Software das Rezept des Produkts vor.",
      "\"Heute zu tun\" schlägt Zuordnungen von selbst vor, wenn der Druckname zu einer Auftragsposition passt.",
    ],
    keywords: "bambu studio material buchen",
  },
  {
    id: "print-start",
    category: "Aufträge und Produktion",
    title: "Druck starten",
    short: "Schickt die 3MF-Datei eines Produkts oder Auftrags an einen Drucker und zeigt vorher Vorschaubild, Material und AMS-Slots.",
    body: ["Im Druckdialog wählst du Drucker, Platte und für jede Farbe den AMS-Slot (oder externe Spule). Das Material wird dem Auftrag zugeordnet. Voraussetzung ist ein Drucker mit LAN-Modus unter Katalog → Drucker."],
    keywords: "ams slot bambu senden",
  },
  {
    id: "order-costs",
    category: "Aufträge und Produktion",
    title: "Kosten eines Auftrags",
    short: "Vergleicht die kalkulierten Kosten mit den tatsächlichen aus den zugeordneten Drucken (Material, Maschine, Arbeit).",
    body: ["Je Auftrag siehst du Soll (aus der Kalkulation der Produkte) und Ist (aus den Drucken inklusive Fehldrucken) und daraus den tatsächlichen Gewinn. Zukaufteile und Veredelung fließen nur in die Kalkulation ein, weil sie sich nicht aus Drucken messen lassen."],
    keywords: "gewinn marge soll ist",
  },

  // ---------------------------------------------------------------- Katalog und Lager
  {
    id: "products",
    category: "Katalog und Lager",
    title: "Produkte",
    short: "Deine Artikel mit Preis, Kalkulation, Dateien und Lager. Beim Anlegen einer Position füllt die Auswahl Preis und Beschreibung aus.",
    body: [
      "Jedes Produkt hat optional eine Kalkulation (Material, Druckzeit, Arbeit, Zukaufteile ...) und liefert einen Preisvorschlag. Dateien (STL, 3MF, STEP) mit Versionen hängst du nach dem ersten Speichern an. Staffelpreise gelten ab einer Menge.",
      "Mit Lagerführung zählt die Software Fertigteile mit Mindestbestand mit: Rechnungen buchen ab, Zugänge und Inventur buchst du im Lagerdialog.",
    ],
    keywords: "artikel preis sku",
  },
  {
    id: "costs",
    category: "Katalog und Lager",
    title: "Kalkulation",
    short: "Selbstkosten = Material (mit Ausschuss) + Strom + Abschreibung + Verschleiß + Arbeit + Zukaufteile + Gemeinkosten. Darauf kommt der Gewinnaufschlag.",
    body: [
      "Die Sätze (Stundenlohn, Strompreis, Ausschuss, Gewinnaufschlag, Rundung) stellst du unter Einstellungen → Firma ein, die Maschinenwerte unter Katalog → Drucker. Die Tabelle \"Berechnet für Auftragsmenge\" zeigt, wie sich die einmalige Rüstzeit auf die Stückzahl verteilt.",
      "\"Übernehmen\" setzt den Preisvorschlag als Verkaufspreis ein. Gebühren von Verkaufsplattformen werden berücksichtigt.",
    ],
    keywords: "preis berechnen selbstkosten gewinn marge",
  },
  {
    id: "parts",
    category: "Katalog und Lager",
    title: "Bauteile (Produkt aus mehreren Drucken)",
    short: "Besteht ein Produkt aus mehreren 3MF (z.B. Scharnier + Deckel), legst du Bauteile an. Die Kalkulation ist die Summe aller Bauteile.",
    body: [
      "Jedes Bauteil hat Druckzeit und Material je Druckplatte (aus der 3MF), die Teile pro Platte und die Anzahl je Produkt. Zeit = Anzahl × Druckzeit ÷ Teile pro Platte, Material genauso. Beispiel: 6 Scharniere pro Platte (60 min, 30 g), 2 je Produkt → 20 min und 10 g.",
      "Die Werte übernimmst du bei \"Dateien und Versionen\" mit \"Werte aus 3MF übernehmen → Neues Bauteil\". Zukaufteile bleiben bei Bauteilen erhalten.",
    ],
    keywords: "mehrere 3mf scharnier deckel",
  },
  {
    id: "purchased",
    category: "Katalog und Lager",
    title: "Zukaufteile und Veredelung",
    short: "Zukaufteile aus dem Lager (Schrauben, Magnete) wählst du mit Menge je Stück; einmalige Posten ohne Lager trägst du unter \"Zukaufteile & Veredelung\" mit Anzahl × Preis ein.",
    body: [
      "Aus dem Lager: Teil unter Katalog → Material mit der Art \"Zukaufteil\" anlegen (Preis, Lieferant, Bestand). Im Produkt nur die Menge je verkaufter Einheit wählen - ohne Ausschuss, nicht je Druckplatte. Der Preis kommt aus dem Lager; beim Verkauf wird abgebucht, bei knappem Bestand erscheint die Nachbestellung.",
      "Ohne Lager: Posten wie Lackieren 40 € oder 4 Schrauben je 0,05 € trägst du direkt im Produkt ein.",
    ],
    keywords: "schrauben magnete lackieren veredelung zubehör",
  },
  {
    id: "stock-products",
    category: "Katalog und Lager",
    title: "Lager für Fertigteile",
    short: "Mit Lagerführung zählt die Software den Bestand eines Produkts mit. Rechnungen buchen ab, Mindestbestand löst eine Meldung aus.",
    body: ["Aktiviere \"Lagerführung\" im Produkt. Zugang (fertig gedruckt) oder Inventur buchst du über den Lagerdialog. Fällt der Bestand auf den Mindestbestand, schlägt \"Heute zu tun\" vor nachzuproduzieren. Storno und Löschen buchen zurück."],
    keywords: "bestand fertigteile inventur nachproduzieren",
  },
  {
    id: "sku",
    category: "Katalog und Lager",
    title: "Artikelnummern",
    short: "Eigene Nummern wie HW-1, HW-2: tippst du ein Kürzel, schlägt die Software die nächste freie Nummer der Reihe vor und prüft live, ob sie schon vergeben ist.",
    body: ["Nichts ist vorausgefüllt. Tippst du nur das Kürzel (z.B. HW), kommt der Vorschlag HW-3. Eine Nummer gilt je Firma nur einmal; das Feld darf auch leer bleiben."],
    keywords: "nummer kürzel serie",
  },
  {
    id: "materials",
    category: "Katalog und Lager",
    title: "Material (Lager)",
    short: "Dein Lager an Filament und Zukaufteilen mit Preis, Bestand, Mindestbestand und Lieferant. Der Verbrauch wird beim Verkauf abgebucht.",
    body: [
      "Beim Anlegen gibst du Bestand und Gesamtpreis ein; der Preis je Einheit wird berechnet und eine Ausgabe angelegt. Beim Nachbestellen rechnet die Software mit dem gleitenden Durchschnittspreis. Einzelne Spulen verwaltest du über \"QR / Spulen\".",
      "Die Art unterscheidet Druckmaterial (Gramm, Ausschuss, AMS) von Zukaufteilen (Stück, feste Menge je Produkt).",
    ],
    keywords: "filament spule bestand lager",
  },
  {
    id: "reorder",
    category: "Katalog und Lager",
    title: "Nachbestellliste",
    short: "Material unter dem Mindestbestand, je Lieferant gruppiert, mit vorbereiteter Bestell-Mail.",
    body: ["Die Zahl am Knopf zeigt, wie viele Materialien knapp sind. Pro Lieferant siehst du Mengen und kannst die Bestellung per E-Mail vorbereiten. Gebucht wird erst, wenn die Lieferung ankommt (\"Nachbestellen\")."],
    keywords: "bestellen lieferant mindestbestand",
  },
  {
    id: "suppliers",
    category: "Katalog und Lager",
    title: "Lieferanten",
    short: "Wo du einkaufst. Material und Ausgaben werden einem Lieferanten zugeordnet; Nachbestellungen gehen an den hinterlegten Lieferanten.",
    body: ["Kontaktdaten und Kundennummer pflegst du hier. In der Materialliste wählst du den bevorzugten Lieferanten je Material."],
  },
  {
    id: "printers",
    category: "Katalog und Lager",
    title: "Drucker",
    short: "Deine 3D-Drucker mit Kostenwerten (Strom, Abschreibung, Verschleiß), Wartungsplan und - bei Bambu Lab - Live-Verbindung.",
    body: [
      "Die Kostenwerte bestimmen die Maschinenkosten in der Kalkulation. Mit Live-Verbindung (LAN-Modus, Zugangscode) siehst du Fortschritt, Restzeit, Material und Kamerabild und bekommst Meldungen bei Druckende und Fehlern. Der Wartungsplan meldet sich, wenn eine Aufgabe nach Betriebsstunden oder Tagen fällig ist.",
    ],
    keywords: "bambu lab live kamera wartung ams",
  },
  {
    id: "archive",
    category: "Katalog und Lager",
    title: "Belegarchiv",
    short: "Ablage für Dateien und Belege: 3MF/STL, Rechnungen von Lieferanten, Fotos. Dateien lassen sich Aufträgen und Produkten zuordnen.",
    body: ["Hochladen per Klick oder Ziehen, Suche nach Name und Datum. Dieselbe Datei wird nicht doppelt abgelegt (Duplikate werden erkannt). Belege, die du bei Ausgaben hochgeladen hast, erscheinen hier ebenfalls."],
    keywords: "dateien upload 3mf stl",
  },

  // ---------------------------------------------------------------- Finanzen
  {
    id: "finance",
    category: "Finanzen",
    title: "Finanzen",
    short: "EÜR-Übersicht, Ausgaben, Anlagen, Bankabgleich und Export für den Steuerberater an einem Ort.",
    body: ["Die Einnahmen-Überschuss-Rechnung entsteht aus deinen fertigen Rechnungen und erfassten Ausgaben. Pflege Ausgaben laufend (oder lass sie beim Nachbestellen automatisch anlegen), dann stimmt die Übersicht."],
    keywords: "eür steuer gewinn ausgaben",
  },
  {
    id: "euer",
    category: "Finanzen",
    title: "EÜR-Übersicht",
    short: "Einnahmen minus Ausgaben des Jahres, gegliedert nach Kategorien - die Grundlage für deine Steuererklärung.",
    body: ["Umsatz kommt aus fertigen Rechnungen, Ausgaben aus der Ausgabenliste, Abschreibungen aus den Anlagen. Als Kleinunternehmer beobachtet die Software zusätzlich die Umsatzgrenze und warnt rechtzeitig."],
    keywords: "einnahmenüberschussrechnung kleinunternehmer umsatzgrenze",
  },
  {
    id: "expenses",
    category: "Finanzen",
    title: "Ausgaben",
    short: "Alle Betriebsausgaben mit Beleg. Einkäufe über \"Nachbestellen\" im Material legen die Ausgabe automatisch an.",
    body: ["Beleg hochladen (Foto/PDF) - die Software liest Betrag und Händler nach Möglichkeit selbst aus und du prüfst nur. Kategorie, Datum und Lieferant gehören dazu."],
    keywords: "kosten beleg einkauf",
  },
  {
    id: "assets",
    category: "Finanzen",
    title: "Anlagen (Abschreibung)",
    short: "Größere Anschaffungen wie Drucker, die über mehrere Jahre abgeschrieben werden. Verknüpfst du die Ausgabe, wird nichts doppelt abgesetzt.",
    body: ["Ohne Verknüpfung mit einer Ausgabe kommt die Abschreibung zusätzlich zu deinen Ausgaben hinzu. Mit Verknüpfung zählt in der EÜR statt der vollen Ausgabe nur die Jahresabschreibung."],
    keywords: "afa abschreibung drucker",
  },
  {
    id: "bank",
    category: "Finanzen",
    title: "Bankabgleich",
    short: "Kontoauszug (CSV) importieren: Zahlungen werden Rechnungen zugeordnet und diese automatisch auf \"Bezahlt\" gesetzt.",
    body: [
      "Automatisch zugeordnet wird nur, wenn Betrag und Rechnungsnummer passen und es genau einen Treffer gibt. Alles andere zeigt die Software als Vorschlag (mit Differenz bei Teilzahlung/Skonto) zum Bestätigen oder Ausblenden.",
      "Die CSV bekommst du im Online-Banking (Umsätze exportieren). Die Software erkennt die Spalten gängiger Banken selbst; doppelte Buchungen werden erkannt.",
    ],
    keywords: "csv import zahlung kontoauszug zuordnen",
  },
  {
    id: "tax",
    category: "Finanzen",
    title: "Steuerberater-Export",
    short: "Exportiert Belege und Buchungen für den Steuerberater (z.B. DATEV-Format) und die Rechnungsübersicht als Datei.",
    body: ["Wähle den Zeitraum und das Format. Der DATEV-Export wurde noch nicht mit einem echten DATEV-System geprüft - lass ihn beim ersten Mal von deinem Steuerberater testen."],
    keywords: "datev export buchhaltung",
  },
  {
    id: "stats",
    category: "Finanzen",
    title: "Statistiken",
    short: "Auswertungen zu Umsatz und Kunden über die Zeit, damit du siehst, was sich lohnt.",
    body: ["Der Umsatz zählt nur bezahlte Rechnungen, und zwar im Monat des Zahlungseingangs (wie in der EÜR). Ausgestellte, noch unbezahlte Rechnungen und Aufträge sind kein Umsatz; der offene Betrag steht separat bei \"Bezahlte Rechnungen\". Eine Rechnung wird bezahlt durch \"Als bezahlt markieren\" oder den Zahlungsabgleich mit dem Konto.", "Wähle den Zeitraum oben. Je genauer du Drucke den Aufträgen zuordnest und Ausgaben erfasst, desto verlässlicher sind die Zahlen."],
    keywords: "auswertung umsatz diagramm",
  },
  {
    id: "time",
    category: "Finanzen",
    title: "Zeiterfassung",
    short: "Arbeitszeit mit Start/Stopp oder nachträglich erfassen, nach Tätigkeit und optional einem Auftrag. Monatsübersicht mit Export.",
    body: ["Pro Mitarbeiter läuft höchstens eine Zeit gleichzeitig. Administratoren sehen alle und können über „Zeit nachtragen“ → „Für wen?“ auch Zeiten für andere eintragen, ändern und löschen; die Buchhaltung sieht alle nur; Mitarbeiter sehen und erfassen nur ihre eigene Zeit. Das Stundenblatt gibt es als PDF und CSV."],
    keywords: "stunden arbeitszeit stundenzettel",
  },

  // ---------------------------------------------------------------- Einstellungen und Team
  {
    id: "settings",
    category: "Einstellungen und Team",
    title: "Einstellungen",
    short: "Firma, Belege, Verbindungen und Konto. Oben wählst du die Gruppe, darunter siehst du zu jedem Reiter eine kurze Erklärung.",
    body: ["\"Mein Betrieb\": Firma, Logo, Beleg-Design, Vorlagen, Mahnwesen. \"Verbindungen\": Status, E-Mail, Schnittstellen. \"Konto & System\": Benutzer, Konto, Sicherheit, Darstellung, Protokoll, Daten."],
  },
  {
    id: "settings-company",
    category: "Einstellungen und Team",
    title: "Firma, Steuer und Kalkulation",
    short: "Firmenangaben für Belege, Steuerangaben (Pflicht), Bankverbindung mit Kontoinhaber, Nummernkreise und die Sätze der Kalkulation.",
    body: [
      "Steuernummer oder USt-IdNr. ist Pflicht auf jeder Rechnung. Unter \"Bank & Zahlung\" trägst du IBAN und den Kontoinhaber ein - der Kontoinhaber erscheint im Zahlungs-QR (damit die Banking-App nicht wegen abweichender Namen warnt), auf Rechnungen und in E-Rechnungen.",
      "Die Kalkulationssätze (Stundenlohn, Strom, Ausschuss, Gemeinkosten, Gewinnaufschlag, Rundung) wirken in allen Produkten.",
    ],
    keywords: "iban kontoinhaber qr steuernummer kleinunternehmer",
  },
  {
    id: "settings-branding",
    category: "Einstellungen und Team",
    title: "Logo und Stempel",
    short: "Logo und Unterschrift/Stempel erscheinen auf Belegen und in E-Mails.",
    body: ["PNG oder JPG mit transparentem Hintergrund sieht am besten aus. Größe und Platzierung stellst du im Beleg-Design ein."],
  },
  {
    id: "settings-design",
    category: "Einstellungen und Team",
    title: "Beleg-Design",
    short: "Farben, Schrift, Fußzeile und Texte deiner Belege mit Live-Vorschau.",
    body: ["Änderungen gelten für neue PDFs; bereits versendete Belege bleiben, wie sie waren."],
  },
  {
    id: "settings-templates",
    category: "Einstellungen und Team",
    title: "Vorlagen (E-Mail-Texte)",
    short: "Wiederverwendbare Texte für Mails zu Angebot, Rechnung, Erinnerung, Versandbescheid und Nachfassen mit Platzhaltern wie {nummer}.",
    body: ["Die Standardvorlage je Art wird beim Senden vorgeschlagen und lässt sich dort noch ändern. Platzhalter werden mit den Daten des Belegs gefüllt.", "Unsicher, wie es klingen soll? Unter \"Formulierungen zum Ausprobieren\" stehen fertige Mails in vier Tonlagen (förmlich, freundlich, kurz, persönlich), dazu Nachfassen beim Angebot und Zahlungserinnerungen. Im Versanddialog wählst du unter \"Vorlage\" → \"Vorschläge zum Ausprobieren\" eine Variante und siehst sofort den Text mit den echten Belegdaten. Begrüßung und Schlusstext der Belege hast du als \"Formulierungen ansehen\" im Beleg und unter Beleg-Design."],
    keywords: "platzhalter mailtext formulierungen tonlage förmlich freundlich vorschläge textvorschläge",
  },
  {
    id: "settings-dunning",
    category: "Einstellungen und Team",
    title: "Mahnwesen",
    short: "Fristen, Stufen und Gebühren für Zahlungserinnerung und Mahnung.",
    body: ["Hier legst du fest, nach wie vielen Tagen erinnert und gemahnt wird (Erinnerung, 1. und 2. Mahnung), die Mahngebühren und den Verzugszins. Gesendet wird immer erst auf deinen Klick."],
  },
  {
    id: "connections",
    category: "Einstellungen und Team",
    title: "Verbindungen (Status)",
    short: "Eine Ampel für alles, was angebunden ist: E-Mail, Drucker, Backup, Push, öffentliche Adresse. Mit Test-Knöpfen.",
    body: ["Hier siehst du auch, wann die Oberfläche gebaut und der Server gestartet wurde. Stimmt die Version nicht, hast du nach dem Update vermutlich das neue Image noch nicht neu geladen (\"Re-pull image\")."],
    keywords: "status ampel test version",
  },
  {
    id: "settings-email",
    category: "Einstellungen und Team",
    title: "E-Mail-Versand",
    short: "Dein Postfach (SMTP) zum Senden von Belegen, Erinnerungen und Meldungen.",
    body: ["Trage Server, Port, Benutzer und Passwort deines Anbieters ein und sende eine Test-Mail. Ohne Postfach kannst du Belege nur als PDF herunterladen oder teilen."],
    keywords: "smtp postfach gmail",
  },
  {
    id: "integrations",
    category: "Einstellungen und Team",
    title: "Schnittstellen (API-Schlüssel, Webhooks, Kalender)",
    short: "Für eigene Automationen (n8n, Zapier, Skripte): API-Schlüssel, Webhooks bei Ereignissen und ein Kalender-Abo (ICS) für Liefertermine.",
    body: [
      "API-Schlüssel gibt es nur lesend oder mit vollem Zugriff; der Schlüssel wird nur einmal angezeigt. Webhooks senden bei Ereignissen (Rechnung gesendet/bezahlt, Auftrag, Druck ...) eine Nachricht an eine Adresse deiner Wahl und lassen sich testen. Der Kalenderlink gehört in Google/Apple/Outlook-Kalender als Abo.",
    ],
    keywords: "api webhook ics kalender n8n zapier",
  },
  {
    id: "users",
    category: "Einstellungen und Team",
    title: "Benutzer und Rollen",
    short: "Mitarbeiter anlegen und Rolle wählen: Administrator (alles), Mitarbeiter (arbeiten, aber keine Einstellungen), Buchhaltung (Finanzen).",
    body: ["Jeder bekommt ein eigenes Konto und kann ein Profilbild (Foto oder Symbol) und Farbe wählen. Ausgeschiedene Mitarbeiter deaktivierst du, statt sie zu löschen; ihre Einträge bleiben nachvollziehbar."],
    keywords: "mitarbeiter rollen profilbild konto",
  },
  {
    id: "security",
    category: "Einstellungen und Team",
    title: "Sicherheit (Passwort und Zwei-Faktor)",
    short: "Starkes Passwort, Zwei-Faktor-Anmeldung (App-Code) und Schutz vor Dauer-Probieren: zu viele falsche Passwörter sperren kurz.",
    body: ["Nach 10 Fehlversuchen innerhalb von 5 Minuten wird die Anmeldung kurz gesperrt. Zwei-Faktor schaltest du unter Einstellungen → Sicherheit ein; du brauchst dafür eine Authenticator-App."],
    keywords: "2fa login passwort sperre",
  },
  {
    id: "appearance",
    category: "Einstellungen und Team",
    title: "Darstellung",
    short: "Design (hell/dunkel und Farbthemen), Akzentfarbe und Programmname für alle Geräte.",
    body: ["Die Wahl gilt für die ganze Firma und auf allen Geräten. Den Namen siehst du in Anmeldung und Kopf der Seitenleiste."],
    keywords: "theme dunkel farbe",
  },
  {
    id: "audit",
    category: "Einstellungen und Team",
    title: "Protokoll",
    short: "Wer hat wann was geändert: Anmeldungen, Belege, Zuweisungen, Einstellungen. Für Nachvollziehbarkeit und Fehlersuche.",
    body: ["Du kannst nach Benutzer, Aktion und Zeitraum filtern. Einträge lassen sich nicht ändern."],
    keywords: "log änderungen nachvollziehen",
  },
  {
    id: "data",
    category: "Einstellungen und Team",
    title: "Daten, Backup und Zurücksetzen",
    short: "Sicherungen laufen automatisch (täglich) und lassen sich hier anstoßen. Zurücksetzen löscht Daten unwiderruflich.",
    body: ["Backups liegen lokal, optional zusätzlich in einem S3-Speicher. Wiederherstellung und Export stehen hier. Das Zurücksetzen fragt mehrfach nach, weil nichts wiederherzustellen ist."],
    keywords: "sicherung wiederherstellen löschen export",
  },
];

const byId = new Map(HELP.map((t) => [t.id, t]));
export const helpTopic = (id: string): HelpTopic | undefined => byId.get(id);

/** Passendes Hilfethema zur aktuellen Seite (für das "?" in der Kopfzeile). */
export function topicForPath(pathname: string, search = ""): string {
  const tab = new URLSearchParams(search).get("tab");
  if (pathname === "/") return "start";
  if (pathname.startsWith("/production")) return "production";
  if (pathname.startsWith("/orders/")) return "order";
  if (pathname.startsWith("/quotes")) return "quote";
  if (pathname.startsWith("/invoices")) return "invoice";
  if (pathname.startsWith("/delivery-notes")) return "delivery-note";
  if (pathname.startsWith("/order-confirmations")) return "documents";
  if (pathname.startsWith("/documents")) return "documents";
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/catalog")) return tab === "materials" ? "materials" : tab === "printers" ? "printers" : tab === "suppliers" ? "suppliers" : "products";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/materials")) return "materials";
  if (pathname.startsWith("/recurring")) return "recurring";
  if (pathname.startsWith("/finance")) return "finance";
  if (pathname.startsWith("/stats")) return "stats";
  if (pathname.startsWith("/archive")) return "archive";
  if (pathname.startsWith("/time")) return "time";
  if (pathname.startsWith("/audit-log")) return "audit";
  if (pathname.startsWith("/settings")) {
    const map: Record<string, string> = { company: "settings-company", branding: "settings-branding", design: "settings-design", templates: "settings-templates", dunning: "settings-dunning", verbindungen: "connections", email: "settings-email", schnittstellen: "integrations", users: "users", password: "users", security: "security", appearance: "appearance", audit: "audit", data: "data" };
    return (tab && map[tab]) || "settings";
  }
  return "ablauf";
}
