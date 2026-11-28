import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { BusFront, MapPin, Search, Ticket } from "lucide-react";
import { useCatalog } from "./CatalogContext";
export default function Guide({ page }: { page: "fares" | "how" | "about" }) {
  const { data } = useCatalog();
  const [reference, setReference] = useState<{
    effective_date: string;
    sources: string[];
    rules: {
      vehicle: string;
      base_fare_php: number;
      base_distance_km: number;
      additional_per_km_php: number;
    }[];
  } | null>(null);
  useEffect(() => {
    if (page !== "fares") return;
    const c = new AbortController();
    fetch("/api/fare-reference", { signal: c.signal })
      .then((r) => r.json())
      .then((j) => {
        if (!c.signal.aborted) setReference(j.reference);
      })
      .catch(() => {});
    return () => c.abort();
  }, [page]);
  return (
    <motion.div
      className="content-page editorial"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="eyebrow">KNOW YOUR ROUTE. KNOW YOUR FARE.</div>
      {page === "how" ? (
        <>
          <h1>Your city, one route at a time.</h1>
          <p>Explore the recorded jeepney network around Cagayan de Oro.</p>
          <div className="guide-grid">
            {[
              {
                icon: Search,
                title: "1. Choose your places",
                text: "Search a place, enter coordinates or choose points on the map. Check that each selected location is correct.",
              },
              {
                icon: BusFront,
                title: "2. Compare trip candidates",
                text: "Set your access-distance limit and compare directed route segments. The solid sage line follows the recorded route; dashed lines show approximate access connections.",
              },
              {
                icon: MapPin,
                title: "3. Review before you ride",
                text: "Check the source and limitations. Confirm current operations, boarding points and fares with the operator before travel.",
              },
            ].map((s, i) => (
              <motion.article
                key={s.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <s.icon />
                <h2>{s.title}</h2>
                <p>{s.text}</p>
              </motion.article>
            ))}
          </div>
          <div className="notice">
            These alignments are unverified. Projected boarding areas are not
            official stops. Without a pedestrian router, walking is a
            straight-line estimate and may cross barriers. No transfers are
            inferred from intersecting lines.
          </div>
          <Link className="primary" to="/">
            Explore CDO routes
          </Link>
        </>
      ) : page === "fares" ? (
        <>
          <h1>Clear information. No invented fares.</h1>
          <p>Know what is available before you ride.</p>
          <div className="notice">
            <Ticket />
            Supplied national rates are reference-only. A route-specific CDO
            matrix, vehicle classification and partial-kilometer rules still
            need verification.
          </div>
          {reference && (
            <>
              <h2>Supplied 2026 national reference</h2>
              <p>
                Reference effective date: {reference.effective_date}. These are
                not verified route-specific CDO fares.
              </p>
              <div className="policy-table" role="region" aria-label="National fare reference" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>First kilometers</th>
                      <th>Base reference</th>
                      <th>Per succeeding km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reference.rules.map((r) => (
                      <tr key={r.vehicle}>
                        <td>{r.vehicle}</td>
                        <td>{r.base_distance_km} km</td>
                        <td>₱{r.base_fare_php.toFixed(2)}</td>
                        <td>₱{r.additional_per_km_php.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                The supplied examples apply a single 20% student/senior/PWD
                discount and nearest ₱0.25 half-up rounding. Local eligibility
                and rounding remain unverified.{" "}
                <a href={reference.sources[0]} target="_blank" rel="noreferrer">
                  Supplied source
                </a>
              </p>
            </>
          )}
          <h2>How the planner uses the reference</h2>
          <p>
            The planner measures each ridden directional segment. Unknown
            vehicle classes receive separate conditional traditional and modern
            illustrations. Because partial-kilometer billing is unspecified,
            fractional distances beyond the base distance show adjacent
            whole-kilometer examples rather than an invented exact fare. These
            are not guaranteed fare limits. Every transfer ride is charged
            separately.
          </p>
          <h2>What is needed for fare estimates</h2>
          <p>
            An applicable, sourced fare matrix with vehicle classification,
            effective dates, base distance, increments, discount eligibility and
            rounding rules. Boarding and drop-off points also need verification
            before a journey fare can be calculated.
          </p>
          <h2>Passenger categories</h2>
          <p>
            Regular, student, senior citizen and PWD categories are supported.
            Confirmed estimates require an approved applicable policy; missing
            or overlapping applicable policies leave the fare unavailable.
          </p>
          <Link to="/planner">Plan a trip with the route planner</Link>
        </>
      ) : (
        <>
          <h1>Local knowledge, with clear sources.</h1>
          <p>
            SakayGo: A Web-Based Jeepney Route Navigation and Fare Estimation
            System for Cagayan de Oro City.
          </p>
          <h2>Where the route data comes from</h2>
          <p>
            Route paths, street lists, landmarks and route status come from the{" "}
            <a href="https://sites.google.com/view/cdo-routes-lptrp/district-1" target="_blank" rel="noreferrer">
              CDO Local Public Transport Route Plan (LPTRP)
            </a>
            , as organised by{" "}
            <a href="https://github.com/jrequiroso/cdo-jeepney-routes" target="_blank" rel="noreferrer">
              jrequiroso/cdo-jeepney-routes
            </a>{" "}
            and used with the maintainer&apos;s permission. Thank you for making
            this data easier to use. The directory contains {data.routes.length}{" "}
            visible routes.
          </p>
          <p>
            Each route keeps its inbound and outbound paths exactly as supplied.
            Routes the plan marks as not yet operational are shown with a label
            and are never suggested by the trip planner. The route plan
            describes planned alignments; actual jeepney operations may still
            differ.
          </p>
          <h2>What remains unverified</h2>
          <p>
            Route accuracy, current operation, boarding locations, signboards,
            schedules and fare rules have not been independently verified. Shape vertices and line endpoints are not
            designated boarding stops. Catalog records are approved by the project owner. Editorial approval is recorded separately from independent field verification.
          </p>
          <h2>Responsible administration</h2>
          <p>
            The owner can edit route information, archive records, upload
            geometry, record internal review notes and publish announcements.
            Saved changes are stored on the server with version checks. The
            original supplied files are retained in the source project.
          </p>
          <h2>Privacy & map data</h2>
          <p>
            Place queries go to the configured geocoder. Trip coordinates go to
            this site's API and, if configured, a pedestrian provider. Optional device location is used to select your trip origin. Basemap ©{" "}
            <a href="https://www.openstreetmap.org/copyright">
              OpenStreetMap contributors
            </a>
            . Tiles require an internet connection; no offline navigation or
            live tracking is claimed.
          </p>
          <Link to="/admin">Owner administration →</Link>
        </>
      )}
    </motion.div>
  );
}


