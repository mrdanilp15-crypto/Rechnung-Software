/**
 * Notfall-Passwort-Reset ohne Login - für den Fall, dass der einzige Admin ausgesperrt ist
 * (vergessenes Passwort, falsch eingetippt/vom Passwortmanager vorgeschlagenes altes Passwort,
 * Sperre nach zu vielen Fehlversuchen). Setzt ein neues, zufälliges Passwort, hebt eine
 * aktive Sperre auf und meldet alle Geräte dieser Person ab.
 *
 * Aufruf (im Container-Terminal des Backend-Dienstes, z.B. in Portainer unter "Console"):
 *   npm run reset-password -- name@firma.de
 *
 * Das neue Passwort wird einmalig im Terminal ausgegeben und sollte nach dem ersten Login
 * unter Einstellungen -> Passwort sofort durch ein eigenes ersetzt werden.
 */
import crypto from "crypto";
import { prisma } from "../src/db/prisma";
import { hashPassword, isPasswordStrongEnough } from "../src/modules/auth/password";
import { revokeAllUserTokens } from "../src/modules/auth/tokens";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Verwendung: npm run reset-password -- <E-Mail-Adresse>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Kein Benutzer mit der E-Mail-Adresse "${email}" gefunden.`);
    process.exit(1);
  }

  let tempPassword = crypto.randomBytes(9).toString("base64url");
  while (!isPasswordStrongEnough(tempPassword)) tempPassword = crypto.randomBytes(9).toString("base64url");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(tempPassword), failedLoginCount: 0, lockedUntil: null, isActive: true },
  });
  await revokeAllUserTokens(user.id);
  await prisma.auditLog.create({
    data: { companyId: user.companyId, userId: user.id, action: "user.reset_password_cli", entityType: "User", entityId: user.id },
  });

  console.log(`\nNeues Passwort für ${user.name} (${user.email}):\n\n  ${tempPassword}\n\nBitte nach dem Login sofort unter Einstellungen -> Passwort ändern.\n`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
