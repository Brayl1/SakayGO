import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { House, Map, Route, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import "./kasakay-widget.css";

const KaSakay = lazy(() => import("./KaSakay"));

export default function KaSakayWidget() {
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
    {(location.pathname === "/" || location.pathname === "/planner") && <nav className="mobile-only mobile-bottom-tabs" aria-label="Quick navigation">
      <NavLink to="/" end><House size={20} /><span>Home</span></NavLink>
      <NavLink to="/planner"><Map size={20} /><span>Planner</span></NavLink>
      <button ref={mobileLauncher} type="button" aria-label="Open KaSakay assistant" aria-haspopup="dialog" aria-expanded={opened} aria-controls="kasakay-panel" onClick={() => { setStarted(true); setOpened(true); dialog.current?.showModal(); closeButton.current?.focus(); }}><span className="mobile-kasakay-icon"><img src="/images/kasakay.png" alt="" width="36" height="36" /></span><span>KaSakay</span></button>
      <NavLink to="/explore"><Route size={20} /><span>Routes</span></NavLink>
    </nav>}
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
      <div className="kasakay-panel-content">
        {started && <Suspense fallback={<p role="status">Loading KaSakay…</p>}><KaSakay compact /></Suspense>}
      </div>
    </dialog>
  </>;
}
