import { authenticator } from "otplib";
import { encryptField, decryptField } from "../../utils/crypto";

authenticator.options = { window: 1 }; // ±30s Zeitfenster gegen Uhrendrift

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function encryptTotpSecret(secret: string): string {
  return encryptField(secret);
}

export function buildOtpAuthUrl(secret: string, email: string, issuer = "Rechnungssoftware"): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotpToken(encryptedSecret: string, token: string): boolean {
  const secret = decryptField(encryptedSecret);
  return authenticator.check(token, secret);
}
