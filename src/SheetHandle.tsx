import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { animate } from "motion/react";
import useReducedMotionNow from "./useReducedMotionNow";

/**
 * Drag handle for the mobile planner sheet. Dragging it resizes the map above
 * (by overriding --ride-map-height on .commuter-page) and snaps to three
 * heights: small map, the default split, and a large map with the sheet peeking.
 * Hidden on desktop through the shared `.mobile-only` rule.
 */
// Smallest map that still fits its back, fullscreen and locate controls.
const MIN_MAP = 226;
const SHEET_PEEK = 210;

export default function SheetHandle() {
  const handle = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ y: number; start: number; last: number; time: number; velocity: number; moved: boolean } | null>(null);
  const defaultHeight = useRef<number | null>(null);
  const reduced = useReducedMotionNow();

  const parts = () => {
    const page = handle.current?.closest<HTMLElement>(".commuter-page");
    const map = page?.querySelector<HTMLElement>(".trip-map-section");
    return page && map ? { page, map } : null;
  };
  const limits = (page: HTMLElement) => ({ min: MIN_MAP, max: Math.max(MIN_MAP, page.clientHeight - SHEET_PEEK) });
  const setHeight = (page: HTMLElement, height: number) => page.style.setProperty("--ride-map-height", `${Math.round(height)}px`);

  function snapTo(target: number) {
    const p = parts();
    if (!p) return;
    const from = p.map.getBoundingClientRect().height;
    if (reduced) { setHeight(p.page, target); return; }
    animate(from, target, { type: "spring", stiffness: 380, damping: 36, onUpdate: (v) => setHeight(p.page, v) });
  }
  function snapPoints(page: HTMLElement) {
    const { min, max } = limits(page);
    const mid = Math.min(Math.max(defaultHeight.current ?? min, min), max);
    return [min, mid, max];
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const p = parts();
    if (!p) return;
    defaultHeight.current ??= p.map.getBoundingClientRect().height;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = p.map.getBoundingClientRect().height;
    drag.current = { y: event.clientY, start, last: event.clientY, time: event.timeStamp, velocity: 0, moved: false };
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current, p = parts();
    if (!d || !p) return;
    const dy = event.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    const dt = Math.max(1, event.timeStamp - d.time);
    d.velocity = (event.clientY - d.last) / dt;
    d.last = event.clientY;
    d.time = event.timeStamp;
    const { min, max } = limits(p.page);
    setHeight(p.page, Math.min(Math.max(d.start + dy, min - 20), max + 20));
  }
  function onPointerUp() {
    const d = drag.current, p = parts();
    drag.current = null;
    if (!d || !p) return;
    const points = snapPoints(p.page);
    const current = p.map.getBoundingClientRect().height;
    if (!d.moved) {
      // A tap toggles between the default split and a big map.
      const [, mid, max] = points;
      snapTo(Math.abs(current - mid) < 8 ? max : mid);
      return;
    }
    // Project a little along the flick so a quick swipe moves one stop.
    const projected = current + d.velocity * 180;
    snapTo(points.reduce((best, h) => (Math.abs(h - projected) < Math.abs(best - projected) ? h : best)));
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const p = parts();
    if (!p) return;
    event.preventDefault();
    defaultHeight.current ??= p.map.getBoundingClientRect().height;
    const points = snapPoints(p.page);
    const current = p.map.getBoundingClientRect().height;
    const index = points.findIndex((h) => Math.abs(h - current) < 8);
    const at = index === -1 ? 1 : index;
    // ArrowUp raises the sheet (smaller map); ArrowDown lowers it (bigger map).
    snapTo(points[Math.min(Math.max(at + (event.key === "ArrowUp" ? -1 : 1), 0), points.length - 1)]);
  }

  return (
    <button
      ref={handle}
      type="button"
      className="mobile-only sheet-drag-handle"
      aria-label="Resize map. Drag, or use the up and down arrow keys."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <span aria-hidden="true" />
    </button>
  );
}
