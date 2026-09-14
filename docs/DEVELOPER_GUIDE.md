# Entwickler-Guide

## Projektstruktur

```
backend/src/
  config/env.ts          Validierte Umgebungsvariablen (Zod)
  db/prisma.ts            Prisma-Client-Singleton
  middleware/              auth, rbac, rateLimit, errorHandler
  modules/
    auth/                  Login/Registrierung/Refresh/2FA
    users/                 Benutzerverwaltung (Rollen)
    companies/             Firmenstammdaten, Logo-Upload
    customers/             Kundenverwaltung, DSGVO-Endpunkte
    products/              Produkt-/Leistungsverzeichnis
    invoices/               Rechnungen inkl. Statusautomat, PDF, Export
    quotes/                 Angebote inkl. Umwandlung in Rechnung
    deliveryNotes/          Lieferscheine
    orderConfirmations/     Auftragsbestätigungen
    tax/                    Zentrale Steuerberechnung
    pdf/                    PDF-Template + SEPA-QR-Code
    shared/numbering.ts      Fortlaufende Belegnummern
    audit/                  Audit-Log
    plugins/hooks.ts         Event-Bus/Plugin-System
    webhooks/                Webhook-Verwaltung + -Zustellung
    backup/                  ZIP-Backup + optionaler S3-Upload
    export/importRouter.ts   CSV-Import
    docs/openapi.*           OpenAPI-Spezifikation + Swagger-UI
  app.ts, index.ts          Express-App-Aufbau, Serverstart
backend/plugins/            Eigene Plugins hier ablegen
frontend/src/
  pages/                   Eine Datei je Ansicht/Route
  components/Layout.tsx     Navigation, Dark-Mode-Schalter, Sprachwahl
  api/client.ts             Axios-Instanz inkl. Token-Refresh-Interceptor
  store/authStore.ts         Zustand-Store für Sitzung
  i18n/                      Übersetzungen (DE/EN)
```

## Neues fachliches Modul hinzufügen (Beispiel: Zeiterfassung)

1. `backend/prisma/schema.prisma`: neues Modell ergänzen (z.B. `TimeEntry` mit
   `companyId`, `customerId`, `description`, `minutes`, `hourlyRateCents`).
2. `npm run prisma:migrate -- --name add_time_entries`
3. Neuer Ordner `backend/src/modules/timeEntries/router.ts` nach dem Muster von
   `modules/deliveryNotes/router.ts` (CRUD + `requireAuth`, Filterung nach
   `req.auth.companyId`).
4. Router in `app.ts` unter einem neuen Pfad einhängen (`app.use("/api/time-entries",
   timeEntriesRouter)`).
5. OpenAPI-Spezifikation (`modules/docs/openapi.json`) um die neuen Pfade ergänzen.
6. Frontend: neue Seite in `frontend/src/pages/`, Route in `App.tsx`, Navigationspunkt
   in `components/Layout.tsx` und Übersetzungsschlüssel in `i18n/locales/*.json`.

## Plugin-System

Ein Plugin ist ein Objekt, das das `Plugin`-Interface aus
`backend/src/modules/plugins/hooks.ts` implementiert:

```ts
import type { Plugin } from "../../src/modules/plugins/hooks";

const meinPlugin: Plugin = {
  name: "meine-erweiterung",
  version: "1.0.0",
  register(api) {
    api.on("invoice.paid", async (payload) => {
      // z.B. E-Mail-Versand, externe Buchhaltungssoftware benachrichtigen, ...
      console.log("Rechnung bezahlt für Firma", payload.companyId);
    });
  },
};

export default meinPlugin;
```

Ablage unter `backend/plugins/<name>/index.ts`, Registrierung in `backend/src/index.ts`:

```ts
import meinPlugin from "../plugins/meine-erweiterung";
registerPlugin(meinPlugin);
```

Verfügbare Events: `invoice.created`, `invoice.sent`, `invoice.paid`, `quote.created`,
`quote.accepted`, `customer.created` (Liste erweiterbar in `modules/plugins/hooks.ts`,
Typ `EventName`).

**Hinweis:** Dies ist ein einfaches In-Prozess-Hook-System, kein isoliertes
Plugin-Sandboxing (kein separates Berechtigungsmodell je Plugin). Für Drittanbieter-
Plugins mit geringerem Vertrauen sollte stattdessen der Webhook-Mechanismus
([API.md](API.md)) genutzt werden, da er Code aus dem eigenen Prozess fernhält.

## Tests

`backend/tests/` (Vitest). Ausführen: `npm test` im `backend`-Ordner. Schwerpunkt
sollte auf der Steuerberechnung (`modules/tax/calculator.ts`) und der
Belegnummerierung (`modules/shared/numbering.ts`) liegen, da hier Rundungs- bzw.
Race-Condition-Fehler am kritischsten wären.

## Codequalität

- TypeScript `strict: true` in Backend und Frontend.
- Zod validiert jede Backend-Eingabe zur Laufzeit.
- Konsequente Mandantenfilterung: jede Prisma-Query in einem Router muss
  `companyId: req.auth.companyId` (oder eine Ableitung davon) enthalten - Code-Reviews
  sollten dies gezielt prüfen (siehe [SECURITY.md](SECURITY.md), "Bekannte Grenzen").

## Lokale Entwicklung ohne installiertes Node.js

Falls wie auf diesem Rechner Node.js noch nicht vorhanden ist: siehe
[INSTALL.md](INSTALL.md), Abschnitt 1.
