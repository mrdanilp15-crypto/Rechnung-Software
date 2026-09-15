import { ReactNode } from "react";

/**
 * Gestapelte Karten-Darstellung einer Listenzeile für schmale Bildschirme - Alternative
 * zur festbreiten CSS-Grid-Tabellenzeile (die auf dem Handy nur horizontal scrollbar
 * wäre). Wird zusammen mit "hidden md:grid" (Desktop-Zeile) / "md:hidden" (diese Karte)
 * verwendet, siehe Listen-Seiten (Products, Customers, Invoices, ...).
 */
export function MobileCard({
  title,
  subtitle,
  actions,
  children,
  onClick,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={`p-4 ${onClick ? "cursor-pointer active:bg-slate-50 dark:active:bg-slate-700/50" : ""}`} onClick={onClick}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{title}</div>
          {subtitle && <div className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</div>}
        </div>
        {actions && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {children && <dl className="text-sm space-y-1 mt-2">{children}</dl>}
    </div>
  );
}

export function MobileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-right truncate min-w-0">{value}</dd>
    </div>
  );
}
