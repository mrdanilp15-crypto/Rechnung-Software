import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MITARBEITER" | "BUCHHALTUNG";
  locale?: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (data: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  updateAccessToken: (accessToken: string, refreshToken: string) => void;
  clearSession: () => void;
}

// Tokens werden bewusst in localStorage gehalten (kein httpOnly-Cookie, da SPA ohne
// eigenes Backend-Rendering) - siehe docs/SECURITY.md für die daraus resultierenden
// XSS-Abwägungen und Gegenmaßnahmen (CSP, kurze Access-Token-Lebensdauer, Token-Rotation).
const STORAGE_KEY = "rechnung_auth";

function loadInitial(): Pick<AuthState, "accessToken" | "refreshToken" | "user"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, user: null };
    return JSON.parse(raw);
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadInitial(),
  setSession: (data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    set(data);
  },
  updateAccessToken: (accessToken, refreshToken) => {
    const next = { accessToken, refreshToken, user: get().user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set(next);
  },
  clearSession: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
