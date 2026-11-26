import type { Dataset, Location, Service } from "./model";
// Approximate landmark coordinates, NOT verified boarding points.
export const locations: Location[] = [
  {
    id: "ustp",
    name: "USTP CDO Campus",
    category: "University",
    point: [8.4853, 124.6565],
  },
  {
    id: "limketkai",
    name: "Limketkai Center",
    category: "Shopping",
    point: [8.4854, 124.6578],
  },
  {
    id: "centrio",
    name: "Centrio Mall",
    category: "Shopping",
    point: [8.4875, 124.6505],
  },
  {
    id: "sm",
    name: "SM CDO Downtown Premier",
    category: "Shopping",
    point: [8.4893, 124.6561],
  },
  {
    id: "cogon",
    name: "Cogon Market",
    category: "Market",
    point: [8.4785, 124.6518],
  },
  {
    id: "divisoria",
    name: "Divisoria",
    category: "City landmark",
    point: [8.4778, 124.6457],
  },
  {
    id: "xavier",
    name: "Xavier University",
    category: "University",
    point: [8.4765, 124.6473],
  },
  {
    id: "gaisano",
    name: "Gaisano City Mall",
    category: "Shopping",
    point: [8.4902, 124.6504],
  },
  {
    id: "agora",
    name: "Agora Bus Terminal",
    category: "Terminal",
    point: [8.4948, 124.6611],
  },
  {
    id: "carmen",
    name: "Carmen Public Market",
    category: "Market",
    point: [8.4803, 124.6368],
  },
];
function service(
  id: string,
  name: string,
  stops: string[],
  area: string,
): Service {
  return {
    id,
    name,
    stops,
    area,
    signboard: `DEMO ${id} · ${name}`,
    direction: "One-way synthetic alignment",
    status: "demo",
    verifiedAt: null,
    source: "Synthetic software test fixture; not a real jeepney service",
    geometry: stops.map((id) => locations.find((l) => l.id === id)!.point),
    policyId: "demo-policy",
  };
}
export const demoData: Dataset = {
  locations,
  routes: [
    service(
      "A",
      "Campus → Downtown",
      ["ustp", "limketkai", "cogon", "xavier", "divisoria"],
      "Downtown",
    ),
    service(
      "B",
      "Campus → North loop",
      ["ustp", "sm", "centrio", "gaisano", "agora"],
      "North",
    ),
    service(
      "C",
      "Mall → Riverside",
      ["centrio", "cogon", "divisoria", "carmen"],
      "Downtown",
    ),
    service(
      "D",
      "Riverside → Campus",
      ["carmen", "divisoria", "xavier", "cogon", "ustp"],
      "West",
    ),
  ],
  policies: [
    {
      id: "demo-policy",
      source: "Synthetic test amounts — not an official fare policy",
      effective: "2020-01-01",
      expires: "2099-12-31",
      demo: true,
      base: 15,
      baseKm: 4,
      perKm: 2,
      discount: 0.2,
      roundTo: 1,
    },
  ],
};
