import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BusFront, Coins, Route } from "lucide-react";
import { useCatalog } from "./CatalogContext";

const steps = [
  { title: "Pick your start and stop", text: "Tell us where you are and where you want to go." },
  { title: "See the jeepney to ride", text: "Compare mapped route options across the city." },
  { title: "Know your fare", text: "Review available fare guidance before you ride." },
];

export default function Welcome() {
  const { data } = useCatalog();
  const navigate = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const routes = data.routes.filter((route) => route.visible).slice(0, 3);
  const routeCount = data.routes.filter((route) => route.visible).length;

  function planTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate("/planner", {
      state: { originQuery: from.trim(), destinationQuery: to.trim() },
    });
  }

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <div className="home-eyebrow">CAGAYAN DE ORO · EVERYDAY SAKAY</div>
          <h1 id="home-title"><span>Sakay na.</span><br />Know your jeepney.</h1>
          <p>Tell us where you are and where you’re headed. We’ll show you which jeepney to ride, where to hop off, and what to pay.</p>
          <form className="hero-planner" onSubmit={planTrip}>
            <label htmlFor="home-from">From</label>
            <input id="home-from" value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Your starting point" autoComplete="street-address" />
            <label htmlFor="home-to">To</label>
            <input id="home-to" value={to} onChange={(event) => setTo(event.target.value)} placeholder="Where to?" />
            <button type="submit">Find my sakay <ArrowRight size={18} /></button>
          </form>
          <div className="hero-browse"><Link to="/explore">Browse all routes <ArrowUpRight size={15} /></Link></div>
        </div>
        <div className="hero-route-badge">
          <span aria-hidden="true" />
          <strong>{routeCount} routes mapped across Cagayan de Oro</strong>
        </div>
      </section>

      <section className="home-section popular-section" aria-labelledby="popular-heading">
        <div className="section-heading"><h2 id="popular-heading">Popular routes</h2><Link to="/explore">See all {routeCount || data.routes.length} routes <ArrowUpRight size={16} /></Link></div>
        <div className="popular-routes">
          {routes.map((route) => <Link className="popular-route" to={`/routes/${encodeURIComponent(route.id)}`} key={route.id}>
            <span className="route-chip">{route.routeIdentifier || route.signboardCode || `ROUTE ${route.id}`}</span>
            <h3>{route.name}</h3>
            <p>{route.from} <span aria-hidden="true">→</span> {route.to}</p>
            <small>Fare guidance · confirm current fare locally</small>
          </Link>)}
          {!routes.length && <Link className="popular-route popular-route-empty" to="/explore"><span className="route-chip">CDO ROUTES</span><h3>Explore jeepney routes</h3><p>Browse the mapped network in Cagayan de Oro.</p><small>Open the route directory <ArrowUpRight size={14} /></small></Link>}
        </div>
      </section>

      <section className="home-section how-section" aria-labelledby="how-heading">
        <div className="section-heading"><h2 id="how-heading">How it works</h2><Link to="/how-it-works">Learn more <ArrowUpRight size={16} /></Link></div>
        <div className="how-cards">
          {steps.map((step, index) => <article className={`how-card${index === 0 ? " how-card-featured" : ""}`} key={step.title}>
            <span className="how-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p>
            {index === 0 ? <Route size={22} aria-hidden="true" /> : index === 1 ? <BusFront size={22} aria-hidden="true" /> : <Coins size={22} aria-hidden="true" />}
          </article>)}
        </div>
      </section>

      <footer className="home-footer"><span><strong>SakayGo</strong> · Built around Cagayan de Oro, Philippines</span><nav aria-label="Footer"><Link to="/fares">Fare guide</Link><Link to="/about">Feedback</Link><Link to="/about">About</Link></nav></footer>
    </div>
  );
}


