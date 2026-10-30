import { useState } from "react";
import { api } from "../api/client";
import { PdfViewerModal } from "./PdfViewerModal";
import { useNeedsCanvasPdf } from "./PdfCanvasViewer";

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
  title,
  children,
}: {
  url: string;
  filename: string;
  download?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const touchLike = useNeedsCanvasPdf();
  const [viewer, setViewer] = useState<{ url: string; blob: Blob } | null>(null);

  async function handleClick() {
    // Das Tab MUSS synchron im Klick-Handler geöffnet werden (window.open nach einem
    // await verliert die "user activation" und wird von Browsern als Popup geblockt).
    // Es startet leer und bekommt die Blob-URL erst, sobald das PDF geladen ist.
    // Handy/Tablet: PDFs werden in der App selbst angezeigt (mit Herunterladen/Teilen) statt in einem neuen Tab, den manche Browser nicht darstellen
    const inApp = !download && touchLike;
    const newTab = download || inApp ? null : window.open("", "_blank");
    setLoading(true);
    try {
      const res = await api.get(url, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(res.data);
      if (inApp && (res.data.type === "application/pdf" || res.data.type.startsWith("image/"))) {
        setViewer({ url: blobUrl, blob: res.data });
      } else if (newTab) {
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
    <>
      <button type="button" onClick={handleClick} disabled={loading} className={className} title={title}>
        {loading ? "..." : children}
      </button>
      {viewer && (
        <PdfViewerModal
          url={viewer.url}
          blob={viewer.blob}
          filename={filename}
          onClose={() => {
            URL.revokeObjectURL(viewer.url);
            setViewer(null);
          }}
        />
      )}
    </>
  );
}
