import axios from "axios";
import { useAuthStore } from "../store/authStore";

// withCredentials: true sorgt dafür, dass der Browser die httpOnly-Auth-Cookies
// (siehe backend/src/modules/auth/cookies.ts) automatisch an jede Anfrage anhängt -
// das Frontend liest/verwaltet die Tokens selbst nicht mehr (kein localStorage).
export const api = axios.create({ baseURL: "/api", withCredentials: true });

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  try {
    await axios.post("/api/auth/refresh", {}, { withCredentials: true });
    return true;
  } catch {
    useAuthStore.getState().clearSession();
    return false;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const refreshed = await refreshPromise;
      refreshPromise = null;
      // Der neue Access-Token steckt im (vom Browser bereits übernommenen) Set-Cookie-
      // Header der Refresh-Antwort - der Retry braucht keinen Header manuell zu setzen,
      // das Cookie wird beim erneuten Request automatisch mitgeschickt.
      if (refreshed) return api(original);
    }
    return Promise.reject(error);
  }
);
