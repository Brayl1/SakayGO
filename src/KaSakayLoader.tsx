import { motion, useReducedMotion } from "motion/react";
import "./kasakay-loader.css";

export function KaSakaySpinner({ small = false }: { small?: boolean }) {
  const reduced = useReducedMotion();
  return <motion.img className={"kasakay-loading-logo" + (small ? " kasakay-loading-logo-small" : "")} src="/images/kasakay.png" alt="" aria-hidden="true" width={small ? 32 : 72} height={small ? 32 : 72}
    animate={{ rotate: reduced ? 0 : 360 }} transition={reduced ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: "linear" }} />;
}

export default function KaSakayLoader({ label = "Loading SakayGo...", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={"kasakay-loader" + (compact ? " kasakay-loader-compact" : "")} role="status" aria-live="polite">
    <KaSakaySpinner small={compact} /><span>{label}</span>
  </div>;
}
