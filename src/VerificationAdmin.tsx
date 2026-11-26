import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, Save, ShieldCheck } from "lucide-react";
export default function VerificationAdmin() {
  const [text, setText] = useState(""),
    [approve, setApprove] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [denied, setDenied] = useState(false),
    [saving, setSaving] = useState(false),
    [ready, setReady] = useState(false),
    [events, setEvents] = useState<
      { at: string; actor: string; action: string }[]
    >([]);
  const etag = useRef("");
  const file = useRef<HTMLInputElement>(null);
  async function load() {
    setError("");
    try {
      const res = await fetch("/api/admin/verification");
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) throw new Error("Verification data could not load.");
      const data = await res.json();
      etag.current = res.headers.get("etag") || "";
      setText(
        JSON.stringify(
          {
            crosswalks: data.crosswalks,
            farePolicies: data.farePolicies,
            vehicleClassifications: data.vehicleClassifications || [],
          },
          null,
          2,
        ),
      );
      setEvents(data.events);
      setReady(true);
      setApprove(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save() {
    setError("");
    setMessage("");
    let draft;
    try {
      draft = JSON.parse(text);
      if (
        !Array.isArray(draft.crosswalks) ||
        !Array.isArray(draft.farePolicies)
      )
        throw new Error();
    } catch {
      setError("Expected JSON with crosswalks and farePolicies arrays.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/verification", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": etag.current,
        },
        body: JSON.stringify({ ...draft, approve }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await load();
      setMessage(
        `Saved verification revision ${body.revision}. No research records were automatically linked.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (denied)
    return (
      <div className="content-page">
        <h1>Owner access required</h1>
        <a
          href="/signin-with-chatgpt?return_to=%2Fadmin%2Fverification"
          target="_top"
        >
          Sign in with the owner account
        </a>
      </div>
    );
  return (
    <div className="content-page verification-admin">
      <Link to="/admin">← Back to administration</Link>
      <div className="eyebrow">
        <ShieldCheck size={16} /> EXPLICIT EVIDENCE REVIEW
      </div>
      <h1>Codes & fare policies</h1>
      <p>
        Import an authoritative crosswalk or CDO-applicable matrix. Nothing is
        verified by matching names, roads or research descriptions.
      </p>
      <div className="notice">
        No authoritative mappings or fare matrix were supplied. Leave both
        arrays empty until evidence is available. A verified entry requires
        explicit approval below; the server records your signed-in identity and
        approval time.
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
          <button onClick={() => void load()}>Reload latest</button>
        </div>
      )}
      {message && (
        <div className="admin-success" role="status">
          {message}
        </div>
      )}
      <fieldset disabled={saving || !ready} className="admin-fields">
        <button className="secondary" onClick={() => file.current?.click()}>
          <FileUp size={16} />
          Import JSON draft
        </button>
        <input
          hidden
          ref={file}
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > 2000000) {
                setError("Import exceeds 2 MB limit.");
                return;
              }
              setText(await f.text());
              setApprove(false);
              setMessage("Draft loaded. Review before saving.");
            }
            e.target.value = "";
          }}
        />
        <label className="json-editor-label">
          Crosswalk and fare-rule JSON
          <textarea
            aria-label="Verification JSON draft"
            rows={20}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setApprove(false);
            }}
            spellCheck={false}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={approve}
            onChange={(e) => setApprove(e.target.checked)}
          />
          I explicitly approve entries marked verified after reviewing their
          official or field-confirmed evidence and applicability.
        </label>
        <button className="primary" onClick={() => void save()}>
          <Save size={17} />
          {saving ? "Saving…" : "Validate and save reviewed data"}
        </button>
      </fieldset>
      <details className="verification-help">
        <summary>Required import fields and safeguards</summary>
        <p>
          Crosswalk fields: id, traditional_code, lptrp_route_id, direction,
          alias, verification_status (pending/verified), operational_status
          (active/inactive/unknown), evidence_url, evidence_type
          (official/field_confirmed), confidence (0–1), notes. Many-to-many
          joins are allowed. Verified entries receive server-generated
          verified_at, verified_by and approved_at.
        </p>
        <p>
          Fare fields: id, region (CDO), vehicle (traditional/modern),
          verification_status, effective_from, effective_to, source_url,
          evidence_type, base_distance_km, base_fare, per_km, increment_mode
          (started_km/proportional), round_to, rounding (nearest/ceil/floor),
          discounts (student/senior/pwd: 0–1 or null), and optional matrix rows
          (upToKm, fare). Overlapping current policies make estimates
          unavailable until resolved.
        </p>
        <p>
          Pending records are never used as verified boarding codes or fares.
          Supplied research remains unchanged and separate.
        </p>
      </details>
      <p>
        Optional vehicleClassifications entries require routeId, direction,
        vehicle (traditional/modern), source_url, evidence_type
        (official/field_confirmed), and verification_status (pending/verified).
        Approval records your identity and time. A user-selected preference
        never establishes the route vehicle class.
      </p>
      <h2>Verification audit</h2>
      {events.length ? (
        <ul className="audit-list">
          {[...events].reverse().map((e, i) => (
            <li key={i}>
              {e.at} · {e.action} · {e.actor}
            </li>
          ))}
        </ul>
      ) : (
        <p>No approval events recorded.</p>
      )}
    </div>
  );
}

