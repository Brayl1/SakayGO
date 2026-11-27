import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Search, ExternalLink, ShieldCheck } from "lucide-react";
import type { ResearchCode } from "../shared/trip-types";
export default function CodeResearch() {
  const [records, setRecords] = useState<ResearchCode[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/route-codes");
      if (!r.ok) throw new Error();
      setRecords((await r.json()).research);
    } catch {
      setError("Code research could not load. Please retry.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const shown = records.filter((r) =>
    `${r.code} ${r.reported_service_area}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <motion.div
      className="content-page code-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="eyebrow">TRADITIONAL CODE RESEARCH</div>
      <h1>Know the code. Check the source.</h1>
      <p>
        Ten research records, not a complete or current registry of CDO
        jeepneys.
      </p>
      <div className="notice">
        <ShieldCheck size={20} />
        <span>
          <strong>Unverified — confirm with operator/driver.</strong>
          <br />
          Traditional R1/R2 are not LPTRP route variants. C2 is not Carmen R2.
          These reports are not joined to any imported route without a
          separately approved directional crosswalk.
        </span>
      </div>
      <div className="directory-search">
        <label>
          <Search size={18} />
          <input
            aria-label="Search traditional codes"
            placeholder="Search C1, C2, R2 or reported service area"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <p role="status">Loading research…</p>
      ) : error ? (
        <div className="notice" role="alert">
          {error}
          <button onClick={() => void load()}>Retry</button>
        </div>
      ) : (
        <div className="code-grid">
          {shown.map((r) => (
            <article className="research-card" key={r.code}>
              <div>
                <span className="research-code">{r.code}</span>
                <span className="demo-pill">
                  {r.verification_status === "verified"
                    ? "Verified"
                    : r.verification_status === "unknown"
                    ? "Unknown"
                    : "Unverified"}
                </span>
              </div>
              {r.verification_basis === "owner_approval" && <small>Owner approved on {r.verified_at}</small>}
              <h2>{r.reported_service_area || "Service area unknown"}</h2>
              <p>
                {r.notes ||
                  "Reported service description only. Current operation has not been confirmed."}
              </p>
              <small>
                {r.source_type === "community_report_2022_2023"
                  ? "Community evidence: 2022–2023"
                  : r.source_type === "not_found"
                    ? "No reliable mapping established"
                    : "Transport guide · publication date not supplied"}
              </small>
              {r.source_url && /^https:\/\//.test(r.source_url) ? (
                <a href={r.source_url} target="_blank" rel="noreferrer">
                  Original research source <ExternalLink size={14} />
                </a>
              ) : (
                <p>No source URL supplied.</p>
              )}
              <p className="code-no-link">
                No operating route is inferred from this research record.
              </p>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && !shown.length && (
        <div className="empty">
          No matching research record. This directory is not exhaustive.
        </div>
      )}
      <p className="code-footer">
        Source links may be outdated or inaccessible; original references are
        preserved. <Link to="/">Plan by mapped route geometry →</Link>
      </p>
    </motion.div>
  );
}

