import { Icon } from "./Icon";

/** Suchfeld im modernen Stil: weiße Pille mit Lupe (wie bei Belegen und Kunden). */
export function SearchPill({ value, onChange, placeholder, className = "mb-5" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`w-full flex items-center gap-2 px-4 h-11 rounded-full bg-white shadow text-sm text-slate-400 ${className}`}>
      <Icon name="search" className="w-4 h-4 shrink-0" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 min-w-0 bg-transparent outline-none text-slate-900 placeholder:text-slate-400 !rounded-none focus-visible:!outline-none" />
    </label>
  );
}
