import { useEffect, useRef, useState } from "react";

/**
 * PDF-Ansicht, die die Seiten selbst als Bilder zeichnet (pdf.js). Nötig, weil Handys und Tablets PDFs nicht in einem
 * eingebetteten Rahmen anzeigen können - dort müsste man sonst erst die Datei herunterladen. Die Bibliothek wird erst
 * beim ersten Gebrauch nachgeladen.
 */

/** Touch-Geräte und schmale Fenster: dort funktioniert die eingebaute PDF-Anzeige des Browsers nicht zuverlässig. */
export const useNeedsCanvasPdf = () => {
  const query = "(max-width: 1023px), (pointer: coarse)";
  const [needs, setNeeds] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNeeds(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return needs;
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.js?url")]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

export function PdfCanvasViewer({ url, className = "" }: { url: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [width, setWidth] = useState(0);

  // Breite des Containers beobachten (Drehen des Geräts, Fenstergröße)
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setWidth(el.clientWidth);
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setWidth((w) => (Math.abs(el.clientWidth - w) > 8 ? el.clientWidth : w)), 200);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || width < 50) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const [lib, data] = await Promise.all([loadPdfjs(), fetch(url).then((r) => r.arrayBuffer())]);
        const pdf = await lib.getDocument({ data }).promise;
        const canvases: HTMLCanvasElement[] = [];
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.background = "#fff";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,.25)";
          canvas.style.marginBottom = "10px";
          canvas.setAttribute("aria-label", `Seite ${n} von ${pdf.numPages}`);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }
        if (cancelled) return;
        el.replaceChildren(...canvases);
        setStatus("ready");
        pdf.destroy();
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, width]);

  return (
    <div className={className}>
      <div ref={host} />
      {status === "loading" && <p className="text-sm text-slate-500 text-center py-6">Vorschau wird gezeichnet ...</p>}
      {status === "error" && (
        <p className="text-sm text-slate-500 text-center py-6">
          Die Vorschau konnte hier nicht angezeigt werden. <a href={url} download="vorschau.pdf" className="text-brand underline">PDF herunterladen</a>
        </p>
      )}
    </div>
  );
}
