// Backup reader for KaSakay when Gemini is unavailable (quota reached,
// provider error). It only understands simple trip questions, such as
// "from A to B", "A to B", "gikan A paingon B", "mula A papunta B",
// "pag-adto sa B gikan sa A", plus fare words and passenger type. It returns
// the same shape as the AI interpretation, or null when it is not sure.
// It never sees or uses anything the model returned.

const FROM = String.raw`(?:from|gikan(?:\s+sa)?|mula(?:\s+sa)?|galing(?:\s+sa)?)`;
const TO = String.raw`(?:to|going\s+to|papunta(?:ng)?(?:\s+sa)?|paingon(?:\s+sa)?|padulong(?:\s+sa)?|ngadto(?:\s+sa)?|hanggang(?:\s+sa)?)`;
const GO = String.raw`(?:to|pa-?adto(?:\s+sa)?|pag-?adto(?:\s+sa)?|adto(?:\s+sa)?|pumunta(?:\s+sa)?|papunta(?:\s+sa)?|paingon(?:\s+sa)?|padulong(?:\s+sa)?|get\s+to)`;

const PATTERNS = [
  { re: new RegExp(String.raw`${FROM}\s+(.+?)\s+${TO}\s+(.+)`, "i"), origin: 1, destination: 2 },
  { re: new RegExp(String.raw`${GO}\s+(.+?)\s+${FROM}\s+(.+)`, "i"), origin: 2, destination: 1 },
];
// Leading question words that are not part of a place in "A to B" questions.
const LEAD = /^(?:(?:how\s+much(?:\s+is)?(?:\s+the)?(?:\s+(?:jeepney\s+)?fare)?|(?:jeepney\s+)?fare|magkano(?:\s+ang)?(?:\s+pamasahe)?|pila(?:\s+ang)?(?:\s+(?:plete|pamasahe))?|unsaon(?:\s+nako)?|paano(?:\s+pumunta)?|how\s+(?:do|can)\s+i\s+(?:get|go)|route|ride)\s*)+/i;
// Where a place name ends: punctuation or the start of a trailing remark.
const TAIL = /[?!.,;]|\s(?:i'?m|im|i\s+am|as\s+an?|for\s+an?|kay|kasi|please|po|ko|nako|ang\s+plete|ang\s+pamasahe|fare|student|estudyante|istudyante|senior|pwd)\b/i;

function clean(place) {
  let p = String(place || "").trim();
  const cut = p.search(TAIL);
  if (cut >= 0) p = p.slice(0, cut);
  p = p.replace(LEAD, "").replace(/^(?:sa|the|ang)\s+/i, "").replace(/\s{2,}/g, " ").trim();
  return p.length >= 2 && p.length <= 60 ? p : "";
}

export function readTripLocally(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 300) return null;
  let origin = "", destination = "";
  for (const { re, origin: o, destination: d } of PATTERNS) {
    const m = t.match(re);
    if (m) { origin = clean(m[o]); destination = clean(m[d]); break; }
  }
  if (!origin || !destination) {
    // Short "A to B" questions, e.g. "xu to carmen", "fare ketkai to cogon".
    const m = t.match(/^(.{2,60}?)\s+(?:to|-|→)\s+(.{2,60})$/i);
    if (m && t.split(" ").length <= 12) { origin = clean(m[1]); destination = clean(m[2]); }
  }
  if (!origin || !destination || origin.toLowerCase() === destination.toLowerCase()) return null;
  const lower = t.toLowerCase();
  const language = /\b(unsaon|gikan|paingon|padulong|ngadto|pila|plete|asa|nako|sakay\s+ko)\b/.test(lower)
    ? "ceb"
    : /\b(magkano|mula|papunta|papuntang|pamasahe|galing|paano|saan|po)\b/.test(lower)
      ? "fil"
      : "en";
  const passenger = /\b(student|estudyante|istudyante)\b/.test(lower) ? "student"
    : /\b(senior|lolo|lola)\b/.test(lower) ? "senior"
      : /\b(pwd|disabled|disability)\b/.test(lower) ? "pwd" : "regular";
  const focus = /\b(how\s+much|fare|magkano|pamasahe|pasahe|pila|plete|price|cost)\b/.test(lower) ? "fare" : "route";
  return { intent: "trip", language, origin, destination, passenger, focus };
}
