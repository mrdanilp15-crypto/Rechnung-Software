import argon2 from "argon2";

// Argon2id mit konservativen, aktuellen (2026) Empfehlungswerten (OWASP Password Storage Cheat Sheet).
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function isPasswordStrongEnough(password: string): boolean {
  // Mindestens 10 Zeichen, mind. ein Buchstabe und eine Ziffer.
  return password.length >= 10 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}
