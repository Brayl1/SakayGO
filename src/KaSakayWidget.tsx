import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import KaSakayLoader from "./KaSakayLoader";
import { House, Map, Route, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import "./kasakay-widget.css";

const KaSakay = lazy(() => import("./KaSakay"));

const tabs = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/planner", label: "Planner", icon: Map, end: false },
  { to: "/explore", label: "Routes", icon: Route, end: false },
];

function TabLink({ to, label, icon: Icon, end, reduced }: (typeof tabs)[number] & { reduced: boolean }) {
  return <NavLink to={to} end={end}>
    {({ isActive }) => <>
      {isActive && <motion.span className="mobile-tab-indicator" layoutId="mobile-tab-indicator" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }} />}
      <motion.span className="mobile-tab-icon" animate={isActive && !reduced ? { y: [0, -3, 0] } : { y: 0 }} transition={{ duration: 0.35 }}><Icon size={20} strokeWidth={isActive ? 2.4 : 2} /></motion.span>
      <span>{label}</span>
    </>}
  </NavLink>;
}

export default function KaSakayWidget() {
  const reduced = useReducedMotion();
  const [opened, setOpened] = useState(false);
  const [started, setStarted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const mobileLauncher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const previousLocation = useRef(location.key);
  function close() {
    dialog.current?.close();
    setOpened(false);
    const trigger = mobileLauncher.current?.getClientRects().length ? mobileLauncher.current : launcher.current;
    trigger?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (previousLocation.current !== location.key) {
      dialog.current?.close();
      setOpened(false);
      previousLocation.current = location.key;
    }
  }, [location.key]);
  useEffect(() => {
    if (!opened) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [opened]);
  // Visual viewport measurements account for soft keyboards without width-based rendering.
  // These tokens are consumed only by the mobile stylesheet, and only set during occlusion.
  useEffect(() => {
    if (location.pathname !== "/" && location.pathname !== "/planner") return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const editing = document.activeElement?.matches("input, textarea, select");
      if (editing && inset > 100 && viewport.scale === 1) {
        root.style.setProperty("--ride-viewport-height", viewport.height + "px");
        root.style.setProperty("--ride-keyboard-inset", inset + "px");
      } else {
        root.style.removeProperty("--ride-viewport-height");
        root.style.removeProperty("--ride-keyboard-inset");
      }
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--ride-viewport-height");
      root.style.removeProperty("--ride-keyboard-inset");
    };
  }, [location.pathname]);
  return <>
    <button ref={launcher} className="kasakay-launcher" aria-label="Open KaSakay assistant" aria-haspopup="dialog" aria-expanded={opened} aria-controls="kasakay-panel"
      onClick={() => { setStarted(true); setOpened(true); dialog.current?.showModal(); closeButton.current?.focus(); }}>
      <img src="/images/kasakay.png" alt="" width="64" height="64" />
      <span>Ask KaSakay</span>
    </button>
    {!location.pathname.startsWith("/admin") && <LayoutGroup id="mobile-tabs"><nav className="mobile-only mobile-bottom-tabs" aria-label="Quick navigation">
      {tabs.slice(0, 2).map((tab) => <TabLink key={tab.to} {...tab} reduced={!!reduced} />)}
      <motion.button whileTap={reduced ? undefined : { scale: 0.92 }} ref={mobileLauncher} type="button" aria-label="Open KaSakay assistant" aria-haspopup="dialog" aria-expanded={opened} aria-controls="kasakay-panel" onClick={() => { setStarted(true); setOpened(true); dialog.current?.showModal(); closeButton.current?.focus(); }}><span className="mobile-kasakay-icon"><img src="/images/kasakay.png" alt="" width="36" height="36" /></span><span>KaSakay</span></motion.button>
      {tabs.slice(2).map((tab) => <TabLink key={tab.to} {...tab} reduced={!!reduced} />)}
    </nav></LayoutGroup>}
    <dialog ref={dialog} id="kasakay-panel" className="kasakay-panel" aria-labelledby="kasakay-panel-title"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setOpened(false)}
      onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right) close(); } }}>
      <div className="kasakay-panel-bar">
        <img src="/images/kasakay.png" alt="" width="48" height="48" />
        <div><h2 id="kasakay-panel-title">KaSakay</h2><p>Your commute companion</p></div>
        <button ref={closeButton} onClick={close} aria-label="Close KaSakay assistant"><X size={22} /></button>
      </div>
      <motion.div className="kasakay-panel-content" initial={false} animate={{ opacity: opened ? 1 : 0, y: opened || reduced ? 0 : 8 }} transition={{ duration: reduced ? 0 : 0.2 }}>
        {started && <Suspense fallback={<KaSakayLoader label="Loading KaSakay..." />}><KaSakay compact /></Suspense>}
      </motion.div>
    </dialog>
  </>;
}
