import { describe, it, expect } from "vitest";
import { readTripLocally } from "../server/kasakay-local.mjs";

describe("KaSakay backup reader (used when Gemini is unavailable)", () => {
  it.each([
    ["How much is the fare from ketkai to cogon? I'm a student.", { origin: "ketkai", destination: "cogon", language: "en", passenger: "student", focus: "fare" }],
    ["How do I get to Cogon Market from Xavier Heights?", { origin: "Xavier Heights", destination: "Cogon Market", language: "en", passenger: "regular", focus: "route" }],
    ["Unsaon pag-adto sa agora gikan sa sm uptown?", { origin: "sm uptown", destination: "agora", language: "ceb", focus: "route" }],
    ["Pila ang plete gikan ketkai paingon cogon kay estudyante ko?", { origin: "ketkai", destination: "cogon", language: "ceb", passenger: "student", focus: "fare" }],
    ["Magkano ang pamasahe mula Limketkai papunta Carmen?", { origin: "Limketkai", destination: "Carmen", language: "fil", focus: "fare" }],
    ["xu to carmen", { origin: "xu", destination: "carmen", language: "en", focus: "route" }],
    ["fare ketkai to cogon, senior", { origin: "ketkai", destination: "cogon", passenger: "senior", focus: "fare" }],
  ])("reads %j", (text, expected) => {
    expect(readTripLocally(text)).toMatchObject({ intent: "trip", ...expected });
  });
  it.each(["hello", "Help me plan a trip", "What fare information is available?", "cogon to cogon", "", "a".repeat(400)])(
    "declines what it cannot read safely: %j",
    (text) => expect(readTripLocally(text)).toBeNull(),
  );
});
