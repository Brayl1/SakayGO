import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownUp,
  ArrowRight,
  BusFront,
  Footprints,
  LocateFixed,
  Map as MapIcon,
  Search,
  ShoppingBag,
  Store,
} from "lucide-react";
import type { Point } from "../shared/model";
import type { Place, TripResult } from "../shared/trip-types";
import PlaceInput from "./PlaceInput";
import TripResults from "./TripResults";
import { useCatalog } from "./CatalogContext";
import { requestDeviceLocation } from "./deviceLocation";
const TripMap = lazy(() => import("./TripMap"));
export default function TripPlanner() {
  const { data } = useCatalog();
  const location = useLocation();
  const launchSearch = location.state as { originQuery?: string; destinationQuery?: string } | null;
  const [originSearchQuery] = useState(() => ({ text: launchSearch?.originQuery || "", version: launchSearch?.originQuery ? 1 : 0 }));
  const [origin, setOrigin] = useState<Place | null>(null),
    [destination, setDestination] = useState<Place | null>(null),
    [picking, setPicking] = useState<"origin" | "destination" | null>(null),
    [maxWalk, setMaxWalk] = useState(500),
    [sort, setSort] = useState("walking"),
    [passenger, setPassenger] = useState("regular"),
    [planning, setPlanning] = useState<{
      result?: TripResult;
      selectedId?: string;
    }>({}),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [focus, setFocus] = useState<Point>(),
    [view, setView] = useState<"form" | "results">("form"),
    [replay, setReplay] = useState(0),
    [resetVersion, setResetVersion] = useState(0),
    [locating, setLocating] = useState(false),
    [popularQuery, setPopularQuery] = useState(() => ({ text: launchSearch?.destinationQuery || "", version: launchSearch?.destinationQuery ? 1 : 0 })),
    [fareAvailable, setFareAvailable] = useState(false),
    [fareError, setFareError] = useState("");
  const abort = useRef<AbortController | null>(null),
    generation = useRef(0),
    geoGeneration = useRef(0),
    cancelLocation = useRef<(() => void) | null>(null),
    mapSection = useRef<HTMLElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const result = planning.result;
  const trip =
    view === "results"
      ? result?.trips.find((t) => t.id === planning.selectedId)
      : undefined;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/fare-policies/current", { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => {
        if (!Array.isArray(j.policies)) throw new Error();
        setFareAvailable(j.policies.length > 0);
        setFareError("");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFareAvailable(false);
        setFareError("Fare policies could not load. Reload to retry; fare comparison is unavailable.");
      });
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      geoGeneration.current++;
      cancelLocation.current?.();
      abort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (view === "results") {
      panel.current
        ?.querySelector<HTMLElement>(".result-title")
        ?.focus({ preventScroll: true });
      panel.current?.scrollTo({ top: 0 });
    }
  }, [view]);
  function invalidate() {
    setPopularQuery((q) => ({ text: "", version: q.version + 1 }));
    generation.current++;
    geoGeneration.current++;
    cancelLocation.current?.();
    abort.current?.abort();
    setPlanning({});
    setError("");
    setLoading(false);
    setLocating(false);

    setFocus(undefined);
    setView("form");
  }
  function changeOrigin(p: Place | null) {
    invalidate();
    setOrigin(p);
  }
  function changeDestination(p: Place | null) {
    invalidate();
    setDestination(p);
  }
  function reset() {
    invalidate();
    setOrigin(null);
    setDestination(null);
    setPicking(null);
    setResetVersion((v) => v + 1);
    setPopularQuery((q) => ({ text: "", version: q.version + 1 }));
  }
  function pick(target: "origin" | "destination") {
    cancelLocation.current?.();
    geoGeneration.current++;
    setLocating(false);
    setPicking(target);
    mapSection.current?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
  }
  function locate() {
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable in this browser. Search for your starting place or choose it on the map.",
      );
      return;
    }
    cancelLocation.current?.();
    const seq = ++geoGeneration.current;
    setLocating(true);
    setPicking(null);
    setError("");
    cancelLocation.current = requestDeviceLocation(navigator.geolocation,
      (position) => {
        if (seq !== geoGeneration.current) return;
        const point: Point = [position.coords.latitude, position.coords.longitude];
        setLocating(false);
        if (!validPoint(point)) {
          setError("Your current location is outside the CDO region. Choose a starting point in Cagayan de Oro.");
          return;
        }
        changeOrigin({
          label: "My current location",
          point,
          source: `Device location: reported accuracy within ${Math.ceil(position.coords.accuracy)} m. Check the pin before planning.`,
        });
        setFocus(point);
      },
      (message) => {
        if (seq !== geoGeneration.current) return;
        setLocating(false);
        setError(message);
      },
    );
  }

  async function search() {
    if (loading) return;
    if (
      !origin ||
      !destination ||
      !validPoint(origin.point) ||
      !validPoint(destination.point)
    ) {
      setError(
        "Choose your starting location and destination from search results or the map first.",
      );
      return;
    }
    setLoading(true);
    setError("");
    setPlanning({});
    const seq = ++generation.current;
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/trips/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.current.signal,
        body: JSON.stringify({
          origin: origin.point,
          destination: destination.point,
          preferences: {
            maxWalkMeters: maxWalk,
            sort,

            passenger,
            allowTransfers: true,
          },
        }),
      });
      const value = await res.json();
      if (!res.ok)
        throw new Error(
          value.error || "We could not find your route. Please retry.",
        );
      if (seq !== generation.current) return;
      setPlanning({ result: value, selectedId: value.trips[0]?.id });

      setPicking(null);
      if (value.trips.length) {
        setView("results");
        setReplay((v) => v + 1);
      } else
        setError(
          "No suitable jeepney route was found for these points. Try nearby locations or increase the walking limit in More options. We cannot confirm a transfer from the available data.",
        );
    } catch (e) {
      if (seq === generation.current)
        setError((e as Error).message || "Trip search failed. Please retry.");
    } finally {
      if (seq === generation.current) setLoading(false);
    }
  }
  function select(id: string) {
    if (!result?.trips.some((t) => t.id === id)) return;
    setPlanning((p) => ({ ...p, selectedId: id }));
    setFocus(undefined);
    setReplay((v) => v + 1);
  }
  return (
    <div className="commuter-page">
      <div className="planner-page-heading">
        <div>
          <h1>Asa ta? Let’s find your jeepney.</h1>
          <p>Plan your ride around Cagayan de Oro, one landmark at a time.</p>
        </div>
        <div className="planner-progress">
          <span className={view === "form" ? "active" : ""}>
            01&nbsp; Plan your trip
          </span>
          <i />
          <span className={view === "results" ? "active" : ""}>
            02&nbsp; Choose your ride
          </span>
        </div>
      </div>
      <div
        className={
          "trip-workspace" + (view === "results" ? " has-results" : "")
        }
      >
        <aside className="trip-panel" ref={panel}>
          <AnimatePresence mode="wait" initial={false}>
            {view === "results" && result && trip && origin && destination ? (
              <TripResults
                key="results"
                result={result}
                trip={trip}
                onSelect={select}
                origin={origin}
                destination={destination}
                passenger={passenger}
                onEdit={() => {
                  setView("form");
                  setFocus(undefined);
                }}
                onReset={reset}
                onReplay={() => {
                  setFocus(undefined);
                  setReplay((v) => v + 1);
                }}
                onFocus={setFocus}
              />
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <section className="trip-form">
                  <h2>
                    Where are you headed? <MapIcon size={20} />
                  </h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void search();
                    }}
                    aria-busy={loading}
                  >
                    <PlaceInput
                      key={"origin" + resetVersion}
                      id="trip-origin"
                      label="Origin"
                      value={origin}
                      onChange={changeOrigin}
                      onPick={() => pick("origin")}
                      searchQuery={originSearchQuery}
                    />
                    <div className="location-actions">
                      <button
                        type="button"
                        onClick={locate}
                        disabled={locating || loading}
                      >
                        <LocateFixed size={14} />
                        {locating ? "Locating you…" : "Use my current location"}
                      </button>
                      <button
                        type="button"
                        aria-label="Swap origin and destination"
                        onClick={() => {
                          const p = origin;
                          invalidate();
                          setOrigin(destination);
                          setDestination(p);
                          setResetVersion((v) => v + 1);
                        }}
                      >
                        <ArrowDownUp size={14} /> Swap
                      </button>
                    </div>
                    {locating && <p className="location-accuracy" role="status">Waiting for a precise location, up to 15 seconds...</p>}
                    {!locating && origin?.source.startsWith("Device location:") && <p className="location-accuracy" role="status">{origin.source}</p>}
                    <PlaceInput
                      key={"destination" + resetVersion}
                      id="trip-destination"
                      label="Destination"
                      value={destination}
                      onChange={changeDestination}
                      onPick={() => pick("destination")}
                      searchQuery={popularQuery}
                    />
                    <label className="commuter-label">
                      Passenger type
                      <select
                        value={passenger}
                        onChange={(e) => {
                          invalidate();
                          setPassenger(e.target.value);
                        }}
                      >
                        <option value="regular">Regular passenger</option>
                        <option value="student">Student</option>
                        <option value="senior">Senior citizen</option>
                        <option value="pwd">PWD</option>
                      </select>
                    </label>
                    <fieldset className="travel-preferences">
                      <legend>What matters most?</legend>
                      <div>
                        {[
                          {
                            value: "walking",
                            label: "Less walking",
                            icon: Footprints,
                          },
                          {
                            value: "transfers",
                            label: "Fewer transfers",
                            icon: BusFront,
                          },
                          {
                            value: "distance",
                            label: "Shorter trip",
                            icon: MapIcon,
                          },
                        ].map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            aria-pressed={sort === p.value}
                            onClick={() => {
                              invalidate();
                              setSort(p.value);
                            }}
                          >
                            <p.icon size={14} />
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <details className="more-options">
                      <summary>More options</summary>
                      <div className="options-row">
                        <label>
                          Walking limit per end
                          <select
                            value={maxWalk}
                            onChange={(e) => {
                              invalidate();
                              setMaxWalk(Number(e.target.value));
                            }}
                          >
                            {[100, 250, 500, 750, 1000].map((n) => (
                              <option key={n} value={n}>
                                {n} meters
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <button
                        type="button"
                        disabled={!fareAvailable}
                        aria-pressed={sort === "fare"}
                        onClick={() => {
                          invalidate();
                          setSort("fare");
                        }}
                      >
                        Lowest estimated fare
                      </button>
                      <p>
                        {fareAvailable
                          ? "Fare sorting places unavailable estimates last."
                          : "Fare comparison needs verified applicable rates."}{" "}
                        Fastest-route comparison is unavailable without reliable
                        journey times.
                      </p>
                    </details>
                    {fareError && <div className="planner-error" role="alert">{fareError}</div>}
                    {error && (
                      <div className="planner-error" role="alert">
                        {error}
                      </div>
                    )}
                    <button
                      className="find primary"
                      type="submit"
                      disabled={loading || data.settings.maintenance}
                    >
                      {loading ? (
                        <span className="search-spinner" aria-hidden="true" />
                      ) : (
                        <Search size={18} />
                      )}
                      <span>
                        {loading
                          ? "Finding your best jeepney route…"
                          : "Find My Jeepney"}
                      </span>
                      {!loading && <ArrowRight size={18} />}
                    </button>
                    {loading && (
                      <p className="search-status" role="status">
                        Finding your best jeepney route…
                      </p>
                    )}
                    {data.settings.maintenance && (
                      <p role="alert">
                        Trip planning is temporarily paused for maintenance.
                      </p>
                    )}
                  </form>
                  {result?.reason && !result.trips.length && (
                    <details className="trip-data-notes">
                      <summary>Why no route?</summary>
                      <p>{result.reason}</p>
                    </details>
                  )}
                </section>
                <section className="popular-destinations">
                  <div>
                    <h3>Popular destinations</h3>
                    <small>Search a destination</small>
                  </div>
                  <div>
                    {[
                      { name: "Centrio Mall", icon: ShoppingBag },
                      { name: "Cogon Market", icon: Store },
                      { name: "Agora Bus Terminal", icon: BusFront },
                    ].map((p) => (
                      <button
                        key={p.name}
                        onClick={() => {
                          changeDestination(null);
                          setPopularQuery((q) => ({
                            text: p.name,
                            version: q.version + 1,
                          }));
                        }}
                      >
                        <p.icon size={18} />
                        <span>{p.name}</span>
                        <ArrowRight size={12} />
                      </button>
                    ))}
                  </div>
                  <p>
                    Choose the matching search result to confirm its location.
                  </p>
                </section>
                <details className="planner-data-tools">
                  <summary>Map information</summary>
                  <p>
                    Place search: Photon / OpenStreetMap contributors. Places
                    are not verified stops.
                  </p>
                  <button onClick={reset}>Reset</button>
                  <Link to="/network">Browse route map →</Link>
                </details>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
        <section
          className="trip-map-section"
          aria-label="Interactive trip map"
          ref={mapSection}
        >
          <div className="map-card-heading">
            <MapIcon size={18} />
            <strong>Your trip, on the map</strong>
            <span>Cagayan de Oro</span>
          </div>
          <Suspense fallback={<div className="map-fallback">Loading map…</div>}>
            <TripMap
              origin={origin}
              destination={destination}
              trip={trip}
              picking={picking}
              focus={focus}
              replay={replay}
              onReplay={() => {
                setFocus(undefined);
                setReplay((v) => v + 1);
              }}
              onPoint={(p) => {
                if (!validPoint(p)) {
                  setError("Choose a point within the CDO region.");
                  return;
                }
                const place: Place = {
                  label: p.map((n) => n.toFixed(6)).join(", "),
                  point: p,
                  source: "User-selected map point",
                };
                if (picking === "origin") changeOrigin(place);
                if (picking === "destination") changeDestination(place);
                setPicking(null);
              }}
            />
          </Suspense>
          <div className="map-card-footer">
            <span>
              <BusFront size={22} />
            </span>
            <div>
              <strong>
                {trip
                  ? "Follow your route, one step at a time."
                  : "A familiar landmark makes a good starting point."}
              </strong>
              <p>
                {trip
                  ? "The moving jeepney is a visual preview, not live GPS. Confirm service and safe boarding with the driver."
                  : "Choose your places, then find your jeepney to compare mapped routes and available fare estimates."}
              </p>
            </div>
          </div>
        </section>
      </div>
      <footer className="planner-footnote">
        <span>
          Routes and access points are approximate. Confirm the route and fare
          with your driver.
        </span>
        <b>RIDE WITH CONFIDENCE.</b>
      </footer>
    </div>
  );
}
function validPoint(p: Point) {
  return (
    p.every(Number.isFinite) &&
    p[0] >= 8.1 &&
    p[0] <= 8.8 &&
    p[1] >= 124.2 &&
    p[1] <= 125
  );
}



