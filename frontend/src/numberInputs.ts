/**
 * Zahlenfelder global komfortabler machen (gilt für ALLE Eingabefelder der App):
 *  1. Beim Anklicken/Tabben wird der Inhalt markiert - eine vorhandene "0" wird beim Tippen einfach ersetzt.
 *  2. Führende Nullen werden sofort entfernt ("05" -> "5"). Ohne das zeigt der Browser bei Feldern, deren Wert in der App
 *     als Zahl geführt wird, weiterhin "05" an, obwohl intern 5 gespeichert ist.
 */
function isNumeric(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  return el.type === "number" || el.inputMode === "decimal" || el.inputMode === "numeric";
}

export function installNumberInputHelpers() {
  document.addEventListener("focusin", (e) => {
    if (isNumeric(e.target)) {
      const el = e.target;
      // Auswahl erst nach dem Klick setzen, sonst hebt der Browser sie sofort wieder auf
      setTimeout(() => {
        try {
          el.select();
        } catch {
          // type="number" erlaubt in manchen Browsern keine Auswahl-API - dann bleibt es beim Standardverhalten
        }
      }, 0);
    }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!isNumeric(el)) return;
    const fixed = el.value.replace(/^(-?)0+(?=\d)/, "$1");
    if (fixed !== el.value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, fixed);
    }
  });
}
