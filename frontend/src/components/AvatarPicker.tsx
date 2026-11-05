import { useState } from "react";
import { api } from "../api/client";
import { Avatar, AVATAR_COLORS, AVATAR_PRESETS, type AvatarInfo } from "./Avatar";
import { Icon } from "./Icon";

/**
 * Profilbild wählen: eigenes Foto hochladen (wird im Browser auf 256 Pixel quadratisch verkleinert), ein Symbol oder die Initialen, jeweils mit Farbe.
 * userId "me" für das eigene Konto; Administratoren können auch fremde Konten ändern.
 */

/** Bild mittig quadratisch zuschneiden und auf 256 x 256 verkleinern (PNG, bei Fotos JPEG). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden.");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.88));
  if (!blob) throw new Error("Bild konnte nicht verarbeitet werden.");
  return blob;
}

export function AvatarPicker({ userId, targetId, name, avatar, onChanged }: { userId: "me" | string; targetId: string; name: string; avatar: AvatarInfo | null | undefined; onChanged: (a: AvatarInfo) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = avatar ?? { photo: false, preset: null, color: null, v: 0 };

  async function run(fn: () => Promise<AvatarInfo>) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  const setLook = (preset: string | null, color: string | null) => run(async () => (await api.put(`/users/${userId}/avatar`, { preset, color })).data);
  const upload = (file: File) =>
    run(async () => {
      if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("Bitte ein PNG- oder JPEG-Bild wählen.");
      const blob = await shrink(file);
      const form = new FormData();
      form.append("file", blob, file.type === "image/png" ? "avatar.png" : "avatar.jpg");
      return (await api.post(`/users/${userId}/avatar/photo`, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    });
  const removePhoto = () => run(async () => (await api.delete(`/users/${userId}/avatar/photo`)).data);

  const btn = "w-10 h-10 rounded-full border-2 flex items-center justify-center";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar id={targetId} name={name} avatar={current} size="xl" />
        <div className="space-y-2 text-sm">
          <label className={`inline-block px-3 py-1.5 rounded-lg bg-brand text-white cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            Foto hochladen
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </label>
          {current.photo && <button type="button" onClick={removePhoto} disabled={busy} className="block text-slate-500 hover:underline">Foto entfernen</button>}
          <p className="text-xs text-slate-500">PNG oder JPEG. Das Bild wird mittig quadratisch zugeschnitten und verkleinert.</p>
        </div>
      </div>

      <div>
        <p className="text-sm mb-1.5">Oder ein Symbol (ohne Foto):</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setLook(null, current.color)} aria-pressed={!current.preset} title="Initialen" className={`${btn} text-xs font-semibold ${!current.preset ? "border-brand" : "border-slate-300 dark:border-slate-600"}`}>Aa</button>
          {AVATAR_PRESETS.map((p) => (
            <button key={p} type="button" disabled={busy} onClick={() => setLook(p, current.color)} aria-pressed={current.preset === p} title={p} className={`${btn} ${current.preset === p ? "border-brand" : "border-slate-300 dark:border-slate-600"}`}>
              <Icon name={p} className="w-5 h-5" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm mb-1.5">Farbe:</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" disabled={busy} onClick={() => setLook(current.preset, c)} aria-pressed={current.color === c} aria-label={`Farbe ${c}`} className={`w-7 h-7 rounded-full border-2 ${current.color === c ? "border-slate-900 dark:border-white" : "border-transparent"}`} style={{ background: c }} />
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1.5">Ein hochgeladenes Foto hat Vorrang vor Symbol und Farbe.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
