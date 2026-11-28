import { useEffect, useState, type FormEvent } from "react";
import { animate, motion, type Variants } from "motion/react";
import useReducedMotionNow from "./useReducedMotionNow";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BusFront, Coins, Route, Info, Ticket } from "lucide-react";
import { useCatalog } from "./CatalogContext";
import HeroRoute from "./HeroRoute";

const MotionLink = motion.create(Link);

const steps = [
  { title: "Pick your start and stop", text: "Tell us where you are and where you want to go." },
  { title: "See the jeepney to ride", text: "Compare mapped route options across the city." },
  { title: "Know your fare", text: "Review available fare guidance before you ride." },
];

const heroStagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 220, damping: 26 } },
};
const group: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const pop: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 320, damping: 24 } },
};

function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotionNow();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced || !value) { setShown(value); return; }
    const controls = animate(0, value, { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.35, onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [value, reduced]);
  return <>{shown}</>;
}

export default function Welcome() {
  const reduced = useReducedMotionNow();
  const { data } = useCatalog();
  const navigate = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const routes = data.routes.filter((route) => route.visible).slice(0, 3);
  const routeCount = data.routes.filter((route) => route.visible).length;
  const start = reduced ? false : "hidden";

  function planTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate("/planner", {
      state: { originQuery: from.trim(), destinationQuery: to.trim() },
    });
  }

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <HeroRoute />
        <motion.div className="hero-copy" variants={heroStagger} initial={start} animate="show">
          <motion.div className="home-eyebrow" variants={rise}><span className="eyebrow-dot" aria-hidden="true" />CAGAYAN DE ORO · EVERYDAY SAKAY</motion.div>
          <motion.h1 variants={rise} id="home-title"><span>Sakay na.</span><br />Know your jeepney.</motion.h1>
          <motion.p variants={rise}>Tell us where you are and where you’re headed. We’ll show you which jeepney to ride, where to hop off, and what to pay.</motion.p>
          <motion.form variants={rise} className="hero-planner" onSubmit={planTrip}>
            <label htmlFor="home-from">From</label>
            <input id="home-from" value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Your starting point" autoComplete="street-address" />
            <label htmlFor="home-to">To</label>
            <input id="home-to" value={to} onChange={(event) => setTo(event.target.value)} placeholder="Where to?" />
            <motion.button whileTap={reduced ? undefined : { scale: 0.97 }} type="submit">Find my sakay <span className="button-arrow" aria-hidden="true"><ArrowRight size={18} /></span></motion.button>
          </motion.form>
          <motion.div variants={rise} className="hero-browse"><Link to="/explore">Browse all routes <ArrowUpRight size={15} /></Link></motion.div>
        </motion.div>
        <motion.div
          className="hero-route-badge"
          initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.45 }}
        >
          <span className="badge-dot" aria-hidden="true" />
          <strong><CountUp value={routeCount} /> routes mapped across Cagayan de Oro</strong>
        </motion.div>
      </section>

      <motion.nav className="mobile-only mobile-home-tiles" aria-label="Commuter guides" variants={group} initial={start} animate="show" transition={{ delayChildren: 0.35 }}>
        <MotionLink variants={pop} whileTap={reduced ? undefined : { scale: 0.95 }} to="/codes"><Ticket size={20} /><span>Jeepney Codes</span></MotionLink>
        <MotionLink variants={pop} whileTap={reduced ? undefined : { scale: 0.95 }} to="/fares"><Coins size={20} /><span>Fare Guide</span></MotionLink>
        <MotionLink variants={pop} whileTap={reduced ? undefined : { scale: 0.95 }} to="/how-it-works"><Info size={20} /><span>How It Works</span></MotionLink>
      </motion.nav>

      <section className="home-section popular-section" aria-labelledby="popular-heading">
        <div className="section-heading"><h2 id="popular-heading">Popular routes</h2><Link to="/explore">See all {routeCount || data.routes.length} routes <ArrowUpRight size={16} /></Link></div>
        <motion.div className="popular-routes" variants={group} initial={start} whileInView="show" viewport={{ once: true, amount: 0.1 }}>
          {routes.map((route) => <MotionLink variants={pop} whileTap={reduced ? undefined : { scale: 0.98 }} className="popular-route" to={`/routes/${encodeURIComponent(route.id)}`} key={route.id}>
            <span className="route-chip">{route.routeIdentifier || route.signboardCode || `ROUTE ${route.id}`}</span>
            <h3>{route.name}</h3>
            <p>{route.from} <span aria-hidden="true">→</span> {route.to}</p>
            <small>Fare guidance · confirm current fare locally <ArrowRight size={14} className="card-arrow" aria-hidden="true" /></small>
          </MotionLink>)}
          {!routes.length && <Link className="popular-route popular-route-empty" to="/explore"><span className="route-chip">CDO ROUTES</span><h3>Explore jeepney routes</h3><p>Browse the mapped network in Cagayan de Oro.</p><small>Open the route directory <ArrowUpRight size={14} /></small></Link>}
        </motion.div>
      </section>

      <section className="home-section how-section" aria-labelledby="how-heading">
        <div className="section-heading"><h2 id="how-heading">How it works</h2><Link to="/how-it-works">Learn more <ArrowUpRight size={16} /></Link></div>
        <motion.div className="how-cards" variants={group} initial={start} whileInView="show" viewport={{ once: true, amount: 0.1 }}>
          {steps.map((step, index) => <motion.article variants={pop} className={`how-card${index === 0 ? " how-card-featured" : ""}`} key={step.title}>
            <span className="how-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p>
            {index === 0 ? <Route size={22} aria-hidden="true" /> : index === 1 ? <BusFront size={22} aria-hidden="true" /> : <Coins size={22} aria-hidden="true" />}
          </motion.article>)}
        </motion.div>
      </section>

      <footer className="home-footer"><span><strong>SakayGo</strong> · Built around Cagayan de Oro, Philippines</span><nav aria-label="Footer"><Link to="/fares">Fare guide</Link><Link to="/about">Feedback</Link><Link to="/about">About</Link></nav></footer>
    </div>
  );
}
