import { describe, it, expect } from "vitest";
import { tripDirections, lineLength, shortPlace } from "../shared/directions.mjs";

// Two straight routes ~1 km long with ordered street lists and key places.
const lineA = [[8.47, 124.62], [8.47, 124.629]];
const lineB = [[8.47, 124.629], [8.479, 124.629]];
const routes = new Map([
  ["1", { from: "Bulua", to: "Carmen Market", stops: [{ name: "Carmen Market", lat: 8.47, lng: 124.629 }], lengths: { inbound: lineLength(lineA) } }],
  ["2", { from: "Cogon Market", to: "Carmen Market", stops: [{ name: "Cogon Market", lat: 8.479, lng: 124.629 }], lengths: { outbound: lineLength(lineB) } }],
]);
const leg = (routeId, direction, label, roads, boardAlong, alightAlong, board, alight) => ({
  routeId, direction, label, roads, boardAlongMeters: boardAlong, alightAlongMeters: alightAlong,
  rideMeters: alightAlong - boardAlong, board, alight,
});
const transferTrip = {
  legs: [
    leg("1", "inbound", "Bulua R1", ["A St", "B St", "C St", "D St"], 100, 980, [8.47, 124.6209], [8.47, 124.6289]),
    leg("2", "outbound", "Carmen R2", ["E St", "F St", "G St", "H St"], 20, 990, [8.4702, 124.629], [8.4789, 124.629]),
  ],
  walks: [{ distanceMeters: 143 }, { distanceMeters: 30 }, { distanceMeters: 61 }],
};

describe("tripDirections", () => {
  it("builds walk, ride, get-off, transfer and arrival steps from route data", () => {
    const steps = tripDirections(transferTrip, routes, { origin: "Bulua Terminal, CDO", destination: "Cogon Market, CDO" });
    expect(steps).toEqual([
      "Walk about 140 m from Bulua Terminal to A St.",
      "Ride the Bulua R1 jeepney heading to Carmen Market. It passes B St, C St.",
      "Get off around D St (near Carmen Market) after about 0.9 km.",
      "Walk about 30 m to E St to transfer.",
      "Ride the Carmen R2 jeepney heading to Cogon Market. It passes F St, G St.",
      "Get off around H St (near Cogon Market) after about 1.0 km.",
      "Walk about 60 m to Cogon Market.",
    ]);
  });
  it("uses the outbound headsign and speaks Filipino and Cebuano", () => {
    const fil = tripDirections(transferTrip, routes, { language: "fil", destination: "Cogon" });
    const ceb = tripDirections(transferTrip, routes, { language: "ceb", destination: "Cogon" });
    expect(fil[0]).toBe("Maglakad nang mga 140 m papunta sa A St.");
    expect(fil.at(-1)).toBe("Maglakad nang mga 60 m papunta sa Cogon.");
    expect(ceb[1]).toBe("Sakay sa jeep nga Bulua R1 padulong Carmen Market. Moagi kini sa B St, C St.");
    expect(ceb[2]).toBe("Naog sa may D St (duol sa Carmen Market) human sa mga 0.9 km.");
  });
  it("boards in place for tiny walks and degrades without route lengths", () => {
    const trip = { legs: [leg("9", "inbound", "Mystery Route", ["X St"], 0, 500, [8.47, 124.62], [8.47, 124.625])], walks: [{ distanceMeters: 4 }, { distanceMeters: 5 }] };
    expect(tripDirections(trip, new Map(), { destination: "Home" })).toEqual([
      "Board right where you are.",
      "Ride the Mystery Route jeepney.",
      "Get off after about 0.5 km.",
      "You're at Home.",
    ]);
  });
  it("only names key places that are actually nearby", () => {
    const far = { ...transferTrip, legs: [{ ...transferTrip.legs[0], alight: [8.46, 124.6] }], walks: [{ distanceMeters: 50 }, { distanceMeters: 50 }] };
    expect(tripDirections(far, routes).join(" ")).not.toContain("near Carmen Market");
  });
  it("returns nothing for a trip without legs and shortens place labels", () => {
    expect(tripDirections({ legs: [] }, routes)).toEqual([]);
    expect(shortPlace("Centrio Mall, Corrales Ave, Cagayan de Oro")).toBe("Centrio Mall");
  });
});
