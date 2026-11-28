import { useReducedMotion } from "motion/react";

/**
 * Motion's useReducedMotion() can report `false` on the very first render,
 * before it has read the media query, so entrance animations would start
 * for people who asked for reduced motion. Read the query directly too.
 */
export default function useReducedMotionNow(): boolean {
  const fromMotion = useReducedMotion();
  const fromQuery = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return Boolean(fromMotion || fromQuery);
}
