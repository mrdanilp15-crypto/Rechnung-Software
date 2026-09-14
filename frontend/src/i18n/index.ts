import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";

const storedLocale = localStorage.getItem("rechnung_locale") || "de";

i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: storedLocale,
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

export function setLocale(locale: "de" | "en") {
  localStorage.setItem("rechnung_locale", locale);
  i18n.changeLanguage(locale);
}

export default i18n;
