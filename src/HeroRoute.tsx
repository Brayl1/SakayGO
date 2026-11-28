import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import useReducedMotionNow from "./useReducedMotionNow";
import { BusFront } from "lucide-react";

// Route drawn on the photo side of the hero, as fractions of its box:
// a start point followed by cubic segments [c1, c2, end].
const START: [number, number] = [0.5, 1.04];
const SEGMENTS: [number, number][][] = [
  [[0.56, 0.86], [0.66, 0.88], [0.7, 0.7]],
  [[0.74, 0.52], [0.66, 0.46], [0.78, 0.38]],
  [[0.9, 0.3], [0.97, 0.3], [0.98, 0.14]],
  [[0.99, 0.04], [1.03, 0.0], [1.08, -0.06]],
];
const STOPS = [0.3, 0.55, 0.8];

type Point = { x: number; y: number };

function buildPath(w: number, h: number) {
  const p = ([x, y]: [number, number]) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`;
  return `M ${p(START)} ` + SEGMENTS.map((s) => `C ${s.map(p).join(", ")}`).join(" ");
}

export default function HeroRoute() {
  const box = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const reduced = useReducedMotionNow();
  const progress = useMotionValue(reduced ? 0.62 : 0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [length, setLength] = useState(0);
  const d = useMemo(() => (size.w ? buildPath(size.w, size.h) : ""), [size]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (pathRef.current && d) setLength(pathRef.current.getTotalLength());
  }, [d]);

  useLayoutEffect(() => {
    if (reduced || !length) return;
    const controls = animate(progress, [0, 1], {
      duration: 9,
      ease: "easeInOut",
      repeat: Infinity,
      repeatDelay: 0.8,
      delay: 1.6,
    });
    return () => controls.stop();
  }, [progress, reduced, length]);

  const pointAt = (t: number): Point => {
    const path = pathRef.current;
    if (!path || !length) return { x: -100, y: -100 };
    const pt = path.getPointAtLength(length * Math.min(Math.max(t, 0), 1));
    return { x: pt.x, y: pt.y };
  };
  const x = useTransform(progress, (t) => pointAt(t).x);
  const y = useTransform(progress, (t) => pointAt(t).y);
  const fade = useTransform(progress, [0, 0.05, 0.93, 1], [0, 1, 1, 0]);
  const stops = length ? STOPS.map(pointAt) : [];

  // Purely decorative: people who asked for reduced motion get the plain hero.
  if (reduced) return null;

  return (
    <div className="hero-route" ref={box} aria-hidden="true">
      {d && <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
        <path className="hero-route-shadow" d={d} />
        <motion.path
          ref={pathRef}
          className="hero-route-line"
          d={d}
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.8, ease: [0.65, 0, 0.35, 1], delay: 0.3 }}
        />
      </svg>}
      {stops.map((stop, index) => <motion.span
        key={index}
        className="hero-route-stop"
        style={{ left: stop.x, top: stop.y }}
        initial={reduced ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.7 + index * 0.35 }}
      />)}
      {length > 0 && <motion.span className="hero-route-bus" style={{ x, y, opacity: reduced ? 1 : fade }}>
        <span className="hero-route-bus-pulse" />
        <BusFront size={16} strokeWidth={2.4} />
      </motion.span>}
    </div>
  );
}
