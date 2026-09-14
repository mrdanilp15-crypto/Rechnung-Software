import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Einheitlicher Speichern-Status für Formulare in der ganzen App: zeigt während des
 * Requests "Wird gespeichert...", kurz danach "Gespeichert ✓", und fällt danach wieder
 * auf den Normalzustand zurück. Wird zusammen mit <SaveButton> verwendet.
 */
export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    clearTimeout(timeoutRef.current);
    setStatus("saving");
    try {
      const result = await fn();
      setStatus("saved");
      timeoutRef.current = setTimeout(() => setStatus("idle"), 2000);
      return result;
    } catch (err) {
      setStatus("error");
      timeoutRef.current = setTimeout(() => setStatus("idle"), 3000);
      throw err;
    }
  }, []);

  return { status, run };
}
