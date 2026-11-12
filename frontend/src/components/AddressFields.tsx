import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { api } from "../api/client";
import { hasMapAddress, mapsRouteUrl, mapsSearchUrl, parseAddressBlock, type AddressValue } from "../lib/address";
import { useEditPanelDirty } from "./EditPanel";

interface Suggestion {
  label: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
}

const input = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";

/**
 * Adressfelder mit Hilfen: Vorschläge beim Tippen der Straße (füllt PLZ, Ort und Land gleich mit), Ort zur Postleitzahl,
 * eine ganze Adresse einfügen (wird zerlegt) und Links zu Google Maps. Alles ist Hilfe - die Felder bleiben von Hand änderbar,
 * und ohne Internet funktioniert die Eingabe wie bisher.
 */
export function AddressFields({ value, onChange }: { value: AddressValue; onChange: (patch: Partial<AddressValue>) => void }) {
  const listId = useId();
  const markDirty = useEditPanelDirty();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [unavailable, setUnavailable] = useState(false);
  const [cityChoices, setCityChoices] = useState<string[]>([]);
  const skipLookup = useRef(false); // direkt nach einer Auswahl keine neue Suche
  const reqId = useRef(0);
  const latest = useRef(value);
  latest.current = value;

  const patch = (p: Partial<AddressValue>) => {
    onChange(p);
    markDirty();
  };

  // Vorschläge zur getippten Straße (verzögert, ab drei Zeichen)
  useEffect(() => {
    if (skipLookup.current) {
      skipLookup.current = false;
      return;
    }
    const street = value.street.trim();
    if (street.length < 3) {
      setSuggestions([]);
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const q = [street, [value.postalCode, value.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        const { data } = await api.get("/geo/address", { params: { q, country: value.country?.length === 2 ? value.country : undefined } });
        if (id !== reqId.current) return;
        setUnavailable(data.available === false);
        setSuggestions(data.suggestions ?? []);
        setActive(-1);
      } catch {
        if (id === reqId.current) setUnavailable(true);
      }
    }, 350);
    return () => clearTimeout(t);
    // nur die Straße löst eine Suche aus; PLZ/Ort fließen als Hinweis ein, ohne bei jeder Änderung neu zu suchen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.street]);

  // Ort zur Postleitzahl: nur eintragen, wenn der Ort noch leer ist - eine eigene Eingabe wird nie überschrieben
  useEffect(() => {
    const code = value.postalCode.trim();
    if (!/^\d{4,5}$/.test(code)) {
      setCityChoices([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/geo/postal-code", { params: { code, country: value.country?.length === 2 ? value.country : "DE" } });
        const cities: string[] = data.cities ?? [];
        if (latest.current.postalCode.trim() !== code) return;
        setCityChoices(cities.length > 1 ? cities : []);
        if (cities.length > 0 && !latest.current.city.trim()) patch({ city: cities[0] });
      } catch {
        /* ohne Internet bleibt es bei der Handeingabe */
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.postalCode, value.country]);

  function choose(s: Suggestion) {
    skipLookup.current = true;
    patch({
      street: s.houseNumber ? `${s.street} ${s.houseNumber}` : `${s.street} `, // ohne Nummer: Cursor bleibt zum Weitertippen
      postalCode: s.postalCode || value.postalCode,
      city: s.city || value.city,
      country: s.country || value.country,
    });
    setOpen(false);
    setSuggestions([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // Auswahl statt Formular abschicken
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation(); // schließt nur die Vorschläge, nicht das ganze Fenster
      setOpen(false);
    }
  }

  // Ganze Adresse eingefügt (mehrere Zeilen oder "Straße 1, 12345 Ort"): zerlegen und auf die Felder verteilen
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!/[\n,]/.test(text)) return;
    const parsed = parseAddressBlock(text);
    if (!parsed || !parsed.postalCode) return;
    e.preventDefault();
    skipLookup.current = true;
    patch(parsed);
    setOpen(false);
  }

  const mapOk = hasMapAddress(value);

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="block text-sm mb-1" htmlFor={`${listId}-street`}>Straße &amp; Hausnummer</label>
        <input
          id={`${listId}-street`}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          value={value.street}
          onChange={(e) => {
            onChange({ street: e.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className={input}
        />
        {open && suggestions.length > 0 && (
          <ul id={`${listId}-list`} role="listbox" className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg text-sm">
            {suggestions.map((s, i) => (
              <li
                key={s.label}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault(); // Fokus bleibt im Feld, bis die Auswahl übernommen ist
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`px-3 py-2 cursor-pointer ${i === active ? "bg-brand/10" : ""}`}
              >
                {s.label}
              </li>
            ))}
            <li className="px-3 py-1 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-700">Vorschläge: © OpenStreetMap-Mitwirkende (Photon)</li>
          </ul>
        )}
        <p className="text-xs text-slate-500 mt-1">
          {unavailable ? "Adressvorschläge sind gerade nicht erreichbar - du kannst die Adresse ganz normal eintippen." : "Tipp: Straße tippen und einen Vorschlag wählen, oder eine ganze Adresse hier einfügen - PLZ und Ort werden erkannt."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm mb-1">Postleitzahl</label>
          <input value={value.postalCode} onChange={(e) => onChange({ postalCode: e.target.value })} inputMode="numeric" autoComplete="postal-code" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm mb-1">Ort</label>
          <input value={value.city} onChange={(e) => onChange({ city: e.target.value })} autoComplete="address-level2" className={input} />
          {cityChoices.length > 0 && (
            <p className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
              Zu dieser PLZ gehören mehrere Orte:
              {cityChoices.map((c) => (
                <button key={c} type="button" onClick={() => patch({ city: c })} className={`px-2 py-0.5 rounded-full border ${value.city === c ? "bg-brand text-white border-brand" : "border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>{c}</button>
              ))}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-sm mb-1">Land (ISO-Code, z.B. DE, AT, CH)</label>
          <input value={value.country} onChange={(e) => onChange({ country: e.target.value.length <= 2 ? e.target.value.toUpperCase() : e.target.value })} autoComplete="country" className={input} />
        </div>
        {mapOk && (
          <div className="flex flex-wrap gap-3 text-sm pb-2">
            <a href={mapsSearchUrl(value)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Auf Karte ansehen</a>
            <a href={mapsRouteUrl(value)} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Route planen</a>
          </div>
        )}
      </div>
    </div>
  );
}
