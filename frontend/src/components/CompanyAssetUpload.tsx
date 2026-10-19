import { useEffect, useState } from "react";
import { api } from "../api/client";

const MAX_SIDE = 1600; // Pixel - mehr braucht ein Logo/Stempel auf einer A4-Seite nicht

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

/** Macht weißen/hellgrauen Hintergrund (auch ein eingebranntes "Transparenz"-Schachbrett) transparent. Gibt den Anteil
 * transparent gemachter Pixel zurück. Farbige Bildteile bleiben erhalten; Kanten werden weich ausgeblendet. */
export function removeLightBackground(data: ImageData): number {
  const px = data.data;
  const total = px.length / 4;
  let cleared = 0;
  const bg = 245;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const min = Math.min(r, g, b);
    const sat = Math.max(r, g, b) - min;
    let alpha = Math.min(1, Math.max(0, (236 - min) / (236 - 110)));
    if (sat < 20 && min > 185) alpha = 0;
    if (alpha < 0.04) alpha = 0;
    if (alpha === 0) cleared++;
    const safe = Math.max(alpha, 0.05);
    // Farbe von der Hintergrundmischung befreien, damit an den Kanten kein heller Saum bleibt
    px[i] = Math.min(255, Math.max(0, (r - (1 - alpha) * bg) / safe));
    px[i + 1] = Math.min(255, Math.max(0, (g - (1 - alpha) * bg) / safe));
    px[i + 2] = Math.min(255, Math.max(0, (b - (1 - alpha) * bg) / safe));
    px[i + 3] = Math.round(px[i + 3] * alpha);
  }
  return cleared / total;
}

/** Rechteck, das den sichtbaren Inhalt umschließt: bei Transparenz alle Pixel mit Alpha, sonst alles, was sich deutlich
 * von der Hintergrundfarbe in den Ecken unterscheidet. */
export function contentBounds(data: ImageData): { x: number; y: number; w: number; h: number } | null {
  const { width, height } = data;
  const px = data.data;
  let hasAlpha = false;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 250) {
      hasAlpha = true;
      break;
    }
  }
  const corner = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const corners = [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)];
  const bgc = [0, 1, 2].map((c) => Math.round(corners.reduce((s, k) => s + k[c], 0) / 4));
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const visible = hasAlpha
        ? px[i + 3] > 12
        : Math.max(Math.abs(px[i] - bgc[0]), Math.abs(px[i + 1] - bgc[1]), Math.abs(px[i + 2] - bgc[2])) > 28;
      if (visible) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export interface ProcessedImage {
  file: File;
  trimmed: boolean;
  backgroundRemoved: boolean;
}

/**
 * Bereitet ein hochgeladenes Bild für die PDFs auf:
 *  - wandelt jedes darstellbare Format (WebP, SVG, GIF, AVIF ...) in PNG/JPEG um (die PDF-Erzeugung kann nur diese
 *    beiden einbetten) und begrenzt die Größe,
 *  - schneidet leere Ränder ab (sonst wird ein Logo mit viel Weißraum winzig dargestellt),
 *  - macht auf Wunsch weißen/grauen Hintergrund transparent.
 */
export async function processAssetImage(original: File, assetName: string, removeBackground: boolean): Promise<ProcessedImage> {
  const img = await loadImage(original);
  let w = img.naturalWidth || 512;
  let h = img.naturalHeight || 512;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("unreadable");
  ctx.drawImage(img, 0, 0, w, h);

  let data = ctx.getImageData(0, 0, w, h);
  let backgroundRemoved = false;
  if (removeBackground) {
    const copy = new ImageData(new Uint8ClampedArray(data.data), w, h);
    const cleared = removeLightBackground(copy);
    // Wäre fast alles "Hintergrund" (z.B. sehr helles Bild), lieber nichts entfernen
    if (cleared < 0.97) {
      data = copy;
      ctx.putImageData(data, 0, 0);
      backgroundRemoved = cleared > 0.02;
    }
  }

  const bounds = contentBounds(data);
  let trimmed = false;
  let out = canvas;
  if (bounds && (bounds.w < w - 4 || bounds.h < h - 4)) {
    const pad = Math.max(4, Math.round(Math.max(bounds.w, bounds.h) * 0.02));
    const x = Math.max(0, bounds.x - pad);
    const y = Math.max(0, bounds.y - pad);
    const cw = Math.min(w - x, bounds.w + pad * 2);
    const ch = Math.min(h - y, bounds.h + pad * 2);
    out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d")!.drawImage(canvas, x, y, cw, ch, 0, 0, cw, ch);
    trimmed = true;
  }

  // JPEG nur, wenn das Original ein JPEG war und nichts transparent gemacht wurde
  const asJpeg = original.type === "image/jpeg" && !backgroundRemoved;
  const type = asJpeg ? "image/jpeg" : "image/png";
  const blob: Blob | null = await new Promise((resolve) => out.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("unreadable");
  return { file: new File([blob], `${assetName}.${asJpeg ? "jpg" : "png"}`, { type }), trimmed, backgroundRemoved };
}

/**
 * Upload/Vorschau/Löschen für ein Firmen-Bild (Logo, Stempel, Unterschrift).
 * Die Bilder werden nur über einen authentifizierten Endpunkt ausgeliefert
 * (`GET /api/companies/me/:asset`), ein normales <img src="..."> kann das Auth-Cookie
 * hier nicht zuverlässig mitschicken - daher wird das Bild per Axios als Blob
 * geladen und als Object-URL angezeigt.
 */
export function CompanyAssetUpload({ assetName, label, hint }: { assetName: "logo" | "stamp" | "signature"; label: string; hint?: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [lastFile, setLastFile] = useState<File | null>(null);

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await api.get(`/companies/me/${assetName}`, { responseType: "blob" });
      setPreviewUrl(URL.createObjectURL(res.data));
    } catch {
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(original: File, removeBackground = removeBg) {
    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      let processed: ProcessedImage;
      try {
        processed = await processAssetImage(original, assetName, removeBackground);
      } catch {
        setError("Dieses Bildformat kann nicht gelesen werden. Bitte als PNG oder JPG speichern und erneut hochladen.");
        return;
      }
      const formData = new FormData();
      formData.append(assetName, processed.file);
      await api.post(`/companies/me/${assetName}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setLastFile(original);
      const notes = [processed.trimmed ? "leere Ränder abgeschnitten" : null, processed.backgroundRemoved ? "Hintergrund transparent gemacht" : null].filter(Boolean);
      if (notes.length) setInfo(`Automatisch angepasst: ${notes.join(", ")}.`);
      await loadPreview();
    } catch (err: any) {
      const status = err.response?.status;
      setError(
        err.response?.data?.error ||
          (status === 413 ? "Die Datei ist zu groß." : status === 403 ? "Nur Administratoren dürfen Bilder hochladen." : "Das Bild konnte nicht hochgeladen werden.")
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setInfo(null);
    try {
      await api.delete(`/companies/me/${assetName}`);
      setPreviewUrl(null);
      setLastFile(null);
    } catch (err: any) {
      setError(err.response?.data?.error || "Das Bild konnte nicht entfernt werden.");
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className="w-28 h-24 border border-dashed border-slate-300 dark:border-slate-600 rounded flex items-center justify-center overflow-hidden bg-white shrink-0">
        {loading || uploading ? (
          <span className="text-xs text-slate-400">...</span>
        ) : previewUrl ? (
          <img src={previewUrl} alt={label} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400 text-center px-1">kein Bild</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
            className="text-sm max-w-full"
          />
          {previewUrl && (
            <button type="button" onClick={handleDelete} className="text-red-600 text-sm hover:underline">
              entfernen
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500 mt-2 cursor-pointer">
          <input
            type="checkbox"
            checked={removeBg}
            disabled={uploading}
            onChange={(e) => {
              setRemoveBg(e.target.checked);
              // Bereits gewähltes Bild sofort mit der neuen Einstellung erneut aufbereiten
              if (lastFile) handleUpload(lastFile, e.target.checked);
            }}
          />
          Weißen/grauen Hintergrund transparent machen
        </label>
        <p className="text-xs text-slate-400 mt-0.5">Leere Ränder werden immer automatisch abgeschnitten.</p>
        {uploading && <p className="text-xs text-slate-500 mt-1">Wird hochgeladen ...</p>}
        {info && <p className="text-xs text-green-600 mt-1">{info}</p>}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
