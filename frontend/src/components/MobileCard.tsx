import { ReactNode } from "react";

/**
 * Listenzeile im modernen Stil - auf allen Bildschirmen dieselbe Darstellung (keine breiten Tabellen mehr).
 * Handy: Titel oben, Felder darunter, Aktionen unten rechts. Ab Tablet-Breite stehen die Aktionen rechts neben dem Titel
 * und die Felder nebeneinander. "leading" ist ein optionales Bild/Symbol links (z.B. Profilbild).
 */
export function MobileCard({
  title,
  subtitle,
  actions,
  children,
  onClick,
  leading,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  leading?: ReactNode;
}) {
  return (
    <div className={`px-4 py-3.5 first:rounded-t-3xl last:rounded-b-3xl ${onClick ? "cursor-pointer hover:bg-slate-50/70 active:bg-slate-50 dark:active:bg-slate-700/50" : ""}`} onClick={onClick}>
      <div className="flex gap-3">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
          <div className="md:flex md:items-start md:gap-4">
            <div className="min-w-0 md:flex-1">
              <div className="font-medium truncate">{title}</div>
              {subtitle && <div className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</div>}
            </div>
            {actions && (
              <div className="hidden md:flex shrink-0 text-sm" onClick={(e) => e.stopPropagation()}>
                {actions}
              </div>
            )}
          </div>
          {children && <dl className="text-sm space-y-1 mt-2 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-1 md:[&>.pt-2]:col-span-full md:[&>div:not(:has(dt))]:col-span-full">{children}</dl>}
          {actions && (
            <div className="md:hidden mt-2 flex justify-end text-sm" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between md:justify-start gap-3">
      <dt className="text-slate-500 shrink-0">{label}{label ? <span className="hidden md:inline">:</span> : null}</dt>
      <dd className="text-right md:text-left truncate md:whitespace-normal md:overflow-visible min-w-0">{value}</dd>
    </div>
  );
}
