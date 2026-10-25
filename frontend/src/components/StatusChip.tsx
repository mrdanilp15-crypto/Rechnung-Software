/**
 * Einheitliche Status-Kennzeichnung für alle Belegarten (Entwurf, Versendet, Bezahlt, Überfällig ...) -
 * gleiche Farben und Bezeichnungen in Listen, Dashboard und Detailseiten, hell wie dunkel.
 */
type Tone = "gray" | "amber" | "blue" | "green" | "red";

const TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function statusInfo(status: string, opts: { kind?: string; isCancellationDocument?: boolean } = {}): { label: string; tone: Tone; strike?: boolean } {
  if (opts.isCancellationDocument) return { label: "Korrekturbeleg", tone: "amber" };
  switch (status) {
    case "DRAFT": return { label: "Entwurf", tone: "amber" };
    case "SENT":
      return !opts.kind || opts.kind === "INVOICE" || opts.kind === "QUOTE" ? { label: "Versendet", tone: "blue" } : { label: "Fertig", tone: "green" };
    case "PAID": return { label: "Bezahlt", tone: "green" };
    case "OVERDUE": return { label: "Überfällig", tone: "red" };
    case "CANCELLED": return { label: "Storniert", tone: "gray", strike: true };
    case "ACCEPTED": return { label: "Angenommen", tone: "green" };
    case "DECLINED": return { label: "Abgelehnt", tone: "red" };
    case "EXPIRED": return { label: "Abgelaufen", tone: "gray" };
    default: return { label: status, tone: "gray" };
  }
}

export function StatusChip({ status, kind, isCancellationDocument, className = "" }: { status: string; kind?: string; isCancellationDocument?: boolean; className?: string }) {
  const info = statusInfo(status, { kind, isCancellationDocument });
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TONES[info.tone]} ${info.strike ? "line-through" : ""} ${className}`}>{info.label}</span>;
}
