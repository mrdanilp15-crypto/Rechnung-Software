# Checkliste: Auftragsverarbeitungsverträge (Art. 28 DSGVO)

**Hinweis:** Ein Auftragsverarbeitungsvertrag (AVV) ist ein rechtliches Dokument zwischen
dir und einem externen Dienstleister - die Software kann ihn nicht automatisch abschließen
oder ersetzen. Diese Checkliste hilft dir, systematisch zu prüfen, mit welchen Anbietern
du (je nach deiner tatsächlichen Konfiguration) einen AVV brauchst.

## Wann brauche ich einen AVV?

Immer dann, wenn ein externer Dienstleister in deinem Auftrag personenbezogene Daten
(Kundendaten, E-Mail-Inhalte, Backups) verarbeitet, ohne selbst über deren Zwecke zu
entscheiden. Ein AVV ist NICHT nötig für Dienste, die selbst gar keine personenbezogenen
Daten dieser Software berühren (z.B. ein reiner DNS-Anbieter ohne Zugriff auf Inhalte).

## 1. E-Mail-Versand (SMTP)

Prüfe unter **Einstellungen → E-Mail-Versand**, welcher SMTP-Anbieter hinterlegt ist.

- [ ] Anbieter identifiziert: `________________________`
- [ ] Ist es ein geschäftlicher/Business-Tarif (meist mit AVV-Angebot) oder ein privates
      Postfach (z.B. privates GMX-/Web.de-/Gmail-Konto)? Private Tarife bieten oft
      **keinen** regulären AVV für geschäftliche Nutzung an - im Zweifel beim Anbieter
      nachfragen oder auf einen Business-/Transaktions-E-Mail-Dienst umsteigen
      (z.B. einen dedizierten Transaktionsmail-Anbieter mit EU-Serverstandort und AVV).
- [ ] AVV abgeschlossen/vorhanden (Datum: `______`) - viele Anbieter stellen ihn per
      Selfservice im Kundenportal bereit ("Auftragsverarbeitung", "DPA")
- [ ] Serverstandort geprüft (EU/EWR oder Land mit Angemessenheitsbeschluss? Falls nicht:
      zusätzlich Standardvertragsklauseln nötig)

## 2. Cloud-Backup-Speicher (S3-kompatibel)

Nur relevant, falls unter **Einstellungen** ein S3-Ziel für Backups konfiguriert ist
(`S3_BUCKET`/`S3_ENDPOINT` gesetzt) - ohne das bleiben Backups ausschließlich lokal auf dem
eigenen Server, dann ist dieser Punkt nicht anwendbar.

- [ ] S3-Anbieter genutzt? [Ja/Nein]
- [ ] Falls ja - Anbieter: `________________________`
- [ ] AVV abgeschlossen (Datum: `______`)
- [ ] Serverstandort/Region geprüft (die Region wird über `S3_REGION` konfiguriert -
      idealerweise eine EU-Region wählen, z.B. `eu-central-1`)

## 3. Hosting/Serverbetreiber

Falls der Server (auf dem diese Software läuft) nicht bei dir selbst zu Hause steht,
sondern bei einem Hosting-Anbieter (VPS, Root-Server, Cloud-Provider) gemietet ist:

- [ ] Anbieter: `________________________`
- [ ] AVV abgeschlossen (die meisten seriösen Hosting-Anbieter stellen diesen standardmäßig
      im Kundenportal bereit)

## 4. Steuerberater

Der Steuerberater ist bei der Übermittlung von Buchhaltungsdaten (z.B. EÜR-CSV-Export)
in der Regel **kein** klassischer Auftragsverarbeiter, sondern eigenständig
verantwortliche Stelle mit eigener berufsrechtlicher Verschwiegenheitspflicht (§203 StGB) -
hier ist üblicherweise kein AVV, sondern höchstens eine Datenschutz-Vereinbarung im
Mandatsvertrag relevant. Im Zweifel beim Steuerberater selbst nachfragen.

## 5. Sonstige Dienste

- [ ] Werden weitere externe Dienste mit Zugriff auf Kunden-/Rechnungsdaten genutzt (z.B.
      ein externer Webhook-Empfänger, eine Buchhaltungssoftware-Anbindung)? `________________`
- [ ] Falls ja: jeweils AVV-Bedarf einzeln prüfen wie oben.

---

## Nächste Schritte, falls ein AVV fehlt

1. Beim Anbieter nachfragen ("Bietet ihr einen Auftragsverarbeitungsvertrag nach Art. 28
   DSGVO an?") - viele haben ein Standardformular im Kundenportal.
2. Falls kein AVV angeboten wird: Anbieterwechsel zu einem Dienst mit AVV erwägen, sofern
   der Dienst tatsächlich personenbezogene Daten verarbeitet.
3. Ergebnis in dieser Datei dokumentieren (Häkchen setzen, Datum eintragen) und diese
   Checkliste mindestens jährlich erneut durchgehen.
