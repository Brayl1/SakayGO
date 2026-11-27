import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, BusFront, MapPin, Menu, Settings2, X } from "lucide-react";

const links = [
  { to: "/kasakay", label: "Ask KaSakay" },
  { to: "/planner", label: "Route Planner" },
  { to: "/explore", label: "Explore Routes" },
  { to: "/codes", label: "Jeepney Codes" },
  { to: "/fares", label: "Fare Guide" },
  { to: "/how-it-works", label: "How It Works" },
];
export default function Navigation({ admin }: { admin: boolean }) {
  const { pathname } = useLocation();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const toggle = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpenPath(null); toggle.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return (
    <header className="site-header">
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
          <motion.button ref={toggle} className="menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpenPath(open ? null : pathname)} whileTap={{ scale: 0.95 }}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </motion.button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && <motion.div id="mobile-navigation" className="mobile-navigation" initial={{ opacity: 0, height: reduced ? "auto" : 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: reduced ? "auto" : 0 }}>
          <nav aria-label="Mobile navigation">
            {links.map(({ to, label }) => <NavLink key={to} to={to} onClick={() => setOpenPath(null)}>{label}<ArrowUpRight size={17} /></NavLink>)}
          </nav>
          <p><MapPin size={14} /> Made for getting around Cagayan de Oro.</p>
        </motion.div>}
      </AnimatePresence>
    </header>
  );
}



