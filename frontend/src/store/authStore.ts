import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MITARBEITER" | "BUCHHALTUNG";
  locale?: string;
}

interface AuthState {
  // Die Tokens selbst liegen nicht mehr im Frontend-State - sie werden vom Backend als
  // httpOnly-Cookies gesetzt (siehe backend/src/modules/auth/cookies.ts) und sind für
  // JavaScript grundsätzlich unsichtbar (Schutz gegen Auslesen bei einem XSS-Angriff,
  // anders als die vorherige localStorage-Speicherung - siehe docs/SECURITY.md).
  // "status" bildet ab, ob die Cookie-Sitzung beim App-Start bereits geprüft wurde
  // (GET /auth/me, siehe App.tsx) - vorher kann nicht entschieden werden, ob der
  // Benutzer angemeldet ist oder nicht.
  status: "checking" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "checking",
  user: null,
  setUser: (user) => set({ user, status: "authenticated" }),
  clearSession: () => set({ user: null, status: "unauthenticated" }),
}));
