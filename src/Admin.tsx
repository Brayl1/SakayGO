import { AdminAccess, AdminSignOut, adminFetch } from "./adminAccess";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Route as RouteIcon,
} from "lucide-react";
import type { CatalogState, CatalogRoute } from "../shared/catalog";
import { useCatalog } from "./CatalogContext";
const emptyRoute = (): CatalogRoute => ({
  id: "custom-" + crypto.randomUUID().slice(0, 8),
  name: "New route",
  from: "",
  to: "",
  source: "",
  sourceUpdated: "",
  visible: false,
  status: "unverified",
  reviewNotes: "",
  reviewedAt: "",
  roads: [],
  directions: ["inbound", "outbound"],
});
export default function Admin() {
  const { reload } = useCatalog();
  const [state, setState] = useState<CatalogState>(),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState<"routes" | "settings">("routes"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(true),
    [denied, setDenied] = useState(false);
  const [accessKey, setAccessKey] = useState(false);
  const etag = useRef("");
  const snapshot = useRef<CatalogState | undefined>(undefined);
  const geometryInput = useRef<HTMLInputElement>(null);
  const configInput = useRef<HTMLInputElement>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/state", { cache: "no-store" });
      if (res.status === 403) {
        const body = await res.json();
        setAccessKey(body.auth === "access-key");
        setError(body.error || "Owner access required.");
        setDenied(true);
        return;
      }
      if (!res.ok) throw new Error("Admin data could not load. Please retry.");
      const value = await res.json();
      etag.current = res.headers.get("etag") || "";
      snapshot.current = structuredClone(value);
      setState(value);
      setSelected((s) =>
        value.routes.some((r: CatalogRoute) => r.id === s)
          ? s
          : value.routes[0]?.id || "",
      );
      setDirty(false);
      setDenied(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const route = state?.routes.find((r) => r.id === selected);
  function patchRoute(patch: Partial<CatalogRoute>) {
    setState((s) =>
      s
        ? {
            ...s,
            routes: s.routes.map((r) =>
              r.id === selected ? { ...r, ...patch } : r,
            ),
          }
        : s,
    );
    setDirty(true);
    setMessage("");
  }
  async function save() {
    if (!state) return;
    for (const r of state.routes) {
      const missing = (["name", "from", "to", "source"] as const).filter(
        (key) => !r[key].trim(),
      );
      if (
        missing.length ||
        (!r.geometry &&
          !snapshot.current?.routes.some((saved) => saved.id === r.id))
      ) {
        setSelected(r.id);
        setTab("routes");
        setError(
          `${r.name || r.id}: ${missing.length ? "Fill in " + missing.join(", ") + "." : "Upload directional geometry before saving a new route."}`,
        );
        return;
      }
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await adminFetch("/api/admin/state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": etag.current,
        },
        body: JSON.stringify(state),
      });
      const value = await res.json();
      if (!res.ok) throw new Error(value.error || "Save failed");
      etag.current = res.headers.get("etag") || "";
      snapshot.current = structuredClone(value);
      setState(value);
      setDirty(false);
      setMessage(`Saved revision ${value.revision}. Changes are now live.`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function discard() {
    if (snapshot.current) {
      setState(structuredClone(snapshot.current));
      setSelected((id) =>
        snapshot.current?.routes.some((r) => r.id === id)
          ? id
          : snapshot.current?.routes[0]?.id || "",
      );
      setDirty(false);
      setError("");
      setMessage("Unsaved changes discarded.");
    }
  }
  async function importGeometry(file: File) {
    try {
      if (file.size > 1500000)
        throw new Error("Geometry file must be smaller than 1.5 MB.");
      const value = JSON.parse(await file.text());
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(
          "Choose a geometry object with inbound or outbound coordinates.",
        );
      const dirs = Object.keys(value);
      if (
        !dirs.length ||
        dirs.length > 2 ||
        !dirs.every(
          (d) =>
            ["inbound", "outbound"].includes(d) &&
            Array.isArray(value[d]) &&
            value[d].length >= 2 &&
            value[d].length <= 10000 &&
            value[d].every(
              (p: unknown) =>
                Array.isArray(p) &&
                p.length === 2 &&
                Number.isFinite(p[0]) &&
                Number.isFinite(p[1]) &&
                p[0] >= 7 &&
                p[0] <= 10 &&
                p[1] >= 123 &&
                p[1] <= 126,
            ),
        )
      )
        throw new Error(
          "Expected inbound/outbound arrays of [latitude, longitude] coordinates within the CDO region.",
        );
      patchRoute({ geometry: value, directions: dirs });
      setMessage("Geometry loaded into draft. Save changes to apply.");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importConfig(file: File) {
    try {
      if (file.size > 6000000) throw new Error("Backup exceeds 6 MB limit.");
      const v = JSON.parse(await file.text());
      if (
        !v ||
        !Array.isArray(v.routes) ||
        !v.settings ||
        v.routes.length > 250
      )
        throw new Error("Choose a SakayGo configuration backup.");
      if (
        !["headline", "description", "announcement"].every(
          (k) => typeof v.settings[k] === "string",
        ) ||
        typeof v.settings.maintenance !== "boolean" ||
        !v.routes.every(
          (r: CatalogRoute) =>
            r &&
            [
              "id",
              "name",
              "from",
              "to",
              "source",
              "sourceUpdated",
              "status",
              "reviewNotes",
              "reviewedAt",
            ].every(
              (k) =>
                typeof (r as unknown as Record<string, unknown>)[k] ===
                "string",
            ) &&
            typeof r.visible === "boolean" &&
            Array.isArray(r.roads) &&
            r.roads.every((x) => typeof x === "string") &&
            Array.isArray(r.directions) &&
            r.directions.every((x) => typeof x === "string"),
        )
      )
        throw new Error(
          "Backup contains malformed settings or route fields. No changes were imported.",
        );
      setState({
        ...v,
        revision: state?.revision || 0,
        updatedAt: state?.updatedAt || "",
      });
      setSelected(v.routes[0]?.id || "");
      setDirty(true);
      setMessage(
        `Loaded ${v.routes.length} records into draft. Review and save to apply. Server validation runs before saving.`,
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function exportConfig() {
    if (!state) return;
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(state, null, 2)], {
          type: "application/json",
        }),
      );
    a.href = url;
    a.download = "sakaygo-admin-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (denied && accessKey)
    return (
      <div className="content-page admin-denied">
        <h1>Administrator sign in</h1>
        <p>{error}</p>
        <AdminAccess
          onSuccess={() => {
            setDenied(false);
            void load();
          }}
        />
      </div>
    );
  if (denied)
    return (
      <div className="content-page admin-denied">
        <ShieldCheck size={40} />
        <h1>Owner access only.</h1>
        <p>
          Sign in with the account that owns this SakayGo site to manage routes
          and website settings.
        </p>
        <a
          className="primary"
          href="/signin-with-chatgpt?return_to=%2Fadmin"
          target="_top"
        >
          Sign in with ChatGPT
        </a>
        <Link to="/">Back to SakayGo</Link>
      </div>
    );
  if (loading)
    return (
      <div className="content-page" role="status">
        Loading admin workspace…
      </div>
    );
  if (!state)
    return (
      <div className="content-page">
        <h1>Admin unavailable</h1>
        <p>{error}</p>
        <button className="primary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  const visible = state.routes.filter((r) => r.visible).length;
  const filtered = state.routes.filter(
    (r) =>
      `${r.id} ${r.name}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "visible" && r.visible) ||
        (filter === "archived" && !r.visible) ||
        filter === r.status),
  );
  return (
    <motion.div
      className="admin-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Link className="verification-link" to="/admin/verification">
        Manage reviewed code crosswalks & fare policies →
      </Link>
      <fieldset className="admin-fields" disabled={saving}>
        <AdminSignOut />
        <div className="admin-top">
          <div>
            <div className="eyebrow">
              <ShieldCheck size={14} /> OWNER WORKSPACE
            </div>
            <h1>Keep SakayGo moving.</h1>
            <p>Manage the directory. Keep the community informed.</p>
          </div>
          <Link to="/" className="secondary">
            <ArrowLeft size={15} />
            View website
          </Link>
        </div>
        <div className="admin-stats">
          <div>
            <RouteIcon />
            <strong>{state.routes.length}</strong>
            <span>Route records</span>
          </div>
          <div>
            <CheckCircle2 />
            <strong>{visible}</strong>
            <span>Visible routes</span>
          </div>
          <div>
            <Archive />
            <strong>{state.routes.length - visible}</strong>
            <span>Archived routes</span>
          </div>
          <div>
            <LayoutDashboard />
            <strong>{state.revision}</strong>
            <span>Saved revision</span>
          </div>
        </div>
        <div className="admin-toolbar">
          <div className="admin-tabs">
            <button
              className={tab === "routes" ? "active" : ""}
              onClick={() => setTab("routes")}
            >
              <RouteIcon size={16} />
              Routes
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              <Settings2 size={16} />
              Website settings
            </button>
          </div>
          <div className="admin-backups">
            <button onClick={exportConfig}>
              <Download size={15} />
              Export backup
            </button>
            <button onClick={() => configInput.current?.click()}>
              <FileUp size={15} />
              Restore draft
            </button>
            <input
              hidden
              ref={configInput}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                if (e.target.files?.[0]) void importConfig(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              role="alert"
              className="notice admin-error"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
              <button onClick={() => void load()}>
                Reload latest (discards draft)
              </button>
            </motion.div>
          )}
          {message && (
            <motion.div
              role="status"
              className="admin-success"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <CheckCircle2 size={17} />
              {message}
            </motion.div>
          )}
        </AnimatePresence>
        {tab === "routes" ? (
          <div className="admin-workspace">
            <section className="admin-list">
              <div className="admin-list-search">
                <Search size={17} />
                <input
                  aria-label="Search admin routes"
                  placeholder="Search routes…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="admin-list-actions">
                <select
                  aria-label="Filter route status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All records</option>
                  <option value="visible">Visible</option>
                  <option value="archived">Archived</option>
                  <option value="under_review">Under review</option>
                  <option value="approved">Verified by owner</option>
                  <option value="unverified">Unverified</option>
                </select>
                <button
                  onClick={() => {
                    if (state.routes.length >= 250) {
                      setError("The catalog supports up to 250 routes.");
                      return;
                    }
                    setMessage("");
                    const r = emptyRoute();
                    setState((s) =>
                      s ? { ...s, routes: [r, ...s.routes] } : s,
                    );
                    setSelected(r.id);
                    setDirty(true);
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  <Plus size={16} />
                  Add route
                </button>
              </div>
              <div className="admin-route-list">
                {filtered.map((r) => (
                  <button
                    className={r.id === selected ? "selected" : ""}
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                  >
                    <span>{r.id}</span>
                    <div>
                      <strong>{r.name}</strong>
                      <small>
                        {r.visible ? "Visible" : "Archived"} ·{" "}
                        {r.status === "approved"
                          ? "Verified by owner"
                          : r.status === "under_review"
                            ? "Under review"
                            : "Unverified"}
                      </small>
                    </div>
                  </button>
                ))}
                {!filtered.length && <p>No matching records.</p>}
              </div>
            </section>
            <section className="admin-editor" aria-label="Route editor">
              {route ? (
                <>
                  <div className="admin-editor-heading">
                    <div>
                      <small>EDIT ROUTE {route.id}</small>
                      <h2>{route.name}</h2>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => patchRoute({ visible: !route.visible })}
                    >
                      <Archive size={15} />
                      {route.visible ? "Archive route" : "Make visible"}
                    </button>
                  </div>
                  {!snapshot.current?.routes.some(
                    (saved) => saved.id === route.id,
                  ) && (
                    <button
                      className="secondary"
                      onClick={() => {
                        const remaining = state.routes.filter(
                          (r) => r.id !== route.id,
                        );
                        setState({ ...state, routes: remaining });
                        setSelected(remaining[0]?.id || "");
                        setDirty(true);
                        setError("");
                      }}
                    >
                      Remove new route
                    </button>
                  )}
                  <p>
                    Route name, from area, to area, source reference and
                    geometry are required. New routes start archived; choose
                    Make visible to publish.
                  </p>
                  <div className="form-grid">
                    <label className="wide">
                      Route name
                      <input
                        maxLength={300}
                        value={route.name}
                        onChange={(e) => patchRoute({ name: e.target.value })}
                      />
                    </label>
                    <label>
                      From area
                      <input
                        maxLength={300}
                        value={route.from}
                        onChange={(e) => patchRoute({ from: e.target.value })}
                      />
                    </label>
                    <label>
                      To area
                      <input
                        maxLength={300}
                        value={route.to}
                        onChange={(e) => patchRoute({ to: e.target.value })}
                      />
                    </label>
                    <label>
                      Review status
                      <select
                        value={route.status}
                        onChange={(e) =>
                          patchRoute({
                            status: e.target.value as CatalogRoute["status"],
                          })
                        }
                      >
                        <option value="unverified">Unverified</option>
                        <option value="under_review">Under review</option>
                        <option value="approved">Verified by owner</option>
                      </select>
                    </label>
                    <label>
                      Review date
                      <input
                        type="date"
                        value={route.reviewedAt}
                        onChange={(e) =>
                          patchRoute({ reviewedAt: e.target.value })
                        }
                      />
                    </label>
                    <label className="wide">
                      Source reference
                      <input
                        maxLength={300}
                        value={route.source}
                        onChange={(e) => patchRoute({ source: e.target.value })}
                      />
                    </label>
                    <label className="wide">
                      Source updated
                      <input
                        maxLength={80}
                        value={route.sourceUpdated}
                        onChange={(e) =>
                          patchRoute({ sourceUpdated: e.target.value })
                        }
                      />
                    </label>
                    <label className="wide">
                      Internal review notes
                      <textarea
                        rows={4}
                        maxLength={1500}
                        value={route.reviewNotes}
                        onChange={(e) =>
                          patchRoute({ reviewNotes: e.target.value })
                        }
                      />
                      <small>Only visible in the owner workspace.</small>
                    </label>
                    <label className="wide">
                      Road names (one per line)
                      <textarea
                        rows={3}
                        value={route.roads.join("\n")}
                        onChange={(e) =>
                          patchRoute({
                            roads: e.target.value.split("\n"),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="admin-geometry">
                    <div>
                      <h3>Directional geometry</h3>
                      <p>
                        {route.geometry
                          ? "Custom geometry in this draft"
                          : snapshot.current?.routes.some(
                                (saved) => saved.id === route.id,
                              )
                            ? "Original source geometry preserved"
                            : "Geometry required before saving"}{" "}
                        · {route.directions.join(" / ")}
                      </p>
                      <small>
                        Upload JSON with inbound/outbound arrays in [latitude,
                        longitude] order. New records require geometry.
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => geometryInput.current?.click()}
                    >
                      <FileUp size={16} />
                      Upload geometry
                    </button>
                    <input
                      hidden
                      type="file"
                      accept="application/json,.json"
                      ref={geometryInput}
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void importGeometry(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <p className="admin-safety-note">
                    Reviewing an alignment does not verify boarding stops or
                    fares. These records remain excluded from verified commuting
                    recommendations.
                  </p>
                </>
              ) : (
                <div className="empty">Select a route to edit.</div>
              )}
            </section>
          </div>
        ) : (
          <section className="admin-settings">
            <h2>Website content</h2>
            <p>These settings apply to the route explorer after saving.</p>
            <div className="form-grid">
              <label className="wide">
                Planner headline
                <input
                  maxLength={80}
                  value={state.settings.headline}
                  onChange={(e) => {
                    setState({
                      ...state,
                      settings: { ...state.settings, headline: e.target.value },
                    });
                    setDirty(true);
                  }}
                />
              </label>
              <label className="wide">
                Planner introduction
                <textarea
                  rows={3}
                  maxLength={240}
                  value={state.settings.description}
                  onChange={(e) => {
                    setState({
                      ...state,
                      settings: {
                        ...state.settings,
                        description: e.target.value,
                      },
                    });
                    setDirty(true);
                  }}
                />
              </label>
              <label className="wide">
                Public announcement
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder="Leave blank to hide the announcement"
                  value={state.settings.announcement}
                  onChange={(e) => {
                    setState({
                      ...state,
                      settings: {
                        ...state.settings,
                        announcement: e.target.value,
                      },
                    });
                    setDirty(true);
                  }}
                />
              </label>
              <label className="checkbox-label wide">
                <input
                  type="checkbox"
                  checked={state.settings.maintenance}
                  onChange={(e) => {
                    setState({
                      ...state,
                      settings: {
                        ...state.settings,
                        maintenance: e.target.checked,
                      },
                    });
                    setDirty(true);
                  }}
                />
                Temporarily pause the route directory
              </label>
            </div>
            <p className="admin-safety-note">
              Pausing hides the directory and geometry from visitors. Your owner
              workspace stays available.
            </p>
          </section>
        )}
        <div className="admin-savebar">
          <span>
            {dirty
              ? "You have unsaved changes"
              : `All changes saved · revision ${state.revision}`}
          </span>
          <button disabled={!dirty || saving} onClick={discard}>
            <RotateCcw size={15} />
            Discard draft
          </button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            className="primary"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            <Save size={17} />
            {saving ? "Saving…" : "Save changes"}
          </motion.button>
        </div>
      </fieldset>
    </motion.div>
  );
}
