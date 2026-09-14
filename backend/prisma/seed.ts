import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { nextDocumentNumber } from "../src/modules/shared/numbering";

const prisma = new PrismaClient();

// Demo-Daten für ein fiktives 3D-Druck-Kleingewerbe. Ausschließlich für lokale
// Entwicklung/Demo gedacht - niemals in Produktion ausführen (npm run seed).
async function main() {
  const passwordHash = await argon2.hash("Demo1234!", { type: argon2.argon2id });

  const company = await prisma.company.create({
    data: {
      name: "Musterhausen 3D-Druck GmbH",
      street: "Werkstattweg 3",
      postalCode: "12345",
      city: "Musterhausen",
      country: "DE",
      vatId: "DE123456789",
      isSmallBusiness: false,
      defaultVatRateBps: 1900,
      iban: "DE02120300000000202051",
      bic: "BYLADEM1001",
      bankName: "Musterbank",
      invoiceFooterText: "Vielen Dank für Ihren Auftrag!",
    },
  });

  await prisma.user.create({
    data: {
      companyId: company.id,
      email: "admin@musterhausen-3d.de",
      passwordHash,
      name: "Admina Musterfrau",
      role: "ADMIN",
    },
  });

  await prisma.product.createMany({
    data: [
      { companyId: company.id, sku: "PLA-01", name: "3D-Druck PLA (pro Gramm)", unit: "g", unitPriceCents: 15, vatRateBps: 1900 },
      { companyId: company.id, sku: "PETG-01", name: "3D-Druck PETG (pro Gramm)", unit: "g", unitPriceCents: 20, vatRateBps: 1900 },
      { companyId: company.id, sku: "DESIGN-01", name: "CAD-Konstruktion (Stundensatz)", unit: "Std.", unitPriceCents: 4500, vatRateBps: 1900 },
      { companyId: company.id, sku: "POST-01", name: "Nachbearbeitung/Schleifen", unit: "Std.", unitPriceCents: 3500, vatRateBps: 1900 },
    ],
  });

  // Nummer über die reguläre Zählerlogik beziehen (nicht hartkodieren!), damit die
  // NumberSequence-Tabelle konsistent mit später über die API angelegten Kunden bleibt.
  const customerNumber = await nextDocumentNumber(company.id, "CUSTOMER", prisma);
  await prisma.customer.create({
    data: {
      companyId: company.id,
      customerNumber,
      type: "GEWERBLICH",
      name: "Beispiel Maschinenbau KG",
      contactName: "Max Beispiel",
      email: "einkauf@beispiel-maschinenbau.de",
      street: "Industriestraße 1",
      postalCode: "54321",
      city: "Beispielstadt",
      country: "DE",
      vatId: "DE987654321",
    },
  });

  console.log("Demo-Login: admin@musterhausen-3d.de / Demo1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
