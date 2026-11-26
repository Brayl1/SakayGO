import {
  createContext,
  useContext,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowDownUp,
  ArrowRight,
  BusFront,
  ChevronDown,
  ChevronRight,
  Check,
  Compass,
  Flag,
  Footprints,
  Info,
  LocateFixed,
  MapPin,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Ticket,
  X,
} from "lucide-react";
import { demoData } from "../shared/data";
import { plan } from "../shared/engine";
import type {
  Dataset,
  Journey,
  Location,
  Passenger,
  Point,
} from "../shared/model";
const Map = lazy(() => import("./Map"));
const Guide = lazy(() => import("./Guide"));
const DataContext = createContext<Dataset>(demoData);
const money = (n: number | null) =>
  n === null ? "Fare unavailable" : `₱${n.toFixed(2)}`;
function LocationInput({
  label,
  value,
  onChange,
  places,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  places: Location[];
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const matches = places
    .filter((l) => l.name.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);
  const input = useRef<HTMLInputElement>(null);
  const id = label.toLowerCase();
  return (
    <div className="location-field">
      <div className={`field-dot ${id}`} />
      <div className="field-main">
        <label htmlFor={id}>{label}</label>
        <input
          ref={input}
          id={id}
          value={value}
          placeholder={
            label === "From"
              ? "Where are you coming from?"
              : "Where are you going?"
          }
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            open && matches[active] ? `${id}-${active}` : undefined
          }
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, matches.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            }
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && open && matches[active]) {
              e.preventDefault();
              onChange(matches[active].name);
              setOpen(false);
            }
          }}
        />
      </div>
      {value && (
        <button
          type="button"
          className="clear"
          aria-label={`Clear ${id}`}
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X size={15} />
        </button>
      )}
      {open && (
        <ul id={`${id}-list`} role="listbox" className="suggestions">
          {matches.map((l, i) => (
            <li
              id={`${id}-${i}`}
              role="option"
              aria-selected={active === i}
              key={l.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(l.name);
                setOpen(false);
              }}
            >
              <MapPin size={16} />
              <span>
                {l.name}
                <small>{l.category}</small>
              </span>
            </li>
          ))}
          {!matches.length && (
            <li role="presentation">
              No matching landmark. Try a listed CDO location.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
export default function App() {
  const [demo, setDemo] = useState(true);
  const [data, setData] = useState<Dataset>(demoData);
  const [dataError, setDataError] = useState("");
  useEffect(() => {
    if (
      (import.meta as unknown as { env: Record<string, string> }).env
        .VITE_DATA_MODE !== "api"
    )
      return;
    const control = new AbortController();
    setDataError("Loading route data…");
    setData({ locations: demoData.locations, routes: [], policies: [] });
    fetch("/api/dataset?demo=" + demo, { signal: control.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
        setDataError("");
      })
      .catch(() => {
        if (!control.signal.aborted)
          setDataError(
            "Route data could not load. Check the API connection and reload.",
          );
      });
    return () => control.abort();
  }, [demo]);
  return (
    <>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <header>
        <Link className="brand" to="/">
          <span className="brand-icon">
            <BusFront size={24} />
          </span>
          Sakay<span>Go</span>
          <small>KNOW YOUR ROUTE. KNOW YOUR FARE.</small>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Route Planner
          </NavLink>
          <NavLink to="/explore">Explore Routes</NavLink>
          <NavLink to="/fares">Fare Guide</NavLink>
          <NavLink to="/how-it-works">How It Works</NavLink>
        </nav>
        <span className="city">
          <MapPin size={16} /> Cagayan de Oro
        </span>
      </header>
      <div className="demo-banner">
        <Info size={15} />
        <span>
          <strong>{demo ? "Demo mode" : "Verified data mode"}</strong> ·{" "}
          {demo
            ? "Synthetic routes and fares. For exploration only, not actual commuting."
            : data.routes.some((r) => r.status === "verified")
              ? "Showing sourced, direction-specific services."
              : "No verified dataset installed. Recommendations will appear after verification."}
        </span>
        <button onClick={() => setDemo((d) => !d)}>
          {demo ? "Use verified mode" : "Try demo mode"}
          <ArrowRight size={14} />
        </button>
      </div>
      <DataContext.Provider value={data}>
        <main id="main">
          {dataError && (
            <div className="notice" role="status">
              {dataError}
            </div>
          )}
          <Routes>
            <Route path="/" element={<Planner demo={demo} />} />
            <Route path="/results" element={<Planner demo={demo} />} />
            <Route path="/explore" element={<Directory demo={demo} />} />
            <Route path="/routes/:id" element={<RouteDetail demo={demo} />} />
            <Route
              path="/fares"
              element={
                <Suspense fallback={<p>Loading fare guide…</p>}>
                  <Guide page="fares" />
                </Suspense>
              }
            />
            <Route
              path="/how-it-works"
              element={
                <Suspense fallback={<p>Loading guide…</p>}>
                  <Guide page="how" />
                </Suspense>
              }
            />
            <Route
              path="/about"
              element={
                <Suspense fallback={<p>Loading about…</p>}>
                  <Guide page="about" />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                <div className="content-page">
                  <h1>This route leads nowhere.</h1>
                  <p>We couldn’t find that page.</p>
                  <Link className="primary" to="/">
                    Back to route planner
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>
      </DataContext.Provider>
    </>
  );
}
export function Planner({ demo }: { demo: boolean }) {
  const data = useContext(DataContext);
  const navigate = useNavigate();
  const [from, setFrom] = useState("USTP CDO Campus"),
    [to, setTo] = useState("Divisoria"),
    [passenger, setPassenger] = useState<Passenger>("regular"),
    [preference, setPreference] = useState("recommended"),
    [journeys, setJourneys] = useState<Journey[]>([]),
    [selected, setSelected] = useState(0),
    [searched, setSearched] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [focus, setFocus] = useState<Point>(),
    [user, setUser] = useState<Point>(),
    [collapsed, setCollapsed] = useState(false),
    [sheet, setSheet] = useState(1),
    [step, setStep] = useState(-1),
    [recent, setRecent] = useState<string[]>(() => {
      try {
        return (() => {
          const parsed = JSON.parse(
            localStorage.getItem("sakaygo-recent") || "[]",
          );
          return Array.isArray(parsed)
            ? parsed
                .filter((v) => typeof v === "string" && v.includes(" → "))
                .slice(0, 3)
            : [];
        })();
      } catch {
        return [];
      }
    });
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current++;
    controller.current?.abort();
    setJourneys([]);
    setSearched(false);
    setLoading(false);
    setError("");
  }, [demo, data]);
  useEffect(
    () => () => {
      request.current++;
      controller.current?.abort();
    },
    [],
  );
  function invalidate() {
    request.current++;
    controller.current?.abort();
    setLoading(false);
    setJourneys([]);
    setSearched(false);
    setError("");
    setStep(-1);
  }
  async function search() {
    const origin = data.locations.find(
        (l) => l.name.toLowerCase() === from.trim().toLowerCase(),
      ),
      destination = data.locations.find(
        (l) => l.name.toLowerCase() === to.trim().toLowerCase(),
      );
    if (!origin || !destination) {
      setError("Choose both locations from the landmark suggestions.");
      return;
    }
    if (origin.id === destination.id) {
      setError("You’re already there. Choose a different destination.");
      return;
    }
    const token = ++request.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError("");
    setSearched(true);
    setJourneys([]);
    setStep(-1);
    try {
      let result: Journey[];
      if (
        (import.meta as unknown as { env: Record<string, string> }).env
          .VITE_DATA_MODE === "api"
      ) {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.current.signal,
          body: JSON.stringify({
            from: origin.id,
            to: destination.id,
            passenger,
            demo,
            maxTransfers: 1,
          }),
        });
        if (!response.ok) throw new Error();
        result = (await response.json()).journeys;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 300));
        result = plan(data, origin.id, destination.id, passenger, demo);
      }
      if (token !== request.current) return;
      setJourneys(result);
      setSelected(0);
      setSheet(1);
      navigate("/demo");
      const next = [
        `${origin.name} → ${destination.name}`,
        ...recent.filter((v) => v !== `${origin.name} → ${destination.name}`),
      ].slice(0, 3);
      setRecent(next);
      try {
        localStorage.setItem("sakaygo-recent", JSON.stringify(next));
      } catch {}
    } catch (e) {
      if (token === request.current)
        setError(
          "We couldn’t load routes. Check your connection and try again.",
        );
    } finally {
      if (token === request.current) setLoading(false);
    }
  }
  function locate() {
    setError("Your location is used on this map only and is not saved.");
    if (!navigator.geolocation) {
      setError("Location access is unavailable. Choose a landmark manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const point: Point = [p.coords.latitude, p.coords.longitude];
        setUser(point);
        setFocus(point);
        setError(
          "Location shown on the map. Select a known boarding landmark manually; proximity does not confirm jeepney service.",
        );
      },
      () =>
        setError(
          "Location access failed or was declined. You can still choose a landmark manually.",
        ),
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  const sorted = [...journeys].sort((a, b) =>
    preference === "fare"
      ? (a.fare ?? Infinity) - (b.fare ?? Infinity)
      : a.transfers - b.transfers,
  );
  const journey = sorted[selected];
  return (
    <div
      className={`workspace ${collapsed ? "panel-collapsed" : ""} sheet-${sheet}`}
    >
      <aside className="planner-panel">
        <button
          className="sheet-handle"
          aria-label="Change route panel height"
          onClick={() => setSheet((s) => (s + 1) % 3)}
        >
          <span />
        </button>
        <div className="panel-intro">
          <div className="eyebrow">
            <Navigation size={14} /> YOUR CITY. YOUR WAY.
          </div>
          <h1>Where to today?</h1>
          <p>
            Hindi sure kung anong jeep ang sasakyan?
            <br />
            Let’s find your way around CDO.
          </p>
        </div>
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div className="location-pair">
            <LocationInput
              label="From"
              value={from}
              onChange={(v) => {
                setFrom(v);
                invalidate();
              }}
              places={data.locations}
            />
            <LocationInput
              label="To"
              value={to}
              onChange={(v) => {
                setTo(v);
                invalidate();
              }}
              places={data.locations}
            />
            <button
              className="swap"
              type="button"
              aria-label="Swap origin and destination"
              onClick={() => {
                setFrom(to);
                setTo(from);
                invalidate();
              }}
            >
              <ArrowDownUp size={17} />
            </button>
          </div>
          <button type="button" className="location-action" onClick={locate}>
            <LocateFixed size={15} /> Use my location
          </button>
          <div className="options-row">
            <label>
              Passenger
              <select
                value={passenger}
                onChange={(e) => {
                  setPassenger(e.target.value as Passenger);
                  invalidate();
                }}
              >
                <option value="regular">Regular passenger</option>
                <option value="student">Student</option>
                <option value="senior">Senior citizen</option>
                <option value="pwd">Person with disability</option>
              </select>
            </label>
            <label>
              Prefer
              <select
                value={preference}
                onChange={(e) => {
                  setPreference(e.target.value);
                  setSelected(0);
                }}
              >
                <option value="recommended">Recommended</option>
                <option value="fare">Lowest fare</option>
                <option value="transfers">Fewest transfers</option>
              </select>
            </label>
          </div>
          <button className="primary find" type="submit" disabled={loading}>
            <Search size={18} />
            {loading ? "Finding routes…" : "Find my jeepney"}
            <ArrowRight size={18} />
          </button>
        </form>
        {error && (
          <div className="notice" role="status">
            {error}
          </div>
        )}
        {loading ? (
          <div className="loading" aria-live="polite">
            <div />
            <div />
            <button onClick={() => invalidate()}>Cancel search</button>
          </div>
        ) : searched ? (
          <section className="results">
            <div className="section-heading">
              <h2>
                {journeys.length ? "Your route options" : "No confirmed route"}
              </h2>
              <span>{journeys.length} available</span>
            </div>
            {!journeys.length ? (
              <div className="empty">
                <Compass size={32} />
                <h3>We haven’t mapped this journey yet.</h3>
                <p>
                  No matching jeepney route was found in the available{" "}
                  {demo ? "demo" : "verified"} data. Try another landmark
                  {demo
                    ? " or reverse your journey."
                    : ", or explore demo mode."}
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    invalidate();
                    navigate("/");
                  }}
                >
                  Adjust search
                </button>
              </div>
            ) : (
              <>
                <div className="tabs">
                  <span>
                    {demo ? "DEMONSTRATION RESULTS" : "VERIFIED ROUTES"}
                  </span>
                  <span>Not live navigation</span>
                </div>
                {sorted.map((j, i) => (
                  <button
                    className={`route-card ${i === selected ? "selected" : ""}`}
                    key={j.id}
                    onClick={() => {
                      setSelected(i);
                      setStep(-1);
                    }}
                  >
                    <div className="card-top">
                      <span className="recommendation">
                        {i === 0
                          ? preference === "fare"
                            ? "Lowest demo fare"
                            : "Recommended"
                          : "Alternative route"}
                      </span>
                      <span className="radio">
                        {i === selected && <Check size={12} />}
                      </span>
                    </div>
                    <div className="route-line">
                      {j.rides.map((r, k) => (
                        <span key={r.route.id}>
                          {k > 0 && <ArrowRight size={14} />}
                          <b>
                            <BusFront size={16} /> {demo ? "DEMO " : ""}
                            {r.route.id}
                          </b>
                        </span>
                      ))}
                      <strong>{money(j.fare)}</strong>
                    </div>
                    <p>{j.rides.map((r) => r.route.name).join(" → ")}</p>
                    <div className="route-meta">
                      <span>
                        {j.transfers === 0
                          ? "Direct ride"
                          : `${j.transfers} transfer`}
                      </span>
                      <span>Walking not verified</span>
                    </div>
                    {i === selected && (
                      <div className="reason">
                        {j.transfers === 0
                          ? "One ride, no changes."
                          : "Connect at a shared demonstration point."}{" "}
                        {demo ? "Synthetic fare." : ""}
                      </div>
                    )}
                  </button>
                ))}
                {journey && (
                  <>
                    <div className="section-heading">
                      <h2>Your journey, step by step</h2>
                      <Footprints size={19} />
                    </div>
                    <div className="timeline">
                      {journey.rides
                        .flatMap((ride, i) => [
                          {
                            title: i
                              ? `Transfer to ${demo ? "DEMO " : ""}${ride.route.id}`
                              : `Board ${demo ? "DEMO " : ""}${ride.route.id}`,
                            detail: `${ride.from.name} · Look for “${ride.route.signboard}”`,
                            point: ride.from.point,
                          },
                          {
                            title: `Get off at ${ride.to.name}`,
                            detail: demo
                              ? "Illustrative stop only. Confirm boarding and pedestrian access before travel."
                              : "Check the stop and confirm safe pedestrian access to your destination.",
                            point: ride.to.point,
                          },
                        ])
                        .map((s, i) => (
                          <button
                            className={step === i ? "active-step" : ""}
                            key={i}
                            onClick={() => {
                              setStep(i);
                              setFocus(s.point);
                            }}
                          >
                            <span className="step-number">{i + 1}</span>
                            <span>
                              <strong>{s.title}</strong>
                              <small>{s.detail}</small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                    </div>
                    <div className="fare-card">
                      <div>
                        <Ticket size={18} />
                        <span>
                          {demo ? "Demo total fare" : "Estimated total fare"}
                        </span>
                        <strong>{money(journey.fare)}</strong>
                      </div>
                      {journey.rides.map((r) => (
                        <p key={r.route.id}>
                          <span>
                            {demo ? "DEMO " : ""}
                            {r.route.id} · {passenger}
                          </span>
                          <b>{money(r.fare)}</b>
                        </p>
                      ))}
                      <small>
                        {demo
                          ? "Synthetic test policy, not official fares."
                          : "Estimated fare based on available fare information. Actual charges may vary."}{" "}
                        Walking directions and travel time unavailable.
                      </small>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="start-state">
            <div className="section-heading">
              <h2>A good place to start</h2>
              <Compass size={18} />
            </div>
            <div className="quick-places">
              {["Centrio Mall", "Cogon Market", "Agora Bus Terminal"].map(
                (p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setTo(p);
                      invalidate();
                    }}
                  >
                    <MapPin size={17} />
                    {p}
                    <ChevronRight size={16} />
                  </button>
                ),
              )}
            </div>
            {recent.length > 0 && (
              <div className="recent">
                <h3>Recent searches</h3>
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      const [a, b] = r.split(" → ");
                      setFrom(a);
                      setTo(b);
                      invalidate();
                    }}
                  >
                    {r}
                  </button>
                ))}
                <button
                  className="text-button"
                  onClick={() => {
                    setRecent([]);
                    try {
                      localStorage.removeItem("sakaygo-recent");
                    } catch {}
                  }}
                >
                  Clear history
                </button>
              </div>
            )}
            <div className="tip-card">
              <span>
                <ShieldCheck size={21} />
              </span>
              <div>
                <h3>Know before you go.</h3>
                <p>
                  Choose your landmarks, compare rides, and see exactly where
                  your journey takes you.
                </p>
                <Link to="/how-it-works">
                  How SakayGo works <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </section>
        )}
        <footer>
          <span>Made for the everyday sakay.</span>
          <Link to="/about">About SakayGo</Link>
        </footer>
      </aside>
      <section className="map-section" aria-label="Journey map">
        <button
          className="collapse"
          aria-label={
            collapsed ? "Expand search panel" : "Collapse search panel"
          }
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <PanelLeftOpen size={19} />
          ) : (
            <PanelLeftClose size={19} />
          )}
        </button>
        <Suspense
          fallback={<div className="map-fallback">Loading your map…</div>}
        >
          <Map
            journey={journey}
            places={data.locations}
            focus={focus}
            user={user}
          />
        </Suspense>
        <div className="map-bottom-card">
          <span className="map-bottom-icon">
            <BusFront size={25} />
          </span>
          <div>
            <strong>
              {journey
                ? `${from} → ${to}`
                : "A little local knowledge. A better commute."}
            </strong>
            <p>
              {journey
                ? "Demo alignment · Select a step to explore the map"
                : "Explore Cagayan de Oro, one jeepney ride at a time."}
            </p>
          </div>
          <span className="demo-pill">{demo ? "DEMO" : "VERIFIED MODE"}</span>
        </div>
      </section>
    </div>
  );
}
function Directory({ demo }: { demo: boolean }) {
  const data = useContext(DataContext);
  const [query, setQuery] = useState(""),
    [area, setArea] = useState("All areas");
  const routes = data.routes.filter(
    (r) =>
      (demo ? r.status === "demo" : r.status === "verified") &&
      `${r.name} ${r.id}`.toLowerCase().includes(query.toLowerCase()) &&
      (area === "All areas" || r.area === area),
  );
  return (
    <div className="content-page">
      <div className="eyebrow">EXPLORE YOUR CITY</div>
      <h1>A route for your next stop.</h1>
      <p>
        Browse direction-specific services and see what’s known before you ride.
      </p>
      <div className="directory-search">
        <label>
          <Search size={18} />
          <input
            aria-label="Search routes"
            placeholder="Search route names or identifiers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter service area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          {["All areas", ...new Set(data.routes.map((r) => r.area))].map(
            (a) => (
              <option key={a}>{a}</option>
            ),
          )}
        </select>
      </div>
      <div className="directory-grid">
        {routes.map((r) => (
          <Link className="directory-card" to={`/routes/${r.id}`} key={r.id}>
            <span className="route-badge">
              <BusFront /> {demo ? "DEMO " : ""}
              {r.id}
            </span>
            <span className="demo-pill">{demo ? "Synthetic" : "Verified"}</span>
            <h2>{r.name}</h2>
            <p>
              {r.stops
                .map((id) => data.locations.find((l) => l.id === id)!.name)
                .join(" → ")}
            </p>
            <div>
              {r.area} · {r.stops.length} illustrative points{" "}
              <ArrowRight size={18} />
            </div>
          </Link>
        ))}
      </div>
      {!routes.length && (
        <div className="empty">
          <Compass />
          <h2>No matching routes</h2>
          <p>
            {demo
              ? "Try a different name or area."
              : "No verified routes have been imported. Demo data is excluded."}
          </p>
        </div>
      )}
    </div>
  );
}
function RouteDetail({ demo }: { demo: boolean }) {
  const data = useContext(DataContext);
  const { id } = useParams();
  const route = data.routes.find(
    (r) => r.id === id && (demo || r.status === "verified"),
  );
  if (!route)
    return (
      <div className="content-page">
        <h1>Route unavailable</h1>
        <Link to="/explore">Back to routes</Link>
      </div>
    );
  const journey = plan(
    data,
    route.stops[0],
    route.stops.at(-1)!,
    "regular",
    demo,
  ).find((j) => j.rides.length === 1 && j.rides[0].route.id === route.id);
  return (
    <div className="detail-page">
      <section>
        <Link to="/explore">← Explore routes</Link>
        <p className="eyebrow">
          {demo ? "DEMO " : ""}
          {route.id} · {demo ? "SYNTHETIC DATA" : "VERIFIED DATA"}
        </p>
        <h1>{route.name}</h1>
        <p>{route.direction}</p>
        {demo && (
          <div className="notice">
            Not a real jeepney service. This alignment demonstrates the
            application.
          </div>
        )}
        <h2>Look for this signboard</h2>
        <div className="signboard">{route.signboard}</div>
        <h2>{demo ? "Illustrative boarding points" : "Boarding points"}</h2>
        <ol>
          {route.stops.map((id) => (
            <li key={id}>{data.locations.find((l) => l.id === id)?.name}</li>
          ))}
        </ol>
        <p>Source: {route.source}</p>
        <p>Last verified: {route.verifiedAt || "Never — demonstration only"}</p>
        <p>Walking access and operating hours: Information unavailable</p>
        <Link to="/fares">View fare policy information</Link>
      </section>
      <Suspense fallback={<p>Loading map…</p>}>
        <Map
          journey={journey}
          places={data.locations.filter((l) => route.stops.includes(l.id))}
        />
      </Suspense>
    </div>
  );
}

