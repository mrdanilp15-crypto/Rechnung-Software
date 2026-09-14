import type { SaveStatus } from "../hooks/useSaveStatus";

/**
 * Speichern-Button mit einheitlichem Rückmeldeverhalten: deaktiviert + "Wird
 * gespeichert..." während des Requests, kurz "✓ Gespeichert" danach. Wird zusammen mit
 * useSaveStatus() verwendet, damit jede Seite dasselbe Verhalten zeigt.
 */
export function SaveButton({
  status,
  children = "Speichern",
  savingLabel = "Wird gespeichert...",
  savedLabel = "✓ Gespeichert",
  errorLabel = "✕ Fehler beim Speichern",
  className = "bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm",
  type = "submit",
  onClick,
}: {
  status: SaveStatus;
  children?: React.ReactNode;
  savingLabel?: string;
  savedLabel?: string;
  errorLabel?: string;
  className?: string;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={status === "saving"}
      className={`${className} disabled:opacity-60 inline-flex items-center gap-2 ${status === "error" ? "!bg-red-600 hover:!bg-red-700 !text-white" : ""}`}
    >
      {status === "saving" && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {status === "saving" ? savingLabel : status === "saved" ? savedLabel : status === "error" ? errorLabel : children}
    </button>
  );
}
