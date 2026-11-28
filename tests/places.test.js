import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildGazetteer, searchGazetteer, onlineQuery, normalizePlace } from "../shared/places.mjs";
import { fareSummary } from "../shared/directions.mjs";

const catalog = JSON.parse(readFileSync("public/data/catalog.json", "utf8"));
const gazetteer = buildGazetteer(catalog.routes);
const top = (q) => searchGazetteer(gazetteer, q, 1)[0];
const dataPoints = new Set(catalog.routes.flatMap((r) => (r.stops || []).map((s) => `${s.lat},${s.lng}`)));

describe("local place names from route data", () => {
  it("understands short local names", () => {
    expect(top("cogon").label).toBe("Cogon Public Market");
    expect(top("Cogon Market").label).toBe("Cogon Public Market");
    expect(top("ketkai").label).toBe("Limketkai Center, Limketkai Drive");
    expect(top("agora").label).toBe("Agora Market City & Terminal");
    expect(top("carmen").label).toBe("Carmen Public Market");
    expect(top("bulua terminal").label).toBe("Westbound Terminal and Public Market");
    expect(top("divisoria").label).toBe("Divisoria Park");
    expect(top("lumbia").label).toBe("Lumbia (barangay centre)");
  });
  it("only returns coordinates that exist in the route data", () => {
    for (const q of ["cogon", "ketkai", "agora", "carmen", "lumbia", "gusa", "puerto"]) {
      for (const place of searchGazetteer(gazetteer, q, 3)) expect(dataPoints.has(place.point.join(","))).toBe(true);
    }
  });
  it("returns nothing for unknown or too-short text", () => {
    expect(searchGazetteer(gazetteer, "zzz")).toEqual([]);
    expect(searchGazetteer(gazetteer, "co")).toEqual([]);
  });
  it("rewrites well-known nicknames for the online map search", () => {
    expect(onlineQuery("SM Uptown")).toBe("SM City Cagayan de Oro");
    expect(onlineQuery("xu")).toBe("Xavier University");
    expect(onlineQuery("centrio")).toBe("Centrio Mall");
    expect(onlineQuery("Some Other Place")).toBe("Some Other Place");
    expect(normalizePlace("Agora Market City & Terminal")).toBe("agora market city and terminal");
  });
});

describe("fare answers", () => {
  const trip = { fare: null, referenceFare: { minimum: 11.25, maximum: 13.5 }, legs: [{ label: "Carmen R5", referenceFares: [{ lower: { discount: 0.2 } }] }] };
  it("states the student reference fare with its discount", () => {
    expect(fareSummary(trip, { passenger: "student", origin: "Limketkai Center, Limketkai Drive", destination: "Cogon Public Market" })).toBe(
      "For a student, the jeepney fare from Limketkai Center to Cogon Public Market is about ₱11.25–₱13.50 with the 20% discount on Carmen R5. This is a reference estimate, not an official local fare; confirm with the driver.",
    );
  });
  it("prefers an approved policy fare and handles missing fares", () => {
    expect(fareSummary({ ...trip, fare: 14 }, { origin: "A", destination: "B" })).toContain("is about ₱14 on Carmen R5. This follows the approved fare policy");
    expect(fareSummary({ legs: [] }, { origin: "A", destination: "B" })).toBe("SakayGo has no fare reference from A to B yet. Please ask the driver.");
    expect(fareSummary(trip, { language: "ceb", passenger: "student" })).toContain("mga ₱11.25–₱13.50 uban ang 20% diskwento");
  });
});
