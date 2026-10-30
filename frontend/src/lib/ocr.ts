import { loadPdfjs } from "../components/PdfCanvasViewer";

/**
 * Lokale Texterkennung für Belege: Fotos werden mit Tesseract (WebAssembly) direkt im Browser gelesen, bei PDFs wird zuerst
 * die Textebene gelesen und nur bei gescannten PDFs die Seite als Bild erkannt. Der Beleg verlässt dabei das Gerät nicht -
 * es gibt keinen Cloud-Dienst. Die Programmdateien und das deutsche Sprachpaket liegen in der App selbst (kein Download von Dritten).
 */

export type OcrMode = "normal" | "kontrast";

export interface OcrResult {
  text: string;
  /** Mittlere Sicherheit der Erkennung in Prozent (bei PDF-Textebene: 100) */
  confidence: number;
  method: "pdf-text" | "ocr";
}

type Progress = (stage: string, fraction: number) => void;

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;
let onProgress: Progress | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/** Unterstützt der Browser WebAssembly-SIMD? (schneller; sonst die einfache Variante laden) */
function hasSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

async function getWorker() {
  clearTimeout(idleTimer);
  if (!workerPromise) {
    workerPromise = (async () => {
      onProgress?.("Texterkennung wird geladen", 0);
      const [{ createWorker, OEM, PSM }, workerUrl, coreSimd, coreBasic] = await Promise.all([
        import("tesseract.js"),
        import("tesseract.js/dist/worker.min.js?url").then((m) => m.default),
        import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url").then((m) => m.default),
        import("tesseract.js-core/tesseract-core-lstm.wasm.js?url").then((m) => m.default),
      ]);
      const worker = await createWorker("deu", OEM.LSTM_ONLY, {
        workerPath: new URL(workerUrl, window.location.href).href,
        corePath: new URL(hasSimd() ? coreSimd : coreBasic, window.location.href).href,
        langPath: `${window.location.origin}/ocr`,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") onProgress?.("Text wird erkannt", m.progress);
          else if (m.status.includes("loading") || m.status.includes("initializing")) onProgress?.("Texterkennung wird geladen", m.progress);
        },
      });
      // Kassenbons: Spalten (Artikel ... Preis) sollen mit ihren Abständen erhalten bleiben
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Gibt den Speicher der Texterkennung wieder frei (beim Schließen des Fensters). */
export function disposeOcr(): void {
  clearTimeout(idleTimer);
  const p = workerPromise;
  workerPromise = null;
  p?.then((w) => w.terminate()).catch(() => {});
}

/** Lädt ein Bild gedreht und in sinnvoller Größe auf eine Zeichenfläche; Graustufen und Kontrast werden für die Erkennung verbessert. */
export async function prepareCanvas(source: CanvasImageSource, rotation: number, mode: OcrMode, enhance = true): Promise<HTMLCanvasElement> {
  const dims = source as { naturalWidth?: number; naturalHeight?: number; width: number; height: number };
  const sw = dims.naturalWidth || dims.width;
  const sh = dims.naturalHeight || dims.height;
  const quarter = Math.abs(rotation / 90) % 2 === 1;
  const w0 = quarter ? sh : sw;
  const h0 = quarter ? sw : sh;
  const longest = Math.max(w0, h0);
  // Zu große Handyfotos verkleinern (schneller), kleine Bilder vergrößern (Schrift sollte mindestens ~25 px hoch sein)
  const scale = longest > 2600 ? 2600 / longest : longest < 1400 ? Math.min(2, 1800 / longest) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, (-sw * scale) / 2, (-sh * scale) / 2, sw * scale, sh * scale);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (enhance) enhanceContrast(ctx, canvas.width, canvas.height, mode);
  return canvas;
}

/** Graustufen, Kontrast strecken; im Modus "kontrast" zusätzlich Schwarz/Weiß (Otsu) - hilft bei Schatten und blasser Schrift. */
function enhanceContrast(ctx: CanvasRenderingContext2D, w: number, h: number, mode: OcrMode) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    hist[g]++;
  }
  const total = w * h;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= total * 0.02) {
      lo = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= total * 0.02) {
      hi = i;
      break;
    }
  }
  const range = Math.max(40, hi - lo);
  let threshold = -1;
  if (mode === "kontrast") {
    // Schwellwert nach Otsu auf dem gestreckten Bild
    const h2 = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) h2[Math.max(0, Math.min(255, Math.round(((d[i] - lo) * 255) / range)))]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * h2[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    for (let t = 0; t < 256; t++) {
      wB += h2[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * h2[t];
      const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
      if (between > best) {
        best = between;
        threshold = t;
      }
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    let v = Math.max(0, Math.min(255, Math.round(((d[i] - lo) * 255) / range)));
    if (threshold >= 0) v = v > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

export async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fallback unten
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function recognizeCanvas(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return { text: data.text, confidence: data.confidence };
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Text der PDF-Textebene, Zeile für Zeile (Elemente mit gleicher Höhe gehören in eine Zeile). */
async function pdfTextLayer(pdf: import("pdfjs-dist").PDFDocumentProxy, maxPages: number): Promise<string> {
  const out: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3);
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], str: item.str });
      rows.set(y, row);
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, row]) => out.push(row.sort((a, b) => a.x - b.x).map((r) => r.str).join(" ")));
  }
  return out.join("\n");
}

/** Liest Foto oder PDF. rotation: 0/90/180/270 (nur für Bilder). */
export async function recognizeReceipt(file: File, opts: { rotation?: number; mode?: OcrMode; onProgress?: Progress } = {}): Promise<OcrResult> {
  onProgress = opts.onProgress ?? null;
  const rotation = opts.rotation ?? 0;
  const mode = opts.mode ?? "normal";
  try {
    if (isPdf(file)) {
      onProgress?.("PDF wird gelesen", 0);
      const lib = await loadPdfjs();
      const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
      try {
        const text = await pdfTextLayer(pdf, 3);
        if (text.replace(/\s/g, "").length >= 40) return { text, confidence: 100, method: "pdf-text" };
        // Gescanntes PDF ohne Text: Seiten als Bild erkennen
        const parts: string[] = [];
        let conf = 0;
        const pages = Math.min(pdf.numPages, 3);
        for (let n = 1; n <= pages; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 2200 / Math.max(base.width, base.height) });
          const raw = document.createElement("canvas");
          raw.width = Math.floor(viewport.width);
          raw.height = Math.floor(viewport.height);
          await page.render({ canvasContext: raw.getContext("2d")!, viewport }).promise;
          const canvas = await prepareCanvas(raw, rotation, mode);
          onProgress = (stage, f) => opts.onProgress?.(`${stage} (Seite ${n} von ${pages})`, f);
          const r = await recognizeCanvas(canvas);
          parts.push(r.text);
          conf += r.confidence / pages;
        }
        return { text: parts.join("\n"), confidence: conf, method: "ocr" };
      } finally {
        pdf.destroy();
      }
    }
    const bitmap = await loadImage(file);
    const canvas = await prepareCanvas(bitmap as unknown as HTMLCanvasElement, rotation, mode);
    const r = await recognizeCanvas(canvas);
    return { text: r.text, confidence: r.confidence, method: "ocr" };
  } finally {
    onProgress = null;
    // Nach einer Weile ohne Nutzung den Speicher freigeben
    clearTimeout(idleTimer);
    idleTimer = setTimeout(disposeOcr, 120_000);
  }
}

/** Gedrehtes, verkleinertes JPEG des Fotos für die Ablage (ohne Graustufen) - so liegt der Beleg später richtig herum im Archiv. */
export async function rotatedJpeg(file: File, rotation: number): Promise<File> {
  const bitmap = await loadImage(file);
  const canvas = await prepareCanvas(bitmap as unknown as HTMLCanvasElement, rotation, "normal", false);
  const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.9));
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
