import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion, useMotionValueEvent, useReducedMotion, useScroll, type Variants } from "motion/react";
import { ArrowUpRight, BookOpen, BusFront, Coins, Compass, Hash, MapPin, Menu, MessageCircle, Navigation as NavigationIcon, Settings2, X } from "lucide-react";

const links = [
  { to: "/kasakay", label: "Ask KaSakay", icon: MessageCircle },
  { to: "/planner", label: "Route Planner", icon: NavigationIcon },
  { to: "/explore", label: "Explore Routes", icon: Compass },
  { to: "/codes", label: "Jeepney Codes", icon: Hash },
  { to: "/fares", label: "Fare Guide", icon: Coins },
  { to: "/how-it-works", label: "How It Works", icon: BookOpen },
];

const sheet: Variants = {
  hidden: { opacity: 0, y: -12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 440, damping: 34, staggerChildren: 0.04, delayChildren: 0.04 } },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } },
};
const item: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 480, damping: 32 } },
};

export default function Navigation({ admin }: { admin: boolean }) {
  const { pathname } = useLocation();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const toggle = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpenPath(null); toggle.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}${open ? " menu-open" : ""}`}>
      <div className="navigation-shell">
        <Link className="brand" to="/" aria-label="SakayGo home" onClick={() => setOpenPath(null)}>
          <span className="brand-icon"><BusFront size={25} strokeWidth={2} /></span>
          <span className="brand-wordmark">Sakay<span>Go</span><small>YOUR EVERYDAY SAKAY</small></span>
        </Link>
        <LayoutGroup id="main-navigation">
          <nav className="desktop-navigation" aria-label="Main navigation">
            {links.map(({ to, label }) => <NavLink key={to} to={to}>
              {({ isActive }) => <>
                {isActive && <motion.span className="nav-indicator" layoutId="active-tab" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <span className="nav-label">{label}</span>
              </>}
            </NavLink>)}
          </nav>
        </LayoutGroup>
        <div className="navigation-actions">
          <span className="navigation-city"><span className="city-dot" /> Cagayan de Oro</span>
          {admin && <NavLink className="admin-link" to="/admin"><Settings2 size={16} />Admin</NavLink>}
          <Link className="header-cta" to="/planner" onClick={() => setOpenPath(null)}>Plan a trip</Link>
          <motion.button ref={toggle} className="menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpenPath(open ? null : pathname)} whileTap={{ scale: 0.92 }}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={open ? "close" : "open"}
                className="menu-toggle-icon"
                initial={reduced ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                {open ? <X size={22} /> : <Menu size={22} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && <motion.div
          key="backdrop"
          className="menu-backdrop"
          aria-hidden="true"
          onClick={() => setOpenPath(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />}
        {open && <motion.div key="sheet" id="mobile-navigation" className="mobile-navigation" variants={reduced ? undefined : sheet} initial="hidden" animate="show" exit="exit">
          <nav aria-label="Mobile navigation">
            {links.map(({ to, label, icon: Icon }) => <motion.div key={to} variants={reduced ? undefined : item}>
              <NavLink to={to} onClick={() => setOpenPath(null)}>
                <span className="mobile-link-icon"><Icon size={18} /></span>
                <span className="mobile-link-label">{label}</span>
                <ArrowUpRight size={17} />
              </NavLink>
            </motion.div>)}
          </nav>
          <motion.p variants={reduced ? undefined : item}><MapPin size={14} /> Made for getting around Cagayan de Oro.</motion.p>
        </motion.div>}
      </AnimatePresence>
    </header>
  );
}
