# Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO)

**Hinweis:** Dies ist eine ausfüllbare Vorlage, kein automatisch generiertes Dokument -
Software kann diese Pflicht nicht für dich erfüllen, da sie auch Prozesse außerhalb der
Software betrifft (z.B. wie du E-Mails beantwortest oder Papierbelege aufbewahrst). Bitte
die eckigen Klammern `[...]` durch deine tatsächlichen Angaben ersetzen und regelmäßig
(mind. jährlich, sowie bei Änderungen) aktualisieren.

Diese Pflicht gilt unabhängig von der Unternehmensgröße, sobald die Verarbeitung nicht nur
gelegentlich erfolgt (Art. 30 Abs. 5 DSGVO) - laufende Rechnungsstellung an Kunden erfüllt
diese Schwelle in aller Regel, die "Kleinunternehmen-Ausnahme" greift hier also meist NICHT.

---

## Verantwortlicher

- Name/Firma: [z.B. Daniel Hegemann, Einzelunternehmen]
- Anschrift: [...]
- E-Mail: [...]
- Telefon: [...]
- (Ein Datenschutzbeauftragter ist für die meisten Kleinunternehmen nicht verpflichtend zu
  bestellen, außer bei umfangreicher Verarbeitung besonderer Datenkategorien oder
  systematischer Überwachung - im Zweifel mit dem Steuerberater/einer Kanzlei klären.)

---

## Verarbeitungstätigkeit 1: Kundenverwaltung & Rechnungsstellung

| Feld | Angabe |
|---|---|
| Zweck der Verarbeitung | Vertragsanbahnung/-erfüllung, Rechnungsstellung, Kundenkommunikation |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung); für Aufbewahrung: Art. 6 Abs. 1 lit. c DSGVO i.V.m. §147 AO |
| Betroffene Personen | Kunden (Privat- und Geschäftskunden) |
| Kategorien personenbezogener Daten | Name, Kontaktperson, Anschrift, E-Mail, Telefon, USt-IdNr. (bei Geschäftskunden), Notizen (freiwillig) |
| Empfänger | Keine Weitergabe an Dritte außer: Steuerberater (auf Anfrage), ggf. SMTP-Anbieter für E-Mail-Versand, ggf. Backup-Speicher (siehe AVV-Checkliste) |
| Drittlandtransfer | [Nein / Ja - falls SMTP- oder Backup-Anbieter außerhalb der EU/eines Angemessenheitsbeschlusses sitzt, hier eintragen] |
| Löschfrist | 10 Jahre nach Ende des Geschäftsjahres der letzten Rechnung (§147 AO); danach Anonymisierung über die Software-Funktion "Anonymisieren (DSGVO)" |
| Technische/organisatorische Maßnahmen | Siehe [SECURITY.md](../SECURITY.md) - Zugriffskontrolle (Rollen/Rechte), Audit-Log, Argon2id-Passwort-Hashing, TLS-Transportverschlüsselung, verschlüsselte Backups |

## Verarbeitungstätigkeit 2: Angebote, Lieferscheine, Auftragsbestätigungen

| Feld | Angabe |
|---|---|
| Zweck der Verarbeitung | Vorvertragliche Anfragen, Auftragsabwicklung, Lieferdokumentation |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO |
| Betroffene Personen | (Potenzielle) Kunden |
| Kategorien personenbezogener Daten | Wie Verarbeitungstätigkeit 1 |
| Empfänger | Wie Verarbeitungstätigkeit 1 |
| Löschfrist | Wie Verarbeitungstätigkeit 1 (aus Nachvollziehbarkeitsgründen ebenso lange aufbewahrt) |

## Verarbeitungstätigkeit 3: Benutzerkonten (Mitarbeiter/Zugriff auf die Software)

| Feld | Angabe |
|---|---|
| Zweck der Verarbeitung | Zugriffsverwaltung, Nachvollziehbarkeit von Änderungen (Audit-Log) |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Systemsicherheit/Nachvollziehbarkeit) bzw. Art. 88 DSGVO/§26 BDSG bei Arbeitsverhältnis |
| Betroffene Personen | Mitarbeiter mit Zugang zur Software |
| Kategorien personenbezogener Daten | Name, E-Mail, Rolle, Login-Zeitpunkte, IP-Adressen (Audit-Log) |
| Empfänger | Keine Weitergabe an Dritte |
| Löschfrist | Bei Ausscheiden: Konto deaktivieren (nicht löschen, solange Audit-Log-Einträge referenziert werden); vollständige Löschung nach Ablauf der Aufbewahrungsfristen für die zugehörigen Geschäftsvorfälle |

## Verarbeitungstätigkeit 4: E-Mail-Versand (Rechnungen, Angebote, Zahlungserinnerungen)

| Feld | Angabe |
|---|---|
| Zweck der Verarbeitung | Versand von Belegen/Erinnerungen an Kunden |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO |
| Kategorien personenbezogener Daten | E-Mail-Adresse, Name des Kunden, Rechnungsinhalt |
| Empfänger/Auftragsverarbeiter | [Name des SMTP-Anbieters eintragen, z.B. GMX, Gmail, eigener Mailserver] - siehe [AVV-CHECKLISTE.md](AVV-CHECKLISTE.md) |
| Drittlandtransfer | [prüfen, je nach Anbieter] |
| Löschfrist | E-Mail-Versandprotokoll (Status/Zeitpunkt) so lange wie die zugehörige Rechnung |

## Verarbeitungstätigkeit 5: Backups

| Feld | Angabe |
|---|---|
| Zweck der Verarbeitung | Schutz vor Datenverlust (technische Notwendigkeit, keine eigenständige Nutzung der Daten) |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Betriebssicherheit) |
| Kategorien personenbezogener Daten | Vollständiges Abbild aller oben genannten Kategorien |
| Empfänger/Auftragsverarbeiter | Lokal auf eigenem Server; [falls S3-Backup aktiv: Name des Anbieters eintragen] - siehe [AVV-CHECKLISTE.md](AVV-CHECKLISTE.md) |
| Aufbewahrung | 10 Jahre rollierend (`BACKUP_RETENTION_DAYS`), verschlüsselt (AES-256-GCM) |

---

## Änderungshistorie

| Datum | Änderung | Von |
|---|---|---|
| [Datum ausfüllen] | Ersterstellung | [Name] |
