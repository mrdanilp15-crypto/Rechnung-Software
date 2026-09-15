import { createContext, ReactNode, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const ToastContext = createContext<((message: string, type?: ToastType) => void) | null>(null);

const styles: Record<ToastType, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  info: "bg-brand",
};
const icons: Record<ToastType, string> = { success: "✓", error: "✕", info: "ℹ" };

let nextId = 1;

/**
 * Globales Feedback für abgeschlossene Aktionen (z.B. "Angebot in Rechnung umgewandelt"),
 * die nicht in einem eigenen Formular passieren und deshalb kein SaveButton-Feedback haben.
 * Einmal in App.tsx eingebunden, überall per useToast() nutzbar.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles[t.type]} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm flex items-center gap-2 animate-in`}
          >
            <span>{icons[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() muss innerhalb von <ToastProvider> verwendet werden");
  return ctx;
}
