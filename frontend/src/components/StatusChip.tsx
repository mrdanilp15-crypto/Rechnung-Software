/**
 * Einheitliche Status-Kennzeichnung für alle Belegarten (Entwurf, Versendet, Bezahlt, Überfällig ...) -
 * gleiche Farben und Bezeichnungen in Listen, Dashboard und Detailseiten, hell wie dunkel.
 */
import { Icon, type IconName } from "./Icon";

type Tone ="gray" | "amber" | "blue" | "green" | "red";

const TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function statusInfo(status: string, opts: { kind?: string; isCancellationDocument?: boolean; emailed?: boolean } = {}): { label: string; tone: Tone; strike?: boolean; hint?: string } {
  if (opts.isCancellationDocument) return { label: "Korrekturbeleg", tone: "amber" };
  switch (status) {
    case "DRAFT": return { label: "Entwurf", tone: "gray" };
    case "SENT":
      // Rechnung: "Versendet" nur, wenn wirklich eine E-Mail raus ist - sonst "Offen" (ausgestellt, noch nicht bezahlt)
      // "Versendet" ist für das Paket reserviert (Produktion); beim Beleg heißt es "Gemailt", damit beides nicht verwechselt wird
      if (opts.kind === "INVOICE") return opts.emailed ? { label: "Gemailt", tone: "amber" } : { label: "Offen", tone: "amber" };
      if (!opts.kind) return { label: "Gemailt", tone: "blue" };
      // Angebot/Auftrag/Lieferschein: "Fertig" heißt nur fertiggestellt - "Gemailt" erst, wenn tatsächlich eine E-Mail verschickt wurde
      return opts.emailed ? { label: "Gemailt", tone: "blue" } : { label: "Fertig", tone: "green" };
    case "PAID": return { label: "Bezahlt", tone: "green" };
    case "OVERDUE": return { label: "Überfällig", tone: "red" };
    // Betrifft nur diese Rechnung, nicht den zugrunde liegenden Auftrag - der bleibt bestehen und braucht ggf. eine neue Rechnung
    case "CANCELLED": return { label: "Storniert", tone: "gray", strike: true, hint: "Nur diese Rechnung ist storniert. Der Auftrag bleibt bestehen - bei Bedarf eine neue Rechnung dafür erstellen." };
    case "ACCEPTED": return { label: "Angenommen", tone: "green" };
    case "DECLINED": return { label: "Abgelehnt", tone: "red" };
    case "EXPIRED": return { label: "Abgelaufen", tone: "gray" };
    default: return { label: status, tone: "gray" };
  }
}

// Farbiges Symbol-Kästchen für Listen: Status auf einen Blick (grün bezahlt, gelb offen, rot überfällig, blau Angebot/gemailt, grau Entwurf)
const ICON_TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-500",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-rose-50 text-rose-700",
};

export function StatusIcon({ status, kind, isCancellationDocument, emailed, className = "" }: { status: string; kind?: string; isCancellationDocument?: boolean; emailed?: boolean; className?: string }) {
  const info = statusInfo(status, { kind, isCancellationDocument, emailed });
  let icon: IconName = "document";
  let tone: Tone = info.tone;
  if (isCancellationDocument) icon = "receipt";
  else if (status === "DRAFT") { icon = "pencil"; tone = "gray"; }
  else if (status === "PAID" || status === "ACCEPTED") icon = "check";
  else if (status === "OVERDUE") icon = "alertCircle";
  else if (status === "CANCELLED" || status === "DECLINED") icon = "xCircle";
  else if (status === "EXPIRED") icon = "clock";
  else if (status === "SENT" && kind === "INVOICE") { icon = emailed ? "mail" : "clock"; tone = "amber"; }
  else if (status === "SENT" && emailed) icon = "mail";
  else if (kind === "DELIVERY_NOTE") icon = "truck";
  if (kind === "QUOTE" && status === "SENT") tone = "blue";
  return (
    <span title={info.label} className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ICON_TONES[tone]} ${className}`}>
      <Icon name={icon} className="w-[18px] h-[18px]" />
    </span>
  );
}

export function StatusChip({ status, kind, isCancellationDocument, emailed, className = "" }: { status: string; kind?: string; isCancellationDocument?: boolean; emailed?: boolean; className?: string }) {
  const info = statusInfo(status, { kind, isCancellationDocument, emailed });
  return (
    <span title={info.hint} className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TONES[info.tone]} ${info.strike ? "line-through" : ""} ${className}`}>
      {info.label}
    </span>
  );
}
