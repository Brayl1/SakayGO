import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownUp,
  ArrowRight,
  BusFront,
  ChevronDown,
  Compass,
  MapPin,
  Search,
  ShieldAlert,
  Ticket,
  X,
} from "lucide-react";
import type { CatalogRoute } from "../shared/catalog";
import type { Point } from "../shared/model";
import { useCatalog } from "./CatalogContext";
import { distance } from "../shared/engine";
const CatalogMap = lazy(() => import("./CatalogMap"));
const EMPTY: Point[] = [];
export function useRouteShape(id: string | undefined) {
  const [route, setRoute] = useState<CatalogRoute>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const { data } = useCatalog();
  useEffect(() => {
    setRoute(undefined);
    setError("");
    if (!id) {
      setLoading(false);
      return;
    }
    const control = new AbortController();
    setLoading(true);
    fetch("/api/catalog/" + encodeURIComponent(id), { signal: control.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((r) => {
        setRoute(r);
        setLoading(false);
      })
      .catch(() => {
        if (!control.signal.aborted) {
          setError(
            "This alignment could not load. Select another route or reload.",
          );
          setLoading(false);
        }
      });
    return () => control.abort();
  }, [id, data.revision]);
  return { route, loading, error };
}
export default function CatalogPlanner() {
  const { data, loading, error, reload } = useCatalog();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [search, setSearch] = useState({ from: "", to: "" }),
    [selected, setSelected] = useState<string>(),
    [direction, setDirection] = useState("inbound"),
    [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(12);
  useEffect(() => setLimit(12), [search]);
  const areas = useMemo(
    () => [...new Set(data.routes.flatMap((r) => [r.from, r.to]))].sort(),
    [data.routes],
  );
  const routes = data.routes.filter((r) => {
    const terms =
      `${r.name} ${r.from} ${r.to} ${r.roads.join(" ")} ${Object.values(
        r.verifiedCodes || {},
      )
        .flat()
        .join(" ")}`.toLowerCase();
    return (
      (!search.from || terms.includes(search.from.toLowerCase())) &&
      (!search.to || terms.includes(search.to.toLowerCase()))
    );
  });
  const currentId = routes.some((r) => r.id === selected)
    ? selected
    : routes[0]?.id;
  const shape = useRouteShape(currentId);
  useEffect(() => {
    if (shape.route && !shape.route.directions.includes(direction))
      setDirection(shape.route.directions[0] || "inbound");
  }, [shape.route, direction]);
  const points = shape.route?.geometry?.[direction] || EMPTY;
  const other =
    shape.route?.geometry?.[direction === "inbound" ? "outbound" : "inbound"] ||
    EMPTY;
  return (
    <div className={`catalog-workspace ${expanded ? "mobile-expanded" : ""}`}>
      <motion.aside
        className="catalog-panel"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          className="catalog-sheet-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span />
          {expanded ? "Show more map" : "Expand route panel"}
          <ChevronDown size={15} />
        </button>
        <div className="eyebrow">
          <Compass size={14} /> AROUND CAGAYAN DE ORO
        </div>
        <h1>{data.settings.headline}</h1>
        <p className="catalog-intro">{data.settings.description}</p>
        <form
          className="catalog-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch({ from: from.trim(), to: to.trim() });
            setSelected(undefined);
          }}
        >
          <div className="catalog-location">
            <MapPin size={17} />
            <label>
              From area
              <input
                list="cdo-areas"
                placeholder="e.g. Balulang"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            {from && (
              <button
                type="button"
                aria-label="Clear origin area"
                onClick={() => setFrom("")}
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="catalog-location">
            <MapPin size={17} />
            <label>
              To area
              <input
                list="cdo-areas"
                placeholder="e.g. Cogon Public Market"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            {to && (
              <button
                type="button"
                aria-label="Clear destination area"
                onClick={() => setTo("")}
              >
                <X size={15} />
              </button>
            )}
            <button
              className="area-swap"
              type="button"
              aria-label="Swap areas"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              <ArrowDownUp size={16} />
            </button>
          </div>
          <datalist id="cdo-areas">
            {areas.map((a) => (
              <option value={a} key={a} />
            ))}
          </datalist>
          <motion.button
            className="primary"
            whileTap={{ scale: 0.98 }}
            type="submit"
          >
            <Search size={17} />
            Find matching routes
            <ArrowRight size={17} />
          </motion.button>
        </form>
        <p className="search-explainer">
          Matches route names and areas. Boarding, transfers and travel
          direction still need confirmation.
        </p>
        <div className="section-heading">
          <h2>
            {search.from || search.to
              ? "Matching routes"
              : "Explore the route network"}
          </h2>
          <span>{routes.length} routes</span>
        </div>
        {(search.from || search.to) && (
          <button
            className="text-button"
            onClick={() => {
              setFrom("");
              setTo("");
              setSearch({ from: "", to: "" });
            }}
          >
            Clear search
          </button>
        )}
        {error && (
          <div className="notice" role="alert">
            {error}
            <button onClick={() => void reload()}>Retry</button>
          </div>
        )}
        {loading ? (
          <div className="loading" aria-label="Loading routes">
            <div />
            <div />
          </div>
        ) : !routes.length ? (
          <div className="empty">
            <Compass size={30} />
            <h3>
              {data.settings.maintenance
                ? "Route directory temporarily paused"
                : "No matching route names"}
            </h3>
            <p>
              {data.settings.maintenance
                ? "The administrator is updating the directory. Please check back soon."
                : "Try one area at a time or browse all routes. No commuting route has been confirmed."}
            </p>
          </div>
        ) : (
          <div className="catalog-cards">
            <AnimatePresence initial={false}>
              {routes.slice(0, limit).map((r, i) => (
                <motion.button
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i, 5) * 0.025 }}
                  className={`catalog-route-card ${r.id === currentId ? "is-selected" : ""}`}
                  key={r.id}
                  onClick={() => {
                    setSelected(r.id);
                    setDirection("inbound");
                  }}
                >
                  <span className="catalog-route-id">
                    <BusFront size={17} />
                    <b>{r.id}</b>
                  </span>
                  <span className="catalog-route-title">
                    <strong>{r.name}</strong>
                    <small>
                      {r.directions.length} directions ·{" "}
                      {r.status === "approved" ? "Verified by owner" : r.status === "under_review"
                        ? "Under review"
                        : "Unverified"}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </motion.button>
              ))}
            </AnimatePresence>
            {routes.length > limit && (
              <button
                className="secondary"
                onClick={() => setLimit((n) => n + 12)}
              >
                Show more routes ({routes.length - limit} remaining)
              </button>
            )}
          </div>
        )}
        <div className="catalog-source">
          <ShieldAlert size={18} />
          <p>
            Imported SakayCDO dataset · 76 original records.
            <br />
            Shape points are not designated boarding stops.
          </p>
        </div>
        <footer>
          <Link to="/about">Data & sources</Link>
          <Link to="/planner">Plan your trip</Link>
        </footer>
      </motion.aside>
      <section className="catalog-map-panel" aria-label="Route alignment map">
        <Suspense fallback={<div className="map-fallback">Loading map…</div>}>
          <CatalogMap
            points={points}
            alternate={other}
            direction={direction}
            name={shape.route?.name || ""}
          />
        </Suspense>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentId || "empty"}
            className="selected-route-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {shape.loading ? (
              <p>Loading selected alignment…</p>
            ) : shape.error ? (
              <p role="alert">{shape.error}</p>
            ) : shape.route ? (
              <>
                <div className="selected-heading">
                  <span className="selected-bus">
                    <BusFront size={24} />
                  </span>
                  <div>
                    <small>ROUTE {shape.route.id} · UNVERIFIED</small>
                    <h2>{shape.route.name}</h2>
                  </div>
                </div>
                <div
                  className="direction-tabs"
                  aria-label="Recorded alignment direction"
                >
                  {shape.route.directions.map((d) => (
                    <button
                      key={d}
                      aria-pressed={direction === d}
                      onClick={() => setDirection(d)}
                    >
                      {d === "inbound" ? "Inbound" : "Outbound"}
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
                <div className="selected-facts">
                  <span>
                    <Ticket size={16} />
                    Fare unavailable
                  </span>
                  <Link to={`/routes/${shape.route.id}`}>
                    Route details
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </>
            ) : (
              <p>Select a route to explore its recorded alignment.</p>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
export function CatalogDirectory() {
  const { data, loading, error, reload } = useCatalog();
  const [query, setQuery] = useState(""),
    [area, setArea] = useState("");
  const [limit, setLimit] = useState(12);
  useEffect(() => setLimit(12), [query, area]);
  const areas = [...new Set(data.routes.map((r) => r.from))].sort();
  const routes = data.routes.filter(
    (r) =>
      (!area || r.from === area) &&
      `${r.id} ${r.name} ${r.from} ${r.to} ${r.roads.join(" ")} ${Object.values(
        r.verifiedCodes || {},
      )
        .flat()
        .join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <motion.div
      className="content-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="eyebrow">YOUR LOCAL ROUTE LIBRARY</div>
      <h1>Find a familiar way.</h1>
      <p>
        {data.routes.length} imported route records. Explore each alignment in
        both recorded directions.
      </p>
      <div className="directory-search">
        <label>
          <Search size={18} />
          <input
            aria-label="Search imported routes"
            placeholder="Route name, number or destination"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter origin area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="">All origin areas</option>
          {areas.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      {error && (
        <div className="notice">
          {error}
          <button onClick={() => void reload()}>Retry</button>
        </div>
      )}
      {loading ? (
        <p role="status">Loading routes…</p>
      ) : (
        <>
          <p className="directory-count">
            {routes.length} routes found · No verified fare data supplied
          </p>
          <div className="directory-grid">
            {routes.slice(0, limit).map((r) => (
              <motion.div
                key={r.id}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.16 }}
              >
                <Link
                  className="directory-card imported-card"
                  to={`/routes/${r.id}`}
                >
                  <span className="directory-card-header">
                  <span className="route-badge">
                    <BusFront size={20} /> ROUTE {r.id}
                  </span>
                  <span className="demo-pill">
                    {r.status === "approved" ? "Verified by owner" : r.status === "under_review"
                      ? "Under review"
                      : "Unverified"}
                  </span>
                  </span>
                  <h2>{r.name}</h2>
                  <p>
                    {r.from}
                    <ArrowRight size={14} />
                    {r.to}
                  </p>
                  <div>
                    {r.directions.length} recorded alignments
                    <ArrowRight size={18} />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
          {routes.length > limit && (
            <button
              className="secondary directory-more"
              onClick={() => setLimit((n) => n + 12)}
            >
              Show more routes ({routes.length - limit} remaining)
            </button>
          )}
          {!routes.length && (
            <div className="empty">
              <h2>No routes to display</h2>
              <p>
                {data.settings.maintenance
                  ? "The directory is temporarily paused."
                  : "Try a different name or area."}
              </p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
export function CatalogDetail() {
  const { id } = useParams();
  const { route, loading, error } = useRouteShape(id);
  const [direction, setDirection] = useState("inbound");
  useEffect(() => {
    if (route && !route.directions.includes(direction))
      setDirection(route.directions[0] || "inbound");
  }, [route, direction]);
  const points = route?.geometry?.[direction] || EMPTY;
  const other =
    route?.geometry?.[direction === "inbound" ? "outbound" : "inbound"] ||
    EMPTY;
  const km = points.slice(1).reduce((n, p, i) => n + distance(points[i], p), 0);
  return (
    <div className="detail-page catalog-detail">
      <motion.section
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <Link to="/explore">← Explore routes</Link>
        {loading ? (
          <p role="status">Loading route…</p>
        ) : error ? (
          <div className="notice">
            {error}
            <Link to="/explore">Return to directory</Link>
          </div>
        ) : (
          route && (
            <>
              <p className="eyebrow">ROUTE {route.id} · UNVERIFIED</p>
              <h1>{route.name}</h1>
              <div className="direction-tabs">
                {route.directions.map((d) => (
                  <button
                    key={d}
                    aria-pressed={direction === d}
                    onClick={() => setDirection(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="notice">
                This is a recorded route alignment. Operation, direction labels
                and boarding points have not been independently verified.
              </div>
              <h2>Source areas</h2>
              <p>
                {route.from} ↔ {route.to}
              </p>
              <h2>Recorded geometry</h2>
              <p>
                {points.length.toLocaleString()} shape points · {km.toFixed(1)}{" "}
                km along this geometry. This is not a fare distance or a
                travel-time estimate.
              </p>
              <h2>Signboard code</h2>
              <p
                className={
                  route.verifiedCodes?.[direction]?.length
                    ? "verified-code-chip"
                    : "code-status"
                }
              >
                {route.verifiedCodes?.[direction]?.length
                  ? route.verifiedCodes[direction].join(" / ")
                  : "Signboard code not verified"}
              </p>
              <h2>Boarding & fare</h2>
              <p>
                Boarding stops: Information unavailable
                <br />
                Fare: Unavailable
                <br />
                Signboard: Unverified — route name is a source label
              </p>
              {route.roads.length > 0 && (
                <>
                  <h2>Road names in source</h2>
                  <ol>
                    {(route.roadsByDirection?.[direction] || route.roads).map(
                      (road, i) => (
                        <li key={i}>{road}</li>
                      ),
                    )}
                  </ol>
                </>
              )}
              <h2>Data provenance</h2>
              <p>
                Source: {route.source}
                <br />
                Source updated: {route.sourceUpdated || "Unknown"}
                <br />
                Review status:{" "}
                {route.status === "approved" ? "Verified by owner" : route.status === "under_review"
                  ? "Under review"
                  : "Unverified"}
                <br />
                Independent verification: Not completed
                <br />
                Reuse permission: Not independently verified
              </p>
              <Link to="/about">About this dataset</Link>
            </>
          )
        )}
      </motion.section>
      <Suspense fallback={<div className="map-fallback">Loading map…</div>}>
        <CatalogMap
          points={points}
          alternate={other}
          direction={direction}
          name={route?.name || ""}
        />
      </Suspense>
    </div>
  );
}

