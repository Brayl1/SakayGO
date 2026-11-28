// Step-by-step commuter directions for a planned trip, built only from
// SakayGo data: the planner's trip (walk distances, where along each route
// you board and alight) and each route's LPTRP street list and key places.
// Nothing here is model-written; the AI only picks the language.
//
// Street names are placed by how far along the route the boarding/alighting
// point is, so they are approximate ("around"), and key places are only named
// when they are actually close by.

const NEAR_PLACE_METERS = 450;
const HERE_METERS = 25;

const words = {
  en: {
    here: (street) => `Board right where you are${street ? `, along ${street}` : ""}.`,
    walkTo: (m, from, street, near) => `Walk about ${m} m${from ? ` from ${from}` : ""}${street ? ` to ${street}` : " to the jeepney route"}${near}.`,
    ride: (route, head, via) => `Ride the ${route} jeepney${head ? ` heading to ${head}` : ""}${via.length ? `. It passes ${via.join(", ")}` : ""}.`,
    off: (street, near, km) => `Get off${street ? ` around ${street}` : ""}${near} after about ${km} km.`,
    transfer: (m, street, near) => m <= HERE_METERS ? `Transfer right there${street ? ` on ${street}` : ""}${near}.` : `Walk about ${m} m${street ? ` to ${street}` : ""}${near} to transfer.`,
    arrive: (m, to) => m <= HERE_METERS ? `You're at ${to || "your destination"}.` : `Walk about ${m} m to ${to || "your destination"}.`,
    near: (p) => ` (near ${p})`,
  },
  fil: {
    here: (street) => `Sumakay na diyan mismo${street ? ` sa ${street}` : ""}.`,
    walkTo: (m, from, street, near) => `Maglakad nang mga ${m} m${from ? ` mula ${from}` : ""}${street ? ` papunta sa ${street}` : " papunta sa ruta ng jeep"}${near}.`,
    ride: (route, head, via) => `Sumakay sa jeep na ${route}${head ? ` papuntang ${head}` : ""}${via.length ? `. Dumadaan ito sa ${via.join(", ")}` : ""}.`,
    off: (street, near, km) => `Bumaba${street ? ` sa bandang ${street}` : ""}${near} pagkatapos ng mga ${km} km.`,
    transfer: (m, street, near) => m <= HERE_METERS ? `Lumipat ng jeep diyan mismo${street ? ` sa ${street}` : ""}${near}.` : `Maglakad nang mga ${m} m${street ? ` papunta sa ${street}` : ""}${near} para lumipat ng jeep.`,
    arrive: (m, to) => m <= HERE_METERS ? `Nandiyan ka na sa ${to || "iyong destinasyon"}.` : `Maglakad nang mga ${m} m papunta sa ${to || "iyong destinasyon"}.`,
    near: (p) => ` (malapit sa ${p})`,
  },
  ceb: {
    here: (street) => `Sakay na diha mismo${street ? ` sa ${street}` : ""}.`,
    walkTo: (m, from, street, near) => `Lakaw og mga ${m} m${from ? ` gikan sa ${from}` : ""}${street ? ` paingon sa ${street}` : " paingon sa agianan sa jeep"}${near}.`,
    ride: (route, head, via) => `Sakay sa jeep nga ${route}${head ? ` padulong ${head}` : ""}${via.length ? `. Moagi kini sa ${via.join(", ")}` : ""}.`,
    off: (street, near, km) => `Naog${street ? ` sa may ${street}` : ""}${near} human sa mga ${km} km.`,
    transfer: (m, street, near) => m <= HERE_METERS ? `Balhin og jeep diha mismo${street ? ` sa ${street}` : ""}${near}.` : `Lakaw og mga ${m} m${street ? ` paingon sa ${street}` : ""}${near} aron mobalhin og jeep.`,
    arrive: (m, to) => m <= HERE_METERS ? `Naa na ka sa ${to || "imong padulngan"}.` : `Lakaw og mga ${m} m paingon sa ${to || "imong padulngan"}.`,
    near: (p) => ` (duol sa ${p})`,
  },
};

export function meters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

export function lineLength(points) {
  let total = 0;
  for (let i = 1; i < (points?.length || 0); i++) total += meters(points[i - 1], points[i]);
  return total;
}

/** Short, readable form of a confirmed place label ("Centrio Mall, Corrales Ave, ..." -> "Centrio Mall"). */
export function shortPlace(label) {
  return typeof label === "string" ? label.split(",")[0].trim().slice(0, 80) : "";
}

const roundWalk = (m) => Math.max(10, Math.round(m / 10) * 10);

/**
 * @param trip  planner trip: { legs: [{ routeId, direction, label, roads, board, alight, boardAlongMeters, alightAlongMeters, rideMeters }], walks: [{ distanceMeters }] }
 * @param routes Map/obj routeId -> { from, to, stops: [{name, lat, lng}], lengths: { inbound, outbound } }
 * @param options { language: "en"|"fil"|"ceb", origin?: string, destination?: string }
 * @returns string[] numbered-ready steps
 */
export function tripDirections(trip, routes, { language = "en", origin = "", destination = "" } = {}) {
  const w = words[language] || words.en;
  const get = (id) => (routes instanceof Map ? routes.get(id) : routes?.[id]) || {};
  const legs = Array.isArray(trip?.legs) ? trip.legs : [];
  const walks = Array.isArray(trip?.walks) ? trip.walks : [];
  if (!legs.length) return [];

  const streetAt = (leg, along) => {
    const streets = Array.isArray(leg.roads) ? leg.roads : [];
    const total = get(leg.routeId).lengths?.[leg.direction];
    if (!streets.length || !total || !Number.isFinite(along)) return { street: "", index: -1 };
    const index = Math.min(streets.length - 1, Math.max(0, Math.floor((along / total) * streets.length)));
    return { street: streets[index], index };
  };
  const nearPlace = (leg, point, exclude) => {
    let best = null;
    for (const stop of get(leg.routeId).stops || []) {
      if (!Number.isFinite(stop?.lat) || !Number.isFinite(stop?.lng) || stop.name === exclude) continue;
      const d = meters(point, [stop.lat, stop.lng]);
      if (d <= NEAR_PLACE_METERS && (!best || d < best.d)) best = { name: stop.name, d };
    }
    return best ? w.near(best.name) : "";
  };

  const steps = [];
  legs.forEach((leg, i) => {
    const route = get(leg.routeId);
    const board = streetAt(leg, leg.boardAlongMeters);
    const alight = streetAt(leg, leg.alightAlongMeters);
    const walkIn = walks[i]?.distanceMeters ?? 0;
    const boardNear = nearPlace(leg, leg.board, board.street);
    if (i === 0) steps.push(walkIn <= HERE_METERS ? w.here(board.street) : w.walkTo(roundWalk(walkIn), shortPlace(origin), board.street, boardNear));
    else steps.push(w.transfer(roundWalk(walkIn), board.street, boardNear));
    const head = leg.direction === "outbound" ? route.from : route.to;
    const via = board.index >= 0 && alight.index > board.index + 1
      ? (leg.roads || []).slice(board.index + 1, alight.index).slice(0, 3)
      : [];
    steps.push(w.ride(leg.label, head, via));
    const km = (Math.max(0, leg.rideMeters || 0) / 1000).toFixed(1);
    steps.push(w.off(alight.street, nearPlace(leg, leg.alight, alight.street), km));
  });
  const walkOut = walks[legs.length]?.distanceMeters ?? 0;
  steps.push(w.arrive(roundWalk(walkOut), shortPlace(destination)));
  return steps;
}

const paragraphWords = {
  en: { lead: (o, d) => `Here's how to get${o ? ` from ${o}` : ""}${d ? ` to ${d}` : ""}:`, first: "First,", then: "Then", next: "After that,", last: "Finally," },
  fil: { lead: (o, d) => `Ganito pumunta${o ? ` mula ${o}` : ""}${d ? ` papuntang ${d}` : ""}:`, first: "Una,", then: "Pagkatapos,", next: "Sunod,", last: "Sa huli," },
  ceb: { lead: (o, d) => `Mao ni ang paagi${o ? ` gikan ${o}` : ""}${d ? ` paingon ${d}` : ""}:`, first: "Una,", then: "Dayon,", next: "Human ana,", last: "Sa katapusan," },
};

/** Join steps into one readable paragraph: "Here's how to get from A to B: First, … Then, … Finally, …". */
export function directionsParagraph(steps, { language = "en", origin = "", destination = "" } = {}) {
  if (!Array.isArray(steps) || !steps.length) return "";
  const w = paragraphWords[language] || paragraphWords.en;
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const body = steps.map((step, i) => {
    if (steps.length === 1) return step;
    const word = i === 0 ? w.first : i === steps.length - 1 ? w.last : i % 2 ? w.then : w.next;
    return `${word} ${lower(step)}`;
  });
  return `${w.lead(shortPlace(origin), shortPlace(destination))} ${body.join(" ")}`;
}
