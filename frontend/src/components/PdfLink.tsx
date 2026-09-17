import { useState } from "react";
import { api } from "../api/client";

/**
 * Öffnet/lädt eine über die API ausgelieferte Datei (PDF, CSV, JSON, ...) herunter,
 * authentifiziert per Axios (Auth-Cookie wird von withCredentials automatisch
 * mitgeschickt, siehe api/client.ts) und als Object-URL geöffnet (PDFs in neuem Tab)
 * bzw. heruntergeladen (download=true, z.B. CSV-/JSON-Exporte).
 */
export function PdfLink({
  url,
  filename,
  download = false,
  className,
  children,
}: {
  url: string;
  filename: string;
  download?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    // Das Tab MUSS synchron im Klick-Handler geöffnet werden (window.open nach einem
    // await verliert die "user activation" und wird von Browsern als Popup geblockt).
    // Es startet leer und bekommt die Blob-URL erst, sobald das PDF geladen ist.
    const newTab = download ? null : window.open("", "_blank");
    setLoading(true);
    try {
      const res = await api.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(res.data);
      if (newTab) {
        newTab.location.href = blobUrl;
      } else {
        // download=true oder Popup-Blocker aktiv: Datei stattdessen herunterladen.
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        link.click();
      }
    } catch {
      newTab?.close();
      alert("Datei konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading} className={className}>
      {loading ? "..." : children}
    </button>
  );
}
