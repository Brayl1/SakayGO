import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, Ticket } from "lucide-react";
import type { FareBreakdown, Trip } from "../shared/trip-types";
const php = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    n,
  );
const bracket = (a: number, b: number) =>
  a === b ? php(a) : `${php(a)} – ${php(b)}`;
const vehicle = (s: string) =>
  s === "unknown" ? "Confirm with operator" : s.charAt(0).toUpperCase() + s.slice(1);
function Breakdown({ value }: { value: FareBreakdown }) {
  return (
    <dl className="fare-ledger">
      <div>
        <dt>Distance basis</dt>
        <dd>{(value.distanceMeters / 1000).toFixed(3)} km</dd>
      </div>
      <div>
        <dt>{value.matrixApplied ? "Matrix charge" : "Base fare"}</dt>
        <dd>{php(value.baseFare)}</dd>
      </div>
      <div>
        <dt>Additional distance charge</dt>
        <dd>{php(value.additionalCharge)}</dd>
      </div>
      <div>
        <dt>{value.discount * 100}% discount</dt>
        <dd>−{php(value.discountAmount)}</dd>
      </div>
      <div>
        <dt>Rounding adjustment</dt>
        <dd>
          {value.roundingAdjustment >= 0 ? "+" : "−"}
          {php(Math.abs(value.roundingAdjustment))}
        </dd>
      </div>
      <div>
        <dt>Fare for this ride</dt>
        <dd>{php(value.amount)}</dd>
      </div>
    </dl>
  );
}
export default function FareCard({
  trip,
  passenger,
}: {
  trip: Trip;
  passenger: string;
}) {
  const [expanded, setExpanded] = useState(false),
    ref = trip.referenceFare;
  const [selection, setSelection] = useState<{ tripId: string; index: number } | null>(null);
  const selected = selection?.tripId === trip.id ? ref?.scenarios[selection.index] : undefined;
  const displayedReference = selected || ref;
  const types = [...new Set(trip.legs.map((l) => l.vehicleType || "unknown"))];
  return (
    <motion.div
      className="prominent-fare"
      data-itinerary-id={trip.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div>
        <Ticket size={18} />
        <span>{trip.fare !== null ? "ESTIMATED JEEPNEY FARE" : "JEEPNEY FARE COMPARISON"}</span>
      </div>
      <strong>
        {trip.fare !== null
          ? php(trip.fare)
          : ref
            ? bracket(displayedReference!.minimum, displayedReference!.maximum)
            : "Fare estimate unavailable"}
      </strong>
      <p>
        Passenger Type:{" "}
        {passenger === "pwd"
          ? "PWD"
          : passenger === "senior"
            ? "Senior citizen"
            : vehicle(passenger)}
      </p>
      <p>Jeepney Type: {types.map(vehicle).join(" / ")}</p>
      {types.includes("unknown") && ref && (
        <fieldset className="vehicle-comparison">
          <legend>Compare fares by jeepney type</legend>
          <div>
            <button type="button" aria-pressed={!selected} onClick={() => setSelection(null)}>All types</button>
            {ref.scenarios.map((scenario, index) => (
              <button type="button" key={scenario.vehicles.join("+")} aria-pressed={selected === scenario}
                onClick={() => setSelection({ tripId: trip.id, index })}>
                {scenario.vehicles.map(vehicle).join(" + ")}
              </button>
            ))}
          </div>
          <p>{selected ? `Fare preview: ${selected.vehicles.map(vehicle).join(" + ")}. ` : "Compare Traditional and Modern fares. "}Confirm the vehicle serving this route with the operator.</p>
        </fieldset>
      )}
      <p>Travel Distance: {(trip.rideMeters / 1000).toFixed(3)} km ridden</p>
      {trip.fare !== null ? (
        <small>
          Policy-based estimate for the verified vehicle classification. Confirm
          fare and discount eligibility.
        </small>
      ) : ref ? (
        <>
          <b className="reference-badge">
            Conditional national reference · not an official CDO fare
          </b>
          <div className="conditional-fares">
            {(selected ? [selected] : ref.scenarios).map((s, i) => (
              <div key={i}>
                <span>If {s.vehicles.map(vehicle).join(" + ")}</span>
                <b>{bracket(s.minimum, s.maximum)}</b>
              </div>
            ))}
          </div>
          <small>
            {types.includes("unknown")
              ? "Vehicle classification is unverified. "
              : ""}
            Local applicability, discount eligibility and rounding need
            confirmation.{" "}
            {trip.legs.some((l) =>
              l.referenceFares.some((r) => r.lowerKm !== r.upperKm),
            )
              ? "Partial-kilometer billing is unspecified. Values bracket adjacent whole-kilometer illustrations; they are not guaranteed fare limits."
              : ""}
          </small>
        </>
      ) : (
        <small>
          No approved applicable policy or usable reference configuration is
          available.
        </small>
      )}
      <button
        aria-expanded={expanded}
        aria-controls="fare-breakdown"
        onClick={() => setExpanded((v) => !v)}
      >
        View Fare Breakdown <ChevronDown size={15} />
      </button>
      {expanded && (
        <div
          id="fare-breakdown"
          className="fare-breakdown"
          data-itinerary-id={trip.id}
        >
          {trip.legs.map((leg, i) => (
            <section key={`${leg.routeId}:${leg.direction}`}>
              <b>
                Ride {i + 1}: {leg.label} · {leg.direction}
              </b>
              <p>
                Actual ridden distance: {(leg.rideMeters / 1000).toFixed(3)} km.
                Vehicle: {vehicle(leg.vehicleType || "unknown")}.
              </p>
              {leg.fare ? (
                <>
                  <Breakdown value={leg.fare} />
                  <p>
                    Effective {leg.fare.effective} · {leg.fare.rounding} to{" "}
                    {php(leg.fare.roundTo)} ·{" "}
                    <a href={leg.fare.source} target="_blank" rel="noreferrer">
                      Policy source
                    </a>
                  </p>
                </>
              ) : leg.referenceFares?.length ? (
                leg.referenceFares.filter((r) => !selected || r.vehicle === selected.vehicles[i]).map((r) => (
                  <div className="reference-breakdown" key={r.vehicle}>
                    <b>If {vehicle(r.vehicle)}</b>
                    <p>{r.note}</p>
                    <Breakdown value={r.lower} />
                    {r.lowerKm !== r.upperKm && (
                      <>
                        <p>Upper whole-kilometer illustration:</p>
                        <Breakdown value={r.upper} />
                      </>
                    )}
                    <p>
                      Reference effective date: {r.effective}. Nearest ₱0.25,
                      half-up per supplied reference; not a verified local rule.
                      Discounts are not stacked.
                    </p>
                    <a href={r.sources[0]} target="_blank" rel="noreferrer">
                      Supplied rate source
                    </a>
                  </div>
                ))
              ) : (
                <p>Fare estimate unavailable for this ride.</p>
              )}
            </section>
          ))}
          <p>
            <b>
              {trip.fare !== null
                ? "Total estimated fare: " + php(trip.fare)
                : ref
                  ? "Conditional total reference: " +
                    bracket(displayedReference!.minimum, displayedReference!.maximum)
                  : "Total estimate unavailable"}
            </b>
          </p>
          <p>
            Each boarding is charged separately. No fare is derived from walking
            distance or the full route length.
          </p>
        </div>
      )}
    </motion.div>
  );
}

