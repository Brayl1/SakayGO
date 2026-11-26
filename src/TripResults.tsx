import FareCard from "./FareCard";
import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BusFront,
  ChevronDown,
  Footprints,
  RotateCcw,
  Ticket,
} from "lucide-react";
import type { Place, TripResult, Trip } from "../shared/trip-types";
import type { Point } from "../shared/model";
export const formatDistance = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
export default function TripResults({
  result,
  trip,
  onSelect,
  origin,
  destination,
  passenger,
  onEdit,
  onReset,
  onReplay,
  onFocus,
}: {
  result: TripResult;
  trip: Trip;
  onSelect: (id: string) => void;
  origin: Place;
  destination: Place;
  passenger: string;
  onEdit: () => void;
  onReset: () => void;
  onReplay: () => void;
  onFocus: (p: Point) => void;
}) {
  const [directions, setDirections] = useState(false),
    [alternatives, setAlternatives] = useState(false);

  return (
    <motion.section
      className="trip-results result-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      aria-label="Trip recommendation"
      data-itinerary-id={trip.id}
    >
      <button className="edit-trip" onClick={onEdit}>
        <ArrowLeft size={16} /> Edit trip
      </button>
      <div className="eyebrow ready-label">YOUR JEEPNEY ROUTE IS READY!</div>
      <h2
        tabIndex={-1}
        className="result-title"
        ref={(node) => node?.focus({ preventScroll: true })}
      >
        Here's your next sakay.
      </h2>
      <p className="result-subtitle">
        An approximate route match. Confirm service and a safe boarding place
        with the driver.
      </p>
      <div className="recommended-ride">
        <span className="ride-icon">
          <BusFront size={23} />
        </span>
        <div>
          <small>RECOMMENDED ROUTE</small>
          <h3>
            {trip.legs
              .map((l) => (l.codes.length ? l.codes.join(" / ") : l.label))
              .join(" → ")}
          </h3>
          <p>
            {trip.legs.map((l) => l.direction).join(" → ")} ·{" "}
            {trip.legs.some((l) => !l.codes.length)
              ? "Signboard code not verified"
              : "Verified signboard mapping"}
          </p>
        </div>
      </div>
      {!!trip.sharesRideWith?.length && (
        <p className="same-path-note">
          Another option follows nearly the same ridden section. Its route
          record stays separate; overlapping paths are not artificially changed.
        </p>
      )}
      <div className="trip-endpoints">
        <p>
          <b className="endpoint-dot">A</b>
          <span>
            <small>FROM</small>
            {origin.label}
          </span>
        </p>
        <p>
          <b className="endpoint-dot destination-dot">B</b>
          <span>
            <small>TO</small>
            {destination.label}
          </span>
        </p>
      </div>
      <div className="trip-metrics">
        <div>
          <BusFront size={17} />
          <strong>{formatDistance(trip.rideMeters)}</strong>
          <small>Jeepney distance</small>
        </div>
        <div>
          <Footprints size={17} />
          <strong>{formatDistance(trip.walkingMeters)}</strong>
          <small>Approx. walking</small>
        </div>
        <div>
          <RotateCcw size={17} />
          <strong>{trip.transfers}</strong>
          <small>Transfers</small>
        </div>
      </div>
      <FareCard trip={trip} passenger={passenger} />
      <div className="quick-guidance">
        <button onClick={() => onFocus(trip.legs[0].board)}>
          <b>Board near point 1</b>
          <span>
            {formatDistance(trip.walks[0].distanceMeters)} from your origin ·
            approximate
          </span>
        </button>
        <button onClick={() => onFocus(trip.legs.at(-1)!.alight)}>
          <b>Get off near point {trip.legs.length * 2}</b>
          <span>
            {formatDistance(trip.walks.at(-1)!.distanceMeters)} to your
            destination · approximate
          </span>
        </button>
      </div>
      <div className="result-actions">
        <button
          className="primary"
          aria-expanded={directions}
          aria-controls="full-directions"
          onClick={() => setDirections((v) => !v)}
        >
          View Full Directions <ChevronDown size={17} />
        </button>
        <button className="secondary" onClick={onReplay}>
          <RotateCcw size={17} /> Replay Route Animation
        </button>
      </div>
      {directions && (
        <div className="trip-itinerary" id="full-directions">
          <ol className="trip-steps">
            {trip.legs.map((l, i) => (
              <li key={i}>
                <button onClick={() => onFocus(l.board)}>
                  <span>{i * 2 + 1}</span>
                  <div>
                    <strong>
                      {i
                        ? "Transfer to the next jeepney"
                        : "Walk to the approximate boarding area"}
                    </strong>
                    <p>
                      {formatDistance(trip.walks[i].distanceMeters)} ·{" "}
                      {trip.walks[i].method === "straight_line"
                        ? "straight-line estimate, not a verified walking path"
                        : "estimated pedestrian path"}
                    </p>
                    <small>{l.board.map((n) => n.toFixed(6)).join(", ")}</small>
                  </div>
                </button>
                <div className="ride-instruction">
                  <b>
                    Ride {l.codes.length ? l.codes.join(" / ") : l.label} ·{" "}
                    {l.direction}
                  </b>
                  <p>
                    {l.codes.length
                      ? "Verified directional code mapping"
                      : "Signboard code not verified"}
                    . Follow the highlighted {formatDistance(l.rideMeters)}{" "}
                    route.
                  </p>
                  <p>{l.boardingStatus}</p>
                  <details>
                    <summary>Streets in source order</summary>
                    <p>
                      Full-direction reference; not verified turn-by-turn
                      instructions for this segment.
                    </p>
                    <ol>
                      {l.roads.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ol>
                  </details>
                </div>
                <button onClick={() => onFocus(l.alight)}>
                  <span>{i * 2 + 2}</span>
                  <div>
                    <strong>Get off at the approximate drop-off area</strong>
                    <p>Confirm a permitted, safe place with the driver.</p>
                    <small>
                      {l.alight.map((n) => n.toFixed(6)).join(", ")}
                    </small>
                  </div>
                </button>
              </li>
            ))}
          </ol>
          <p className="final-walk">
            Walk toward {destination.label} —{" "}
            {formatDistance(trip.walks.at(-1)!.distanceMeters)} approximate
            access.
          </p>
        </div>
      )}
      <button
        className="alternatives-toggle"
        aria-expanded={alternatives}
        onClick={() => setAlternatives((v) => !v)}
      >
        Alternative Routes ({Math.max(0, result.trips.length - 1)}){" "}
        <ChevronDown size={16} />
      </button>
      {alternatives && (
        <div className="route-alternatives">
          {result.trips.length === 1 ? (
            <p>No other valid route matched your access limit.</p>
          ) : (
            result.trips.map((t, i) => (
              <button
                key={t.id}
                data-itinerary-id={t.id}
                className={"route-card " + (trip.id === t.id ? "selected" : "")}
                aria-pressed={trip.id === t.id}
                onClick={() => onSelect(t.id)}
              >
                <b>
                  {i === 0 ? "Recommended" : "Option " + (i + 1)} ·{" "}
                  {t.legs
                    .map(
                      (l) => `${l.label} · ${l.direction} (route ${l.routeId})`,
                    )
                    .join(" → ")}
                </b>
                <span>
                  {formatDistance(t.walkingMeters)} walk ·{" "}
                  {formatDistance(t.rideMeters)} ride · {t.transfers} transfers
                </span>
                <small>
                  {t.fare === null
                    ? t.referenceFare
                      ? `Conditional reference ₱${t.referenceFare.minimum.toFixed(2)} – ₱${t.referenceFare.maximum.toFixed(2)}`
                      : "Fare estimate unavailable"
                    : `Estimated ₱${t.fare.toFixed(2)}`}
                </small>
              </button>
            ))
          )}
        </div>
      )}
      <details className="trip-data-notes">
        <summary>Route confidence & data notes</summary>
        <p>
          Confidence: {trip.confidence}. No reliable duration or live service
          information is available.
        </p>
        <p>{result.transferNote}</p>
        {result.caveats?.map((c) => (
          <p key={c}>{c}</p>
        ))}
        <p>Sources: {trip.legs.map((l) => l.source).join("; ")}</p>
        <p>Access limit: {result.limits.maxWalkMeters} m per end.</p>
      </details>
      <button className="plan-another" onClick={onReset}>
        Plan Another Trip <span>→</span>
      </button>
    </motion.section>
  );
}

