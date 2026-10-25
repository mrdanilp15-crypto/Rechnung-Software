/** @type {import('tailwindcss').Config} */

// Die Grau-Stufen (slate) kommen aus CSS-Variablen (siehe src/index.css): Im dunklen Design lässt sich so die ganze Oberfläche
// zwischen "kühl" (Standard-Tailwind) und "warm" umschalten, ohne dass einzelne Seiten angepasst werden müssen.
const slateSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const slate = Object.fromEntries(slateSteps.map((s) => [s, `rgb(var(--slate-${s}) / <alpha-value>)`]));

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Akzentfarbe: frei wählbar unter Einstellungen -> Darstellung (CSS-Variablen, gesetzt in src/theme/appearance.ts)
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          dark: "rgb(var(--brand-dark) / <alpha-value>)",
        },
        slate,
      },
      borderRadius: {
        lg: "0.75rem",
      },
    },
  },
  plugins: [],
};
