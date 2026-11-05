import { useAuthStore } from "../store/authStore";
import { AvatarPicker } from "./AvatarPicker";

/** "Mein Konto": eigenes Profilbild wählen (jede Rolle). */
export function ProfileCard() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  if (!user) return null;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3 max-w-md mb-4">
      <h2 className="font-medium">Profilbild</h2>
      <p className="text-sm text-slate-500">So erscheinst du bei Aufträgen, auf dem Produktionsboard und in der Benutzerliste.</p>
      <AvatarPicker userId="me" targetId={user.id} name={user.name} avatar={user.avatar} onChanged={(avatar) => setUser({ ...user, avatar })} />
    </div>
  );
}
