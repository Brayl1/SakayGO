// Local place lookup built from SakayGo's own route data (CDO LPTRP key
// places: markets, terminals, malls, barangay centres). Every coordinate comes
// from that data; the nicknames below only point at places already in it.
//
// It understands the short names people actually type ("cogon", "ketkai",
// "agora", "westbound", "lumbia") and is checked before the OpenStreetMap
// search, which often misses or misplaces those.

// Words that describe a kind of place rather than which place it is.
const GENERIC = new Set([
  "public", "market", "markets", "terminal", "city", "center", "centre", "subd", "subdivision",
  "brgy", "barangay", "centro", "hall", "the", "of", "and", "sa", "ang", "ng", "mall", "st", "street",
  "ave", "avenue", "road", "rd", "drive", "dr", "integrated", "bus", "palengke", "merkado", "relocation",
  "phase", "sitio", "zone", "eastern", "western", "station", "gasoline", "corner", "old", "new",
]);

// Common local names -> words of the place they mean (must match the data).
const NICKNAMES = {
  ketkai: "limketkai", lkc: "limketkai", "limketkai mall": "limketkai", "limketkai center": "limketkai",
  "cogon market": "cogon", "palengke cogon": "cogon", "cogon palengke": "cogon",
  "carmen market": "carmen", "palengke carmen": "carmen", ororama: "carmen",
  "agora market": "agora", "agora terminal": "agora", "agora palengke": "agora",
  "westbound terminal": "westbound", "bulua terminal": "westbound", "westbound bulua": "westbound",
  "plaza divisoria": "divisoria", "divisoria plaza": "divisoria",
  "gaisano city": "gaisano", "puerto market": "puerto",
  pueblo: "pueblo oro", "pueblo de oro": "pueblo oro", "xavier estates": "pueblo oro",
  "xavier heights": "xavier heights", "lto bulua": "bulua lto", "bulua lto": "bulua lto",
};

export function normalizePlace(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const coreWords = (text) => normalizePlace(text).split(" ").filter((w) => w && !GENERIC.has(w) && !/^r\d+$/.test(w));

// "Limketkai Center- Limketkai Drive" -> ["Limketkai Center", "Limketkai Drive"];
// "Carmen Public Market (Ororama)" -> ["Carmen Public Market", "Ororama"].
function nameParts(name) {
  const inner = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const outer = name.replace(/\([^)]*\)/g, " ");
  return [...outer.split(/\s[-–]+\s?|\s?[-–]+\s|\//), ...inner].map((s) => s.trim()).filter((s) => s.length > 1);
}

// Readable label: "Centro Brgy. Lumbia" -> "Lumbia (barangay centre)".
function displayName(name, type) {
  const first = nameParts(name)[0] || name;
  const m = first.match(/^(?:centro\s+)?(?:brgy\.?|barangay)\s+(.+)$/i) || first.match(/^centro\s+(.+)$/i) || first.match(/^(.+?)\s+centro$/i);
  if (m && type === "area") return `${m[1].trim()} (barangay centre)`;
  // Keep the context: "Roxas St. (Cogon Public Market)", "Limketkai Drive, Limketkai Center".
  return name.replace(/\s*[-–]+\s*(?=[A-Z(])/g, ", ").replace(/\s{2,}/g, " ").replace(/^,\s*|,\s*$/g, "").trim();
}

/**
 * Build a gazetteer from catalog routes (each with stops: [{name, lat, lng, type}]).
 * Places sharing the same core words merge; the most common spelling wins.
 */
export function buildGazetteer(routes) {
  const groups = new Map();
  for (const route of routes || []) {
    for (const stop of route.stops || []) {
      if (!stop?.name || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) continue;
      const parts = nameParts(stop.name);
      const key = coreWords(parts[0] || stop.name).join(" ");
      if (!key) continue;
      const group = groups.get(key) || { key, spellings: new Map(), aliases: new Set(), routes: new Set(), type: stop.type };
      const s = group.spellings.get(stop.name) || { count: 0, lat: stop.lat, lng: stop.lng, type: stop.type };
      s.count++;
      group.spellings.set(stop.name, s);
      group.routes.add(route.id);
      for (const part of [stop.name, ...parts]) {
        const words = coreWords(part).join(" ");
        if (words) group.aliases.add(words);
        group.aliases.add(normalizePlace(part));
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((g) => {
    // Most common spelling wins; on a tie prefer a place-like name
    // ("Limketkai Center, Limketkai Drive" over "Limketkai Drive, Limketkai Center").
    const placeLike = (n) => (/\b(center|centre|market|terminal|mall|park|hall|plaza)\b/i.test(n.split(/[-–(]/)[0]) ? 1 : 0);
    const [name, best] = [...g.spellings.entries()].sort((a, b) => b[1].count - a[1].count || placeLike(b[0]) - placeLike(a[0]))[0];
    return {
      key: g.key,
      label: displayName(name, best.type),
      point: [best.lat, best.lng],
      type: best.type,
      aliases: [...g.aliases].filter(Boolean),
      routeCount: g.routes.size,
    };
  });
}

/** Find places for a query; best matches first. */
export function searchGazetteer(gazetteer, query, limit = 3) {
  const q = normalizePlace(query);
  if (q.length < 3) return [];
  const qCore = coreWords(q).join(" ");
  const nick = NICKNAMES[q] || NICKNAMES[qCore] || null;
  const wanted = (nick || qCore || q).split(" ").filter(Boolean);
  const scored = [];
  for (const place of gazetteer) {
    let score = 0;
    for (const alias of place.aliases) {
      const words = alias.split(" ");
      if (alias === (nick || qCore) || alias === q) score = Math.max(score, 100);
      else if (wanted.every((w) => words.includes(w))) score = Math.max(score, 80 - words.length);
      else if (wanted.length === 1 && wanted[0].length >= 4 && words.some((w) => w.startsWith(wanted[0]))) score = Math.max(score, 40 - words.length);
    }
    if (!score) continue;
    // Prefer well-served hubs (markets/terminals used by many routes).
    score += Math.min(place.routeCount, 20) / 2 + (place.type === "market" || place.type === "terminal" || place.type === "mall" ? 3 : 0);
    scored.push({ place, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.place.label.localeCompare(b.place.label))
    .slice(0, limit)
    .map(({ place }) => ({ label: place.label, point: place.point, source: "SakayGo route data (CDO LPTRP)" }));
}

// Nicknames for well-known places that are not on a jeepney route (so not in
// the route data). They are rewritten to the name OpenStreetMap uses, so the
// online search finds them; the coordinates still come from OpenStreetMap.
// Each target name was checked against Photon on 2026-11-28.
const ONLINE_NAMES = {
  "sm uptown": "SM City Cagayan de Oro", "sm cdo uptown": "SM City Cagayan de Oro", "sm city": "SM City Cagayan de Oro",
  "sm city cdo": "SM City Cagayan de Oro", "sm cdo": "SM City Cagayan de Oro", "sm uptown cdo": "SM City Cagayan de Oro",
  "sm downtown": "SM CDO Downtown Premier", "sm premier": "SM CDO Downtown Premier", "sm cdo downtown": "SM CDO Downtown Premier",
  centrio: "Centrio Mall", "ayala centrio": "Centrio Mall", "centrio mall": "Centrio Mall", ayala: "Centrio Mall",
  robinsons: "Robinsons Cagayan de Oro", robinson: "Robinsons Cagayan de Oro",
  xu: "Xavier University", xavier: "Xavier University", "xavier university": "Xavier University", ateneo: "Xavier University",
  ustp: "University of Science and Technology of Southern Philippines", must: "University of Science and Technology of Southern Philippines",
  cu: "Capitol University", capitol: "Capitol University", liceo: "Liceo de Cagayan University", ldcu: "Liceo de Cagayan University",
  nmmc: "Northern Mindanao Medical Center", "limketkai mall": "Limketkai Mall", "ketkai mall": "Limketkai Mall",
  "gaisano city mall": "Gaisano City Mall", "gaisano carmen": "Gaisano Carmen Mall", "city hall": "Cagayan de Oro City Hall",
  "plaza rizal": "Plaza Rizal", "rizal park": "Plaza Rizal", pier: "Port of Cagayan de Oro", port: "Port of Cagayan de Oro",
  "macabalan port": "Port of Cagayan de Oro", airport: "Laguindingan Airport", laguindingan: "Laguindingan Airport",
  eastbound: "CDO Eastbound Bus Terminal", "eastbound terminal": "CDO Eastbound Bus Terminal", "agora bus terminal": "CDO Eastbound Bus Terminal",
};

/** Text to send to the online place search: a known nickname becomes its map name. */
export function onlineQuery(query) {
  const q = normalizePlace(query);
  return ONLINE_NAMES[q] || query;
}
