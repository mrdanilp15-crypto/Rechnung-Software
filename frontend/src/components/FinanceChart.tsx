const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const eur = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);

export interface FinanceMonth {
  month: number; // 1-12
  incomeCents: number;
  expenseCents: number;
}

/** Monatsdiagramm (reines SVG): Einnahmen und Ausgaben als Balken, Gewinn (Einnahmen minus Ausgaben) als Linie; Verluste liegen unter der Nulllinie. */
export function FinanceChart({ months }: { months: FinanceMonth[] }) {
  const profits = months.map((m) => m.incomeCents - m.expenseCents);
  const top = Math.max(1, ...months.map((m) => Math.max(m.incomeCents, m.expenseCents)), ...profits);
  const bottom = Math.min(0, ...profits);
  const W = 640;
  const H = 190;
  const padL = 52;
  const padT = 8;
  const plotW = W - padL - 8;
  const plotH = H - padT;
  const range = top - bottom;
  const y = (v: number) => padT + ((top - v) / range) * plotH;
  const slot = plotW / 12;
  const barW = (slot - 8) / 2;
  const ticks = [top, top / 2, 0, ...(bottom < 0 ? [bottom] : [])];
  const points = profits.map((p, i) => `${padL + i * slot + slot / 2},${y(p)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label="Einnahmen, Ausgaben und Gewinn pro Monat">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-slate-400 dark:stroke-slate-500" : "stroke-slate-200 dark:stroke-slate-700"} strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-500" fontSize="10">{eur(t)}</text>
        </g>
      ))}
      {months.map((m, i) => {
        const x0 = padL + i * slot + 4;
        const profit = profits[i];
        return (
          <g key={m.month}>
            <title>{`${MONTH_SHORT[i]}: Einnahmen ${eur(m.incomeCents)}, Ausgaben ${eur(m.expenseCents)}, Gewinn ${eur(profit)}`}</title>
            <rect x={x0} y={y(m.incomeCents)} width={barW} height={Math.max(y(0) - y(m.incomeCents), m.incomeCents > 0 ? 1.5 : 0)} rx={2} fill="#22c55e" />
            <rect x={x0 + barW + 1} y={y(m.expenseCents)} width={barW} height={Math.max(y(0) - y(m.expenseCents), m.expenseCents > 0 ? 1.5 : 0)} rx={2} fill="#f59e0b" />
            <text x={padL + i * slot + slot / 2} y={H + 14} textAnchor="middle" className="fill-slate-500" fontSize="11">{MONTH_SHORT[i]}</text>
          </g>
        );
      })}
      <polyline points={points} fill="none" className="stroke-brand" strokeWidth="2" strokeLinejoin="round" />
      {profits.map((p, i) => (
        <circle key={i} cx={padL + i * slot + slot / 2} cy={y(p)} r="3" className="fill-brand" />
      ))}
    </svg>
  );
}

export function FinanceLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />Einnahmen</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#f59e0b" }} />Ausgaben</span>
      <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand" />Gewinn</span>
    </span>
  );
}
