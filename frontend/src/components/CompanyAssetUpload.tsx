import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Upload/Vorschau/Löschen für ein Firmen-Bild (Logo, Stempel, Unterschrift).
 * Die Bilder werden nur über einen authentifizierten Endpunkt ausgeliefert
 * (`GET /api/companies/me/:asset`), ein normales <img src="..."> könnte den
 * Authorization-Header nicht mitschicken - daher wird das Bild per Axios als Blob
 * geladen und als Object-URL angezeigt.
 */
export function CompanyAssetUpload({ assetName, label, hint }: { assetName: "logo" | "stamp" | "signature"; label: string; hint?: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function handleUpload(file: File) {
    const formData = new FormData();
    formData.append(assetName, file);
    await api.post(`/companies/me/${assetName}`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    loadPreview();
  }

  async function handleDelete() {
    await api.delete(`/companies/me/${assetName}`);
    setPreviewUrl(null);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-24 h-24 border border-dashed border-slate-300 dark:border-slate-600 rounded flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-900 shrink-0">
        {loading ? (
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
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
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
      </div>
    </div>
  );
}
