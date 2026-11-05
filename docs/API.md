# API-Dokumentation

Die vollständige, interaktive OpenAPI/Swagger-Dokumentation ist zur Laufzeit unter
`http://localhost:4000/api/docs` erreichbar (Rohformat: `/api/docs/openapi.json`).
Quelle: [`backend/src/modules/docs/openapi.json`](../backend/src/modules/docs/openapi.json).

Dieses Dokument ergänzt die generierte Referenz um Konzepte, die sich nicht 1:1 in
OpenAPI abbilden lassen.

## Authentifizierung

Alle Endpunkte außer `POST /api/auth/register`, `POST /api/auth/login` und
`POST /api/auth/refresh` erfordern einen `Authorization: Bearer <accessToken>`-Header.

Ablauf:

1. `POST /api/auth/login` → `{ accessToken, refreshToken, user }`
2. Access-Token 15 Minuten lang für Anfragen verwenden.
3. Bei `401` mit abgelaufenem Access-Token: `POST /api/auth/refresh` mit dem
   `refreshToken` → neues Token-Paar. Das alte Refresh-Token wird dabei ungültig
   (Rotation, siehe [SECURITY.md](SECURITY.md)).
4. `POST /api/auth/logout` mit dem `refreshToken` widerruft die Sitzung serverseitig.

Das Frontend implementiert diesen Ablauf bereits transparent über einen Axios-
Interceptor (`frontend/src/api/client.ts`) - dort werden die Tokens allerdings NICHT
mehr manuell gehalten: `POST /api/auth/login`, `/register`, `/refresh` und
`/change-password` setzen dieselben Tokens zusätzlich als httpOnly-Cookies
(`backend/src/modules/auth/cookies.ts`), die der Browser automatisch mitschickt. Der
oben beschriebene Bearer-Header-Ablauf bleibt für Skripte/externe Integrationen ohne
Cookie-Unterstützung unverändert nutzbar - `middleware/auth.ts` akzeptiert beide Wege.

## Geldbeträge

Alle Beträge sind **Ganzzahlen in Cent** (`unitPriceCents`, `totalCents`, ...), nie
Fließkommazahlen. `19,99 €` wird als `1999` übertragen. USt.-Sätze sind Basispunkte
(`vatRateBps`): `1900` = 19,00 %, `700` = 7,00 %, `0` = 0 % (z.B. bei
Kleinunternehmerregelung).

## Fehlerformat

```json
{ "error": "Menschenlesbare Fehlermeldung (Deutsch)", "details": { "...": "optional, z.B. Zod-Validierungsfehler" } }
```

HTTP-Statuscodes folgen REST-Konventionen: `400` Validierung, `401` nicht
authentifiziert, `403` keine Berechtigung, `404` nicht gefunden, `409` Konflikt
(z.B. Statuswechsel nicht erlaubt), `423` Konto gesperrt, `500` Serverfehler.

## Webhooks

Firmen (Rolle `ADMIN`) können Webhooks registrieren: `POST /api/webhooks`
```json
{ "url": "https://beispiel.de/hook", "eventTypes": ["invoice.paid", "invoice.created"] }
```
Antwort enthält **einmalig** ein `secret` - sicher aufbewahren, es wird danach nicht
erneut ausgegeben.

Bei einem Ereignis sendet das System:

```
POST <url>
Content-Type: application/json
X-Signature: <hex-HMAC-SHA256 des Bodys mit `secret` als Schlüssel>

{"event":"invoice.paid","payload":{...},"sentAt":"2026-09-14T10:00:00.000Z"}
```

Empfänger sollten die Signatur verifizieren:

```js
const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
if (expected !== req.headers["x-signature"]) return res.status(401).end();
```

Verfügbare Event-Typen: `invoice.created`, `invoice.sent`, `invoice.paid`, `invoice.overdue`, `quote.created`, `quote.accepted`, `quote.expired`, `customer.created`, `order.status_changed`, `print.ended`, `stock.low` (aktuelle Liste: `GET /api/webhooks/events`). Einrichten und testen geht auch in der Oberfläche unter *Einstellungen → Schnittstellen*; dort gibt es einen Testknopf (Ereignis `webhook.test`) und die letzten Zustellungen. Erlaubt sind http/https-Adressen (auch im Heimnetz), nicht erlaubt sind Zugangsdaten in der Adresse und Metadaten-Adressen (169.254.x.x). Weiterleitungen werden nicht verfolgt, ein Aufruf hat 5 Sekunden Zeit; als erfolgreich gilt Status 200-299.

## Export/Import

- `GET /api/invoices/export/all?format=csv|json` - alle Rechnungen der Firma
- `GET /api/customers/:id/gdpr-export` - DSGVO-Auskunft für einen Kunden (JSON)
- `POST /api/import/customers` (multipart/form-data, Feld `file`) - CSV-Import

## GraphQL

Aktuell nicht implementiert (nur REST). Siehe [ARCHITECTURE.md](ARCHITECTURE.md),
Abschnitt "Erweiterbarkeit", für den vorgesehenen Erweiterungsweg.


## API-Schlüssel

Für Skripte und Automatisierung (n8n, Zapier, Make) ohne Benutzer-Anmeldung: *Einstellungen → Schnittstellen → API-Schlüssel* (nur Administratoren). Der Schlüssel hat die Form `hp_` plus 48 Hex-Zeichen, wird nur einmal angezeigt (gespeichert wird nur der Hash) und gilt für die eigene Firma:

```
curl -H "Authorization: Bearer hp_..." https://deine-adresse/api/invoices
```

- **Nur lesen:** erlaubt nur `GET`. **Lesen und schreiben:** erlaubt auch `POST/PATCH/PUT/DELETE`.
- Nie erreichbar mit einem Schlüssel (`403`): `/api/auth`, `/api/users`, `/api/api-keys`, `/api/webhooks`, `/api/backups`, `/api/reset`, `/api/companies`, `/api/system`, `/api/notifications`, `/api/time`, `/api/audit-logs`, `/api/calendar`. Ebenso alle Funktionen, die nur Administratoren dürfen (z.B. Druck senden).
- Ein Schlüssel handelt wie ein Mitarbeiter ohne Verwaltungsrechte. Im Protokoll erscheinen seine Aktionen ohne Benutzer, mit der Schlüssel-ID in den Details.
- Widerrufen: Der Schlüssel funktioniert sofort nicht mehr. Es gibt höchstens 20 Schlüssel je Firma.

## Kalender-Abo (ICS)

*Einstellungen → Schnittstellen → Kalender-Abo* erzeugt eine geheime Adresse `/api/calendar/feed/<token>.ics`, die Kalender-Apps abonnieren können (Liefertermine offener Aufträge, Zahlungsziele offener Rechnungen, Angebotsfristen, Wartung nach Tagesintervall; Zeitraum 30 Tage zurück bis 180 Tage voraus; ohne Beträge). Die Adresse lässt sich jederzeit erneuern oder abschalten. Sie nutzt `PUBLIC_APP_URL` - für Handys muss das die echte Adresse sein.
