import { useEffect } from "react";
import { PdfCanvasViewer } from "./PdfCanvasViewer";

/** Vollbild-Ansicht eines PDFs für Handy und Tablet - mit Herunterladen und Teilen. */
export function PdfViewerModal({ url, filename, blob, onClose }: { url: string; filename: string; blob: Blob; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function share() {
    const file = new File([blob], filename, { type: blob.type || "application/pdf" });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: filename });
      else download();
    } catch {
      // Teilen abgebrochen
    }
  }
  function download() {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-200 dark:bg-slate-950" role="dialog" aria-label={filename}>
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="font-medium text-sm truncate flex-1">{filename}</span>
        <button onClick={download} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800">Herunterladen</button>
        {typeof navigator !== "undefined" && "share" in navigator && <button onClick={share} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800">Teilen</button>}
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-brand text-white" aria-label="Schließen">Schließen</button>
      </div>
      <div className="flex-1 overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {blob.type.startsWith("image/") ? <img src={url} alt={filename} className="max-w-full mx-auto rounded shadow" /> : <PdfCanvasViewer url={url} className="max-w-3xl mx-auto" />}
      </div>
    </div>
  );
}
