import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { CatalogState } from "../shared/catalog";
import { defaultSettings } from "../shared/catalog";
type Context = {
  data: CatalogState;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  admin: boolean;
  sessionError: string;
};
const CatalogContext = createContext<Context>({
  data: { routes: [], settings: defaultSettings, revision: 0, updatedAt: "" },
  loading: true,
  error: "",
  reload: async () => {},
  admin: false,
  sessionError: "",
});
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CatalogState>({
      routes: [],
      settings: defaultSettings,
      revision: 0,
      updatedAt: "",
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [admin, setAdmin] = useState(false),
    [sessionError, setSessionError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const value = await response.json();
      if (!Array.isArray(value.routes) || !value.settings ||
          typeof value.settings.maintenance !== "boolean" ||
          typeof value.revision !== "number" || typeof value.updatedAt !== "string")
        throw new Error("Invalid catalog response");
      setData(value);
    } catch {
      setError("The route directory could not load. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
  void reload();

  const controller = new AbortController();
  fetch("/api/session", { signal: controller.signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Session endpoint unavailable");
      }
      return response.json();
    })
    .then((session) => {
      if (typeof session.admin !== "boolean" || typeof session.signedIn !== "boolean")
        throw new Error("Invalid session response");
      setAdmin(session.admin === true);
      setSessionError("");
    })
    .catch(() => {
      if (controller.signal.aborted) return;
      setAdmin(false);
      setSessionError("Account status could not load. Reload to retry; admin access is unavailable.");
    });
  return () => controller.abort();
}, [reload]);
  return (
    <CatalogContext.Provider value={{ data, loading, error, reload, admin, sessionError }}>
      {children}
    </CatalogContext.Provider>
  );
}
export const useCatalog = () => useContext(CatalogContext);

