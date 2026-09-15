import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./components/Toast";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Macht die App auf dem Handy "installierbar" (Zum Home-Bildschirm hinzufügen) und
// cacht das App-Shell für schnelleres Laden - siehe public/sw.js. Nur in der Produktions-
// Auslieferung (import.meta.env.PROD), damit der Vite-Dev-Server nicht mitgecacht wird.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
