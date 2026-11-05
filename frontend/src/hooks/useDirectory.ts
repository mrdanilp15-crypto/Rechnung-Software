import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AvatarInfo } from "../components/Avatar";

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  avatar: AvatarInfo;
}

let cache: StaffMember[] | null = null;
let pending: Promise<StaffMember[]> | null = null;

/** Mitarbeiter-Verzeichnis (aktive Konten der Firma) für Auswahlfelder und Filter; einmal geladen, dann zwischengespeichert. */
export function useDirectory(): StaffMember[] {
  const [list, setList] = useState<StaffMember[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    pending = pending ?? api.get("/users/directory").then((r) => (cache = r.data as StaffMember[])).catch(() => (cache = [])).finally(() => { pending = null; });
    let alive = true;
    pending.then((l) => { if (alive) setList(l); });
    return () => { alive = false; };
  }, []);
  return list;
}

/** Nach Änderung eines Profilbilds den Zwischenspeicher verwerfen. */
export function resetDirectory() {
  cache = null;
}
