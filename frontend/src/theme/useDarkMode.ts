import { useEffect } from "react";

const STORAGE_KEY = "rechnung_theme";

// Die App ist bewusst immer hell (Wunsch des Inhabers). Ein früher gespeichertes "dunkel" wird beim Start entfernt.
export function useDarkMode() {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Speicher gesperrt - spielt keine Rolle, die App ist ohnehin hell
    }
  }, []);
  return { isDark: false, toggle: () => {} };
}
