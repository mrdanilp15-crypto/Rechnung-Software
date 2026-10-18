import { useEffect, useState } from "react";
import { api } from "../api/client";

const MAX_SIDE = 1600; // Pixel - mehr braucht ein Logo/Stempel auf einer A4-Seite nicht
const KEEP_AS_IS_BYTES = 3 * 1024 * 1024;

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

/**
 * Die PDF-Erzeugung kann nur PNG und JPEG einbetten. Andere Formate (WebP, SVG, GIF, AVIF ...) und sehr große
 * Dateien wandelt der Browser deshalb vor dem Hochladen selbst in ein passendes PNG/JPEG um - so klappt der
 * Upload mit jedem Bild, das der Browser anzeigen kann, ohne dass jemand ein Grafikprogramm braucht.
 */
async function toPdfSafeImage(file: File, assetName: string): Promise<File> {
  const isPng = file.type === "image/png";
  const isJpeg = file.type === "image/jpeg";
  if ((isPng || isJpeg) && file.size <= KEEP_AS_IS_BYTES) return file;

  const img = await loadImage(file);
  let w = img.naturalWidth || 512;
  let h = img.naturalHeight || 512;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unreadable");
  if (isJpeg) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  const type = isJpeg ? "image/jpeg" : "image/png";
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("unreadable");
  return new File([blob], `${assetName}.${isJpeg ? "jpg" : "png"}`, { type });
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

  async function handleUpload(original: File) {
    setError(null);
    setUploading(true);
    try {
      let file: File;
      try {
        file = await toPdfSafeImage(original, assetName);
      } catch {
        setError("Dieses Bildformat kann nicht gelesen werden. Bitte als PNG oder JPG speichern und erneut hochladen.");
        return;
      }
      const formData = new FormData();
      formData.append(assetName, file);
      await api.post(`/companies/me/${assetName}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
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
    try {
      await api.delete(`/companies/me/${assetName}`);
      setPreviewUrl(null);
    } catch (err: any) {
      setError(err.response?.data?.error || "Das Bild konnte nicht entfernt werden.");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24 border border-dashed border-slate-300 dark:border-slate-600 rounded flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-900 shrink-0">
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
        {uploading && <p className="text-xs text-slate-500 mt-1">Wird hochgeladen ...</p>}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
